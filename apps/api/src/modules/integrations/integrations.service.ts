import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { IntegrationProvider, IntegrationSyncStatus, OrderFulfillmentType } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { findOrgAdministratorId } from '@/modules/roles/org-administrator';
import { SalesDeductionsService } from '@/modules/sales-deductions/sales-deductions.service';
import { runAsOrg, runWithoutTenant } from '@/prisma/tenant-context';
import {
  CreateIntegrationDto,
  UpdateIntegrationDto,
  IntegrationResponseDto,
  CreateProductMappingDto,
  ProductMappingResponseDto,
  ExternalOrderResponseDto,
} from './dto';
import { extractPickupiaDelivery, pickupiaMethodLabel, PickupiaDelivery } from './pickupia.parser';
import { parseRomanianDeadline } from './ro-deadline.parser';
import { verifyWooSignature, wooWebhookSecret } from './woo-webhook-signature';
import {
  extractWooCustomerName,
  extractWooPickupText,
  IMPORTABLE_WOO_STATUS_FILTER,
  isImportableWooStatus,
  parseWooConfig,
  WooCommerceClient,
  WooOrder,
} from './woocommerce.client';

const MS_DAY = 86_400_000;
/** How far back the manual WooCommerce backfill looks. */
const BACKFILL_LOOKBACK_DAYS = 90;
/** WooCommerce max is 100 per page. */
const BACKFILL_PER_PAGE = 100;
/** Safety cap so a misbehaving store can't spin the request forever. */
const BACKFILL_MAX_PAGES = 50;

export interface WooBackfillResult {
  /** Orders fetched from the store (status processing/completed, last 90 days). */
  fetched: number;
  /** Stored/refreshed as PENDING external orders (deadline today or future). */
  stored: number;
  /** Recorded as SKIPPED — deadline in the past (or undetectable), no Order created. */
  skippedPast: number;
  /** Orders created by the sync pass. */
  synced: number;
  /** External orders that failed to sync. */
  failed: number;
}

/** Woo `date_created_gmt` (UTC, no zone suffix) or `date_created`; null when absent/invalid. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wooPlacedAt(payload: any): Date | null {
  const gmt = typeof payload?.date_created_gmt === 'string' ? payload.date_created_gmt : null;
  const local = typeof payload?.date_created === 'string' ? payload.date_created : null;
  const d = gmt ? new Date(`${gmt}Z`) : local ? new Date(local) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Delivery data of a Woo order: Pickupia meta first, legacy free-text pickup field as fallback. */
export interface WooDelivery {
  /** Confident due date (UTC midnight) or null. */
  dueDate: Date | null;
  /** Legacy pickup text that could not be parsed confidently — staff reconcile it by hand. */
  uncertainText: string | null;
  /** Pickupia data when the order carries it. */
  pickupia: PickupiaDelivery | null;
}

/**
 * Pickupia (the shop's delivery plugin) writes a structured date + method and
 * wins whenever present (and the org has the shop-delivery feature on). The old free-text "Comanda se ridică…" line-item field
 * is deprecated but still honoured for orders placed without the plugin.
 */
export function resolveWooDelivery(order: WooOrder, usePickupia = true): WooDelivery {
  const pickupia = usePickupia ? extractPickupiaDelivery(order) : null;
  if (pickupia?.dueDate) return { dueDate: pickupia.dueDate, uncertainText: null, pickupia };

  const pickupText = extractWooPickupText(order);
  if (pickupText) {
    const orderDate = order.date_created ? new Date(order.date_created) : new Date();
    const parsed = parseRomanianDeadline(pickupText, orderDate);
    if (parsed.date && (parsed.confidence === 'high' || parsed.confidence === 'medium')) {
      return { dueDate: parsed.date, uncertainText: null, pickupia };
    }
    return { dueDate: null, uncertainText: parsed.raw, pickupia };
  }
  return { dueDate: null, uncertainText: null, pickupia };
}

