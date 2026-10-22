import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { UnitType, UnitConversion } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { PrismaService } from '@/prisma/prisma.service';
import { CreateUnitConversionDto } from './dto';
import { METRIC_BASE } from './metric-factor';

/** Standard (universal) conversion factors to seed on module init. */
const STANDARD_CONVERSIONS: {
  fromUnit: UnitType;
  toUnit: UnitType;
  factor: number;
}[] = [
  // Mass
  { fromUnit: UnitType.GRAME, toUnit: UnitType.KILOGRAME, factor: 0.001 },
  { fromUnit: UnitType.KILOGRAME, toUnit: UnitType.GRAME, factor: 1000 },

  // Volume
  { fromUnit: UnitType.MILILITRI, toUnit: UnitType.LITRI, factor: 0.001 },
  { fromUnit: UnitType.LITRI, toUnit: UnitType.MILILITRI, factor: 1000 },

  // Imperial ↔ Metric (mass)
  { fromUnit: UnitType.OUNCES, toUnit: UnitType.GRAME, factor: 28.3495 },
  { fromUnit: UnitType.GRAME, toUnit: UnitType.OUNCES, factor: 0.035274 },
  { fromUnit: UnitType.POUNDS, toUnit: UnitType.GRAME, factor: 453.592 },
  { fromUnit: UnitType.GRAME, toUnit: UnitType.POUNDS, factor: 0.00220462 },
  { fromUnit: UnitType.POUNDS, toUnit: UnitType.KILOGRAME, factor: 0.453592 },
  { fromUnit: UnitType.KILOGRAME, toUnit: UnitType.POUNDS, factor: 2.20462 },

  // Volume measures
  { fromUnit: UnitType.CANI, toUnit: UnitType.MILILITRI, factor: 236.588 },
  { fromUnit: UnitType.MILILITRI, toUnit: UnitType.CANI, factor: 0.00422675 },
  { fromUnit: UnitType.LINGURITE, toUnit: UnitType.MILILITRI, factor: 5 },
  { fromUnit: UnitType.MILILITRI, toUnit: UnitType.LINGURITE, factor: 0.2 },
  { fromUnit: UnitType.LINGURI, toUnit: UnitType.MILILITRI, factor: 15 },
  { fromUnit: UnitType.MILILITRI, toUnit: UnitType.LINGURI, factor: 0.0666667 },
];

