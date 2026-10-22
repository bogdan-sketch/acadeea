/**
 * Romanian free-text deadline parser.
 *
 * WooCommerce pickup/delivery dates arrive as an unvalidated free-text field
 * ("Comanda se ridică de la cofetărie…"). Customers type anything:
 *   "28.07.2026", "25/07/26", "26 iulie 2026", "28 iulie", "duminica, 2 august",
 *   "Marti in 28.07 . Alexandru B.", "Mâine - 19.07.2026", "24.07.2026 (vineri)",
 *   "Astăzi, ora 18:00", "Duminică aproximativ ora 11", "20.07. sau 21.07.", "Love you!"
 *
 * This turns that into a real Date with an honesty flag. A wrong cake date is a
 * business incident, so anything we are not sure about is returned as low/none
 * confidence and the caller leaves the order's dueDate empty for human review —
 * never a silent guess.
 */

export type DeadlineConfidence = 'high' | 'medium' | 'low' | 'none';

export interface ParsedDeadline {
  /** Local calendar date at 00:00 (UTC) or null when nothing usable was found. */
  date: Date | null;
  confidence: DeadlineConfidence;
  /** The original text, always preserved so staff can reconcile. */
  raw: string;
  /** Short machine hint about how it was resolved / why it is uncertain. */
  reason: string;
}

const MONTHS: Record<string, number> = {
  ianuarie: 1,
  ian: 1,
  februarie: 2,
  feb: 2,
  martie: 3,
  mar: 3,
  aprilie: 4,
  apr: 4,
  mai: 5,
  iunie: 6,
  iun: 6,
  iulie: 7,
  iul: 7,
  august: 8,
  aug: 8,
  septembrie: 9,
  sep: 9,
  sept: 9,
  octombrie: 10,
  oct: 10,
  noiembrie: 11,
  noi: 11,
  nov: 11,
  decembrie: 12,
  dec: 12,
};

// Monday = 1 … Sunday = 7 (ISO), keyed by diacritic-stripped Romanian names.
const WEEKDAYS: Record<string, number> = {
  luni: 1,
  marti: 2,
  miercuri: 3,
  joi: 4,
  vineri: 5,
  sambata: 6,
  duminica: 7,
};

const MS_DAY = 86_400_000;

function stripDiacritics(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // Romanian ș/ț sometimes arrive as the cedilla codepoints NFD does not split
      .replace(/[şș]/g, 's')
      .replace(/[ţț]/g, 't')
      .replace(/[ăâ]/g, 'a')
      .replace(/î/g, 'i')
  );
}

function normalize(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** UTC midnight date; validates the calendar (rejects 31 feb, month 13, …). */
function makeDate(day: number, month: number, year: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null; // overflowed (e.g. 31.04 -> 01.05)
  }
  return d;
}

function refMidnight(orderDate: Date): Date {
  return new Date(
    Date.UTC(orderDate.getUTCFullYear(), orderDate.getUTCMonth(), orderDate.getUTCDate()),
  );
}

/**
 * Fill in a missing year for a day/month. A pickup date is always on/after the
 * order — pick the year that lands the date in [order-3d, order+~10 months];
 * roll to next year if this year's occurrence is already in the past.
 */
function inferYear(day: number, month: number, orderDate: Date): number {
  const ref = refMidnight(orderDate);
  const thisYear = makeDate(day, month, ref.getUTCFullYear());
  if (thisYear && thisYear.getTime() >= ref.getTime() - 3 * MS_DAY) {
    return ref.getUTCFullYear();
  }
  return ref.getUTCFullYear() + 1;
}

function normalizeYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/** Plausible for a bakery pickup: within [-3 days, +10 months] of the order. */
function inWindow(date: Date, orderDate: Date): boolean {
  const ref = refMidnight(orderDate).getTime();
  const diff = date.getTime() - ref;
  return diff >= -3 * MS_DAY && diff <= 305 * MS_DAY;
}

interface Hit {
  date: Date;
  hadYear: boolean;
  index: number;
}

