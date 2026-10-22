import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { categoryFilter } from '../recipes/category-filter';
import {
  MaterialStatus,
  Prisma,
  StockMovementType,
  TaskStatus,
  TransferStatus,
  UnitType,
} from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import {
  currentOrgWhere,
  getCurrentTenantId,
  runWithoutTenant,
  tenantOrgFilter,
} from '@/prisma/tenant-context';
import { PaginatedDto } from '@/common/dto';
import { normalizePurchasePrice } from '@/common/vat';
import { WebsocketService, StockUpdateDto, MovementType } from '@/modules/websocket';
import { UnitConversionsService } from '@/modules/unit-conversions';
import { StockReservationService } from './services/stock-reservation.service';
import {
  CreateStockMovementDto,
  StockMovementResponseDto,
  StockMovementQueryDto,
  RecipeStockQueryDto,
  RecipeStockResponseDto,
  CreateRecipeMovementDto,
  BatchReceiveDto,
  TestConsumptionDto,
  StockLotResponseDto,
  LowStockItemDto,
  ExpiringItemDto,
  ItemAvailabilityQueryDto,
  ItemLocationStockDto,
  ItemPendingTransferDto,
  StockItemAvailabilityDto,
} from './dto';
import { deriveMaterialStatus } from './material-status.util';
import { consumeRecipeLotsFifo } from './recipe-lot-fifo.util';
import { RecipeLotResponseDto } from './dto/recipe-lot-response.dto';

/** Movement types that can be created manually via the API. */
const MANUAL_MOVEMENT_TYPES: StockMovementType[] = [
  StockMovementType.INTRARE,
  StockMovementType.AJUSTARE,
];

