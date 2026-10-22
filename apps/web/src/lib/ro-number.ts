/**
 * Numbers typed by a Romanian user — same rules as Android `RoFormat.parseDecimal`
 * and iOS `RoFormat.parseDecimal`.
 *
 * "1,5", "1.5", " 2 ", "-0,25", "1.250,5", "1 000,5". A lone '.' or ',' is the
 * decimal separator; when both appear the LAST one is the decimal separator and
 * the other is grouping. Spaces (also non-breaking) are grouping. Returns null
 * for blank / invalid text — including exponents, hex and words that
 * `Number`/`parseFloat` accept ("1e5", "0x10", "Infinity") and trailing junk
 * that `parseFloat` silently drops ("2f" → 2).
 */
export function parseDecimal(text: string | null | undefined): number | null {
  if (text == null) return null;
  const s = text.replace(/[\s  ]/g, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    if (s.indexOf(',') !== lastComma) return null;
    normalized = s.replace(',', '.');
  } else {
    if (s.indexOf('.') !== lastDot) return null;
    normalized = s;
  }
  if (!PLAIN_DECIMAL.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const PLAIN_DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/**
 * Stored number → text for an editable field: Romanian comma, up to
 * `maxDecimals` decimals, no grouping, never scientific notation
 * (`String(0.0001)` is fine but `String(1e-7)` is "1e-7"; `String(1.5)` is "1.5").
 * Empty for a missing value.
 */
export function decimalInputText(value: number | null | undefined, maxDecimals = 6): string {
  if (value == null || !Number.isFinite(value)) return '';
  const s = value.toLocaleString('ro-RO', {
    maximumFractionDigits: maxDecimals,
    useGrouping: false,
  });
  return s === '-0' ? '0' : s;
}
