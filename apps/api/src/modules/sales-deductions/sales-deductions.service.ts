import { createHash } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IntegrationProvider,
  Prisma,
  RecipeType,
  SalesDeductionDecision,
  SalesDeductionSource,
  SalesDeductionStatus,
  StockMovementType,
} from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { findOrgAdministratorId } from '@/modules/roles/org-administrator';
import { PaginatedDto } from '@/common/dto';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { MovementType, WebsocketService } from '@/modules/websocket';
import { consumeRecipeLotsFifo } from '@/modules/stock/recipe-lot-fifo.util';
import { isImportableWooStatus } from '@/modules/integrations/woocommerce.client';
import { salesDeductionsEnabled } from './sales-deductions.feature';
import {
  CONFIDENT_SCORE,
  MatchCandidate,
  normalizeProductName,
  rankCandidates,
} from './name-matcher';
import { extractPickupiaDelivery } from '@/modules/integrations/pickupia.parser';
import { parseSalesReport, SalesReportParseError } from './sales-report.parser';
import {
  ConfirmSalesDeductionDto,
  ConfirmSalesDeductionLineDto,
  SalesDeductionLineResponseDto,
  SalesDeductionResponseDto,
  SalesDeductionSummaryDto,
  SalesMatchCandidateDto,
  SalesProductOptionDto,
} from './dto/sales-deduction.dto';

/** A line as produced by a source (Excel / Woo) before matching. */
interface SourceLine {
  rawName: string;
  rawUnit: string | null;
  quantity: number;
  /** Already resolved by an integration ProductMapping. */
  recipeId?: string;
}

