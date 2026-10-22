import type { CSSProperties } from 'react';

import type { Recipe } from '@/lib/types';
import { formatUnitQty, formatMoney } from '@/lib/utils';

/** Fields the recipe endpoints return but `lib/types.ts` does not model yet. */
export type RecipeExtras = {
  photoUrl?: string | null;
  stockCount?: number;
  reservedCount?: number;
  sellingPrice?: number | null;
};
export type CatalogRecipe = Recipe & RecipeExtras;

/** Lowercase, no diacritics: "Monoporții" → "monoportii". */
export function categoryKey(category?: string | null): string {
  return (category ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

/**
 * Category → tint slot 1–8 (`--cat-N` in globals.css, repainted per scheme).
 * Slots: 1 rose, 2 apricot, 3 sky, 4 caramel, 5 lilac, 6 pistachio, 7 coral, 8 teal.
 * Known catalogue categories are pinned so neighbours differ; anything else
 * hashes to a stable slot.
 */
const SLOTS: [RegExp, number][] = [
  [/tort/, 1],
  [/^monopor/, 2],
  [/^macaron/, 3],
  [/^(cookie|biscui|fursec)/, 4],
  [/^felii/, 5],
  [/^(tart|insert)/, 6],
  [/^(praji|pralin)/, 7],
  [/^(semi|crem|mouss|ganache)/, 8],
  [/^blat/, 4],
  [/^(crocant|caramel)/, 2],
  [/^(glazur|candy|bar$)/, 5],
];

export function categorySlot(category?: string | null): number {
  const key = categoryKey(category);
  if (!key) return 0;
  for (const [re, slot] of SLOTS) if (re.test(key)) return slot;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 8) + 1;
}

/**
 * Tinted surface (hero tile, category pill, detail square). Pair the
 * `tint-surface` (flat) or `tint-tile` (with corner glow) class from
 * globals.css with this style. Every scheme defines its own `--cat-N`, so
 * `text-foreground` on it holds ≥8.6:1 in all six.
 */
export const TINT_SURFACE = 'tint-surface';
export const TINT_TILE = 'tint-tile';
export function tintStyle(category?: string | null): CSSProperties {
  const slot = categorySlot(category);
  return {
    '--tint': slot ? `var(--cat-${slot})` : 'var(--muted)',
    '--tint-ink': slot ? `var(--cat-${slot}-ink)` : 'var(--muted-foreground)',
  } as CSSProperties;
}

export const fmtMoney = (n: number | null | undefined): string => formatMoney(n);

export const marginPct = (cost?: number | null, price?: number | null): number | null =>
  cost != null && price != null && price > 0 ? ((price - cost) / price) * 100 : null;

/** "12 buc / șarjă · 1,2 kg" — only the fields that are known. */
export function yieldText(r: Recipe, perBatch = true): string {
  const parts: string[] = [];
  if (r.yieldQuantity != null) {
    parts.push(`${formatUnitQty(r.yieldQuantity, r.unit)}${perBatch ? ' / șarjă' : ''}`);
  }
  if (r.finishedWeightGrams) parts.push(formatUnitQty(r.finishedWeightGrams, 'GRAME'));
  return parts.join(' · ');
}

export type StockState = 'ok' | 'low' | 'out';

/** out = nothing on hand; low = everything on hand is already reserved. */
export function stockState(count?: number, reserved?: number): StockState | null {
  if (count == null) return null;
  if (count <= 0) return 'out';
  if (reserved != null && count - reserved <= 0) return 'low';
  return 'ok';
}

/** Status text colour for the frosted stock pill (the dot uses `currentColor`). */
export const STOCK_DOT: Record<StockState, string> = {
  ok: 'text-[var(--st-green)]',
  low: 'text-[var(--st-orange)]',
  out: 'text-[var(--st-red)]',
};

export function stockLabel(state: StockState, r: Recipe & RecipeExtras): string {
  if (state === 'out') return 'fără stoc';
  if (state === 'low') return 'puțin';
  return `${formatUnitQty(r.stockCount ?? 0, r.unit)} în stoc`;
}

/** Margin colour scale from the design: ≥ 60 % green, otherwise amber. */
export const marginColor = (m: number | null): string =>
  m == null
    ? 'text-muted-foreground'
    : m >= 60
      ? 'text-[var(--st-green)]'
      : 'text-[var(--st-orange)]';

export const fmtPct = (m: number | null): string => (m == null ? '—' : `${Math.round(m)} %`);

/** One focus system (M-12): 3px solid accent ring, browser outline off. */
export const focusRing = 'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';
/** Filled accent controls: offset the ring so it shows around a same-coloured box. */
export const focusRingFilled = `${focusRing} focus-visible:ring-offset-2 focus-visible:ring-offset-background`;

/** 42x42 icon button shell (header actions). */
export const iconBtn = `inline-flex h-[var(--ctl-h)] w-[var(--ctl-h)] cursor-pointer items-center justify-center rounded-[var(--radius-ctl)] border border-border bg-card text-foreground transition-colors hover:bg-muted ${focusRing}`;
export const iconBtnPrimary = `inline-flex h-[var(--ctl-h)] w-[var(--ctl-h)] cursor-pointer items-center justify-center rounded-[var(--radius-ctl)] bg-primary text-primary-foreground transition-colors hover:bg-primary-pressed ${focusRingFilled}`;

/** Icon + one word (header actions). */
export const wordBtn = `inline-flex h-[var(--ctl-h)] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-ctl)] border border-border bg-card pl-3 pr-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted ${focusRing}`;
export const wordBtnPrimary = `inline-flex h-[var(--ctl-h)] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-ctl)] bg-primary pl-3 pr-3.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-pressed ${focusRingFilled}`;

export const pillClass =
  'inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-bold';
