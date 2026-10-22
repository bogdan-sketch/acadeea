/**
 * VAT normalization for purchase prices.
 *
 * Stored purchase prices are always the organization's REAL cost basis:
 *  - VAT payer (plătitor de TVA): net (fără TVA) — the VAT is recovered.
 *  - Non-payer: gross (cu TVA) — the VAT is part of the cost.
 *
 * Price inputs carry an optional `priceIncludesVat` flag; this converts the
 * entered value to the org's basis. An undefined flag means "already in the
 * org's basis" (older clients) — no conversion.
 */
export function normalizePurchasePrice(
  entered: number,
  priceIncludesVat: boolean | undefined,
  org: { vatPayer: boolean; vatRatePercent: unknown },
): number {
  if (priceIncludesVat === undefined) return entered;
  const rate = Number(org.vatRatePercent) / 100;
  if (!Number.isFinite(rate) || rate <= 0) return entered;

  if (org.vatPayer) {
    // Canonical = net. Entered gross → strip VAT.
    return priceIncludesVat ? round4(entered / (1 + rate)) : entered;
  }
  // Canonical = gross. Entered net → add VAT.
  return priceIncludesVat ? entered : round4(entered * (1 + rate));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
