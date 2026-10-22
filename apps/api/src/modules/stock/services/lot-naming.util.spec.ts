import {
  bucharestDmy,
  bucharestDayStartUtc,
  bucharestIsoDate,
  buildLotNumber,
} from './lot-naming.util';

describe('lot-naming.util', () => {
  describe('bucharestDmy', () => {
    it('formats a UTC-morning instant as ddMMyyyy in Romania summer time (UTC+3)', () => {
      // 2026-08-10T09:00:00Z is 2026-08-10 12:00 in Bucharest (EEST, UTC+3) — same day either way.
      expect(bucharestDmy(new Date('2026-08-10T09:00:00Z'))).toBe('10082026');
    });

    it('rolls a UTC late-night instant into the NEXT Romania calendar day (EEST, UTC+3)', () => {
      // 2026-08-10T22:00:00Z is 2026-08-11 01:00 in Bucharest — the bug this fixes: a naive
      // server-local (UTC, no TZ set) day computation would still say "10082026" here.
      expect(bucharestDmy(new Date('2026-08-10T22:00:00Z'))).toBe('11082026');
    });

    it('handles winter time (EET, UTC+2) correctly', () => {
      // 2026-01-10T22:30:00Z is 2026-01-11 00:30 in Bucharest (winter, UTC+2).
      expect(bucharestDmy(new Date('2026-01-10T22:30:00Z'))).toBe('11012026');
    });
  });

  describe('bucharestDayStartUtc', () => {
    it('returns the UTC instant of local midnight for a summer-time instant', () => {
      // Local midnight 2026-08-10 00:00 EEST (UTC+3) = 2026-08-09T21:00:00Z.
      const start = bucharestDayStartUtc(new Date('2026-08-10T09:00:00Z'));
      expect(start.toISOString()).toBe('2026-08-09T21:00:00.000Z');
    });

    it('returns the UTC instant of local midnight for a winter-time instant', () => {
      // Local midnight 2026-01-11 00:00 EET (UTC+2) = 2026-01-10T22:00:00Z.
      const start = bucharestDayStartUtc(new Date('2026-01-10T22:30:00Z'));
      expect(start.toISOString()).toBe('2026-01-10T22:00:00.000Z');
    });

    it('a same-Romania-day instant just before UTC midnight and one just after both fall on the same day start', () => {
      const late = bucharestDayStartUtc(new Date('2026-08-10T23:59:00Z')); // 2026-08-11 02:59 RO
      const early = bucharestDayStartUtc(new Date('2026-08-11T00:01:00Z')); // 2026-08-11 03:01 RO
      expect(late.getTime()).toBe(early.getTime());
    });
  });

  describe('buildLotNumber', () => {
    it('matches the spec format: ddMMyyyy-<product name> N', () => {
      expect(buildLotNumber('Fistic', new Date('2026-08-10T09:00:00Z'), 0)).toBe(
        '10082026-Fistic 1',
      );
    });

    it('increments N for the second same-day batch of the same product', () => {
      expect(buildLotNumber('Fistic', new Date('2026-08-10T15:00:00Z'), 1)).toBe(
        '10082026-Fistic 2',
      );
    });

    it('uses the Romania calendar day, not the raw UTC day, for the date prefix', () => {
      // 23:00 UTC on the 10th is already the 11th in Bucharest.
      expect(buildLotNumber('Fistic', new Date('2026-08-10T23:00:00Z'), 0)).toBe(
        '11082026-Fistic 1',
      );
    });
  });
});

describe('bucharestIsoDate', () => {
  it('uses the Romania calendar day, not the UTC one', () => {
    // 00:30 in Bucharest (EET, +02:00) is still the previous day in UTC.
    expect(bucharestIsoDate(new Date('2026-11-10T00:30:00+02:00'))).toBe('2026-11-10');
    // 23:30 local in summer (EEST, +03:00).
    expect(bucharestIsoDate(new Date('2026-07-01T23:30:00+03:00'))).toBe('2026-07-01');
  });
});