const DEDUCTION_INCLUDE = {
  location: { select: { name: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  confirmedBy: { select: { firstName: true, lastName: true } },
  lines: {
    orderBy: { position: 'asc' as const },
    include: { recipe: { select: { name: true, unit: true } } },
  },
} satisfies Prisma.SalesDeductionInclude;

type DeductionWithLines = Prisma.SalesDeductionGetPayload<{ include: typeof DEDUCTION_INCLUDE }>;

const num = (d: Prisma.Decimal | number | null | undefined): number | null =>
  d == null ? null : Number(d);
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const fullName = (u: { firstName: string; lastName: string } | null) =>
  u ? `${u.firstName} ${u.lastName}`.trim() : '';

/**
 * "Scădere din stoc pe bază de vânzări": turns a sales report (eBriza Excel,
 * manual entry, WooCommerce orders) into finished-goods stock-out for ONE
 * location, through a DRAFT the user reviews line by line and confirms in bulk.
 *
 * Rules (from the product spec):
 *  - the confirmation is authoritative ("confirmerul e sfânt"): the sold
 *    quantity is logged as confirmed even when stock can't cover it;
 *  - stock never goes below 0 — selling more than on hand needs an explicit
 *    acknowledgement (clamped to 0) or an absolute stock override;
 *  - quantities are fully adjustable both ways (<0 = adds back);
 *  - report products missing from the app can be created on the spot with
 *    the quantity currently on hand;
 *  - one summary notification per confirmation, never one per product;
 *  - every session + line is kept as the audit log (SalesDeduction*).
 */
@Injectable()
export class SalesDeductionsService {
  private readonly logger = new Logger(SalesDeductionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly websocket: WebsocketService,
  ) {}

  // ── Catalog ────────────────────────────────────────────────────────────

  /** Sellable products (active FINAL + SEMIPREPARAT recipes) with stock at a location. */
  /**
   * CSV template for a manual deduction (Anca's "scoateri manuale"): one row
   * per sellable product with the exact name the matcher expects, the
   * quantity left blank, the unit prefilled. Semicolon-separated + UTF-8 BOM
   * so Excel (ro-RO) opens it in columns without an import wizard.
   */
  async buildTemplateCsv(locationId: string): Promise<Buffer> {
    const products = await this.listProducts(locationId);
    const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = ['Denumire;Cantitate;U.M.'];
    for (const p of products) lines.push(`${esc(p.name)};;${esc(unitTypeLabel(p.unit))}`);
    return Buffer.from('\ufeff' + lines.join('\r\n') + '\r\n', 'utf8');
  }

  async listProducts(locationId: string): Promise<SalesProductOptionDto[]> {
    await this.ensureLocation(locationId);
    const recipes = await this.prisma.recipe.findMany({
      where: { isArchived: false, isDraft: false },
      select: { id: true, name: true, unit: true, type: true, category: true },
      orderBy: { name: 'asc' },
    });
    const stocks = await this.stockMap(
      locationId,
      recipes.map((r) => r.id),
    );
    return recipes.map(
      (r) =>
        new SalesProductOptionDto({
          id: r.id,
          name: r.name,
          unit: r.unit,
          type: r.type,
          category: r.category,
          stock: stocks.get(r.id) ?? 0,
        }),
    );
  }

  // ── Draft creation (one per source) ────────────────────────────────────

  async createFromExcel(
    file: { buffer: Buffer; originalname?: string } | undefined,
    locationId: string,
    userId: string,
  ): Promise<SalesDeductionResponseDto> {
    if (!file?.buffer?.length) throw new BadRequestException('Niciun fișier încărcat.');
    await this.ensureLocation(locationId);

    let parsed;
    try {
      parsed = await parseSalesReport(file.buffer);
    } catch (e) {
      if (e instanceof SalesReportParseError) throw new BadRequestException(e.message);
      throw e;
    }

    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    return this.createDraft({
      locationId,
      userId,
      source: SalesDeductionSource.EXCEL,
      fileName: file.originalname ?? null,
      fileHash,
      lines: parsed.rows.map((r) => ({ rawName: r.name, rawUnit: r.unit, quantity: r.quantity })),
    });
  }

  async createManual(locationId: string, userId: string): Promise<SalesDeductionResponseDto> {
    await this.ensureLocation(locationId);
    return this.createDraft({ locationId, userId, source: SalesDeductionSource.MANUAL, lines: [] });
  }

  /**
   * Aggregates the WooCommerce orders already pulled into ExternalOrderSource
   * (poll job / webhooks) whose `date_created` falls in [from, to] and whose
   * status is processing/completed. Products resolve through the integration's
   * ProductMapping first, then by name like any other source.
   */
  async createFromWoo(
    locationId: string,
    fromIso: string,
    toIso: string,
    userId: string,
  ): Promise<SalesDeductionResponseDto> {
    await this.ensureLocation(locationId);
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (!(from <= to)) throw new BadRequestException('Intervalul de date nu este valid.');

    const integrations = await this.prisma.integration.findMany({
      where: { provider: IntegrationProvider.WOOCOMMERCE },
      select: { id: true },
    });
    if (integrations.length === 0) {
      throw new BadRequestException('Nu există nicio integrare WooCommerce configurată.');
    }
    const integrationIds = integrations.map((i) => i.id);

    const mappings = await this.prisma.productMapping.findMany({
      where: { integrationId: { in: integrationIds } },
      select: { externalProductId: true, recipeId: true },
    });
    const mappingById = new Map(mappings.map((m) => [m.externalProductId, m.recipeId]));

    // Orders are stored when first seen, which is after they were placed —
    // widen the DB window a little and filter on the order's own date.
    const sources = await this.prisma.externalOrderSource.findMany({
      where: {
        integrationId: { in: integrationIds },
        createdAt: { gte: new Date(from.getTime() - 7 * 86_400_000) },
      },
      select: { rawPayload: true, integrationId: true },
    });

    // Orders already deducted automatically (at "processing") must not count twice.
    const autoKeys = new Set(
      (
        await this.prisma.salesDeduction.findMany({
          where: { fileHash: { startsWith: 'woo:' }, status: { not: SalesDeductionStatus.ANULAT } },
          select: { fileHash: true },
        })
      ).map((d) => d.fileHash),
    );

    const agg = new Map<string, SourceLine>();
    let orders = 0;
    let skippedAuto = 0;
    for (const s of sources) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = s.rawPayload as any;
      if (!Array.isArray(p?.line_items) || !isImportableWooStatus(p?.status)) continue;
      if (autoKeys.has(`woo:${s.integrationId}:${String(p?.id ?? '')}`)) {
        skippedAuto++;
        continue;
      }
      const placed = p?.date_created_gmt
        ? new Date(`${p.date_created_gmt}Z`)
        : p?.date_created
          ? new Date(p.date_created)
          : null;
      if (!placed || placed < from || placed > to) continue;
      orders++;
      for (const li of p.line_items) {
        const variationId = Number(li?.variation_id) > 0 ? String(li.variation_id) : null;
        const productId = Number(li?.product_id) > 0 ? String(li.product_id) : null;
        const recipeId =
          (variationId ? mappingById.get(variationId) : undefined) ??
          (productId ? mappingById.get(productId) : undefined);
        const name = typeof li?.name === 'string' && li.name.trim() ? li.name.trim() : 'Produs';
        const quantity = Number(li?.quantity) || 0;
        if (quantity <= 0) continue;
        const key = recipeId ? `r:${recipeId}` : `n:${normalizeProductName(name)}`;
        const existing = agg.get(key);
        if (existing) existing.quantity = round3(existing.quantity + quantity);
        else agg.set(key, { rawName: name, rawUnit: null, quantity, recipeId });
      }
    }
    if (orders === 0) {
      throw new BadRequestException(
        skippedAuto > 0
          ? `Toate cele ${skippedAuto} comenzi din interval au fost deja scăzute automat la „în procesare”.`
          : 'Nicio comandă WooCommerce (processing/completed) în intervalul ales.',
      );
    }

    return this.createDraft({
      locationId,
      userId,
      source: SalesDeductionSource.WOOCOMMERCE,
      periodFrom: from,
      periodTo: to,
      note:
        `${orders} ${orders === 1 ? 'comandă' : 'comenzi'} WooCommerce` +
        (skippedAuto > 0 ? ` (${skippedAuto} deja scăzute automat)` : ''),
      lines: [...agg.values()],
    });
  }

  // ── Auto deduction when a WooCommerce order reaches "processing" ───────

  /**
   * Called for every WooCommerce order the webhook / poll job stores. When the
   * order's status is processing (or completed) and nothing was deducted for
   * it yet, the sold products leave the stock of the org's default location
   * right away — the client's "prăjiturile vândute pe site se scad din stoc
   * când comanda e în procesare". One deduction per Woo order (keyed on
   * fileHash = `woo:<integrationId>:<orderId>`), so webhook retries and the
   * poll job never deduct twice. Products the mapping / name match cannot
   * resolve are kept on the deduction as DECLINE lines for staff to review.
   * Never throws — a failure must not break the order import.
   */
  async autoDeductWooOrder(
    integrationId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    order: any,
  ): Promise<{ deducted: boolean; reason?: string }> {
    if (!salesDeductionsEnabled()) return { deducted: false, reason: 'feature off' };
    if (!Array.isArray(order?.line_items) || !isImportableWooStatus(order?.status)) {
      return { deducted: false, reason: `status ${order?.status ?? '?'}` };
    }
    const orderId = String(order?.id ?? '');
    if (!orderId) return { deducted: false, reason: 'no order id' };
    const key = `woo:${integrationId}:${orderId}`;
    try {
      const existing = await this.prisma.salesDeduction.findFirst({
        where: { fileHash: key, status: { not: SalesDeductionStatus.ANULAT } },
        select: { id: true },
      });
      if (existing) return { deducted: false, reason: 'already deducted' };

      // Everything is resolved in the INTEGRATION's organization — Organization
      // is not tenant-scoped, so a bare organization.findFirst() read the
      // oldest org in the database.
      const integration = await this.prisma.integration.findUnique({
        where: { id: integrationId },
        select: { organizationId: true },
      });
      if (!integration) return { deducted: false, reason: 'no integration' };
      const organizationId = integration.organizationId;

      const [mappings, adminId, org] = await Promise.all([
        this.prisma.productMapping.findMany({
          where: { integrationId },
          select: { externalProductId: true, recipeId: true },
        }),
        findOrgAdministratorId(this.prisma, organizationId),
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { defaultLocationId: true, wooDeliveryEnabled: true },
        }),
      ]);
      if (!adminId) return { deducted: false, reason: 'no administrator' };
      // Main units first ("unitate principală"): the order's pickup location
      // when it is one, else the oldest main unit. Then the legacy fallbacks:
      // the org's default location, the first shop, the first location.
      let locationId: string | null = null;
      // (Main units are part of the shop-delivery feature — off = legacy rules.)
      const mainUnits = org?.wooDeliveryEnabled
        ? await this.prisma.location.findMany({
            where: { organizationId, isActive: true, isMainUnit: true },
            orderBy: { createdAt: 'asc' },
            select: { id: true, externalId: true },
          })
        : [];
      if (mainUnits.length > 0) {
        const pickupIds = new Set(
          (extractPickupiaDelivery(order)?.groups ?? [])
            .map((g) => g.externalId?.toLowerCase())
            .filter((id): id is string => !!id),
        );
        const pickup = mainUnits.find(
          (l) => l.externalId && pickupIds.has(l.externalId.toLowerCase()),
        );
        locationId = (pickup ?? mainUnits[0])?.id ?? null;
      }
      if (!locationId) locationId = org?.defaultLocationId ?? null;
      if (locationId && locationId === org?.defaultLocationId) {
        const loc = await this.prisma.location.findFirst({
          where: { id: locationId, organizationId, isActive: true },
          select: { id: true },
        });
        if (!loc) locationId = null;
      }
      if (!locationId) {
        const shop =
          (await this.prisma.location.findFirst({
            where: { organizationId, isActive: true, type: 'MAGAZIN' },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          })) ??
          (await this.prisma.location.findFirst({
            where: { organizationId, isActive: true },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          }));
        locationId = shop?.id ?? null;
      }
      if (!locationId) return { deducted: false, reason: 'no location' };

      const mappingById = new Map(mappings.map((m) => [m.externalProductId, m.recipeId]));
      const agg = new Map<string, SourceLine>();
      for (const li of order.line_items) {
        const variationId = Number(li?.variation_id) > 0 ? String(li.variation_id) : null;
        const productId = Number(li?.product_id) > 0 ? String(li.product_id) : null;
        const recipeId =
          (variationId ? mappingById.get(variationId) : undefined) ??
          (productId ? mappingById.get(productId) : undefined);
        const name = typeof li?.name === 'string' && li.name.trim() ? li.name.trim() : 'Produs';
        const quantity = Number(li?.quantity) || 0;
        if (quantity <= 0) continue;
        const k = recipeId ? `r:${recipeId}` : `n:${normalizeProductName(name)}`;
        const ex = agg.get(k);
        if (ex) ex.quantity = round3(ex.quantity + quantity);
        else agg.set(k, { rawName: name, rawUnit: null, quantity, recipeId });
      }
      if (agg.size === 0) return { deducted: false, reason: 'no lines' };

      const placed = order?.date_created_gmt
        ? new Date(`${order.date_created_gmt}Z`)
        : order?.date_created
          ? new Date(order.date_created)
          : new Date();
      const wooRef = String(order?.number ?? orderId);
      const draft = await this.createDraft({
        locationId,
        userId: adminId,
        source: SalesDeductionSource.WOOCOMMERCE,
        fileHash: key,
        periodFrom: placed,
        periodTo: placed,
        note: `Comanda WooCommerce #${wooRef} · scăzută automat la „în procesare”`,
        lines: [...agg.values()],
      });
      const lines: ConfirmSalesDeductionLineDto[] = (draft.lines ?? []).map((l) => ({
        id: l.id,
        rawName: l.rawName,
        decision: l.recipeId ? 'ACCEPT' : 'DECLINE',
        recipeId: l.recipeId ?? undefined,
        quantity: l.quantity ?? undefined,
        acceptShortfall: true,
      })) as ConfirmSalesDeductionLineDto[];
      await this.confirm(draft.id, { lines } as ConfirmSalesDeductionDto, adminId);
      this.logger.log(`Woo order #${wooRef} auto-deducted (${draft.id}) at location ${locationId}`);
      return { deducted: true };
    } catch (err) {
      this.logger.error(`Woo order ${orderId} auto-deduction failed: ${(err as Error).message}`);
      return { deducted: false, reason: (err as Error).message };
    }
  }

  private async createDraft(input: {
    locationId: string;
    userId: string;
    source: SalesDeductionSource;
    fileName?: string | null;
    fileHash?: string | null;
    periodFrom?: Date;
    periodTo?: Date;
    note?: string;
    lines: SourceLine[];
  }): Promise<SalesDeductionResponseDto> {
    const { products, aliases } = await this.matchingContext();

    const lines = input.lines.map((l, position) => {
      if (l.recipeId && products.some((p) => p.id === l.recipeId)) {
        return {
          position,
          rawName: l.rawName,
          rawUnit: l.rawUnit,
          quantityReported: l.quantity,
          quantity: l.quantity,
          recipeId: l.recipeId,
          matchScore: 1,
          matchKind: 'MAPPING',
          decision: SalesDeductionDecision.ACCEPT,
        };
      }
      const [best] = rankCandidates(l.rawName, products, aliases, 1);
      const confident = best && best.score >= CONFIDENT_SCORE;
      return {
        position,
        rawName: l.rawName,
        rawUnit: l.rawUnit,
        quantityReported: l.quantity,
        quantity: l.quantity,
        // Weak guesses are suggested (candidates), never pre-selected.
        recipeId: confident ? best.id : null,
        matchScore: best?.score ?? 0,
        matchKind: best?.kind ?? 'NONE',
        decision: confident ? SalesDeductionDecision.ACCEPT : SalesDeductionDecision.CREATE_NEW,
      };
    });

    const created = await this.prisma.salesDeduction.create({
      data: {
        locationId: input.locationId,
        source: input.source,
        fileName: input.fileName ?? null,
        fileHash: input.fileHash ?? null,
        periodFrom: input.periodFrom ?? null,
        periodTo: input.periodTo ?? null,
        note: input.note ?? null,
        createdById: input.userId,
        lines: { create: lines },
      },
      select: { id: true },
    });
    this.logger.log(
      `Sales deduction draft ${created.id} (${input.source}): ${lines.length} lines, ` +
        `${lines.filter((l) => l.recipeId).length} matched`,
    );
    return this.findOne(created.id);
  }

  // ── Read ───────────────────────────────────────────────────────────────

  async findAll(page = 1, limit = 20): Promise<PaginatedDto<SalesDeductionResponseDto>> {
    const where: Prisma.SalesDeductionWhereInput = {
      // Abandoned drafts are noise in the log.
      NOT: { status: SalesDeductionStatus.ANULAT, confirmedAt: null },
    };
    const [rows, total] = await Promise.all([
      this.prisma.salesDeduction.findMany({
        where,
        include: DEDUCTION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.salesDeduction.count({ where }),
    ]);
    const data = rows.map((d) => this.toDto(d, [], false));
    return new PaginatedDto(data, total, page, limit);
  }

  async findOne(id: string): Promise<SalesDeductionResponseDto> {
    const d = await this.prisma.salesDeduction.findUnique({
      where: { id },
      include: DEDUCTION_INCLUDE,
    });
    if (!d) throw new NotFoundException('Scăderea nu a fost găsită.');

    const duplicateOf = d.fileHash
      ? (
          await this.prisma.salesDeduction.findMany({
            where: {
              id: { not: d.id },
              fileHash: d.fileHash,
              status: SalesDeductionStatus.CONFIRMED,
            },
            select: { id: true },
          })
        ).map((x) => x.id)
      : [];

    const dto = this.toDto(d, duplicateOf, true);
    if (d.status === SalesDeductionStatus.DRAFT && dto.lines?.length) {
      // Review aids, computed live (never stored): best name matches per
      // line and the matched product's stock at the location right now.
      const { products, aliases } = await this.matchingContext();
      const stocks = await this.stockMap(
        d.locationId,
        products.map((p) => p.id),
      );
      for (const line of dto.lines) {
        line.candidates = rankCandidates(line.rawName, products, aliases, 3).map(
          (c) => new SalesMatchCandidateDto({ ...c, score: round3(c.score) }),
        );
        line.currentStock = line.recipeId ? (stocks.get(line.recipeId) ?? 0) : null;
      }
    }
    return dto;
  }

  // ── Confirm ────────────────────────────────────────────────────────────

  async confirm(
    id: string,
    dto: ConfirmSalesDeductionDto,
    userId: string,
  ): Promise<SalesDeductionResponseDto> {
    const draft = await this.prisma.salesDeduction.findUnique({
      where: { id },
      select: { id: true, status: true, locationId: true, lines: { select: { id: true } } },
    });
    if (!draft) throw new NotFoundException('Scăderea nu a fost găsită.');
    if (draft.status !== SalesDeductionStatus.DRAFT) {
      throw new ConflictException({
        errorCode: 'SALES_002',
        message: 'Scăderea a fost deja confirmată sau anulată.',
      });
    }
    const draftLineIds = new Set(draft.lines.map((l) => l.id));
    this.validateLines(dto.lines, draftLineIds);

    const locationId = draft.locationId;
    const recipeIds = [
      ...new Set(
        dto.lines.flatMap((l) => (l.decision === 'ACCEPT' && l.recipeId ? [l.recipeId] : [])),
      ),
    ];
    const recipes = await this.prisma.recipe.findMany({
      where: { id: { in: recipeIds } },
      select: { id: true, name: true, unit: true, isArchived: true, isDraft: true },
    });
    const recipeById = new Map(recipes.map((r) => [r.id, r]));
    const missing = recipeIds.filter((rid) => !recipeById.has(rid));
    if (missing.length) throw new BadRequestException('Unele produse alese nu mai există.');

    // Pre-flight shortfall check against live stock, BEFORE writing anything,
    // so the client gets the full list in one go.
    const live = await this.stockMap(locationId, recipeIds);
    const running = new Map(live);
    const unacknowledged: { recipeName: string; quantity: number; stock: number }[] = [];
    for (const l of dto.lines) {
      const recipe = l.decision === 'ACCEPT' && l.recipeId ? recipeById.get(l.recipeId) : null;
      if (!recipe) continue;
      const before = running.get(recipe.id) ?? 0;
      const qty = l.quantity ?? 0;
      const after = l.stockOverride ?? Math.max(0, before - qty);
      if (qty > before && l.stockOverride == null && !l.acceptShortfall) {
        unacknowledged.push({
          recipeName: recipe.name,
          quantity: qty,
          stock: before,
        });
      }
      running.set(recipe.id, after);
    }
    if (unacknowledged.length) {
      // The global exception filter only forwards errorCode + message, so the
      // offending products ride in the message (clients pre-check anyway).
      const list = unacknowledged
        .slice(0, 5)
        .map((u) => `${u.recipeName} (vândut ${u.quantity}, stoc ${u.stock})`)
        .join(', ');
      throw new ConflictException({
        errorCode: 'SALES_001',
        message:
          `Vânzări mai mari decât stocul: ${list}` +
          (unacknowledged.length > 5 ? ` și încă ${unacknowledged.length - 5}` : '') +
          '. Confirmă scăderea până la 0 sau suprascrie stocul.',
      });
    }

    const touched = new Set<string>();
    const createdProducts: string[] = [];
    const summary = { accepted: 0, declined: 0, created: 0, shortfalls: 0, overrides: 0 };

    await this.prisma.$transaction(
      async (tx) => {
        // Claim the draft atomically — a double-click / retry matches 0 rows.
        const claimed = await tx.salesDeduction.updateMany({
          where: { id, status: SalesDeductionStatus.DRAFT },
          data: {
            status: SalesDeductionStatus.CONFIRMED,
            confirmedById: userId,
            confirmedAt: new Date(),
            note: dto.note ?? undefined,
          },
        });
        if (claimed.count === 0) {
          throw new ConflictException({
            errorCode: 'SALES_002',
            message: 'Scăderea a fost deja confirmată sau anulată.',
          });
        }

        // The body is authoritative: draft lines left out were removed by the user.
        const keptIds = dto.lines.map((l) => l.id).filter((x): x is string => !!x);
        await tx.salesDeductionLine.deleteMany({
          where: { salesDeductionId: id, id: { notIn: keptIds } },
        });

        const ref = `Scădere vânzări #${id.slice(0, 8)}`;
        for (const [position, l] of dto.lines.entries()) {
          const lineData: Prisma.SalesDeductionLineUncheckedUpdateInput = {
            position,
            rawName: l.rawName,
            decision: l.decision,
            quantity: l.quantity ?? null,
            stockOverride: l.stockOverride ?? null,
            recipeId: null,
            shortfall: null,
            stockBefore: null,
            stockAfter: null,
          };

          if (l.decision === 'DECLINE') {
            summary.declined++;
            lineData.recipeId = l.recipeId ?? null;
          } else if (l.decision === 'CREATE_NEW') {
            const np = l.newProduct;
            if (!np) throw new BadRequestException('Lipsesc datele produsului nou.');
            const recipe = await tx.recipe.create({
              data: {
                name: np.name.trim(),
                unit: np.unit,
                yieldQuantity: 1,
                type: RecipeType.FINAL,
                category: np.category ?? null,
                createdById: userId,
              },
              select: { id: true, name: true },
            });
            createdProducts.push(recipe.name);
            await tx.recipeStock.create({
              data: { locationId, recipeId: recipe.id, quantity: np.initialStock },
            });
            await tx.stockMovement.create({
              data: {
                recipeId: recipe.id,
                locationId,
                movementType: StockMovementType.INTRARE,
                quantity: np.initialStock,
                unit: np.unit,
                performedById: userId,
                referenceNote: `${ref} · produs nou din raport („${l.rawName}")`,
              },
            });
            await this.saveAlias(tx, l.rawName, recipe.id);
            touched.add(recipe.id);
            summary.created++;
            Object.assign(lineData, {
              recipeId: recipe.id,
              stockBefore: 0,
              stockAfter: np.initialStock,
            });
          } else {
            const r = l.recipeId ? recipeById.get(l.recipeId) : undefined;
            if (!r) throw new BadRequestException(`Produs lipsă pe rândul „${l.rawName}".`);
            const qty = l.quantity ?? 0;
            const row = await tx.recipeStock.findUnique({
              where: { locationId_recipeId: { locationId, recipeId: r.id } },
              select: { quantity: true },
            });
            const before = num(row?.quantity) ?? 0;
            const after = round3(l.stockOverride ?? Math.max(0, before - qty));
            const shortfall = qty > before && l.stockOverride == null ? round3(qty - before) : null;

            await tx.recipeStock.upsert({
              where: { locationId_recipeId: { locationId, recipeId: r.id } },
              update: { quantity: after },
              create: { locationId, recipeId: r.id, quantity: after },
            });
            const removed = before - after;
            if (removed > 0) await consumeRecipeLotsFifo(tx, r.id, locationId, removed);

            // Movements: the SALE as confirmed (sacred), then the override if any.
            if (qty > 0) {
              await tx.stockMovement.create({
                data: {
                  recipeId: r.id,
                  locationId,
                  movementType: StockMovementType.IESIRE_VANZARE,
                  quantity: qty,
                  unit: r.unit,
                  performedById: userId,
                  referenceNote: shortfall
                    ? `${ref} · stoc insuficient (${before}), lipsă ${shortfall} — stoc adus la 0`
                    : ref,
                },
              });
            } else if (qty < 0) {
              await tx.stockMovement.create({
                data: {
                  recipeId: r.id,
                  locationId,
                  movementType: StockMovementType.INTRARE,
                  quantity: -qty,
                  unit: r.unit,
                  performedById: userId,
                  referenceNote: `${ref} · corecție (adăugat înapoi)`,
                },
              });
            }
            if (l.stockOverride != null) {
              await tx.stockMovement.create({
                data: {
                  recipeId: r.id,
                  locationId,
                  movementType: StockMovementType.AJUSTARE,
                  quantity: after,
                  unit: r.unit,
                  performedById: userId,
                  referenceNote: `${ref} · stoc suprascris la ${after}`,
                },
              });
              summary.overrides++;
            }
            if (normalizeProductName(l.rawName) !== normalizeProductName(r.name)) {
              await this.saveAlias(tx, l.rawName, r.id);
            }
            if (shortfall) summary.shortfalls++;
            summary.accepted++;
            touched.add(r.id);
            Object.assign(lineData, {
              recipeId: r.id,
              stockBefore: before,
              stockAfter: after,
              shortfall,
            });
          }

          if (l.id && draftLineIds.has(l.id)) {
            await tx.salesDeductionLine.update({ where: { id: l.id }, data: lineData });
          } else {
            await tx.salesDeductionLine.create({
              data: {
                ...(lineData as Prisma.SalesDeductionLineUncheckedCreateInput),
                salesDeductionId: id,
                matchKind: 'MANUAL',
              },
            });
          }
        }

        await this.resyncRecipeAggregates(tx, [...touched]);
      },
      { timeout: 60_000 },
    );

    await this.emitStock([...touched], MovementType.OUT);
    await this.notifySummary(id, locationId, userId, summary, createdProducts);
    this.logger.log(`Sales deduction ${id} confirmed: ${JSON.stringify(summary)}`);
    return this.findOne(id);
  }

  private validateLines(lines: ConfirmSalesDeductionLineDto[], draftLineIds: Set<string>): void {
    const errors: string[] = [];
    lines.forEach((l, i) => {
      const label = `Rândul ${i + 1} („${l.rawName}")`;
      if (l.id && !draftLineIds.has(l.id)) errors.push(`${label}: rând necunoscut.`);
      if (l.decision === 'ACCEPT') {
        if (!l.recipeId) errors.push(`${label}: alege produsul din aplicație.`);
        if (l.quantity == null && l.stockOverride == null) {
          errors.push(`${label}: lipsește cantitatea.`);
        }
      }
      if (l.decision === 'CREATE_NEW' && !l.newProduct) {
        errors.push(`${label}: completează datele produsului nou.`);
      }
    });
    if (errors.length) throw new BadRequestException(errors.slice(0, 10).join(' '));
  }

  // ── Discard / revert ───────────────────────────────────────────────────

  /** Drop an unconfirmed draft (kept as ANULAT, hidden from the log). */
  async discard(id: string): Promise<void> {
    const res = await this.prisma.salesDeduction.updateMany({
      where: { id, status: SalesDeductionStatus.DRAFT },
      data: { status: SalesDeductionStatus.ANULAT },
    });
    if (res.count === 0) {
      throw new ConflictException({
        errorCode: 'SALES_002',
        message: 'Doar o scădere neconfirmată poate fi renunțată.',
      });
    }
  }

  /**
   * Undo a confirmed deduction: every accepted line's net effect
   * (stockBefore − stockAfter) is put back on today's stock (clamped at 0).
   * Products created from the report are kept. Lot attribution consumed by
   * the original deduction is not restored (the restored quantity stays
   * unattributed, like pre-lot stock).
   */
  async revert(id: string, userId: string): Promise<SalesDeductionResponseDto> {
    const d = await this.prisma.salesDeduction.findUnique({
      where: { id },
      include: { lines: { include: { recipe: { select: { unit: true } } } } },
    });
    if (!d) throw new NotFoundException('Scăderea nu a fost găsită.');
    if (d.status !== SalesDeductionStatus.CONFIRMED) {
      throw new ConflictException({
        errorCode: 'SALES_002',
        message: 'Doar o scădere confirmată poate fi anulată.',
      });
    }
    const touched = new Set<string>();
    await this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.salesDeduction.updateMany({
          where: { id, status: SalesDeductionStatus.CONFIRMED },
          data: { status: SalesDeductionStatus.ANULAT, revertedAt: new Date() },
        });
        if (claimed.count === 0) {
          throw new ConflictException({
            errorCode: 'SALES_002',
            message: 'Scăderea a fost deja anulată.',
          });
        }
        const ref = `Anulare scădere vânzări #${id.slice(0, 8)}`;
        for (const l of d.lines) {
          if (l.decision !== 'ACCEPT' || !l.recipeId || l.stockBefore == null) continue;
          const delta = Number(l.stockBefore) - Number(l.stockAfter ?? 0);
          if (delta === 0) continue;
          const row = await tx.recipeStock.findUnique({
            where: { locationId_recipeId: { locationId: d.locationId, recipeId: l.recipeId } },
            select: { quantity: true },
          });
          const current = num(row?.quantity) ?? 0;
          const next = round3(Math.max(0, current + delta));
          await tx.recipeStock.upsert({
            where: { locationId_recipeId: { locationId: d.locationId, recipeId: l.recipeId } },
            update: { quantity: next },
            create: { locationId: d.locationId, recipeId: l.recipeId, quantity: next },
          });
          if (current > next) {
            await consumeRecipeLotsFifo(tx, l.recipeId, d.locationId, current - next);
          }
          await tx.stockMovement.create({
            data: {
              recipeId: l.recipeId,
              locationId: d.locationId,
              movementType: StockMovementType.AJUSTARE,
              quantity: next,
              unit: l.recipe?.unit ?? 'BUCATI',
              performedById: userId,
              referenceNote: `${ref} · ${delta > 0 ? '+' : ''}${round3(delta)}`,
            },
          });
          touched.add(l.recipeId);
        }
        await this.resyncRecipeAggregates(tx, [...touched]);
      },
      { timeout: 60_000 },
    );
    await this.emitStock([...touched], MovementType.ADJUSTMENT);
    return this.findOne(id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async ensureLocation(locationId: string): Promise<void> {
    const loc = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true },
    });
    if (!loc) throw new NotFoundException('Locația nu a fost găsită.');
  }

  private async matchingContext(): Promise<{
    products: MatchCandidate[];
    aliases: Map<string, string>;
  }> {
    const [products, aliasRows] = await Promise.all([
      this.prisma.recipe.findMany({
        where: { isArchived: false, isDraft: false },
        select: { id: true, name: true },
      }),
      this.prisma.salesProductAlias.findMany({
        select: { normalizedName: true, recipeId: true },
      }),
    ]);
    return {
      products,
      aliases: new Map(aliasRows.map((a) => [a.normalizedName, a.recipeId])),
    };
  }

  private async stockMap(locationId: string, recipeIds: string[]): Promise<Map<string, number>> {
    if (recipeIds.length === 0) return new Map();
    const rows = await this.prisma.recipeStock.findMany({
      where: { locationId, recipeId: { in: recipeIds } },
      select: { recipeId: true, quantity: true },
    });
    return new Map(rows.map((r) => [r.recipeId, Number(r.quantity)]));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async saveAlias(tx: any, rawName: string, recipeId: string): Promise<void> {
    const normalizedName = normalizeProductName(rawName);
    if (!normalizedName) return;
    const existing = await tx.salesProductAlias.findFirst({
      where: { normalizedName },
      select: { id: true },
    });
    if (existing) {
      await tx.salesProductAlias.update({
        where: { id: existing.id },
        data: { recipeId, rawName },
      });
    } else {
      await tx.salesProductAlias.create({ data: { normalizedName, rawName, recipeId } });
    }
  }

  /** Recipe.stockCount = Σ RecipeStock (same contract as syncRecipeAggregate). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async resyncRecipeAggregates(tx: any, recipeIds: string[]): Promise<void> {
    for (const recipeId of recipeIds) {
      const agg = await tx.recipeStock.aggregate({
        where: { recipeId },
        _sum: { quantity: true },
      });
      await tx.recipe.update({
        where: { id: recipeId },
        data: { stockCount: Math.max(0, Math.round(Number(agg._sum.quantity ?? 0))) },
      });
    }
  }

  /** Same per-product stock event production/byproducts emit — clients refresh live. */
  private async emitStock(recipeIds: string[], movementType: MovementType): Promise<void> {
    if (recipeIds.length === 0) return;
    const recipes = await this.prisma.recipe.findMany({
      where: { id: { in: recipeIds } },
      select: { id: true, name: true, stockCount: true },
    });
    for (const r of recipes) {
      this.websocket.emitStockUpdate({
        materialId: r.id,
        materialTitle: r.name,
        newStockCount: Number(r.stockCount),
        movementType,
      });
    }
  }

  /** ONE notification for the whole confirmation (confirmer + administrators). */
  private async notifySummary(
    id: string,
    locationId: string,
    userId: string,
    s: {
      accepted: number;
      declined: number;
      created: number;
      shortfalls: number;
      overrides: number;
    },
    createdProducts: string[],
  ): Promise<void> {
    try {
      const location = await this.prisma.location.findUnique({
        where: { id: locationId },
        select: { name: true },
      });
      const admins = await this.prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          dynamicRole: { is: { slug: 'administrator' } },
        },
        select: { id: true },
      });
      const recipients = new Set([userId, ...admins.map((a) => a.id)]);
      const parts = [`${s.accepted} ${s.accepted === 1 ? 'produs scăzut' : 'produse scăzute'}`];
      if (s.shortfalls) parts.push(`${s.shortfalls} cu stoc insuficient (adus la 0)`);
      if (s.overrides) parts.push(`${s.overrides} cu stoc suprascris`);
      if (s.created) parts.push(`${s.created} ${s.created === 1 ? 'produs nou' : 'produse noi'}`);
      if (s.declined) parts.push(`${s.declined} ignorate`);
      const body =
        parts.join(' · ') +
        (createdProducts.length ? `. Noi: ${createdProducts.slice(0, 5).join(', ')}` : '');
      for (const recipient of recipients) {
        await this.notifications.notifyUser(recipient, {
          type: 'SALES_DEDUCTION',
          title: `Vânzări scăzute din stoc — ${location?.name ?? 'locație'}`,
          body,
          data: { salesDeductionId: id },
        });
      }
    } catch (e) {
      this.logger.warn(`Sales deduction ${id}: summary notification failed: ${String(e)}`);
    }
  }

  private toDto(
    d: DeductionWithLines,
    duplicateOf: string[],
    withLines: boolean,
  ): SalesDeductionResponseDto {
    const lines = d.lines;
    const summary = new SalesDeductionSummaryDto({
      total: lines.length,
      accepted: lines.filter((l) => l.decision === 'ACCEPT').length,
      declined: lines.filter((l) => l.decision === 'DECLINE').length,
      created: lines.filter((l) => l.decision === 'CREATE_NEW').length,
      shortfalls: lines.filter((l) => l.shortfall != null && Number(l.shortfall) > 0).length,
      overrides: lines.filter((l) => l.stockOverride != null).length,
      unmatched: lines.filter((l) => !l.recipeId).length,
    });
    return new SalesDeductionResponseDto({
      id: d.id,
      locationId: d.locationId,
      locationName: d.location.name,
      source: d.source,
      status: d.status,
      fileName: d.fileName,
      periodFrom: d.periodFrom,
      periodTo: d.periodTo,
      note: d.note,
      createdByName: fullName(d.createdBy),
      confirmedByName: d.confirmedBy ? fullName(d.confirmedBy) : null,
      createdAt: d.createdAt,
      confirmedAt: d.confirmedAt,
      revertedAt: d.revertedAt,
      duplicateOf,
      summary,
      lines: withLines
        ? lines.map(
            (l) =>
              new SalesDeductionLineResponseDto({
                id: l.id,
                position: l.position,
                rawName: l.rawName,
                rawUnit: l.rawUnit,
                quantityReported: num(l.quantityReported),
                recipeId: l.recipeId,
                recipeName: l.recipe?.name ?? null,
                recipeUnit: l.recipe?.unit ?? null,
                matchScore: num(l.matchScore),
                matchKind: l.matchKind,
                decision: l.decision,
                quantity: num(l.quantity),
                stockOverride: num(l.stockOverride),
                shortfall: num(l.shortfall),
                stockBefore: num(l.stockBefore),
                stockAfter: num(l.stockAfter),
                currentStock: null,
                candidates: [],
              }),
          )
        : undefined,
    });
  }
}

/** Short Romanian unit label for the CSV template (what the parser reads back as U.M.). */
function unitTypeLabel(unit: string): string {
  switch (unit) {
    case 'BUCATI':
      return 'buc';
    case 'KILOGRAME':
      return 'kg';
    case 'GRAME':
      return 'g';
    case 'LITRI':
      return 'l';
    case 'MILILITRI':
      return 'ml';
    default:
      return unit.toLowerCase();
  }
}
