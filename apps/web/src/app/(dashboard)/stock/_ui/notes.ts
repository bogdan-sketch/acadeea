/**
 * Movement notes written by the API before 17.10.2026 are English; newer ones
 * are Romanian. Map the legacy forms so the journal reads in one language.
 */
const LEGACY: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Reservation for task "(.+)"$/, (m) => `Rezervare pentru taskul „${m[1]}”`],
  [/^Production output for task "(.+)"$/, (m) => `Producție din taskul „${m[1]}”`],
  [/^Production consumption for task$/, () => 'Consum în producție'],
  [/^Byproduct din producția "(.+)"$/, (m) => `Rest din producția „${m[1]}”`],
];

export function localizeNote(note: string): string {
  for (const [re, fn] of LEGACY) {
    const m = note.match(re);
    if (m) return fn(m);
  }
  return note;
}
