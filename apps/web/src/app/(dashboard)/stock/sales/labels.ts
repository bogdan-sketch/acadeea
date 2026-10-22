import type { SalesDeduction, SalesDeductionSource } from '@/lib/types';

export const sourceLabels: Record<SalesDeductionSource, string> = {
  EXCEL: 'Raport Excel',
  MANUAL: 'Manual',
  WOOCOMMERCE: 'Site (WooCommerce)',
};

export const salesStatusBadge: Record<SalesDeduction['status'], { label: string; color: string }> =
  {
    DRAFT: { label: 'Neconfirmată', color: 'st-orange' },
    CONFIRMED: { label: 'Confirmată', color: 'st-green' },
    ANULAT: { label: 'Anulată', color: 'st-gray' },
  };

/** Cât de sigură e potrivirea numelui din raport cu produsul din aplicație. */
export function matchBadge(
  kind: string | null,
  score: number | null,
): { label: string; color: string } {
  switch (kind) {
    case 'ALIAS':
      return { label: 'Învățat', color: 'st-green' };
    case 'MAPPING':
      return { label: 'Mapat site', color: 'st-green' };
    case 'MANUAL':
      return { label: 'Manual', color: 'st-blue' };
    case 'NONE':
    case null:
      return { label: 'Negăsit', color: 'st-red' };
    default:
      return (score ?? 0) >= 0.85
        ? { label: 'Sigur', color: 'st-green' }
        : { label: 'De verificat', color: 'st-orange' };
  }
}

/** History source chips: Site / eBriza / Manual (client filter over the loaded page). */
export const sourceChips: { key: SalesDeductionSource; label: string }[] = [
  { key: 'WOOCOMMERCE', label: 'Site' },
  { key: 'EXCEL', label: 'eBriza' },
  { key: 'MANUAL', label: 'Manual' },
];

/** Source column title in the history grid. */
export const sourceRowLabels: Record<SalesDeductionSource, string> = {
  EXCEL: 'Excel eBriza',
  MANUAL: 'Manual',
  WOOCOMMERCE: 'Comenzi site',
};
