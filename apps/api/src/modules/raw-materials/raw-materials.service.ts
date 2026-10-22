import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, UnitType } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { getCurrentTenantId } from '@/prisma/tenant-context';
import { PaginatedDto } from '@/common/dto';
import { normalizePurchasePrice } from '@/common/vat';
import { WebsocketService, MovementType } from '@/modules/websocket';
import { deriveMaterialStatus } from '@/modules/stock/material-status.util';
import { metricFactor } from '@/modules/unit-conversions/metric-factor';
import {
  CreateRawMaterialDto,
  UpdateRawMaterialDto,
  RawMaterialResponseDto,
  RawMaterialQueryDto,
} from './dto';

@Injectable()
export class RawMaterialsService {
  private readonly logger = new Logger(RawMaterialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: WebsocketService,
  ) {}

  /**
   * List raw materials with pagination, search, and filters.
   */
  async findAll(query: RawMaterialQueryDto): Promise<PaginatedDto<RawMaterialResponseDto>> {
    const { page = 1, limit = 20, search, storageType, status, pieceType } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.RawMaterialWhereInput = {};

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (storageType) {
      where.storageType = storageType;
    }

    if (pieceType) {
      where.pieceType = pieceType;
    }

    // Statusul se derivă din stoc/minim la citire (coloana stocată poate fi
    // stale — vezi deriveMaterialStatus), deci filtrul de status nu poate fi
    // un WHERE pe coloană: aducem setul și filtrăm/paginăm în memorie.
    if (status) {
      const all = await this.prisma.rawMaterial.findMany({
        where,
        orderBy: { title: 'asc' },
        include: { supplier: { select: { name: true } } },
      });
      const matching = all.filter(
        (m) =>
          deriveMaterialStatus(Number(m.stockCount), Number(m.minimumStock), m.status) === status,
      );
      const data = matching.slice(skip, skip + limit).map((material) => this.toDto(material));
      return new PaginatedDto(data, matching.length, page, limit);
    }

    const [materials, total] = await Promise.all([
      this.prisma.rawMaterial.findMany({
        where,
        skip,
        take: limit,
        orderBy: { title: 'asc' },
        include: { supplier: { select: { name: true } } },
      }),
      this.prisma.rawMaterial.count({ where }),
    ]);

    const data = materials.map((material) => this.toDto(material));

    return new PaginatedDto(data, total, page, limit);
  }