@Injectable()
export class UnitConversionsService {
  private readonly logger = new Logger(UnitConversionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Convert
  // ---------------------------------------------------------------------------

  /**
   * Convert a quantity from one unit to another.
   *
   * Resolution order:
   * 1. Direct conversion (fromUnit -> toUnit) — material-specific first, then universal
   * 2. Two-hop via intermediate (fromUnit -> intermediate -> toUnit)
   * 3. Throw BadRequestException if no path found
   */
  async convert(
    quantity: number,
    fromUnit: UnitType,
    toUnit: UnitType,
    rawMaterialId?: string,
  ): Promise<{ quantity: number; unit: UnitType }> {
    // Identity conversion — no lookup needed
    if (fromUnit === toUnit) {
      return { quantity, unit: toUnit };
    }

    // ----- Step 1: Direct material-specific conversion -----
    if (rawMaterialId) {
      const materialDirect = await this.prisma.unitConversion.findFirst({
        where: { fromUnit, toUnit, rawMaterialId },
      });

      if (materialDirect) {
        return {
          quantity: this.applyFactor(quantity, materialDirect.factor),
          unit: toUnit,
        };
      }
    }

    // ----- Step 2: Direct universal conversion -----
    const universalDirect = await this.prisma.unitConversion.findFirst({
      where: { fromUnit, toUnit, rawMaterialId: null },
    });

    if (universalDirect) {
      return {
        quantity: this.applyFactor(quantity, universalDirect.factor),
        unit: toUnit,
      };
    }

    // ----- Step 3: Two-hop conversion -----
    const twoHopResult = await this.findTwoHopConversion(quantity, fromUnit, toUnit, rawMaterialId);

    if (twoHopResult) {
      return twoHopResult;
    }

    // ----- Step 4: Built-in metric fallback (no DB row required) -----
    const metric = this.metricFallback(quantity, fromUnit, toUnit);
    if (metric !== null) {
      return { quantity: metric, unit: toUnit };
    }

    throw new BadRequestException(
      `No conversion path found from ${fromUnit} to ${toUnit}` +
        (rawMaterialId ? ` for material ${rawMaterialId}` : ''),
    );
  }

  /**
   * Convert with an optional "piece equivalent" bridge, used for a semipreparat
   * whose yield is counted in BUCATI: one yield unit equals `pieceEquivalent`
   * (e.g. 1 bucată = 2 kg, or 0.5 l). This lets such a semipreparat be used as
   * an ingredient in a different measure family than its (count) yield unit.
   *
   * `countUnit` is the semipreparat's yield unit (the BUCATI side). When either
   * `fromUnit` or `toUnit` is that count unit and a normal conversion fails, we
   * bridge through the equivalent's unit:
   *   pieces → X:  (pieces × equiv.quantity) equiv.unit → X
   *   X → pieces:  (X → equiv.unit) ÷ equiv.quantity  = pieces
   */
  async convertWithPieceBridge(
    quantity: number,
    fromUnit: UnitType,
    toUnit: UnitType,
    countUnit: UnitType,
    pieceEquivalent?: { quantity: number; unit: UnitType } | null,
  ): Promise<{ quantity: number; unit: UnitType }> {
    try {
      return await this.convert(quantity, fromUnit, toUnit);
    } catch (err) {
      if (!pieceEquivalent || !(pieceEquivalent.quantity > 0)) throw err;

      // pieces → other unit
      if (fromUnit === countUnit && toUnit !== countUnit) {
        const base = quantity * pieceEquivalent.quantity;
        return this.convert(base, pieceEquivalent.unit, toUnit);
      }
      // other unit → pieces
      if (toUnit === countUnit && fromUnit !== countUnit) {
        const inEquivUnit = await this.convert(quantity, fromUnit, pieceEquivalent.unit);
        return { quantity: inEquivUnit.quantity / pieceEquivalent.quantity, unit: countUnit };
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * List all conversions, optionally filtered by a specific raw material.
   * When rawMaterialId is provided, returns both material-specific AND universal conversions.
   */
  async findAll(rawMaterialId?: string): Promise<UnitConversion[]> {
    const where = rawMaterialId
      ? {
          OR: [{ rawMaterialId }, { rawMaterialId: null }],
        }
      : undefined;

    return this.prisma.unitConversion.findMany({
      where,
      orderBy: [{ fromUnit: 'asc' }, { toUnit: 'asc' }],
    });
  }

  /**
   * Create a new conversion factor.
   */
  async create(dto: CreateUnitConversionDto): Promise<UnitConversion> {
    const conversion = await this.prisma.unitConversion.create({
      data: {
        fromUnit: dto.fromUnit,
        toUnit: dto.toUnit,
        factor: new Decimal(dto.factor),
        rawMaterialId: dto.rawMaterialId ?? null,
      },
    });

    this.logger.log(
      `Created conversion ${dto.fromUnit} → ${dto.toUnit} (factor ${dto.factor})` +
        (dto.rawMaterialId ? ` for material ${dto.rawMaterialId}` : ' (universal)'),
    );

    return conversion;
  }

  /**
   * Delete a conversion by ID.
   */
  async remove(id: string): Promise<void> {
    await this.prisma.unitConversion.delete({ where: { id } });
    this.logger.log(`Deleted conversion ${id}`);
  }

  // ---------------------------------------------------------------------------
  // Seeding
  // ---------------------------------------------------------------------------

  /**
   * Seed standard (universal) conversions for every organization (or a single
   * one when `organizationId` is given — used when a new org is created).
   * Idempotent. Startup job (no tenant context) — orgs handled explicitly.
   */
  async seedStandardConversions(organizationId?: string): Promise<void> {
    this.logger.log('Seeding standard unit conversions…');

    const orgIds = organizationId
      ? [organizationId]
      : (await this.prisma.organization.findMany({ select: { id: true } })).map((o) => o.id);

    let upserted = 0;

    for (const orgId of orgIds) {
      for (const conv of STANDARD_CONVERSIONS) {
        const existing = await this.prisma.unitConversion.findFirst({
          where: {
            organizationId: orgId,
            fromUnit: conv.fromUnit,
            toUnit: conv.toUnit,
            rawMaterialId: null,
          },
        });
        if (existing) {
          await this.prisma.unitConversion.update({
            where: { id: existing.id },
            data: { factor: new Decimal(conv.factor) },
          });
        } else {
          await this.prisma.unitConversion.create({
            data: {
              organizationId: orgId,
              fromUnit: conv.fromUnit,
              toUnit: conv.toUnit,
              factor: new Decimal(conv.factor),
              rawMaterialId: null,
            },
          });
        }
        upserted++;
      }
    }

    this.logger.log(`Standard unit conversions seeded (${upserted} upserted)`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Attempt a two-hop conversion: fromUnit → intermediate → toUnit.
   * Prefers material-specific conversions at each hop.
   */
  private async findTwoHopConversion(
    quantity: number,
    fromUnit: UnitType,
    toUnit: UnitType,
    rawMaterialId?: string,
  ): Promise<{ quantity: number; unit: UnitType } | null> {
    // Find all conversions FROM fromUnit (material-specific first, then universal)
    const firstHops = await this.prisma.unitConversion.findMany({
      where: {
        fromUnit,
        ...(rawMaterialId
          ? { OR: [{ rawMaterialId }, { rawMaterialId: null }] }
          : { rawMaterialId: null }),
      },
      orderBy: { rawMaterialId: { sort: 'asc', nulls: 'last' } },
    });

    for (const hop1 of firstHops) {
      const intermediateUnit = hop1.toUnit;

      // Skip if intermediate is same as source (no progress)
      if (intermediateUnit === fromUnit) continue;

      // Look for second hop: intermediate → toUnit (material-specific first)
      let hop2: UnitConversion | null = null;

      if (rawMaterialId) {
        hop2 = await this.prisma.unitConversion.findFirst({
          where: { fromUnit: intermediateUnit, toUnit, rawMaterialId },
        });
      }

      if (!hop2) {
        hop2 = await this.prisma.unitConversion.findFirst({
          where: { fromUnit: intermediateUnit, toUnit, rawMaterialId: null },
        });
      }

      if (hop2) {
        const intermediateQty = this.applyFactor(quantity, hop1.factor);
        const finalQty = this.applyFactor(intermediateQty, hop2.factor);
        return { quantity: finalQty, unit: toUnit };
      }
    }

    return null;
  }

  /**
   * Multiply a quantity by a Decimal conversion factor, returning a plain number.
   */
  private applyFactor(quantity: number, factor: Decimal): number {
    return new Decimal(quantity).mul(factor).toNumber();
  }

  /**
   * Convert between two metric units of the same family using built-in factors,
   * with no DB lookup. Returns null when either unit is non-metric or the units
   * belong to different families (mass vs volume).
   */
  private metricFallback(quantity: number, fromUnit: UnitType, toUnit: UnitType): number | null {
    const from = METRIC_BASE[fromUnit];
    const to = METRIC_BASE[toUnit];
    if (!from || !to || from.base !== to.base) {
      return null;
    }
    return new Decimal(quantity).mul(from.factor).div(to.factor).toNumber();
  }
}