const RO_DAY = new Intl.DateTimeFormat('ro-RO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** "2026-10-19" → "luni, 19 octombrie". */
function formatRoDay(isoDay: string): string {
  return RO_DAY.format(new Date(`${isoDay}T00:00:00.000Z`));
}

/** Woo shipping (else billing) address as one line, or null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wooAddress(payload: any): string | null {
  for (const block of [payload?.shipping, payload?.billing]) {
    if (!block || typeof block !== 'object') continue;
    const parts = [block.address_1, block.address_2, block.city]
      .map((p: unknown) => (typeof p === 'string' ? p.trim() : ''))
      .filter((p: string) => p.length > 0);
    if (parts.length > 0) return parts.join(', ');
  }
  return null;
}

/** Raw request data needed to authenticate a provider webhook. */
export interface WebhookAuth {
  rawBody?: Buffer;
  signature?: string;
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly salesDeductions: SalesDeductionsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Integration CRUD
  // ---------------------------------------------------------------------------

  async findAll(): Promise<IntegrationResponseDto[]> {
    const integrations = await this.prisma.integration.findMany({
      include: { _count: { select: { mappings: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return integrations.map((i) => this.toIntegrationDto(i));
  }

  async findOne(id: string): Promise<IntegrationResponseDto> {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
      include: { _count: { select: { mappings: true } } },
    });

    if (!integration) throw new NotFoundException('Integration not found');
    return this.toIntegrationDto(integration);
  }

  async create(dto: CreateIntegrationDto): Promise<IntegrationResponseDto> {
    const integration = await this.prisma.integration.create({
      data: {
        provider: dto.provider,
        config: (dto.config as any) ?? {},
      },
      include: { _count: { select: { mappings: true } } },
    });

    return this.toIntegrationDto(integration);
  }

  async update(id: string, dto: UpdateIntegrationDto): Promise<IntegrationResponseDto> {
    const existing = await this.prisma.integration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Integration not found');

    const integration = await this.prisma.integration.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.config !== undefined && { config: dto.config as any }),
      },
      include: { _count: { select: { mappings: true } } },
    });

    return this.toIntegrationDto(integration);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.integration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Integration not found');

    await this.prisma.integration.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Product Mappings
  // ---------------------------------------------------------------------------

  async findMappings(integrationId: string): Promise<ProductMappingResponseDto[]> {
    await this.ensureIntegrationExists(integrationId);

    const mappings = await this.prisma.productMapping.findMany({
      where: { integrationId },
      include: { recipe: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return mappings.map((m) => this.toMappingDto(m));
  }

  async createMapping(
    integrationId: string,
    dto: CreateProductMappingDto,
  ): Promise<ProductMappingResponseDto> {
    await this.ensureIntegrationExists(integrationId);

    // Validate recipe exists
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: dto.recipeId },
      select: { id: true, name: true },
    });
    if (!recipe) throw new NotFoundException('Recipe not found');

    const mapping = await this.prisma.productMapping.create({
      data: {
        integrationId,
        externalProductId: dto.externalProductId,
        externalProductName: dto.externalProductName,
        recipeId: dto.recipeId,
      },
      include: { recipe: { select: { name: true } } },
    });

    return this.toMappingDto(mapping);
  }

  async removeMapping(integrationId: string, mappingId: string): Promise<void> {
    // ProductMapping has no organizationId — the integration check scopes it.
    await this.ensureIntegrationExists(integrationId);
    const mapping = await this.prisma.productMapping.findFirst({
      where: { id: mappingId, integrationId },
    });
    if (!mapping) throw new NotFoundException('Product mapping not found');

    await this.prisma.productMapping.delete({ where: { id: mappingId } });
  }

  // ---------------------------------------------------------------------------
  // External Orders
  // ---------------------------------------------------------------------------

  async findExternalOrders(integrationId: string): Promise<ExternalOrderResponseDto[]> {
    await this.ensureIntegrationExists(integrationId);

    const orders = await this.prisma.externalOrderSource.findMany({
      where: { integrationId },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((o) => this.toExternalOrderDto(o));
  }

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------

  async triggerSync(integrationId: string): Promise<{ synced: number; failed: number }> {
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
      select: { organizationId: true },
    });
    if (!integration) throw new NotFoundException('Integration not found');

    // Find all pending external orders
    const pendingOrders = await this.prisma.externalOrderSource.findMany({
      where: { integrationId, syncStatus: IntegrationSyncStatus.PENDING },
    });

    if (pendingOrders.length === 0) {
      return { synced: 0, failed: 0 };
    }

    // Load all mappings for this integration
    const mappings = await this.prisma.productMapping.findMany({
      where: { integrationId },
    });
    const mappingByExternalId = new Map(mappings.map((m) => [m.externalProductId, m]));

    // Pickupia delivery methods carry the id of the pickup location
    // (Location.externalId, set in location management).
    // ...only when the org uses the shop-delivery feature (Organization.wooDeliveryEnabled).
    const org = await this.prisma.organization.findUnique({
      where: { id: integration.organizationId },
      select: { wooDeliveryEnabled: true },
    });
    const wooDelivery = org?.wooDeliveryEnabled === true;
    const locations = wooDelivery
      ? await this.prisma.location.findMany({
          where: { organizationId: integration.organizationId, externalId: { not: null } },
          select: { id: true, name: true, externalId: true },
        })
      : [];
    const locationByExternalId = new Map(
      locations.map((l) => [(l.externalId ?? '').toLowerCase(), l] as const),
    );

    // An active administrator of THIS organization (dynamic role) is the
    // createdById of auto-created orders.
    const adminUserId = await findOrgAdministratorId(this.prisma, integration.organizationId);
    if (!adminUserId) {
      throw new BadRequestException(
        'Nu există niciun administrator activ în organizație pentru a crea comenzile importate',
      );
    }
    const adminUser = { id: adminUserId };

    let synced = 0;
    let failed = 0;

    for (const extOrder of pendingOrders) {
      try {
        const rawPayload = extOrder.rawPayload as any;
        // A WooCommerce order carries `line_items[]`; the legacy webhook shape
        // carries `items[]`. Detect and map each to internal order items.
        const isWooOrder = Array.isArray(rawPayload?.line_items);
        const wooStatus = typeof rawPayload?.status === 'string' ? rawPayload.status : null;

        // Unfinished checkouts (`pending`, `on-hold`, `cancelled`, …) must never
        // become production orders — record them as SKIPPED, not FAILED.
        if (isWooOrder && !isImportableWooStatus(wooStatus)) {
          await this.prisma.externalOrderSource.update({
            where: { id: extOrder.id },
            data: {
              syncStatus: IntegrationSyncStatus.SKIPPED,
              errorMessage: `Status WooCommerce „${wooStatus}” — se importă doar comenzile processing/completed`,
            },
          });
          continue;
        }

        const orderItems: { recipeId: string | null; label: string | null; quantity: number }[] =
          [];
        if (isWooOrder) {
          const lineItems: any[] = rawPayload.line_items;
          if (lineItems.length === 0) {
            throw new Error('No line_items found in WooCommerce order');
          }
          for (const li of lineItems) {
            // Resolve the mapping by the Woo PRODUCT identity only: the
            // variation id first (more specific), then the product id. NEVER
            // fall back to `li.id` — that is the order line-item id, an
            // unrelated auto-increment that can collide with another product's
            // id and silently import the wrong recipe.
            const variationId = Number(li?.variation_id) > 0 ? String(li.variation_id) : null;
            const productId = Number(li?.product_id) > 0 ? String(li.product_id) : null;
            const mapping =
              (variationId ? mappingByExternalId.get(variationId) : undefined) ??
              (productId ? mappingByExternalId.get(productId) : undefined);

            const quantity = Number(li?.quantity) || 1;
            if (mapping) {
              orderItems.push({ recipeId: mapping.recipeId, label: null, quantity });
            } else {
              // No mapping — keep the Woo product NAME as a free-text label
              // instead of guessing a recipe (or failing the whole order).
              const name = typeof li?.name === 'string' ? li.name.trim() : '';
              orderItems.push({
                recipeId: null,
                label: name || `Produs WooCommerce #${productId ?? variationId ?? '?'}`,
                quantity,
              });
            }
          }
        } else {
          const items: { externalProductId: string; quantity: number }[] = rawPayload?.items ?? [];
          if (items.length === 0) {
            throw new Error('No items found in rawPayload');
          }
          for (const item of items) {
            const mapping = mappingByExternalId.get(item.externalProductId);
            if (!mapping) {
              throw new Error(`No mapping found for external product: ${item.externalProductId}`);
            }
            orderItems.push({
              recipeId: mapping.recipeId,
              label: null,
              quantity: item.quantity,
            });
          }
        }

        // Order number denotes the source. WooCommerce orders take the store's
        // own order number (WOO-11351) — traceable back to the shop and stable,
        // so a re-sync of the same order never duplicates it. The legacy webhook
        // shape keeps the timestamped EXT- number.
        const wooRef = String(rawPayload?.number ?? rawPayload?.id ?? extOrder.externalId);
        const orderNumber = isWooOrder ? `WOO-${wooRef}` : `EXT-${Date.now()}`;
        let deliveryPoint: string =
          rawPayload?.deliveryPoint ?? (isWooOrder ? 'WooCommerce' : 'External Order');

        // Customer name (Woo billing first + last name) so staff know whose
        // order it is; external status is surfaced on the order for the UI.
        const customerName = isWooOrder ? extractWooCustomerName(rawPayload as WooOrder) : null;
        const externalStatus = isWooOrder ? wooStatus : null;
        // The order's own time, so the list sorts WOO-numbers the way the shop
        // does (bigger = newer) regardless of when the sync stored it.
        const placedAt = isWooOrder ? wooPlacedAt(rawPayload) : null;

        // Every WooCommerce order carries a visible source line in its notes so
        // staff can tell at a glance where it came from.
        let notes: string | null = rawPayload?.notes ?? null;
        if (isWooOrder) {
          notes = (notes ? notes + '\n' : '') + `Sursă: WooCommerce · comanda #${wooRef}`;
        }

        // Delivery date + method for WooCommerce orders: Pickupia meta first,
        // the deprecated free-text pickup field as fallback. A confident date
        // sets Order.dueDate; anything uncertain is left null and the raw text
        // is appended to notes so staff can reconcile it by hand.
        let dueDate: Date | null = null;
        let deliveryMethod: string | null = null;
        let fulfillmentType: OrderFulfillmentType = OrderFulfillmentType.DELIVERY;
        let pickupLocationId: string | null = null;
        let deliveryAddress: string | null = null;
        if (isWooOrder) {
          const delivery = resolveWooDelivery(rawPayload as WooOrder, wooDelivery);
          dueDate = delivery.dueDate;
          if (delivery.uncertainText) {
            notes = (notes ? notes + '\n' : '') + 'Termen de verificat: ' + delivery.uncertainText;
          }
          const pickupia = delivery.pickupia;
          if (pickupia) {
            deliveryMethod = pickupiaMethodLabel(pickupia);
            // A method whose external id matches a location = pickup from there.
            const location = pickupia.groups
              .map((g) =>
                g.externalId ? locationByExternalId.get(g.externalId.toLowerCase()) : undefined,
              )
              .find((l) => l !== undefined);
            if (location) {
              fulfillmentType = OrderFulfillmentType.PICKUP;
              pickupLocationId = location.id;
              deliveryPoint = location.name;
            } else {
              deliveryPoint = deliveryMethod ?? deliveryPoint;
              deliveryAddress = wooAddress(rawPayload);
            }
            // Several (method, date) groups — spell them out for staff.
            if (pickupia.groups.length > 1) {
              const lines = pickupia.groups.map(
                (g) => `• ${g.method || 'Livrare'} — ${g.date ? formatRoDay(g.date) : 'fără dată'}`,
              );
              notes = (notes ? notes + '\n' : '') + 'Livrări:\n' + lines.join('\n');
            }
          }
        }

        // Create the order and update the external order source in a transaction
        const order = await this.prisma.$transaction(async (tx) => {
          const createdOrder = await tx.order.create({
            data: {
              orderNumber,
              ...(placedAt ? { createdAt: placedAt } : {}),
              fulfillmentType,
              pickupLocationId,
              deliveryPoint,
              deliveryAddress,
              deliveryMethod,
              customerName,
              externalStatus,
              notes,
              dueDate,
              createdById: adminUser.id,
              items: {
                create: orderItems.map((oi) => ({
                  recipeId: oi.recipeId,
                  label: oi.label,
                  quantity: oi.quantity,
                  unit: 'BUCATI',
                })),
              },
            },
          });

          await tx.externalOrderSource.update({
            where: { id: extOrder.id },
            data: {
              syncStatus: IntegrationSyncStatus.SYNCED,
              orderId: createdOrder.id,
            },
          });

          return createdOrder;
        });

        this.logger.log(`Synced external order ${extOrder.externalId} -> order ${order.id}`);
        synced++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await this.prisma.externalOrderSource.update({
          where: { id: extOrder.id },
          data: {
            syncStatus: IntegrationSyncStatus.FAILED,
            errorMessage,
          },
        });

        this.logger.warn(`Failed to sync external order ${extOrder.externalId}: ${errorMessage}`);
        failed++;
      }
    }

    // lastSyncAt is the POLL cursor (woo-poll.job fetches orders created
    // after it and advances it itself once the fetch is done). Mapping the
    // already-stored PENDING rows — what a manual "Sincronizează" does — fetches
    // nothing from Woo, so it must not move the cursor past unfetched orders.

    return { synced, failed };
  }

  /**
   * Upsert one Woo order into ExternalOrderSource (unique [integrationId,
   * externalId]). Already-SYNCED rows are left untouched — an imported external
   * id never duplicates. Otherwise the raw payload is refreshed and the status
   * returns to PENDING so the next sync retries it. Returns true when a row was
   * created or refreshed (i.e. is now syncable).
   */
  async upsertWooExternalOrder(
    integrationId: string,
    order: WooOrder,
    options: { autoDeduct?: boolean } = {},
  ): Promise<boolean> {
    const externalId = String(order.id);

    // Stock first, independent of the order import: a processing order's
    // products leave the shop's stock once (idempotent per Woo order).
    if (options.autoDeduct !== false) {
      await this.salesDeductions.autoDeductWooOrder(integrationId, order);
    }

    const existing = await this.prisma.externalOrderSource.findUnique({
      where: { integrationId_externalId: { integrationId, externalId } },
      select: { syncStatus: true },
    });
    if (existing?.syncStatus === IntegrationSyncStatus.SYNCED) return false;

    await this.prisma.externalOrderSource.upsert({
      where: { integrationId_externalId: { integrationId, externalId } },
      create: {
        integrationId,
        externalId,
        rawPayload: order as object,
        syncStatus: IntegrationSyncStatus.PENDING,
      },
      update: {
        rawPayload: order as object,
        syncStatus: IntegrationSyncStatus.PENDING,
        errorMessage: null,
      },
    });

    return true;
  }

  // ---------------------------------------------------------------------------
  // WooCommerce backfill
  // ---------------------------------------------------------------------------

  /**
   * Fetch the last 90 days of paid/fulfilled WooCommerce orders and run them
   * through the normal ExternalOrderSource → sync path, but only CREATE orders
   * whose parsed pickup deadline (ro-deadline parser over the Woo pickup meta)
   * is today or in the future. Past-deadline (or undatable) orders are recorded
   * as SKIPPED external orders with no Order. Idempotent: already-SYNCED
   * external ids are never touched, so re-running cannot duplicate orders.
   */
  async backfillWooCommerce(integrationId: string): Promise<WooBackfillResult> {
    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });
    if (!integration) throw new NotFoundException('Integration not found');
    if (integration.provider !== IntegrationProvider.WOOCOMMERCE) {
      throw new BadRequestException('Backfill is only available for WooCommerce integrations');
    }

    let client: WooCommerceClient;
    try {
      client = new WooCommerceClient(parseWooConfig(integration.config));
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid WooCommerce config',
      );
    }

    const wooDelivery =
      (
        await this.prisma.organization.findUnique({
          where: { id: integration.organizationId },
          select: { wooDeliveryEnabled: true },
        })
      )?.wooDeliveryEnabled === true;
    const after = new Date(Date.now() - BACKFILL_LOOKBACK_DAYS * MS_DAY).toISOString();
    const now = new Date();
    // The deadline parser returns UTC-midnight dates — compare against today's.
    const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

    let fetched = 0;
    let stored = 0;
    let skippedPast = 0;
    let page = 1;
    let totalPages = 1;
    do {
      const res = await client.fetchOrders({
        after,
        status: IMPORTABLE_WOO_STATUS_FILTER,
        page,
        perPage: BACKFILL_PER_PAGE,
      });
      totalPages = res.totalPages;

      for (const order of res.orders) {
        fetched++;
        // Pickupia date first, then the legacy free-text field (any confidence
        // — the backfill only decides "current vs historic" with it).
        const pickupia = wooDelivery ? extractPickupiaDelivery(order) : null;
        let deadline: Date | null = pickupia?.dueDate ?? null;
        if (!deadline) {
          const pickupText = extractWooPickupText(order);
          const orderDate = order.date_created ? new Date(order.date_created) : new Date();
          deadline = pickupText ? parseRomanianDeadline(pickupText, orderDate).date : null;
        }
        const isCurrent = deadline != null && deadline.getTime() >= startOfToday;

        if (isCurrent) {
          if (await this.upsertWooExternalOrder(integrationId, order, { autoDeduct: false }))
            stored++;
          continue;
        }

        // Historic (or undatable) order — keep the trace, create no Order.
        const externalId = String(order.id);
        const existing = await this.prisma.externalOrderSource.findUnique({
          where: { integrationId_externalId: { integrationId, externalId } },
          select: { syncStatus: true },
        });
        if (existing?.syncStatus === IntegrationSyncStatus.SYNCED) continue;

        const errorMessage = deadline
          ? `Backfill: termen de ridicare în trecut (${deadline.toISOString().slice(0, 10)}) — comandă istorică, neimportată`
          : 'Backfill: termen de ridicare nedetectat — comandă istorică, neimportată';
        await this.prisma.externalOrderSource.upsert({
          where: { integrationId_externalId: { integrationId, externalId } },
          create: {
            integrationId,
            externalId,
            rawPayload: order as object,
            syncStatus: IntegrationSyncStatus.SKIPPED,
            errorMessage,
          },
          update: {
            rawPayload: order as object,
            syncStatus: IntegrationSyncStatus.SKIPPED,
            errorMessage,
          },
        });
        skippedPast++;
      }
      page++;
    } while (page <= totalPages && page <= BACKFILL_MAX_PAGES);

    // Same sync path as the poll job / manual sync — maps PENDING rows to Orders.
    const { synced, failed } = await this.triggerSync(integrationId);

    this.logger.log(
      `WooCommerce backfill for integration ${integrationId}: fetched ${fetched}, stored ${stored}, skipped ${skippedPast} past-deadline, synced ${synced}, failed ${failed}`,
    );

    return { fetched, stored, skippedPast, synced, failed };
  }

  // ---------------------------------------------------------------------------
  // Webhook
  // ---------------------------------------------------------------------------

  /**
   * Webhooks arrive with no user context — the org comes from the integration
   * row itself. `integrationId` is preferred (new per-integration webhook URLs
   * embed it); the provider-only legacy routes fall back to findFirst, which
   * stays unambiguous only while a single org has that provider configured.
   */
  async processWebhook(
    provider: IntegrationProvider,
    payload: any,
    integrationId?: string,
    auth?: WebhookAuth,
  ): Promise<void> {
    await runWithoutTenant(async () => {
      let integration;
      if (integrationId) {
        integration = await this.prisma.integration.findFirst({
          where: { id: integrationId, provider },
        });
      } else {
        // Legacy provider-only route: only unambiguous while a SINGLE org has
        // this provider. With two+, picking one would silently inject orders
        // into the wrong tenant — hard-fail instead and force the
        // per-integration webhook URL (/integrations/:id/webhook/<provider>).
        const candidates = await this.prisma.integration.findMany({
          where: { provider },
          take: 2,
        });
        if (candidates.length > 1) {
          throw new ConflictException(
            `Multiple organizations have ${provider} configured — use the per-integration webhook URL`,
          );
        }
        integration = candidates[0] ?? null;
      }

      if (!integration) {
        throw new NotFoundException(`No integration configured for provider: ${provider}`);
      }

      // WooCommerce: authenticate the delivery BEFORE touching any data — an
      // unsigned webhook could otherwise inject orders and deduct stock.
      // Without a stored secret webhooks are refused; the 10-min poll
      // (woo-poll.job) still imports orders through the authenticated REST API.
      if (provider === IntegrationProvider.WOOCOMMERCE) {
        const secret = wooWebhookSecret(integration.config);
        if (!secret) {
          // Acknowledge but ignore: a 401 makes WooCommerce disable the webhook
          // after a few deliveries. The 10-min poll imports the order safely.
          this.logger.warn(
            `Ignored WooCommerce webhook for integration ${integration.id}: no webhookSecret configured (poll will import it)`,
          );
          return;
        }
        if (!verifyWooSignature(auth?.rawBody, auth?.signature, secret)) {
          this.logger.warn(
            `Rejected WooCommerce webhook for integration ${integration.id}: invalid signature`,
          );
          throw new UnauthorizedException('Semnătura webhook-ului WooCommerce este invalidă');
        }
      }

      const externalId = payload?.id ?? payload?.order_id ?? `${provider}-${Date.now()}`;

      // WooCommerce sends order.created AND order.updated (status changes):
      // upsert so a later "processing" update refreshes the stored payload
      // instead of failing on the unique key, and deduct stock when due.
      if (provider === IntegrationProvider.WOOCOMMERCE && Array.isArray(payload?.line_items)) {
        const org = integration.organizationId;
        await runAsOrg(org, () => this.upsertWooExternalOrder(integration.id, payload as WooOrder));
        this.logger.log(`Stored WooCommerce webhook order ${externalId} (${payload?.status})`);
        return;
      }

      await runAsOrg(integration.organizationId, () =>
        this.prisma.externalOrderSource.create({
          data: {
            integrationId: integration.id,
            externalId: String(externalId),
            rawPayload: payload,
            syncStatus: IntegrationSyncStatus.PENDING,
          },
        }),
      );

      this.logger.log(`Stored webhook payload from ${provider} with externalId: ${externalId}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async ensureIntegrationExists(id: string): Promise<void> {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
    });
    if (!integration) throw new NotFoundException('Integration not found');
  }

  private toIntegrationDto(integration: any): IntegrationResponseDto {
    return new IntegrationResponseDto({
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      config: integration.config as Record<string, any>,
      lastSyncAt: integration.lastSyncAt ? integration.lastSyncAt.toISOString() : null,
      createdAt: integration.createdAt.toISOString(),
      updatedAt: integration.updatedAt.toISOString(),
      mappingsCount: integration._count?.mappings ?? 0,
    });
  }

  private toMappingDto(mapping: any): ProductMappingResponseDto {
    return new ProductMappingResponseDto({
      id: mapping.id,
      integrationId: mapping.integrationId,
      externalProductId: mapping.externalProductId,
      externalProductName: mapping.externalProductName,
      recipeId: mapping.recipeId,
      recipeName: mapping.recipe?.name ?? '',
      createdAt: mapping.createdAt.toISOString(),
    });
  }

  private toExternalOrderDto(order: any): ExternalOrderResponseDto {
    return new ExternalOrderResponseDto({
      id: order.id,
      integrationId: order.integrationId,
      externalId: order.externalId,
      orderId: order.orderId,
      syncStatus: order.syncStatus,
      errorMessage: order.errorMessage,
      createdAt: order.createdAt.toISOString(),
    });
  }
}
