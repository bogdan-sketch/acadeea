/** Date helpers for the stock pages — day before month, 24h clock, Romanian names. */

const MONTHS_SHORT = [
  'ian',
  'feb',
  'mar',
  'apr',
  'mai',
  'iun',
  'iul',
  'aug',
  'sept',
  'oct',
  'nov',
  'dec',
];
const MONTHS_LONG = [
  'ianuarie',
  'februarie',
  'martie',
  'aprilie',
  'mai',
  'iunie',
  'iulie',
  'august',
  'septembrie',
  'octombrie',
  'noiembrie',
  'decembrie',
];
const WEEKDAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local yyyy-mm-dd (never UTC, so late-evening dates don't slip a day). */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** "16 oct" */
export function fmtDayMonth(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "oct 2027" */
export function fmtMonthYear(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "16:40" */
export function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "16 oct 16:40" */
export function fmtDayMonthTime(d: Date): string {
  return `${fmtDayMonth(d)} ${fmtTime(d)}`;
}

/** "JOI, 16 OCTOMBRIE" */
export function fmtDayHeader(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`.toUpperCase();
}

/** "azi 08:12" / "ieri 19:00" / "14 oct 18:30" */
export function fmtRelative(d: Date, now = new Date()): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `azi ${fmtTime(d)}`;
  if (diff === 1) return `ieri ${fmtTime(d)}`;
  return fmtDayMonthTime(d);
}
