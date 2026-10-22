import { UnitType } from '@prisma/client';

/**
 * Built-in metric factors: the value of 1 unit in its family base (grams for
 * mass, millilitres for volume). The single table behind every g↔kg / ml↔l
 * conversion that must never depend on DB rows.
 */
export const METRIC_BASE: Partial<Record<UnitType, { base: 'mass' | 'volume'; factor: number }>> = {
  [UnitType.MILIGRAME]: { base: 'mass', factor: 0.001 },
  [UnitType.GRAME]: { base: 'mass', factor: 1 },
  [UnitType.KILOGRAME]: { base: 'mass', factor: 1000 },
  [UnitType.POUNDS]: { base: 'mass', factor: 453.592 },
  [UnitType.OUNCES]: { base: 'mass', factor: 28.3495 },
  [UnitType.MILILITRI]: { base: 'volume', factor: 1 },
  [UnitType.LITRI]: { base: 'volume', factor: 1000 },
};

/**
 * Multiplier that turns a quantity in `from` into the same amount in `to`
 * (KILOGRAME → GRAME = 1000). 1 for identical units, null when the two units
 * are not in the same metric family (mass vs volume vs count).
 */
export function metricFactor(from: UnitType, to: UnitType): number | null {
  if (from === to) return 1;
  const a = METRIC_BASE[from];
  const b = METRIC_BASE[to];
  if (!a || !b || a.base !== b.base) return null;
  return a.factor / b.factor;
}
