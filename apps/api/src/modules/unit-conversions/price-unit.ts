import { UnitType } from '@prisma/client';

/**
 * Purchase prices are entered per COMMERCIAL unit — RON/kg for mass-stocked
 * materials, RON/litru for volume-stocked ones, RON/<stock unit> for
 * everything else (bucăți etc.) — regardless of how fine the stock unit is.
 * A material stocked in grams still has its price written as "6 RON/kg",
 * not "0.006 RON/g".
 *
 * `pricePerStockUnit` translates that commercial price into a price per one
 * stock unit so `quantity-in-stock-units × price` math stays correct.
 */
const STOCK_UNIT_IN_PRICE_UNIT: Partial<Record<UnitType, number>> = {
  [UnitType.MILIGRAME]: 0.000001, // price is per kg
  [UnitType.GRAME]: 0.001, // price is per kg
  [UnitType.KILOGRAME]: 1,
  [UnitType.MILILITRI]: 0.001, // price is per litru
  [UnitType.LITRI]: 1,
};

export function pricePerStockUnit(price: number, stockUnit: UnitType): number {
  return price * (STOCK_UNIT_IN_PRICE_UNIT[stockUnit] ?? 1);
}

/** Human label of the unit a purchase price refers to ("kg", "l", "buc", …). */
export function priceUnitLabel(stockUnit: UnitType): string {
  switch (stockUnit) {
    case UnitType.MILIGRAME:
    case UnitType.GRAME:
    case UnitType.KILOGRAME:
      return 'kg';
    case UnitType.MILILITRI:
    case UnitType.LITRI:
      return 'l';
    case UnitType.BUCATI:
      return 'buc';
    default:
      return stockUnit.toLowerCase();
  }
}
