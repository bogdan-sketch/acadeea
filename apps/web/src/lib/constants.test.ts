import { describe, expect, it } from 'vitest';
import { UnitType } from '@horae/shared-types';
import { selectableUnits, unitChoices } from './constants';

describe('unitChoices', () => {
  it('offers only the metric units for a metric value', () => {
    expect(unitChoices(UnitType.GRAME)).toEqual(selectableUnits);
  });

  it("keeps an old recipe's legacy unit so editing does not lose it", () => {
    for (const legacy of [UnitType.CANI, UnitType.OUNCES, UnitType.POUNDS]) {
      const units = unitChoices(legacy);
      expect(units).toContain(legacy);
      expect(units.slice(0, -1)).toEqual(selectableUnits);
    }
  });
});
