/**
 * Human-readable lot numbering for finished-goods lots (ClickUp "Stoc diferentiat nume").
 * Format: ddMMyyyy-<Nume produs> N, where N counts batches of the same product made on
 * the same ROMANIA calendar day (not the server process's local/UTC day — API containers
 * run with no TZ set, so `new Date().setHours(0,0,0,0)` silently uses UTC).
 */

const LOT_TIMEZONE = 'Europe/Bucharest';

function bucharestOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LOT_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

/** ddMMyyyy for `date`, read in the Romania calendar day (DST-safe via Intl). */
export function bucharestDmy(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LOT_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}${get('month')}${get('year')}`;
}

/** UTC instant of local midnight (Romania) for the calendar day `date` falls on. */
export function bucharestDayStartUtc(date: Date): Date {
  const offsetMin = bucharestOffsetMinutes(date);
  const localMs = date.getTime() + offsetMin * 60000;
  const localMidnightMs = Math.floor(localMs / 86_400_000) * 86_400_000;
  return new Date(localMidnightMs - offsetMin * 60000);
}

export function buildLotNumber(recipeName: string, producedAt: Date, sameDayCount: number): string {
  return `${bucharestDmy(producedAt)}-${recipeName} ${sameDayCount + 1}`;
}

/** yyyy-MM-dd of the Romania calendar day `date` falls on (DST-safe via Intl). */
export function bucharestIsoDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LOT_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
