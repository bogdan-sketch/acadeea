import { parseRomanianDeadline } from './ro-deadline.parser';

// Reference order date used across cases: a real pickup is on/after the order.
const ORDER = new Date('2026-07-15T09:00:00Z');
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe('parseRomanianDeadline', () => {
  describe('explicit numeric dates → high', () => {
    it.each([
      ['28.07.2026', '2026-07-28'],
      ['15.07.2026.', '2026-07-15'],
      ['25/07/2026', '2026-07-25'],
      ['25/07/26', '2026-07-25'],
      ['09.08.2026', '2026-08-09'],
      ['24.07.2026 (vineri)', '2026-07-24'],
    ])('%s → %s (high)', (input, expected) => {
      const r = parseRomanianDeadline(input, ORDER);
      expect(iso(r.date)).toBe(expected);
      expect(r.confidence).toBe('high');
    });
  });

  describe('month-word dates', () => {
    it('with explicit year → high', () => {
      const r = parseRomanianDeadline('26 iulie 2026', ORDER);
      expect(iso(r.date)).toBe('2026-07-26');
      expect(r.confidence).toBe('high');
    });
    it('no space "1iulie 2026" still parses', () => {
      const r = parseRomanianDeadline('1iulie 2026 dupa ora 16', ORDER);
      expect(iso(r.date)).toBe('2026-07-01');
    });
    it('no year, clean → inferred, medium', () => {
      const r = parseRomanianDeadline('28 iulie', ORDER);
      expect(iso(r.date)).toBe('2026-07-28');
      expect(['high', 'medium']).toContain(r.confidence);
    });
    it('capitalised month + diacritics', () => {
      const r = parseRomanianDeadline('26 Iunie 2026', ORDER);
      expect(iso(r.date)).toBe('2026-06-26');
    });
  });

  describe('year inference from the order date', () => {
    it('rolls to next year when the day already passed', () => {
      // order in December, pickup "5 ianuarie" → next January
      const dec = new Date('2026-12-20T09:00:00Z');
      const r = parseRomanianDeadline('5 ianuarie', dec);
      expect(iso(r.date)).toBe('2027-01-05');
    });
    it('keeps the order year for a near-future day', () => {
      const r = parseRomanianDeadline('28.07', ORDER);
      expect(iso(r.date)).toBe('2026-07-28');
    });
    it('two-digit year expands to 20xx', () => {
      const r = parseRomanianDeadline('25/07/26', ORDER);
      expect(r.date?.getUTCFullYear()).toBe(2026);
    });
  });

  describe('dates buried in noise → extracted', () => {
    // order placed in late June, so early-July pickups infer the same year
    const ORDER_JUNE = new Date('2026-06-25T09:00:00Z');
    it.each([
      ['Mâine - 19.07.2026', '2026-07-19'],
      ['Marti in 28.07 . Alexandru B.', '2026-07-28'],
      ['Rugaminte livrare in 14 iulie', '2026-07-14'],
      ['Joi, 02.07, ora 17:00', '2026-07-02'],
      ['3 iulie(vineri)', '2026-07-03'],
    ])('%s → %s', (input, expected) => {
      const r = parseRomanianDeadline(input, ORDER_JUNE);
      expect(iso(r.date)).toBe(expected);
    });
  });

  describe('ambiguous → low, but never dropped silently', () => {
    it('two alternative dates takes the earliest, flags low', () => {
      const r = parseRomanianDeadline('20.07. sau 21.07.', ORDER);
      expect(iso(r.date)).toBe('2026-07-20');
      expect(r.confidence).toBe('low');
      expect(r.reason).toContain('multiple');
    });
    it('weekday + approx hour, no date → resolved but low', () => {
      const r = parseRomanianDeadline('Duminică aproximativ ora 11', ORDER);
      expect(r.confidence).toBe('low');
      // next Sunday on/after Wed 2026-07-15 is 2026-07-19
      expect(iso(r.date)).toBe('2026-07-19');
    });
    it('"azi" resolves to the order date, low', () => {
      const r = parseRomanianDeadline('Astăzi, ora 18:00', ORDER);
      expect(iso(r.date)).toBe('2026-07-15');
      expect(r.confidence).toBe('low');
    });
    it('"mâine" resolves to order date + 1', () => {
      const r = parseRomanianDeadline('maine dupa amiaza', ORDER);
      expect(iso(r.date)).toBe('2026-07-16');
    });
  });

  describe('no usable date → none, null', () => {
    it.each(['Love you!', '19', ''])('%s → none', (input) => {
      const r = parseRomanianDeadline(input, ORDER);
      expect(r.date).toBeNull();
      expect(r.confidence).toBe('none');
    });
  });

  describe('invalid calendar dates are rejected', () => {
    it('31.04 does not roll into May', () => {
      const r = parseRomanianDeadline('31.04.2026', ORDER);
      // 31 April is invalid → no numeric hit → none
      expect(r.date).toBeNull();
    });
  });

  it('always preserves the raw input', () => {
    const r = parseRomanianDeadline('  duminica, 2 august  ', ORDER);
    expect(r.raw).toBe('  duminica, 2 august  ');
    expect(iso(r.date)).toBe('2026-08-02');
  });
});
