'use client';

import Link from 'next/link';
import { Play } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { formatUnitQty } from '@/lib/utils';
import { Hint } from '@/components/hint';
import { resolveApiUrl } from '@/lib/api';
import { RECIPE_PHOTOS_ENABLED } from '@/lib/features';
import {
  type CatalogRecipe,
  fmtMoney,
  fmtPct,
  focusRingFilled,
  marginColor,
  marginPct,
  stockLabel,
  stockState,
  TINT_TILE,
  tintStyle,
} from './recipe-ui';
import { CategoryArt } from './category-art';

/**
 * Names past this length may hit the 3-line clamp at the 300px minimum card
 * width (~28 Fraunces characters per line), so they get a Hint with the full name.
 */
const HINT_AFTER = 64;

/**
 * Many catalogue names are typed in ALL CAPS ("TORT EXOTIC CU MANGO…"). We keep
 * the owner's text as typed (lowercasing would mangle "2KG" and proper nouns)
 * but set shouted names a step smaller with a hair of tracking, so caps and
 * mixed-case cards carry the same visual weight.
 */
function isShouted(name: string): boolean {
  const letters = name.replace(/[^\p{L}]/gu, '');
  if (letters.length < 6) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, '').length;
  return upper / letters.length > 0.6;
}

export function RecipeCard({
  recipe: r,
  cost,
  selecting,
  selected,
  onToggle,
}: {
  recipe: CatalogRecipe;
  cost: number | null;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const state = stockState(r.stockCount, r.reservedCount);
  const m = marginPct(cost, r.sellingPrice);
  const tint = tintStyle(r.category);
  const hasPhoto = RECIPE_PHOTOS_ENABLED && !!r.photoUrl;
  const hasMoney = cost != null || r.sellingPrice != null;

  const nameEl = (
    <span
      className={`line-clamp-3 font-serif font-semibold text-foreground ${
        isShouted(r.name)
          ? 'text-[17px] leading-[1.25] tracking-[0.01em]'
          : 'text-[21px] leading-[1.2] tracking-[-0.01em]'
      }`}
    >
      {r.name}
    </span>
  );
  const name = r.name.length > HINT_AFTER ? <Hint label={r.name}>{nameEl}</Hint> : nameEl;

  const inStock = state === 'ok' || state === 'low';
  const out = state === 'out';
  // "1,5 kg" / "160 buc" → big number + small unit.
  const qtyFull = formatUnitQty(Math.max(0, r.stockCount ?? 0), r.unit);
  const cut = qtyFull.lastIndexOf(' ');
  const qtyText = cut > 0 ? qtyFull.slice(0, cut) : qtyFull;
  const qtyUnit = cut > 0 ? qtyFull.slice(cut + 1) : '';

  const body = (
    <span
      className={`${TINT_TILE} relative isolate flex h-[200px] flex-col justify-between overflow-hidden px-4 pb-4 pt-3.5 transition-[filter] duration-300 ${
        out ? 'grayscale-[0.85] group-hover:grayscale-0 group-has-[:focus-visible]:grayscale-0' : ''
      }`}
    >
      {!hasPhoto && (
        // Faded category watermark, cropped by the tile's right edge.
        <CategoryArt
          category={r.category}
          recipeType={r.type}
          className="pointer-events-none absolute -right-4 top-9 -z-10 size-[132px] -rotate-[8deg] text-[var(--tint-ink)] opacity-[0.2] transition-[transform,opacity] duration-500 ease-out group-hover:-rotate-[14deg] group-hover:scale-[1.06] group-hover:opacity-[0.28] group-has-[:focus-visible]:-rotate-[14deg] group-has-[:focus-visible]:scale-[1.06] motion-reduce:transform-none dark:opacity-[0.18]"
        />
      )}
      {hasPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveApiUrl(r.photoUrl)}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
          loading="lazy"
        />
      )}
      {/* Hover/focus wash: deepens the tile toward its own ink. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-[var(--tint-ink)] opacity-0 transition-opacity duration-200 group-hover:opacity-[0.08] group-has-[:focus-visible]:opacity-[0.08] dark:group-hover:opacity-[0.05]"
      />

      {/* Top row: stock number left, category right. */}
      <span className="flex items-start justify-between gap-3">
        {selecting ? (
          <span className="rounded-md bg-card p-0.5">
            <Checkbox checked={selected} aria-label={`Selectează ${r.name}`} />
          </span>
        ) : inStock ? (
          <span className="flex flex-col leading-none" title={stockLabel(state!, r)}>
            <span className="font-serif text-[20px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">
              {qtyText}
            </span>
            <span className="mt-1 text-[11.5px] font-semibold text-foreground/70">
              {qtyUnit ? `${qtyUnit} în stoc` : 'în stoc'}
            </span>
          </span>
        ) : out ? (
          <span className="inline-flex h-6 items-center rounded-full bg-card/80 px-2.5 text-[11.5px] font-semibold text-muted-foreground backdrop-blur-sm">
            Fără stoc
          </span>
        ) : (
          <span />
        )}
        {r.category && (
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-card/85 pl-2 pr-2.5 text-[11.5px] font-semibold text-foreground shadow-(--shadow-card-sm) backdrop-blur-sm">
            <span aria-hidden className="size-1.5 rounded-full bg-[var(--tint-ink)]" />
            {r.category}
          </span>
        )}
      </span>

      {/* Bottom: name; money only when known; "Pornește rețeta" on hover when out of stock. */}
      <span
        className={`flex flex-col gap-2 transition-transform duration-200 ease-out motion-reduce:transform-none ${
          out && !selecting
            ? 'group-hover:-translate-y-12 group-has-[:focus-visible]:-translate-y-12 [@media(hover:none)]:-translate-y-12'
            : ''
        }`}
      >
        {name}
        {hasMoney && (
          <span className="flex gap-3 text-[11px] text-foreground/70 tabular-nums">
            {cost != null && <span>Cost {fmtMoney(cost)}</span>}
            {r.sellingPrice != null && <span>Preț {fmtMoney(r.sellingPrice)}</span>}
            {m != null && <span className={marginColor(m)}>{fmtPct(m)}</span>}
          </span>
        )}
      </span>
    </span>
  );

  // The card itself always opens the recipe; when out of stock, "Pornește
  // rețeta" is its own link layered on top (links can't nest), so only the
  // button starts a task.
  const cls = `group relative flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border bg-card text-left text-foreground shadow-(--shadow-card-sm) transition-[box-shadow,transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-(--shadow-card-md) has-[:focus-visible]:-translate-y-0.5 has-[:focus-visible]:shadow-(--shadow-card-md) has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring motion-reduce:transform-none ${
    selected ? 'border-primary ring-2 ring-primary/30' : 'border-border'
  }`;
  const inner = 'flex flex-col text-left focus-visible:outline-none';

  return (
    <div className={cls} style={tint}>
      {selecting ? (
        <button
          type="button"
          aria-pressed={selected}
          onClick={onToggle}
          className={`${inner} cursor-pointer`}
        >
          {body}
        </button>
      ) : (
        <Link href={`/recipes/${r.id}`} className={inner}>
          {body}
        </Link>
      )}
      {out && !selecting && (
        <Link
          href={`/tasks/new?recipeId=${r.id}`}
          aria-label={`Pornește rețeta ${r.name}`}
          className={`absolute inset-x-4 bottom-4 flex translate-y-2 items-center justify-center gap-1.5 rounded-[var(--radius-ctl)] bg-primary py-2.5 text-[13px] font-semibold text-primary-foreground pointer-events-none opacity-0 shadow-(--shadow-card-md) transition-[opacity,transform] duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:translate-y-0 group-has-[:focus-visible]:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100 motion-reduce:transform-none ${focusRingFilled}`}
        >
          <Play aria-hidden className="size-4" />
          Pornește rețeta
        </Link>
      )}
    </div>
  );
}
