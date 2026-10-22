/**
 * Date-only timestamps reach the web as midnight — UTC midnight for orders
 * imported from the site (shown as "03:00" in Romania) and local midnight for
 * manual entries ("00:00"). Neither is a real time of day, so callers show
 * only the date in those cases (QA M1).
 */
export function hasTimeOfDay(input: string | Date | null | undefined): boolean {
  if (!input) return false;
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return false;
  const utcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  const localMidnight = d.getHours() === 0 && d.getMinutes() === 0;
  return !utcMidnight && !localMidnight;
}