@Injectable()
export class StockService implements OnModuleInit {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: WebsocketService,
    private readonly stockReservation: StockReservationService,
    private readonly unitConversions: UnitConversionsService,
  ) {}

  /**
   * Movement quantities may be entered in any unit ("2 KILOGRAME"), but stock
   * is kept in the item's own unit (GRAME). Convert through the same
   * UnitConversionsService the recipe resolution uses (material-specific →
   * universal → two-hop → metric fallback; count↔mass via the recipe's piece
   * equivalent). No path ⇒ Romanian 400 instead of silently mixing units.
   */
  private async toStockUnit(
    quantity: number,
    unit: UnitType | undefined,
    stockUnit: UnitType,
    itemName: string,
    opts: {
      rawMaterialId?: string;
      pieceEquivalent?: { quantity: number; unit: UnitType } | null;
    } = {},
  ): Promise<number> {
    if (!unit || unit === stockUnit) return quantity;
    try {
      const converted = opts.pieceEquivalent
        ? await this.unitConversions.convertWithPieceBridge(
            quantity,
            unit,
            stockUnit,
            stockUnit,
            opts.pieceEquivalent,
          )
        : await this.unitConversions.convert(quantity, unit, stockUnit, opts.rawMaterialId);
      return converted.quantity;
    } catch {
      throw new BadRequestException(
        `Unitatea ${unit} nu poate fi convertită în ${stockUnit} (unitatea de stoc pentru „${itemName}”). ` +
          'Folosește unitatea de stoc sau adaugă o conversie de unități.',
      );
    }
  }

  /**
   * One-time backfill for FIFO lot tracking: lots created before
   * `remainingQuantity` existed all sit at 0 — treat them as fully available.
   * Only runs while NO LotConsumption row exists (before the first FIFO
   * production); after that, remaining=0 legitimately means "exhausted" and
   * the backfill must never fire again.
   */
  async onModuleInit(): Promise<void> {
    try {
      // System-wide startup backfill — deliberately cross-tenant.
      await runWithoutTenant(async () => {
        const consumed = await this.prisma.lotConsumption.count();
        if (consumed > 0) return;
        const n = await this.prisma.$executeRaw`
          UPDATE "StockLot" SET "remainingQuantity" = "quantity"
          WHERE "remainingQuantity" = 0 AND "quantity" > 0
        `;
        if (n > 0) this.logger.log(`Backfilled remainingQuantity on ${n} stock lots`);
      });
    } catch (err) {
      // Migrations run before the app boots (`prisma migrate deploy`), but on
      // the very first boot after a schema change the column may not exist
      // yet. Never crash the app for the backfill; it re-runs on next boot.
      this.logger.warn(`Skipping stock-lot backfill (schema not ready yet): ${err}`);
    }
  }

  /**
   * Bring a material's lots in line with its stock after an absolute count
   * (AJUSTARE): too much in the lots → trim FIFO (held lots last, same order
   * as consumption); too little → the difference goes back on the newest lot.
   * Materials with no lot at all (pre-lot data) are left alone.
   */
  private async reconcileLotsToStock(rawMaterialId: string, target: number): Promise<void> {
    const lots = await this.prisma.stockLot.findMany({
      where: { rawMaterialId },
      orderBy: [{ onHold: 'asc' }, { receivedAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (lots.length === 0) return;
    const sum = lots.reduce((acc, l) => acc + Number(l.remainingQuantity), 0);
    let diff = target - sum;
    if (Math.abs(diff) < 1e-9) return;
    if (diff > 0) {
      const [newest] = [...lots].sort(
        (a, b) =>
          b.receivedAt.getTime() - a.receivedAt.getTime() ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
      if (!newest) return;
      await this.prisma.stockLot.update({
        where: { id: newest.id },
        data: { remainingQuantity: { increment: diff } },
      });
      return;
    }
    for (const lot of lots) {
      if (diff >= 0) break;
      const take = Math.min(Number(lot.remainingQuantity), -diff);
      if (take <= 0) continue;
      await this.prisma.stockLot.update({
        where: { id: lot.id },
        data: { remainingQuantity: { decrement: take } },
      });
      diff += take;
    }
  }

  /**
   * Create a manual stock movement (INTRARE or AJUSTARE only).
   * Validates XOR constraint and updates the material's stockCount accordingly.
   */
  async createMovement(
    dto: CreateStockMovementDto,
    userId: string,
  ): Promise<StockMovementResponseDto> {
    // Normalize the intake price to the org's cost basis (net for VAT payers,
    // gross for non-payers) when the client says whether it includes VAT.
    if (dto.purchasePrice !== undefined && dto.priceIncludesVat !== undefined) {
      // Scope to the caller's org — Organization is unscoped by the tenant
      // extension, so a bare findFirst() would read a different tenant's VAT.
      const orgId = getCurrentTenantId();
      const org = orgId
        ? await this.prisma.organization.findUnique({
            where: { id: orgId },
            select: { vatPayer: true, vatRatePercent: true },
          })
        : null;
      if (org) {
        dto = {
          ...dto,
          purchasePrice: normalizePurchasePrice(dto.purchasePrice, dto.priceIncludesVat, org),
        };
      }
    }
    // Validate: only INTRARE and AJUSTARE allowed for manual entry
    if (!MANUAL_MOVEMENT_TYPES.includes(dto.movementType)) {
      throw new BadRequestException(
        `Only INTRARE and AJUSTARE movement types are allowed for manual stock entry. ` +
          `Received: ${dto.movementType}`,
      );
    }

    // Quantity 0 only makes sense as an absolute AJUSTARE (zero the stock).
    if (dto.movementType === StockMovementType.INTRARE && dto.quantity <= 0) {
      throw new BadRequestException('Cantitatea unei intrari trebuie sa fie pozitiva.');
    }

    // Validate XOR: exactly one of rawMaterialId or consumableId must be provided
    if (dto.rawMaterialId && dto.consumableId) {
      throw new BadRequestException(
        'Exactly one of rawMaterialId or consumableId must be provided, not both',
      );
    }
    if (!dto.rawMaterialId && !dto.consumableId) {
      throw new BadRequestException(
        'Exactly one of rawMaterialId or consumableId must be provided',
      );
    }

    let materialTitle: string;
    let materialId: string;
    let newStockCount: number;
    let minimumStock: number;
    let currentStatus: MaterialStatus;
    let movementLocationId: string | null = null;

    if (dto.rawMaterialId) {
      const material = await this.prisma.rawMaterial.findUnique({
        where: { id: dto.rawMaterialId },
      });
      if (!material) {
        throw new NotFoundException(`Raw material with ID "${dto.rawMaterialId}" not found`);
      }

      // Everything below (location stock, lot, movement row) is in the
      // material's stock unit.
      if (dto.unit !== material.unit) {
        dto = {
          ...dto,
          quantity: await this.toStockUnit(dto.quantity, dto.unit, material.unit, material.title, {
            rawMaterialId: material.id,
          }),
          unit: material.unit,
        };
      }

      materialTitle = material.title;
      materialId = material.id;
      minimumStock = Number(material.minimumStock);
      currentStatus = material.status;

      // Reception/adjustment lands in a LOCATION's stock — production reserves
      // from per-location MaterialStock, so a reception that only bumped the
      // global count would never be usable. Write the location, then keep the
      // global RawMaterial.stockCount as the sum of all locations.
      const locationId = await this.resolveLocationId(dto.locationId, userId);
      if (!locationId) {
        throw new BadRequestException(
          'Nicio locație configurată pentru recepție. Asignează o locație.',
        );
      }
      movementLocationId = locationId;

      if (dto.movementType === StockMovementType.INTRARE) {
        await this.prisma.materialStock.upsert({
          where: { locationId_rawMaterialId: { locationId, rawMaterialId: material.id } },
          update: { quantity: { increment: dto.quantity } },
          create: { locationId, rawMaterialId: material.id, quantity: dto.quantity },
        });
      } else {
        // AJUSTARE: set this location's quantity to the absolute value.
        await this.prisma.materialStock.upsert({
          where: { locationId_rawMaterialId: { locationId, rawMaterialId: material.id } },
          update: { quantity: dto.quantity },
          create: { locationId, rawMaterialId: material.id, quantity: dto.quantity },
        });
      }

      // Global stock = sum across locations.
      const agg = await this.prisma.materialStock.aggregate({
        where: { rawMaterialId: material.id },
        _sum: { quantity: true },
      });
      newStockCount = Number(agg._sum.quantity ?? 0);
      const newStatus = this.computeStatus(newStockCount, minimumStock, currentStatus);

      await this.prisma.rawMaterial.update({
        where: { id: material.id },
        data: {
          stockCount: newStockCount,
          status: newStatus,
          // Keep the material's "current" lot/expiry pointed at the latest intake.
          ...(dto.movementType === StockMovementType.INTRARE && {
            ...(dto.lotNumber !== undefined && { lotNumber: dto.lotNumber }),
            ...(dto.expiryDate !== undefined && { expiryDate: new Date(dto.expiryDate) }),
            ...(dto.supplier !== undefined && { producer: dto.supplier }),
            ...(dto.purchasePrice !== undefined && { purchasePrice: dto.purchasePrice }),
          }),
        },
      });

      if (dto.movementType === StockMovementType.AJUSTARE) {
        // A count overrides the stock; the lots must say the same thing, or
        // the lot list keeps showing what was there before the count.
        await this.reconcileLotsToStock(material.id, newStockCount);
      }

      if (dto.movementType === StockMovementType.INTRARE) {
        // Record this intake as a StockLot (intake history + FIFO tracking).
        await this.prisma.stockLot.create({
          data: {
            rawMaterialId: material.id,
            lotNumber: dto.lotNumber ?? null,
            barcode: dto.barcode ?? null,
            quantity: dto.quantity,
            remainingQuantity: dto.quantity,
            expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
            purchasePrice: dto.purchasePrice ?? null,
            supplier: dto.supplier ?? null,
            supplierInvoice: dto.supplierInvoice ?? dto.referenceNote ?? null,
          },
        });

        // Feed the price-evolution chart when the purchase price changes.
        if (
          dto.purchasePrice !== undefined &&
          Number(material.purchasePrice ?? NaN) !== dto.purchasePrice
        ) {
          await this.prisma.priceHistory.create({
            data: {
              rawMaterialId: material.id,
              priceType: 'PURCHASE',
              oldPrice: material.purchasePrice ?? null,
              newPrice: dto.purchasePrice,
              changedById: userId,
            },
          });
        }
      }
    } else {
      // consumableId is guaranteed to exist by XOR validation above
      const consumable = await this.prisma.consumable.findUnique({
        where: { id: dto.consumableId as string },
      });
      if (!consumable) {
        throw new NotFoundException(`Consumable with ID "${dto.consumableId}" not found`);
      }

      materialTitle = consumable.title;
      materialId = consumable.id;
      minimumStock = Number(consumable.minimumStock);
      currentStatus = consumable.status;

      if (dto.movementType === StockMovementType.INTRARE) {
        newStockCount = Number(consumable.stockCount) + dto.quantity;
      } else {
        // AJUSTARE: set stockCount directly
        newStockCount = dto.quantity;
      }

      const newStatus = this.computeStatus(newStockCount, minimumStock, currentStatus);

      await this.prisma.consumable.update({
        where: { id: dto.consumableId as string },
        data: {
          stockCount: newStockCount,
          status: newStatus,
        },
      });

      if (dto.movementType === StockMovementType.INTRARE) {
        // Record this intake as a StockLot (intake history; consumables aren't
        // FIFO-consumed but keep the same lot/expiry/invoice trail).
        await this.prisma.stockLot.create({
          data: {
            consumableId: dto.consumableId,
            lotNumber: dto.lotNumber ?? null,
            barcode: dto.barcode ?? null,
            quantity: dto.quantity,
            remainingQuantity: dto.quantity,
            expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
            purchasePrice: dto.purchasePrice ?? null,
            supplier: dto.supplier ?? null,
            supplierInvoice: dto.supplierInvoice ?? dto.referenceNote ?? null,
          },
        });
      }
    }

    // Create the stock movement record
    const movement = await this.prisma.stockMovement.create({
      data: {
        rawMaterialId: dto.rawMaterialId ?? null,
        consumableId: dto.consumableId ?? null,
        locationId: movementLocationId,
        movementType: dto.movementType,
        quantity: dto.quantity,
        unit: dto.unit,
        performedById: userId,
        referenceNote: dto.referenceNote ?? null,
      },
      include: {
        rawMaterial: { select: { title: true } },
        consumable: { select: { title: true } },
        location: { select: { name: true } },
        performedBy: { select: { firstName: true, lastName: true } },
      },
    });

    this.logger.log(
      `Created ${dto.movementType} movement for "${materialTitle}" (${materialId}): ${dto.quantity} ${dto.unit}`,
    );

    // Emit WebSocket events
    const wsMovementType =
      dto.movementType === StockMovementType.INTRARE ? MovementType.IN : MovementType.ADJUSTMENT;

    const stockUpdate: StockUpdateDto = {
      materialId,
      materialTitle,
      newStockCount,
      movementType: wsMovementType,
    };

    this.ws.emitStockUpdate(stockUpdate);

    if (newStockCount <= minimumStock) {
      this.ws.emitLowStockAlert(stockUpdate);
    }

    // Check if any blocked tasks can now start
    if (
      dto.movementType === StockMovementType.INTRARE ||
      dto.movementType === StockMovementType.AJUSTARE
    ) {
      await this.notifyBlockedTasksIfStockAvailable(materialId);
    }

    return this.toDto(movement);
  }

  /**
   * List stock movements with pagination and optional filters.
   */
  async findMovements(
    query: StockMovementQueryDto,
  ): Promise<PaginatedDto<StockMovementResponseDto>> {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = this.movementWhere(query);

    const [movements, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          rawMaterial: { select: { title: true } },
          consumable: { select: { title: true } },
          recipe: { select: { name: true } },
          location: { select: { name: true } },
          performedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    const data = movements.map((m) => this.toDto(m));

    return new PaginatedDto(data, total, page, limit);
  }

  private movementWhere(query: StockMovementQueryDto): Prisma.StockMovementWhereInput {
    const {
      rawMaterialId,
      consumableId,
      movementType,
      taskId,
      recipeId,
      search,
      from,
      to,
      locationId,
    } = query;
    const where: Prisma.StockMovementWhereInput = {};
    if (rawMaterialId) where.rawMaterialId = rawMaterialId;
    if (consumableId) where.consumableId = consumableId;
    if (movementType) where.movementType = movementType;
    if (taskId) where.taskId = taskId;
    if (recipeId) where.recipeId = recipeId;
    if (locationId) where.locationId = locationId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) {
        // `to` is a day (inclusive) or an instant — a bare date gets the whole day.
        const end = new Date(to);
        if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setUTCDate(end.getUTCDate() + 1);
        where.createdAt[/^\d{4}-\d{2}-\d{2}$/.test(to) ? 'lt' : 'lte'] = end;
      }
    }
    if (search) {
      where.OR = [
        { rawMaterial: { title: { contains: search, mode: 'insensitive' } } },
        { consumable: { title: { contains: search, mode: 'insensitive' } } },
        { recipe: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  /**
   * "Jurnal mișcări": the filtered movement log as .xlsx — one row per movement,
   * newest first, with the item kind, location, who and the note. Defaults to
   * the last 30 days when no range is given; capped at 20 000 rows.
   */
  async exportMovementsXlsx(query: StockMovementQueryDto): Promise<Buffer> {
    const q = { ...query };
    if (!q.from && !q.to) {
      q.from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    }
    const movements = await this.prisma.stockMovement.findMany({
      where: this.movementWhere(q),
      orderBy: { createdAt: 'desc' },
      take: 20_000,
      include: {
        rawMaterial: { select: { title: true, category: true } },
        consumable: { select: { title: true, category: true } },
        recipe: { select: { name: true, category: true, type: true } },
        location: { select: { name: true } },
        performedBy: { select: { firstName: true, lastName: true } },
        task: { select: { title: true, recipe: { select: { name: true } } } },
      },
    });
    const typeLabel: Record<string, string> = {
      INTRARE: 'Intrare',
      INTRARE_PRODUCTIE: 'Intrare producție',
      IESIRE_PRODUCTIE: 'Ieșire producție',
      IESIRE_TESTE: 'Ieșire teste',
      IESIRE_VANZARE: 'Ieșire vânzare',
      AJUSTARE: 'Ajustare',
      REZERVARE: 'Rezervare',
      ELIBERARE: 'Eliberare',
    };
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Mișcări stoc', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: 'Data', key: 'date', width: 18 },
      { header: 'Tip', key: 'type', width: 18 },
      { header: 'Produs', key: 'item', width: 36 },
      { header: 'Fel', key: 'kind', width: 14 },
      { header: 'Categorie', key: 'category', width: 18 },
      { header: 'Cantitate', key: 'qty', width: 12 },
      { header: 'U.M.', key: 'unit', width: 8 },
      { header: 'Locație', key: 'location', width: 20 },
      { header: 'Task', key: 'task', width: 26 },
      { header: 'Notă', key: 'note', width: 44 },
      { header: 'De către', key: 'who', width: 22 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const m of movements) {
      const kind = m.rawMaterial
        ? 'Materie primă'
        : m.consumable
          ? 'Consumabil'
          : m.recipe?.type === 'SEMIPREPARAT'
            ? 'Semipreparat'
            : m.recipe
              ? 'Produs finit'
              : '';
      const signed =
        m.movementType === 'AJUSTARE'
          ? Number(m.quantity)
          : m.movementType === 'INTRARE' ||
              m.movementType === 'INTRARE_PRODUCTIE' ||
              m.movementType === 'ELIBERARE'
            ? Number(m.quantity)
            : -Number(m.quantity);
      const row = sheet.addRow({
        date: m.createdAt,
        type: typeLabel[m.movementType] ?? m.movementType,
        item: m.rawMaterial?.title ?? m.consumable?.title ?? m.recipe?.name ?? '',
        kind,
        category: m.rawMaterial?.category ?? m.consumable?.category ?? m.recipe?.category ?? '',
        qty: m.movementType === 'AJUSTARE' ? `= ${Number(m.quantity)}` : signed,
        unit: m.unit ?? '',
        location: m.location?.name ?? '',
        task: m.task ? (m.task.title ?? m.task.recipe?.name ?? '') : '',
        note: m.referenceNote ?? '',
        who: m.performedBy ? `${m.performedBy.firstName} ${m.performedBy.lastName}` : '',
      });
      row.getCell('date').numFmt = 'dd.mm.yyyy hh:mm';
    }
    const data = await workbook.xlsx.writeBuffer();
    return Buffer.from(data);
  }

  /**
   * Find a single stock movement by ID.
   * @throws NotFoundException if the movement does not exist.
   */
  async findMovementById(id: string): Promise<StockMovementResponseDto> {
    const movement = await this.prisma.stockMovement.findUnique({
      where: { id },
      include: {
        rawMaterial: { select: { title: true } },
        consumable: { select: { title: true } },
        recipe: { select: { name: true } },
        location: { select: { name: true } },
        performedBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!movement) {
      throw new NotFoundException(`Stock movement with ID "${id}" not found`);
    }

    return this.toDto(movement);
  }

  /**
   * Availability snapshot for a single stock item: per-location quantities,
   * active task reservations, and pending transfers. Powers the item detail
   * quick actions — transfer source preselection and the "item is reserved"
   * warning shown before a zeroing adjustment.
   */
  async getItemAvailability(query: ItemAvailabilityQueryDto): Promise<StockItemAvailabilityDto> {
    const provided = [query.rawMaterialId, query.consumableId, query.recipeId].filter(Boolean);
    if (provided.length !== 1) {
      throw new BadRequestException(
        'Exactly one of rawMaterialId, consumableId or recipeId must be provided',
      );
    }

    let totalQuantity = 0;
    let locations: ItemLocationStockDto[] = [];

    if (query.rawMaterialId) {
      const material = await this.prisma.rawMaterial.findUnique({
        where: { id: query.rawMaterialId },
      });
      if (!material) {
        throw new NotFoundException(`Raw material with ID "${query.rawMaterialId}" not found`);
      }
      totalQuantity = Number(material.stockCount);
      const rows = await this.prisma.materialStock.findMany({
        where: { rawMaterialId: query.rawMaterialId },
        include: { location: { select: { name: true } } },
        orderBy: { quantity: 'desc' },
      });
      locations = rows
        .filter((r) => Number(r.quantity) > 0 || Number(r.reservedCount) > 0)
        .map(
          (r) =>
            new ItemLocationStockDto({
              locationId: r.locationId,
              locationName: r.location.name,
              quantity: Number(r.quantity),
              reservedCount: Number(r.reservedCount),
            }),
        );
    } else if (query.consumableId) {
      const consumable = await this.prisma.consumable.findUnique({
        where: { id: query.consumableId },
      });
      if (!consumable) {
        throw new NotFoundException(`Consumable with ID "${query.consumableId}" not found`);
      }
      // Consumables are global-only — no per-location rows.
      totalQuantity = Number(consumable.stockCount);
    } else {
      const recipe = await this.prisma.recipe.findUnique({
        where: { id: query.recipeId as string },
      });
      if (!recipe) {
        throw new NotFoundException(`Recipe with ID "${query.recipeId}" not found`);
      }
      totalQuantity = Number(recipe.stockCount);
      const rows = await this.prisma.recipeStock.findMany({
        where: { recipeId: query.recipeId as string },
        include: { location: { select: { name: true } } },
        orderBy: { quantity: 'desc' },
      });
      locations = rows
        .filter((r) => Number(r.quantity) > 0 || Number(r.reservedCount) > 0)
        .map(
          (r) =>
            new ItemLocationStockDto({
              locationId: r.locationId,
              locationName: r.location.name,
              quantity: Number(r.quantity),
              reservedCount: Number(r.reservedCount),
            }),
        );
    }

    // Active task reservations (not yet consumed, not released).
    const reservations = await this.prisma.stockReservation.findMany({
      where: {
        isFulfilled: false,
        isReleased: false,
        ...(query.rawMaterialId && { rawMaterialId: query.rawMaterialId }),
        ...(query.consumableId && { consumableId: query.consumableId }),
        ...(query.recipeId && { recipeId: query.recipeId }),
      },
      select: { quantityReserved: true, taskId: true },
    });
    const reservedForTasks = reservations.reduce((sum, r) => sum + Number(r.quantityReserved), 0);
    const activeTaskCount = new Set(reservations.map((r) => r.taskId)).size;

    // Pending transfers hold the item outside any location's free stock
    // (source quantity is deducted at creation). Consumables can't transfer.
    let pendingTransfers: ItemPendingTransferDto[] = [];
    if (!query.consumableId) {
      const items = await this.prisma.stockTransferItem.findMany({
        where: {
          ...(query.rawMaterialId
            ? { rawMaterialId: query.rawMaterialId }
            : { recipeId: query.recipeId as string }),
          transfer: { status: { in: [TransferStatus.IN_ASTEPTARE, TransferStatus.IN_TRANZIT] } },
        },
        include: {
          transfer: {
            include: {
              fromLocation: { select: { name: true } },
              toLocation: { select: { name: true } },
            },
          },
        },
        orderBy: { transfer: { createdAt: 'desc' } },
      });
      pendingTransfers = items.map(
        (item) =>
          new ItemPendingTransferDto({
            id: item.transferId,
            status: item.transfer.status,
            fromLocationId: item.transfer.fromLocationId,
            fromLocationName: item.transfer.fromLocation.name,
            // Ad-hoc destinations (event transports) have no saved location.
            toLocationId: item.transfer.toLocationId ?? '',
            toLocationName: item.transfer.toLocation?.name ?? item.transfer.destinationName ?? '',
            quantity: Number(item.quantity),
            unit: item.unit,
          }),
      );
    }

    return new StockItemAvailabilityDto({
      totalQuantity,
      reservedForTasks,
      activeTaskCount,
      locations,
      pendingTransfers,
    });
  }

  /**
   * List recipes with stock info, filterable by type/category/search.
   */
  async findRecipeStock(query: RecipeStockQueryDto): Promise<PaginatedDto<RecipeStockResponseDto>> {
    const { page = 1, limit = 20, type, category, search } = query;
    const skip = (page - 1) * limit;

    // Archived AND draft recipes are hidden from the product-stock listing too —
    // same contract as GET /recipes (they keep any residual stock rows in the DB).
    const where: Prisma.RecipeWhereInput = { isArchived: false, isDraft: false };

    if (type) {
      where.type = type;
    }

    if (category === '__none__') {
      // Uncategorized = null category OR category not in admin config
      const validCategories = await this.prisma.recipeCategoryConfig.findMany({
        select: { name: true },
      });
      const validNames = validCategories.map((c) => c.name);
      where.OR = [
        { category: null },
        ...(validNames.length > 0 ? [{ category: { notIn: validNames } }] : []),
      ];
    } else if (category) {
      // A parent category also matches its sub-categories (category dial).
      where.category = await categoryFilter(this.prisma, category);
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [recipes, total] = await Promise.all([
      this.prisma.recipe.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          // Earliest expiry among the recipe's per-location stock rows that
          // actually hold quantity — the aggregate view's conservative expiry.
          locationStocks: {
            where: { expiryDate: { not: null }, quantity: { gt: 0 } },
            orderBy: { expiryDate: 'asc' },
            take: 1,
            select: { expiryDate: true },
          },
        },
      }),
      this.prisma.recipe.count({ where }),
    ]);

    const data = recipes.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) =>
        new RecipeStockResponseDto({
          id: r.id,
          name: r.name,
          type: r.type,
          category: r.category,
          flavors: r.flavors,
          stockCount: r.stockCount,
          reservedCount: r.reservedCount,
          unit: r.unit,
          photoUrl: r.photoUrl,
          sellingPrice: r.sellingPrice ? Number(r.sellingPrice) : null,
          calculatedCost: null, // calculated on-demand via /cost endpoint
          expiryDate: r.locationStocks?.[0]?.expiryDate ?? null,
        }),
    );

    return new PaginatedDto(data, total, page, limit);
  }

  /**
   * List the production batches (lots) with remaining quantity for a recipe,
   * optionally filtered by location. FIFO order: earliest expiry first (no
   * expiry last), then oldest production.
   */
  async findRecipeLots(recipeId: string, locationId?: string): Promise<RecipeLotResponseDto[]> {
    const recipe = await this.prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${recipeId}" not found`);
    }

    const lots = await this.prisma.recipeStockLot.findMany({
      where: {
        recipeId,
        remainingQuantity: { gt: 0 },
        ...(locationId ? { locationId } : {}),
      },
      include: { location: { select: { name: true } } },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { producedAt: 'asc' }],
    });

    return lots.map(
      (lot) =>
        new RecipeLotResponseDto({
          id: lot.id,
          lotNumber: lot.lotNumber,
          quantity: Number(lot.quantity),
          remainingQuantity: Number(lot.remainingQuantity),
          expiryDate: lot.expiryDate,
          producedAt: lot.producedAt,
          locationId: lot.locationId,
          locationName: lot.location.name,
        }),
    );
  }

  /**
   * Create manual stock movement for a recipe (INTRARE or AJUSTARE).
   */
  async createRecipeMovement(
    dto: CreateRecipeMovementDto,
    userId: string,
  ): Promise<StockMovementResponseDto> {
    if (
      dto.movementType !== StockMovementType.INTRARE &&
      dto.movementType !== StockMovementType.AJUSTARE
    ) {
      throw new BadRequestException(
        `Only INTRARE and AJUSTARE are allowed for recipe stock entry. Received: ${dto.movementType}`,
      );
    }

    // Quantity 0 only makes sense as an absolute AJUSTARE (zero the stock).
    if (dto.movementType === StockMovementType.INTRARE && dto.quantity <= 0) {
      throw new BadRequestException('Cantitatea unei intrari trebuie sa fie pozitiva.');
    }

    const recipe = await this.prisma.recipe.findUnique({
      where: { id: dto.recipeId },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${dto.recipeId}" not found`);
    }

    // Recipe stock is kept in the recipe's yield unit.
    if (dto.unit !== recipe.unit) {
      dto = {
        ...dto,
        quantity: await this.toStockUnit(dto.quantity, dto.unit, recipe.unit, recipe.name, {
          pieceEquivalent:
            recipe.pieceEquivalentQuantity != null && recipe.pieceEquivalentUnit != null
              ? {
                  quantity: Number(recipe.pieceEquivalentQuantity),
                  unit: recipe.pieceEquivalentUnit,
                }
              : null,
        }),
        unit: recipe.unit,
      };
    }

    // Write the per-location RecipeStock row, NOT just the global counter —
    // task fulfillment/transfers recompute Recipe.stockCount as the SUM of
    // RecipeStock rows (syncRecipeAggregate), so a global-only adjustment
    // would silently revert on the next production event.
    const locationId = await this.resolveLocationId(dto.locationId, userId);
    if (!locationId) {
      throw new BadRequestException(
        'Nicio locație configurată pentru stocul de produse. Asignează o locație.',
      );
    }

    if (dto.movementType === StockMovementType.INTRARE) {
      await this.prisma.recipeStock.upsert({
        where: { locationId_recipeId: { locationId, recipeId: dto.recipeId } },
        update: { quantity: { increment: dto.quantity } },
        create: { locationId, recipeId: dto.recipeId, quantity: dto.quantity },
      });
    } else {
      // AJUSTARE: set this location's quantity to the absolute value.
      const before = await this.prisma.recipeStock.findUnique({
        where: { locationId_recipeId: { locationId, recipeId: dto.recipeId } },
        select: { quantity: true },
      });
      await this.prisma.recipeStock.upsert({
        where: { locationId_recipeId: { locationId, recipeId: dto.recipeId } },
        update: { quantity: dto.quantity },
        create: { locationId, recipeId: dto.recipeId, quantity: dto.quantity },
      });
      // Downward adjustment consumes batch lots FIFO too, so the per-lot view
      // stays in step with the aggregate.
      const removed = Number(before?.quantity ?? 0) - dto.quantity;
      if (removed > 0) {
        await consumeRecipeLotsFifo(this.prisma, dto.recipeId, locationId, removed);
      }
    }

    // Global stock = sum across locations (same contract as syncRecipeAggregate).
    const agg = await this.prisma.recipeStock.aggregate({
      where: { recipeId: dto.recipeId },
      _sum: { quantity: true },
    });
    const newStockCount = Math.max(0, Math.round(Number(agg._sum.quantity ?? 0)));

    await this.prisma.recipe.update({
      where: { id: dto.recipeId },
      data: { stockCount: newStockCount },
    });

    const movement = await this.prisma.stockMovement.create({
      data: {
        recipeId: dto.recipeId,
        locationId,
        movementType: dto.movementType,
        quantity: dto.quantity,
        unit: dto.unit,
        performedById: userId,
        referenceNote: dto.referenceNote ?? null,
      },
      include: {
        recipe: { select: { name: true } },
        location: { select: { name: true } },
        performedBy: { select: { firstName: true, lastName: true } },
      },
    });

    this.logger.log(
      `Created ${dto.movementType} recipe movement for "${recipe.name}": ${dto.quantity} ${dto.unit}`,
    );

    return this.toDto(movement);
  }

  /**
   * After a stock increase, check if any BLOCAT tasks could now start.
   * Emits a notification but does NOT move the task — user retries manually.
   */
  private async notifyBlockedTasksIfStockAvailable(materialId: string): Promise<void> {
    try {
      const blockedTasks = await this.prisma.task.findMany({
        where: { status: TaskStatus.BLOCAT },
        select: {
          id: true,
          targetQuantity: true,
          shortages: true,
          recipe: { select: { name: true } },
        },
      });

      // Filter tasks whose shortages reference this material
      const relevant = blockedTasks.filter((task) => {
        if (!task.shortages || !Array.isArray(task.shortages)) return false;
        return (task.shortages as any[]).some(
          (s: any) => s.rawMaterialId === materialId || s.recipeId === materialId,
        );
      });

      for (const task of relevant) {
        const canStart = await this.stockReservation.canReserveForTask(task.id);
        if (canStart) {
          this.ws.emitActivity({
            type: 'STOCK_AVAILABLE',
            title: `Stoc disponibil: ${Number(task.targetQuantity)} ${task.recipe?.name ?? ''}`,
            description: 'Materialele necesare sunt acum disponibile',
            metadata: { taskId: task.id, materialId },
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to check blocked tasks after stock increase: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Compute the material status based on the new stock count.
   * Does not change status if material is DISCONTINUED.
   */
  /**
   * Where a reception lands: the explicit location, else the user's primary
   * location, else the default (first active LABORATOR, else first active).
   */
  private async resolveLocationId(explicit?: string, userId?: string): Promise<string | null> {
    if (explicit) return explicit;
    if (userId) {
      const ul = await this.prisma.userLocation.findFirst({
        where: { userId },
        orderBy: { isPrimary: 'desc' },
      });
      if (ul) return ul.locationId;
    }
    // Then the organization's chosen default (same order as task creation:
    // user primary → org default → first LABORATOR → first active).
    const org = await this.prisma.organization.findFirst({
      where: currentOrgWhere(),
      select: { defaultLocationId: true },
    });
    if (org?.defaultLocationId) {
      const def = await this.prisma.location.findFirst({
        where: { id: org.defaultLocationId, isActive: true },
        select: { id: true },
      });
      if (def) return def.id;
    }
    const lab = await this.prisma.location.findFirst({
      where: { isActive: true, type: 'LABORATOR' },
      orderBy: { createdAt: 'asc' },
    });
    if (lab) return lab.id;
    const any = await this.prisma.location.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return any?.id ?? null;
  }

  private computeStatus(
    newStockCount: number,
    minimumStock: number,
    currentStatus: MaterialStatus,
  ): MaterialStatus {
    return deriveMaterialStatus(newStockCount, minimumStock, currentStatus);
  }

  // ========================================================================
  // Batch Receive
  // ========================================================================

  async batchReceive(dto: BatchReceiveDto, userId: string): Promise<StockMovementResponseDto[]> {
    const results: StockMovementResponseDto[] = [];

    for (const item of dto.items) {
      if (!item.rawMaterialId && !item.consumableId) {
        throw new BadRequestException('Each item must specify rawMaterialId or consumableId');
      }

      // Create INTRARE movement — createMovement records the StockLot too
      // (single lot per intake; a second create here would double the
      // FIFO remainingQuantity).
      const movement = await this.createMovement(
        {
          rawMaterialId: item.rawMaterialId,
          consumableId: item.consumableId,
          movementType: StockMovementType.INTRARE,
          quantity: item.quantity,
          unit: item.unit,
          referenceNote: item.referenceNote ?? item.supplierInvoice ?? undefined,
          locationId: dto.locationId,
          lotNumber: item.lotNumber,
          barcode: item.barcode,
          expiryDate: item.expiryDate,
          purchasePrice: item.purchasePrice,
          priceIncludesVat: item.priceIncludesVat,
          supplierInvoice: item.supplierInvoice,
        },
        userId,
      );
      results.push(movement);
    }

    this.logger.log(`Batch received ${dto.items.length} items`);
    return results;
  }

  // ========================================================================
  // Test Consumption (R&D / test bakes)
  // ========================================================================

  /**
   * Consume stock for tests/R&D — no task, no recipe output. Decrements stock
   * exactly like production consumption (`IESIRE_PRODUCTIE` in
   * StockReservationService.fulfillForTask): per-location MaterialStock clamped
   * at 0, RawMaterial.stockCount resynced as the sum of locations, and StockLot
   * remainingQuantity walked FIFO (held lots last). Unlike production there is
   * NO LotConsumption row — that table requires a taskId and tests have none.
   * Insufficient stock is allowed (quantities clamp at 0, same as production).
   */
  async testConsumption(
    dto: TestConsumptionDto,
    userId: string,
  ): Promise<StockMovementResponseDto[]> {
    for (const item of dto.items) {
      if (
        (item.rawMaterialId && item.consumableId) ||
        (!item.rawMaterialId && !item.consumableId)
      ) {
        throw new BadRequestException(
          'Exactly one of rawMaterialId or consumableId must be provided per item',
        );
      }
      if (!(item.quantity > 0)) {
        throw new BadRequestException('Cantitatea consumata trebuie sa fie pozitiva.');
      }
    }

    const location = await this.prisma.location.findUnique({ where: { id: dto.locationId } });
    if (!location) {
      throw new NotFoundException(`Location with ID "${dto.locationId}" not found`);
    }

    const referenceNote = dto.notes ?? 'Consum teste';
    const movementIds: string[] = [];
    // Post-commit websocket payloads (same events production consumption emits).
    const touched: { rawMaterialId?: string; consumableId?: string }[] = [];

    await this.prisma.$transaction(
      async (tx) => {
        for (const item of dto.items) {
          if (item.rawMaterialId) {
            const material = await tx.rawMaterial.findUnique({
              where: { id: item.rawMaterialId },
            });
            if (!material) {
              throw new NotFoundException(`Raw material with ID "${item.rawMaterialId}" not found`);
            }
            // Consume in the material's stock unit.
            const quantity = await this.toStockUnit(
              item.quantity,
              item.unit,
              material.unit,
              material.title,
              { rawMaterialId: material.id },
            );

            // Per-location stock, clamped at 0 (same as production fulfillment).
            const stock = await tx.materialStock.findUnique({
              where: {
                locationId_rawMaterialId: {
                  locationId: dto.locationId,
                  rawMaterialId: item.rawMaterialId,
                },
              },
            });
            if (stock) {
              await tx.materialStock.update({
                where: {
                  locationId_rawMaterialId: {
                    locationId: dto.locationId,
                    rawMaterialId: item.rawMaterialId,
                  },
                },
                data: { quantity: Math.max(0, Number(stock.quantity) - quantity) },
              });
            }

            // Global stock = sum across locations, status re-derived — same
            // contract as syncRawMaterialAggregate.
            const agg = await tx.materialStock.aggregate({
              where: { rawMaterialId: item.rawMaterialId },
              _sum: { quantity: true },
            });
            const newStockCount = Number(agg._sum.quantity ?? 0);
            await tx.rawMaterial.update({
              where: { id: item.rawMaterialId },
              data: {
                stockCount: newStockCount,
                status: this.computeStatus(
                  newStockCount,
                  Number(material.minimumStock),
                  material.status,
                ),
              },
            });

            // FIFO lot attribution: oldest first, held lots last — identical
            // ordering to production's consumeLotsFifo, but WITHOUT a
            // LotConsumption row (it requires a taskId). Any remainder simply
            // stays unattributed, like legacy stock without lot records.
            const lots = await tx.stockLot.findMany({
              where: { rawMaterialId: item.rawMaterialId, remainingQuantity: { gt: 0 } },
              orderBy: [{ onHold: 'asc' }, { receivedAt: 'asc' }, { createdAt: 'asc' }],
            });
            let left = quantity;
            for (const lot of lots) {
              if (left <= 0) break;
              const take = Math.min(Number(lot.remainingQuantity), left);
              if (take <= 0) continue;
              await tx.stockLot.update({
                where: { id: lot.id },
                data: { remainingQuantity: { decrement: take } },
              });
              left -= take;
            }

            const movement = await tx.stockMovement.create({
              data: {
                rawMaterialId: item.rawMaterialId,
                locationId: dto.locationId,
                movementType: StockMovementType.IESIRE_TESTE,
                quantity: quantity,
                unit: material.unit,
                performedById: userId,
                referenceNote,
              },
            });
            movementIds.push(movement.id);
            touched.push({ rawMaterialId: item.rawMaterialId });
          } else {
            const consumable = await tx.consumable.findUnique({
              where: { id: item.consumableId as string },
            });
            if (!consumable) {
              throw new NotFoundException(`Consumable with ID "${item.consumableId}" not found`);
            }

            // Consumables are global-only — clamp at 0 like production does.
            const newStockCount = Number(consumable.stockCount) - item.quantity;
            await tx.consumable.update({
              where: { id: item.consumableId as string },
              data: {
                stockCount: Math.max(0, newStockCount),
                status: this.computeStatus(
                  newStockCount,
                  Number(consumable.minimumStock),
                  consumable.status,
                ),
              },
            });

            const movement = await tx.stockMovement.create({
              data: {
                consumableId: item.consumableId,
                locationId: dto.locationId,
                movementType: StockMovementType.IESIRE_TESTE,
                quantity: item.quantity,
                unit: item.unit,
                performedById: userId,
                referenceNote,
              },
            });
            movementIds.push(movement.id);
            touched.push({ consumableId: item.consumableId });
          }
        }
      },
      { timeout: 15000 },
    );

    // Emit WebSocket events after successful transaction (same as production).
    for (const t of touched) {
      if (t.rawMaterialId) {
        const material = await this.prisma.rawMaterial.findUnique({
          where: { id: t.rawMaterialId },
        });
        if (material) {
          const stockUpdate: StockUpdateDto = {
            materialId: material.id,
            materialTitle: material.title,
            newStockCount: Number(material.stockCount),
            movementType: MovementType.OUT,
          };
          this.ws.emitStockUpdate(stockUpdate);
          if (Number(material.stockCount) <= Number(material.minimumStock)) {
            this.ws.emitLowStockAlert(stockUpdate);
          }
        }
      } else if (t.consumableId) {
        const consumable = await this.prisma.consumable.findUnique({
          where: { id: t.consumableId },
        });
        if (consumable) {
          const stockUpdate: StockUpdateDto = {
            materialId: consumable.id,
            materialTitle: consumable.title,
            newStockCount: Number(consumable.stockCount),
            movementType: MovementType.OUT,
          };
          this.ws.emitStockUpdate(stockUpdate);
          if (Number(consumable.stockCount) <= Number(consumable.minimumStock)) {
            this.ws.emitLowStockAlert(stockUpdate);
          }
        }
      }
    }

    this.logger.log(
      `Test consumption at location ${dto.locationId}: ${dto.items.length} items ("${referenceNote}")`,
    );

    // Reload with the display includes, preserving the request item order.
    const movements = await this.prisma.stockMovement.findMany({
      where: { id: { in: movementIds } },
      include: {
        rawMaterial: { select: { title: true } },
        consumable: { select: { title: true } },
        location: { select: { name: true } },
        performedBy: { select: { firstName: true, lastName: true } },
      },
    });
    const byId = new Map(movements.map((m) => [m.id, m]));
    return movementIds
      .map((id) => byId.get(id))
      .filter((m) => m !== undefined)
      .map((m) => this.toDto(m));
  }

  // ========================================================================
  // Stats
  // ========================================================================

  async getStats(): Promise<{ statusCounts: Record<string, number>; totalItems: number }> {
    const statusCounts: Record<string, number> = {};
    for (const status of Object.values(MaterialStatus)) {
      statusCounts[status] = 0;
    }

    // Statusul se DERIVĂ la citire din stoc/minim (computeStatus) în loc să
    // se ia din coloana stocată — unele fluxuri (ex. transferuri) au lăsat
    // statusuri stale (stoc 0 dar ACTIVE), iar cardurile de overview arătau
    // alt total decât bannerul de stoc scăzut, care compară la citire.
    const select = { stockCount: true, minimumStock: true, status: true } as const;
    const [raws, consumables] = await Promise.all([
      this.prisma.rawMaterial.findMany({ select }),
      this.prisma.consumable.findMany({ select }),
    ]);

    for (const row of [...raws, ...consumables]) {
      const status = this.computeStatus(
        Number(row.stockCount),
        Number(row.minimumStock),
        row.status,
      );
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }

    return { statusCounts, totalItems: raws.length + consumables.length };
  }

  // ========================================================================
  // Low Stock
  // ========================================================================

  async findLowStock(): Promise<LowStockItemDto[]> {
    const [rawMaterials, consumables] = await Promise.all([
      this.prisma.rawMaterial.findMany({
        where: {
          status: { not: MaterialStatus.OUT_OF_STOCK },
          minimumStock: { gt: 0 },
        },
      }),
      this.prisma.consumable.findMany({
        where: {
          status: { not: MaterialStatus.OUT_OF_STOCK },
          minimumStock: { gt: 0 },
        },
      }),
    ]);

    const lowStockItems: LowStockItemDto[] = [];

    for (const rm of rawMaterials) {
      if (Number(rm.stockCount) <= Number(rm.minimumStock)) {
        lowStockItems.push(
          new LowStockItemDto({
            id: rm.id,
            title: rm.title,
            type: 'raw_material',
            currentStock: Number(rm.stockCount),
            minimumStock: Number(rm.minimumStock),
            unit: rm.unit,
          }),
        );
      }
    }

    for (const c of consumables) {
      if (Number(c.stockCount) <= Number(c.minimumStock)) {
        lowStockItems.push(
          new LowStockItemDto({
            id: c.id,
            title: c.title,
            type: 'consumable',
            currentStock: Number(c.stockCount),
            minimumStock: Number(c.minimumStock),
            unit: 'BUCATI',
          }),
        );
      }
    }

    return lowStockItems.sort(
      (a, b) => a.currentStock / a.minimumStock - b.currentStock / b.minimumStock,
    );
  }

  // ========================================================================
  // Expiring Materials
  // ========================================================================

  async findExpiring(days: number = 30): Promise<ExpiringItemDto[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    // StockLot has no organizationId (not tenant-scoped), so filter by the
    // owning material/consumable's org to avoid leaking other tenants' lots.
    const orgId = getCurrentTenantId();
    const lots = await this.prisma.stockLot.findMany({
      where: {
        expiryDate: { lte: cutoff },
        // What's LEFT matters — fully consumed lots must not alert.
        remainingQuantity: { gt: 0 },
        ...(orgId
          ? {
              OR: [
                { rawMaterial: { is: { organizationId: orgId } } },
                { consumable: { is: { organizationId: orgId } } },
              ],
            }
          : {}),
      },
      include: {
        rawMaterial: { select: { title: true, unit: true } },
        consumable: { select: { title: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    // Produced goods (produse finite + semipreparate) expiring in the window —
    // expiry stamped at production from Recipe.shelfLifeMonths.
    // RecipeStock has no organizationId either — scope through the recipe.
    const producedStock = await this.prisma.recipeStock.findMany({
      where: {
        expiryDate: { not: null, lte: cutoff },
        quantity: { gt: 0 },
        recipe: tenantOrgFilter(),
      },
      include: {
        recipe: { select: { name: true, unit: true } },
        location: { select: { name: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const now = new Date();
    const daysUntil = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const items = [
      ...lots.map(
        (lot) =>
          new ExpiringItemDto({
            lotId: lot.id,
            materialTitle: lot.rawMaterial?.title ?? lot.consumable?.title ?? 'Unknown',
            quantity: Number(lot.remainingQuantity),
            unit: lot.rawMaterial?.unit ?? 'BUCATI',
            expiryDate: lot.expiryDate as Date,
            daysUntilExpiry: daysUntil(lot.expiryDate as Date),
            itemType: 'MATERIE',
            locationName: null,
          }),
      ),
      ...producedStock.map(
        (rs) =>
          new ExpiringItemDto({
            lotId: rs.id,
            materialTitle: rs.recipe.name,
            quantity: Number(rs.quantity),
            unit: rs.recipe.unit,
            expiryDate: rs.expiryDate as Date,
            daysUntilExpiry: daysUntil(rs.expiryDate as Date),
            itemType: 'PRODUS',
            locationName: rs.location.name,
          }),
      ),
    ];
    return items.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
  }

  // ========================================================================
  // Stock Lots
  // ========================================================================

  async findLots(materialId?: string, consumableId?: string): Promise<StockLotResponseDto[]> {
    // StockLot carries no organizationId (the tenant extension can't scope
    // it) — scope through the owning material, as findExpiring does.
    const orgId = getCurrentTenantId();
    const where: Prisma.StockLotWhereInput = orgId
      ? {
          OR: [
            { rawMaterial: { is: { organizationId: orgId } } },
            { consumable: { is: { organizationId: orgId } } },
          ],
        }
      : {};
    if (materialId) where.rawMaterialId = materialId;
    if (consumableId) where.consumableId = consumableId;

    const lots = await this.prisma.stockLot.findMany({
      where,
      include: {
        rawMaterial: { select: { title: true, unit: true } },
        consumable: { select: { title: true } },
      },
      orderBy: { receivedAt: 'desc' },
    });

    return lots.map(
      (lot) =>
        new StockLotResponseDto({
          id: lot.id,
          rawMaterialId: lot.rawMaterialId,
          consumableId: lot.consumableId,
          materialTitle: lot.rawMaterial?.title ?? lot.consumable?.title ?? null,
          unit: lot.rawMaterial?.unit ?? null,
          lotNumber: lot.lotNumber,
          barcode: lot.barcode,
          quantity: Number(lot.quantity),
          expiryDate: lot.expiryDate,
          purchasePrice: lot.purchasePrice ? Number(lot.purchasePrice) : null,
          supplier: lot.supplier,
          supplierInvoice: lot.supplierInvoice,
          receivedAt: lot.receivedAt,
          remainingQuantity: Number(lot.remainingQuantity),
          onHold: lot.onHold,
        }),
    );
  }

  /**
   * Hold/release a lot for FIFO: held lots are consumed only after every
   * other lot is exhausted — lets the lab keep a lot for a specific purpose
   * or steer production onto a different lot.
   */
  async setLotHold(id: string, onHold: boolean): Promise<StockLotResponseDto> {
    // StockLot is NOT tenant-scoped — verify the lot's material/consumable
    // belongs to the caller's org before mutating (prevents cross-tenant IDOR).
    const orgId = getCurrentTenantId();
    const lot = await this.prisma.stockLot.findUnique({
      where: { id },
      include: {
        rawMaterial: { select: { organizationId: true } },
        consumable: { select: { organizationId: true } },
      },
    });
    const lotOrgId = lot?.rawMaterial?.organizationId ?? lot?.consumable?.organizationId;
    if (!lot || (orgId && lotOrgId !== orgId)) {
      throw new NotFoundException(`Stock lot with ID "${id}" not found`);
    }
    const updated = await this.prisma.stockLot.update({
      where: { id },
      data: { onHold },
      include: {
        rawMaterial: { select: { title: true, unit: true } },
        consumable: { select: { title: true } },
      },
    });
    this.logger.log(`Lot ${id} (${updated.lotNumber ?? 'fara numar'}) onHold=${onHold}`);
    return new StockLotResponseDto({
      id: updated.id,
      rawMaterialId: updated.rawMaterialId,
      consumableId: updated.consumableId,
      materialTitle: updated.rawMaterial?.title ?? updated.consumable?.title ?? null,
      unit: updated.rawMaterial?.unit ?? null,
      lotNumber: updated.lotNumber,
      barcode: updated.barcode,
      quantity: Number(updated.quantity),
      expiryDate: updated.expiryDate,
      purchasePrice: updated.purchasePrice ? Number(updated.purchasePrice) : null,
      supplier: updated.supplier,
      supplierInvoice: updated.supplierInvoice,
      receivedAt: updated.receivedAt,
      remainingQuantity: Number(updated.remainingQuantity),
      onHold: updated.onHold,
    });
  }

  /**
   * Convert a Prisma StockMovement record to a response DTO.
   * Handles Decimal -> Number conversion.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(movement: any): StockMovementResponseDto {
    return new StockMovementResponseDto({
      id: movement.id,
      rawMaterialId: movement.rawMaterialId,
      consumableId: movement.consumableId,
      recipeId: movement.recipeId,
      itemTitle:
        movement.rawMaterial?.title ?? movement.consumable?.title ?? movement.recipe?.name ?? null,
      movementType: movement.movementType,
      quantity: Number(movement.quantity),
      unit: movement.unit,
      taskId: movement.taskId,
      referenceNote: movement.referenceNote,
      performedById: movement.performedById,
      createdByName: movement.performedBy
        ? `${movement.performedBy.firstName} ${movement.performedBy.lastName}`
        : null,
      locationName: movement.location?.name ?? null,
      createdAt: movement.createdAt,
    });
  }
}