  /**
   * Get purchase price history for a raw material.
   */
  async getPriceHistory(id: string) {
    const material = await this.prisma.rawMaterial.findUnique({ where: { id } });
    if (!material) {
      throw new NotFoundException(`Raw material with ID "${id}" not found`);
    }

    return this.prisma.priceHistory.findMany({
      where: { rawMaterialId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        priceType: true,
        oldPrice: true,
        newPrice: true,
        createdAt: true,
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Find a single raw material by ID.
   * @throws NotFoundException if the material does not exist.
   */
  async findById(id: string): Promise<RawMaterialResponseDto> {
    const material = await this.prisma.rawMaterial.findUnique({
      where: { id },
      include: { supplier: { select: { name: true } } },
    });

    if (!material) {
      throw new NotFoundException(`Raw material with ID "${id}" not found`);
    }

    return this.toDto(material);
  }

  /**
   * Convert an entered price to the org's cost basis (net for VAT payers,
   * gross for non-payers) per the optional cu/fără TVA input flag.
   */
  private async toCostBasis(
    price: number | undefined,
    priceIncludesVat: boolean | undefined,
  ): Promise<number | undefined> {
    if (price === undefined || priceIncludesVat === undefined) return price;
    // MUST scope to the caller's org — Organization has no organizationId so the
    // tenant extension does NOT filter it; a bare findFirst() returns an
    // arbitrary org and would apply the wrong VAT basis.
    const orgId = getCurrentTenantId();
    const org = orgId
      ? await this.prisma.organization.findUnique({
          where: { id: orgId },
          select: { vatPayer: true, vatRatePercent: true },
        })
      : null;
    if (!org) return price;
    return normalizePurchasePrice(price, priceIncludesVat, org);
  }

  /**
   * Create a new raw material.
   */
  async create(dto: CreateRawMaterialDto): Promise<RawMaterialResponseDto> {
    const purchasePrice = await this.toCostBasis(dto.purchasePrice, dto.priceIncludesVat);
    const material = await this.prisma.rawMaterial.create({
      include: { supplier: { select: { name: true } } },
      data: {
        title: dto.title,
        category: dto.category,
        producer: dto.producer,
        supplierId: dto.supplierId,
        // Only title is required; default the rest.
        unit: dto.unit ?? 'BUCATI',
        quantityPerPiece: dto.quantityPerPiece,
        pieceType: dto.pieceType,
        storageType: dto.storageType ?? 'WARM',
        minimumStock: dto.minimumStock,
        estimatedLossPercent: dto.estimatedLossPercent,
        allergens: dto.allergens,
        purchasePrice,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
        lotNumber: dto.lotNumber,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      },
    });

    this.logger.log(`Created raw material "${material.title}" (${material.id})`);

    // Assign to a location by creating a (zero-quantity) stock entry there, so
    // the material shows up under that location instead of being "unassigned".
    if (dto.locationId) {
      await this.prisma.materialStock.upsert({
        where: {
          locationId_rawMaterialId: { locationId: dto.locationId, rawMaterialId: material.id },
        },
        update: {},
        create: { locationId: dto.locationId, rawMaterialId: material.id, quantity: 0 },
      });
    }

    const result = this.toDto(material);
    this.emitStockEvents(result, MovementType.ADJUSTMENT);
    return result;
  }

  /**
   * Update an existing raw material.
   * @throws NotFoundException if the material does not exist.
   */
  async update(
    id: string,
    dto: UpdateRawMaterialDto,
    userId?: string,
  ): Promise<RawMaterialResponseDto> {
    const existing = await this.prisma.rawMaterial.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Raw material with ID "${id}" not found`);
    }

    // Build update data, handling invoiceDate conversion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = { ...dto };
    // locationId is not a column — it assigns a stock location (handled below).
    delete updateData.locationId;
    // priceIncludesVat is an input hint, not a column — normalize the price.
    delete updateData.priceIncludesVat;
    if (dto.purchasePrice !== undefined) {
      updateData.purchasePrice = await this.toCostBasis(dto.purchasePrice, dto.priceIncludesVat);
    }
    if (dto.invoiceDate !== undefined) {
      updateData.invoiceDate = dto.invoiceDate ? new Date(dto.invoiceDate) : null;
    }
    if (dto.expiryDate !== undefined) {
      updateData.expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : null;
    }
    if (dto.nutrition !== undefined) {
      // Prisma Json columns need DbNull to clear; nested DTO -> plain object.
      updateData.nutrition = dto.nutrition === null ? Prisma.DbNull : { ...dto.nutrition };
    }

    // Changing the unit must never relabel the numbers: 599,96 KILOGRAME is
    // not 599,96 GRAME. Within a metric family every stored quantity of the
    // material is rescaled to the new unit in the same transaction; across
    // families (kg → buc) there is no exact factor, so it is refused while
    // the material still has stock.
    const unitChange =
      dto.unit !== undefined && dto.unit !== existing.unit
        ? await this.planUnitChange(existing, dto.unit)
        : null;
    if (unitChange?.factor && unitChange.factor !== 1) {
      const f = unitChange.factor;
      // Quantities the client sent along with the new unit are already in it;
      // echoed-back unchanged values (full-form PATCH) are still in the old one.
      if (dto.minimumStock === undefined || dto.minimumStock === Number(existing.minimumStock)) {
        updateData.minimumStock = Number(existing.minimumStock) * f;
      }
      if (
        existing.quantityPerPiece !== null &&
        (dto.quantityPerPiece === undefined ||
          dto.quantityPerPiece === Number(existing.quantityPerPiece))
      ) {
        updateData.quantityPerPiece = Number(existing.quantityPerPiece) * f;
      }
      updateData.stockCount = { multiply: f };
      updateData.reservedCount = { multiply: f };
      updateData.orderedCount = { multiply: f };
    }

    const material = await this.prisma.$transaction(async (tx) => {
      if (unitChange?.factor && unitChange.factor !== 1) {
        await this.rescaleMaterialQuantities(tx, id, existing.unit, dto.unit as UnitType);
      }
      return tx.rawMaterial.update({
        where: { id },
        data: updateData,
        include: { supplier: { select: { name: true } } },
      });
    });
    if (unitChange?.factor && unitChange.factor !== 1) {
      this.logger.log(
        `Unit of "${material.title}" changed ${existing.unit} → ${material.unit}: quantities ×${unitChange.factor}`,
      );
    }

    // Auto-create price history when purchasePrice changes (normalized value).
    if (
      updateData.purchasePrice !== undefined &&
      userId &&
      Number(existing.purchasePrice) !== updateData.purchasePrice
    ) {
      await this.prisma.priceHistory.create({
        data: {
          rawMaterialId: id,
          priceType: 'PURCHASE',
          oldPrice: existing.purchasePrice,
          newPrice: updateData.purchasePrice,
          changedById: userId,
        },
      });
      this.logger.log(
        `Price history recorded for "${material.title}": ${existing.purchasePrice} → ${updateData.purchasePrice}`,
      );
    }

    // Assign to a location (creates a zero-quantity stock entry if missing).
    if (dto.locationId) {
      await this.prisma.materialStock.upsert({
        where: {
          locationId_rawMaterialId: { locationId: dto.locationId, rawMaterialId: id },
        },
        update: {},
        create: { locationId: dto.locationId, rawMaterialId: id, quantity: 0 },
      });
    }

    this.logger.log(`Updated raw material "${material.title}" (${material.id})`);

    const result = this.toDto(material);
    this.emitStockEvents(result, MovementType.ADJUSTMENT);
    return result;
  }

  /**
   * Validate a unit change. Same metric family → the exact factor; different
   * family → allowed only while nothing is in stock (pure relabel of an empty
   * item), otherwise a Romanian 400.
   */
  private async planUnitChange(
    existing: { id: string; title: string; unit: UnitType; stockCount: Prisma.Decimal },
    next: UnitType,
  ): Promise<{ factor: number | null }> {
    const factor = metricFactor(existing.unit, next);
    if (factor !== null) return { factor };
    const [stockRows, lotRows] = await Promise.all([
      this.prisma.materialStock.count({
        where: { rawMaterialId: existing.id, quantity: { not: 0 } },
      }),
      this.prisma.stockLot.count({
        where: { rawMaterialId: existing.id, remainingQuantity: { gt: 0 } },
      }),
    ]);
    if (Number(existing.stockCount) !== 0 || stockRows > 0 || lotRows > 0) {
      throw new BadRequestException(
        `Unitatea „${existing.title}” nu poate fi schimbată din ${existing.unit} în ${next} cât timp are stoc: ` +
          'nu există o conversie exactă. Golește stocul (ajustare la 0) sau păstrează unitatea.',
      );
    }
    return { factor: null };
  }

  /**
   * Rescale every stored quantity of a material from `from` to `to` (same
   * metric family): per-location stock + reservations, lots, the movement
   * journal, task reservations, lot consumptions and transfer items. Each
   * row is converted from ITS OWN unit, so a journal that already mixed
   * units ends up uniformly in the new unit.
   */
  private async rescaleMaterialQuantities(
    // Interactive-transaction client of the tenant-extended Prisma (same loose
    // typing as consumeRecipeLotsFifo).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    rawMaterialId: string,
    from: UnitType,
    to: UnitType,
  ): Promise<void> {
    const f = metricFactor(from, to) as number;
    await tx.materialStock.updateMany({
      where: { rawMaterialId },
      data: { quantity: { multiply: f }, reservedCount: { multiply: f } },
    });
    await tx.stockLot.updateMany({
      where: { rawMaterialId },
      data: { quantity: { multiply: f }, remainingQuantity: { multiply: f } },
    });
    const rowUnits = async (
      model: 'stockMovement' | 'stockReservation' | 'lotConsumption' | 'stockTransferItem',
    ): Promise<UnitType[]> => {
      const rows: { unit: UnitType }[] = await tx[model].findMany({
        where: { rawMaterialId },
        select: { unit: true },
        distinct: ['unit'],
      });
      return rows.map((r) => r.unit);
    };
    for (const u of await rowUnits('stockMovement')) {
      const k = metricFactor(u, to);
      if (k === null) continue;
      await tx.stockMovement.updateMany({
        where: { rawMaterialId, unit: u },
        data: { quantity: { multiply: k }, unit: to },
      });
    }
    for (const u of await rowUnits('stockReservation')) {
      const k = metricFactor(u, to);
      if (k === null) continue;
      await tx.stockReservation.updateMany({
        where: { rawMaterialId, unit: u },
        data: { quantityReserved: { multiply: k }, unit: to },
      });
    }
    for (const u of await rowUnits('lotConsumption')) {
      const k = metricFactor(u, to);
      if (k === null) continue;
      await tx.lotConsumption.updateMany({
        where: { rawMaterialId, unit: u },
        data: { quantity: { multiply: k }, unit: to },
      });
    }
    for (const u of await rowUnits('stockTransferItem')) {
      const k = metricFactor(u, to);
      if (k === null) continue;
      await tx.stockTransferItem.updateMany({
        where: { rawMaterialId, unit: u },
        data: { quantity: { multiply: k }, unit: to },
      });
    }
  }

  /**
   * Soft-delete a raw material by setting status to DISCONTINUED.
   * @throws NotFoundException if the material does not exist.
   */
  async remove(id: string): Promise<RawMaterialResponseDto> {
    const existing = await this.prisma.rawMaterial.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Raw material with ID "${id}" not found`);
    }

    const material = await this.prisma.rawMaterial.update({
      where: { id },
      data: { status: 'DISCONTINUED' },
    });

    this.logger.log(`Discontinued raw material "${material.title}" (${material.id})`);

    const result = this.toDto(material);
    this.emitStockEvents(result, MovementType.ADJUSTMENT);
    return result;
  }

  /**
   * Pre-delete check: hard delete is allowed only at zero stock (global count
   * AND every per-location MaterialStock row) and with no LIVE transfer
   * (IN_ASTEPTARE/IN_TRANZIT) carrying the material — goods in flight would
   * be corrupted. Completed transfers are history, not a blocker.
   * `everUsed` = the material has production/stock/transfer history or
   * appears in recipes — clients show the "history & traceability will be
   * lost" fine print when true. `activeTransfers` lets clients word the
   * blocked message accurately (stock vs transfer in progress).
   */
  async deleteInfo(id: string): Promise<{
    currentStock: number;
    canDelete: boolean;
    everUsed: boolean;
    activeTransfers: number;
  }> {
    const material = await this.prisma.rawMaterial.findUnique({ where: { id } });
    if (!material) {
      throw new NotFoundException(`Raw material with ID "${id}" not found`);
    }

    const [
      nonZeroStockRow,
      movementCount,
      recipeCount,
      liveTransferItems,
      anyTransferItems,
      lotCount,
    ] = await Promise.all([
      // Per-row check, not an aggregate: offsetting +5/-5 rows must NOT
      // pass the guard while a location physically holds stock.
      this.prisma.materialStock.findFirst({
        where: { rawMaterialId: id, quantity: { not: 0 } },
        select: { quantity: true },
      }),
      this.prisma.stockMovement.count({ where: { rawMaterialId: id } }),
      this.prisma.recipeIngredient.count({ where: { rawMaterialId: id } }),
      // Only transfers still in flight block the delete.
      this.prisma.stockTransferItem.count({
        where: { rawMaterialId: id, transfer: { status: { in: ['IN_ASTEPTARE', 'IN_TRANZIT'] } } },
      }),
      // Any non-cancelled transfer counts as history (printed avize).
      this.prisma.stockTransferItem.count({
        where: { rawMaterialId: id, transfer: { status: { not: 'ANULAT' } } },
      }),
      this.prisma.stockLot.count({ where: { rawMaterialId: id } }),
    ]);

    const globalStock = Number(material.stockCount);
    // Block deletion while the material sits on ANY non-cancelled transfer:
    // in-flight ones reserve stock, and finalized ones are printed avize whose
    // line items are legal (fiscal) history — hardDelete cascades
    // stockTransferItem.deleteMany, so allowing this would silently strip a line
    // (and corrupt the TOTAL) from an already-issued aviz on reprint. Materials
    // entered by mistake that were never transferred still delete freely; one on
    // a printed aviz must be discontinued (soft-delete) instead.
    const canDelete =
      globalStock === 0 && !nonZeroStockRow && liveTransferItems === 0 && anyTransferItems === 0;
    return {
      currentStock: globalStock !== 0 ? globalStock : Number(nonZeroStockRow?.quantity ?? 0),
      canDelete,
      everUsed: movementCount > 0 || recipeCount > 0 || anyTransferItems > 0 || lotCount > 0,
      activeTransfers: liveTransferItems,
    };
  }

  /**
   * Permanently delete a raw material entered by mistake. Guarded: stock must
   * be exactly 0 (global + per location). Removes ALL its history in one
   * transaction — movements, lots + FIFO lot consumptions (traceability),
   * reservations, per-location stock, transfer items, recipe ingredient rows,
   * price history and material-specific unit conversions.
   */
  async hardDelete(id: string): Promise<void> {
    const info = await this.deleteInfo(id);
    if (!info.canDelete) {
      throw new BadRequestException(
        'Materia primă nu poate fi ștearsă cât timp are stoc sau apare pe un transfer ' +
          '(în curs sau finalizat). Adu stocul la 0 și încearcă din nou.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Re-verify inside the transaction — a reception landing between the
      // check above and this point must not be wiped with the material.
      const fresh = await tx.rawMaterial.findUnique({
        where: { id },
        select: { stockCount: true },
      });
      const freshRow = await tx.materialStock.findFirst({
        where: { rawMaterialId: id, quantity: { not: 0 } },
        select: { id: true },
      });
      if (!fresh || Number(fresh.stockCount) !== 0 || freshRow) {
        throw new BadRequestException(
          'Stocul s-a schimbat între timp — reîncarcă și încearcă din nou.',
        );
      }

      await tx.lotConsumption.deleteMany({ where: { rawMaterialId: id } });
      await tx.stockLot.deleteMany({ where: { rawMaterialId: id } });
      await tx.stockMovement.deleteMany({ where: { rawMaterialId: id } });
      await tx.stockReservation.deleteMany({ where: { rawMaterialId: id } });
      await tx.materialStock.deleteMany({ where: { rawMaterialId: id } });
      await tx.stockTransferItem.deleteMany({ where: { rawMaterialId: id } });
      await tx.recipeIngredient.deleteMany({ where: { rawMaterialId: id } });
      await tx.priceHistory.deleteMany({ where: { rawMaterialId: id } });
      await tx.unitConversion.deleteMany({ where: { rawMaterialId: id } });
      await tx.rawMaterial.delete({ where: { id } });
    });

    this.logger.warn(`HARD-deleted raw material ${id} (stock was 0; history removed)`);
  }

  private emitStockEvents(dto: RawMaterialResponseDto, movementType: MovementType): void {
    this.ws.emitStockUpdate({
      materialId: dto.id,
      materialTitle: dto.title,
      newStockCount: dto.stockCount,
      movementType,
    });

    if (dto.stockCount <= dto.minimumStock) {
      this.ws.emitLowStockAlert({
        materialId: dto.id,
        materialTitle: dto.title,
        newStockCount: dto.stockCount,
        movementType,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(material: any): RawMaterialResponseDto {
    return new RawMaterialResponseDto({
      ...material,
      // Badge-ul de pe rand foloseste statusul derivat, ca sa fie mereu in
      // acord cu /stock/stats si cu filtrul de lista.
      status: deriveMaterialStatus(
        Number(material.stockCount),
        Number(material.minimumStock),
        material.status,
      ),
      supplierName: material.supplier?.name ?? null,
      quantityPerPiece: Number(material.quantityPerPiece),
      stockCount: Number(material.stockCount),
      openedCount: Number(material.openedCount),
      orderedCount: Number(material.orderedCount),
      reservedCount: Number(material.reservedCount),
      minimumStock: Number(material.minimumStock),
      estimatedLossPercent: Number(material.estimatedLossPercent),
      purchasePrice: material.purchasePrice != null ? Number(material.purchasePrice) : null,
    });
  }
}
