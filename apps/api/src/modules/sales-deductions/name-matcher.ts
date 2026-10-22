/**
 * Product-name matching for sales reports (eBriza export / WooCommerce lines /
 * free text) against the org's finished products (recipes).
 *
 * Pure functions — no Prisma — so they are unit-testable in isolation.
 *
 * Order of confidence:
 *   ALIAS    — a name the user already confirmed once (SalesProductAlias)
 *   EXACT    — equal after normalization (case, diacritics, punctuation)
 *   CONTAINS — one name's significant words are all contained in the other
 *              ("sos usturoi" ⊂ "sos de usturoi", "Tort Ciocolată 1kg" ⊃ "tort ciocolata")
 *   FUZZY    — Dice similarity over character bigrams (typos, abbreviations)
 */

/** Romanian filler words that never distinguish two products. */
const STOPWORDS = new Set(['de', 'cu', 'si', 'la', 'din', 'pe', 'a', 'al', 'ale', 'in', 'fara']);

/** Pack/size tokens ("1kg", "500 g", "buc", "x2") — dropped for the containment test only. */
const SIZE_TOKEN = /^(\d+([.,]\d+)?(kg|g|gr|ml|l|buc|pcs|x)?|x\d+|kg|g|gr|ml|l|buc|pcs)$/;

export type MatchKind = 'ALIAS' | 'EXACT' | 'CONTAINS' | 'FUZZY' | 'NONE';

export interface MatchCandidate {
  id: string;
  name: string;
}

export interface MatchResult {
  id: string;
  name: string;
  score: number;
  kind: MatchKind;
}

/** Lowercase, strip diacritics + punctuation, collapse whitespace. */
export function normalizeProductName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.,]+/g, ' ')
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Significant words: normalized, minus stopwords. */
export function significantTokens(raw: string, dropSizes = false): string[] {
  return normalizeProductName(raw)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t) && !(dropSizes && SIZE_TOKEN.test(t)));
}

function bigrams(s: string): string[] {
  const compact = s.replace(/\s+/g, ' ');
  const out: string[] = [];
  for (let i = 0; i < compact.length - 1; i++) out.push(compact.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice coefficient over character bigrams, 0..1. */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let overlap = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      overlap++;
      counts.set(g, c - 1);
    }
  }
  return (2 * overlap) / (A.length + B.length);
}

/** Every token of `small` appears in `big` (as a whole word). */
function tokensContained(small: string[], big: string[]): boolean {
  if (small.length === 0) return false;
  const set = new Set(big);
  return small.every((t) => set.has(t));
}

/** Score one report name against one product name. */
export function scorePair(
  reportName: string,
  productName: string,
): { score: number; kind: MatchKind } {
  const a = normalizeProductName(reportName);
  const b = normalizeProductName(productName);
  if (!a || !b) return { score: 0, kind: 'NONE' };
  if (a === b) return { score: 1, kind: 'EXACT' };

  const ta = significantTokens(reportName, true);
  const tb = significantTokens(productName, true);
  if (ta.length && tb.length && ta.join(' ') === tb.join(' '))
    return { score: 0.97, kind: 'EXACT' };
  if (ta.length && tb.length && [...ta].sort().join(' ') === [...tb].sort().join(' ')) {
    return { score: 0.95, kind: 'EXACT' };
  }

  // Containment both ways. A single shared word ("tort") is weak evidence, so
  // the score scales with how much of the longer name the shorter one covers.
  if (tokensContained(ta, tb) || tokensContained(tb, ta)) {
    const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    const coverage = small.length / big.length;
    return { score: 0.7 + 0.2 * coverage, kind: 'CONTAINS' };
  }
  // Raw substring on the normalized strings ("sosusturoi" typo-free cases).
  const ja = ta.join(' ');
  const jb = tb.join(' ');
  if (ja.length >= 4 && jb.length >= 4 && (ja.includes(jb) || jb.includes(ja))) {
    const coverage = Math.min(ja.length, jb.length) / Math.max(ja.length, jb.length);
    return { score: 0.65 + 0.2 * coverage, kind: 'CONTAINS' };
  }

  const dice = diceSimilarity(ja || a, jb || b);
  return { score: Math.round(dice * 0.85 * 1000) / 1000, kind: dice > 0 ? 'FUZZY' : 'NONE' };
}

/** Auto-accept threshold — at/above it the line comes pre-accepted. */
export const CONFIDENT_SCORE = 0.85;
/** Below this a candidate isn't even suggested. */
export const SUGGEST_SCORE = 0.45;

/**
 * Rank products for one report name. `aliases` maps normalized report names
 * to a product id the user confirmed earlier — those win outright.
 */
export function rankCandidates(
  reportName: string,
  products: MatchCandidate[],
  aliases: Map<string, string> = new Map(),
  limit = 3,
): MatchResult[] {
  const results: MatchResult[] = [];
  const aliasId = aliases.get(normalizeProductName(reportName));
  const aliasProduct = aliasId ? products.find((p) => p.id === aliasId) : undefined;
  if (aliasProduct) results.push({ ...aliasProduct, score: 1, kind: 'ALIAS' });

  const scored = products
    .filter((p) => p.id !== aliasProduct?.id)
    .map((p) => ({ ...p, ...scorePair(reportName, p.name) }))
    .filter((r) => r.score >= SUGGEST_SCORE)
    .sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));

  results.push(...scored);
  return results.slice(0, limit);
}