/** All numeric d/m[/y] dates, in order of appearance. */
function numericHits(norm: string, orderDate: Date): Hit[] {
  const re = /(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/g;
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    const day = +(m[1] as string);
    const month = +(m[2] as string);
    const hadYear = m[3] != null;
    const year = hadYear ? normalizeYear(+(m[3] as string)) : inferYear(day, month, orderDate);
    const date = makeDate(day, month, year);
    if (date) hits.push({ date, hadYear, index: m.index });
  }
  return hits;
}

/** All "<day> <month-word> [year]" dates, in order of appearance. */
function wordHits(norm: string, orderDate: Date): Hit[] {
  const names = Object.keys(MONTHS).join('|');
  // `\s*` (not `\s+`) so "1iulie" parses; lookbehind stops a year's tail
  // ("2026iulie") from being read as a day.
  const re = new RegExp(`(?<!\\d)(\\d{1,2})\\s*(${names})(?:\\s+(\\d{4}))?`, 'g');
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    const day = +(m[1] as string);
    const month = MONTHS[m[2] as string] as number;
    const hadYear = m[3] != null;
    const year = hadYear ? +(m[3] as string) : inferYear(day, month, orderDate);
    const date = makeDate(day, month, year);
    if (date) hits.push({ date, hadYear, index: m.index });
  }
  return hits;
}

function resolveRelative(norm: string, orderDate: Date): { date: Date; reason: string } | null {
  const ref = refMidnight(orderDate);
  if (/\bpoimaine\b/.test(norm))
    return { date: new Date(ref.getTime() + 2 * MS_DAY), reason: 'relative:poimaine' };
  if (/\bmaine\b/.test(norm))
    return { date: new Date(ref.getTime() + MS_DAY), reason: 'relative:maine' };
  if (/\b(azi|astazi)\b/.test(norm)) return { date: ref, reason: 'relative:azi' };
  // bare weekday -> next occurrence on/after the order date
  for (const [name, iso] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(norm)) {
      const refIso = ((ref.getUTCDay() + 6) % 7) + 1; // JS Sun=0 -> ISO Mon=1..Sun=7
      const delta = (iso - refIso + 7) % 7;
      return { date: new Date(ref.getTime() + delta * MS_DAY), reason: `relative:weekday:${name}` };
    }
  }
  return null;
}

export function parseRomanianDeadline(rawInput: string, orderDate: Date): ParsedDeadline {
  const raw = (rawInput ?? '').toString();
  const norm = normalize(raw);
  if (!norm) return { date: null, confidence: 'none', raw, reason: 'empty' };

  const nums = numericHits(norm, orderDate);
  const words = wordHits(norm, orderDate);
  const hits = [...nums, ...words].sort((a, b) => a.index - b.index);

  if (hits.length > 0) {
    const distinct = new Set(hits.map((h) => h.date.getTime()));
    const first = hits[0] as Hit;
    const ok = inWindow(first.date, orderDate);

    // Several different dates ("20.07 sau 21.07") — take the earliest, flag it.
    if (distinct.size > 1) {
      const earliest = hits.reduce((a, b) => (b.date.getTime() < a.date.getTime() ? b : a));
      return {
        date: earliest.date,
        confidence: 'low',
        raw,
        reason: 'multiple-dates:earliest',
      };
    }

    if (!ok) {
      // A real date, but implausibly far from the order — surface for review.
      return { date: first.date, confidence: 'low', raw, reason: 'out-of-window' };
    }

    // Single plausible date. Explicit year = high; inferred year = still high if
    // the string was clean, medium if it was buried in other text.
    const clean = /^[\s\d./-]+$/.test(norm) || /^[\s\d./-]+\([^)]*\)$/.test(norm);
    if (first.hadYear)
      return { date: first.date, confidence: 'high', raw, reason: 'explicit-date' };
    return {
      date: first.date,
      confidence: clean ? 'high' : 'medium',
      raw,
      reason: clean ? 'inferred-year' : 'inferred-year:noisy',
    };
  }

  // No day/month at all — try relative words (azi/mâine/weekday). Always low:
  // "Duminică ora 11" only pins a weekday, not a specific date.
  const rel = resolveRelative(norm, orderDate);
  if (rel && inWindow(rel.date, orderDate)) {
    return { date: rel.date, confidence: 'low', raw, reason: rel.reason };
  }

  return { date: null, confidence: 'none', raw, reason: 'no-date' };
}
