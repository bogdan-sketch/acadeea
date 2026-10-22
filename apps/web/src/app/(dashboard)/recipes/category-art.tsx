'use client';

import { useId, type ReactNode } from 'react';

import { categoryKey } from './recipe-ui';

/**
 * Faded category watermark for recipe tiles. Each glyph is a 120×120 drawing
 * built as a mask: white = ink, black = cut-outs (layer lines, chips, rims),
 * then painted with `currentColor` so the tile's `--tint-ink` and the CSS
 * opacity decide how loud it is. Cut-outs show the tile itself through, so
 * they stay correct over the corner glow and in every scheme.
 */
type Art =
  | 'cake'
  | 'mono'
  | 'macaron'
  | 'cookie'
  | 'tart'
  | 'slice'
  | 'croissant'
  | 'bowl'
  | 'cupcake';

const CUT = { stroke: 'black', strokeWidth: 3, strokeLinecap: 'round', fill: 'none' } as const;

const GLYPHS: Record<Art, ReactNode> = {
  // Wedge of layered cake with a berry on top.
  cake: (
    <>
      <path fill="white" d="M16 72 L78 38 L108 50 L108 92 L16 102 Z" />
      <path {...CUT} d="M16 72 L108 50" />
      <path {...CUT} strokeWidth={4} d="M16 82 L108 64 M16 92 L108 78" />
      <circle cx="80" cy="40" r="13" fill="black" />
      <circle cx="80" cy="40" r="10" fill="white" />
      <path fill="white" d="M81 30 C80 20 72 16 66 18 C70 22 74 27 81 30 Z" />
    </>
  ),
  // Round entremet with mirror glaze drips and a raspberry.
  mono: (
    <>
      <ellipse cx="60" cy="100" rx="50" ry="9" fill="white" />
      <ellipse cx="60" cy="94" rx="44" ry="9" {...CUT} strokeWidth={4} />
      <path fill="white" d="M22 46 L22 90 C22 99 98 99 98 90 L98 46 Z" />
      <ellipse cx="60" cy="46" rx="38" ry="12" fill="white" />
      <path
        {...CUT}
        d="M22 60 C28 60 28 72 33 72 C38 72 38 60 46 60 C54 60 54 68 60 68 C66 68 66 60 74 60 C82 60 82 76 88 76 C94 76 96 64 98 60"
      />
      <ellipse cx="60" cy="46" rx="28" ry="7" {...CUT} strokeWidth={2.5} />
      <circle cx="60" cy="38" r="11" fill="black" />
      <circle cx="60" cy="38" r="8" fill="white" />
    </>
  ),
  // Macaron, slightly tilted: shells, ruffled feet, filling.
  macaron: (
    <g transform="rotate(-14 60 60)">
      <path fill="white" d="M16 50 C16 22 104 22 104 50 Z" />
      <path {...CUT} d="M34 40 C42 33 54 31 64 31" />
      {[20, 27, 34, 41, 48, 55, 62, 69, 76, 83, 90, 97].map((x) => (
        <circle key={`t${x}`} cx={x + 1.5} cy="52.5" r="3.6" fill="white" />
      ))}
      <rect x="20" y="58" width="80" height="13" rx="6.5" fill="white" />
      {[20, 27, 34, 41, 48, 55, 62, 69, 76, 83, 90, 97].map((x) => (
        <circle key={`b${x}`} cx={x + 1.5} cy="76.5" r="3.6" fill="white" />
      ))}
      <path fill="white" d="M16 79 L104 79 C104 98 16 98 16 79 Z" />
    </g>
  ),
  // Chocolate-chip cookie with a bite out of it.
  cookie: (
    <>
      <circle cx="58" cy="62" r="46" fill="white" />
      <circle cx="102" cy="28" r="16" fill="black" />
      <circle cx="90" cy="16" r="11" fill="black" />
      <circle cx="108" cy="46" r="11" fill="black" />
      <g fill="black" stroke="black" strokeWidth="2" strokeLinejoin="round">
        <path d="M34 42 l9 -3 l3 8 l-8 4 z" />
        <path d="M60 50 l8 1 l-1 8 l-8 -1 z" />
        <path d="M30 70 l8 -2 l2 7 l-8 2 z" />
        <path d="M52 82 l9 1 l-2 8 l-8 -2 z" />
        <path d="M76 70 l7 -3 l3 7 l-7 3 z" />
        <path d="M50 26 l6 2 l-2 6 l-6 -2 z" />
        <path d="M82 92 l6 -1 l1 6 l-6 1 z" />
      </g>
    </>
  ),
  // Fluted tart shell with berries.
  tart: (
    <>
      <path fill="white" d="M12 54 L20 82 C26 94 94 94 100 82 L108 54 Z" />
      <ellipse cx="60" cy="54" rx="48" ry="15" fill="white" />
      <ellipse cx="60" cy="54" rx="39" ry="10" {...CUT} />
      <path
        {...CUT}
        strokeWidth={2.5}
        d="M22 66 L26 84 M33 70 L36 88 M45 72 L47 90 M60 73 L60 91 M75 72 L73 90 M87 70 L84 88 M98 66 L94 84"
      />
      {[
        [44, 50],
        [58, 46],
        [72, 50],
        [52, 58],
        [67, 58],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy - 6} r="8.5" fill="black" />
          <circle cx={cx} cy={cy - 6} r="6" fill="white" />
        </g>
      ))}
    </>
  ),
  // Square entremet slice on a plate.
  slice: (
    <>
      <ellipse cx="60" cy="94" rx="52" ry="13" fill="white" />
      <ellipse cx="60" cy="92" rx="40" ry="8" {...CUT} strokeWidth={2.5} />
      <path fill="white" d="M28 48 L44 36 L94 36 L94 76 L78 90 L28 90 Z" />
      <path {...CUT} d="M28 48 L78 48 L94 36 M78 48 L78 90" />
      <path {...CUT} d="M28 62 L78 62 L94 50 M28 76 L78 76 L94 64" strokeWidth={2.5} />
      <circle cx="58" cy="34" r="10" fill="black" />
      <circle cx="58" cy="34" r="7" fill="white" />
      <path fill="white" d="M64 30 C70 20 80 22 82 24 C76 28 72 30 64 30 Z" />
    </>
  ),
  // Croissant: one crescent, laminated into five segments.
  croissant: (
    <>
      <path
        fill="white"
        d="M10 86 C10 52 34 24 60 24 C86 24 110 52 110 86 C102 74 92 70 84 72 C78 76 70 78 60 78 C50 78 42 76 36 72 C28 70 18 74 10 86 Z"
      />
      <path
        {...CUT}
        strokeWidth={3.5}
        d="M26 42 C33 52 36 62 36 72 M44 29 C49 44 50 60 48 77 M76 29 C71 44 70 60 72 77 M94 42 C87 52 84 62 84 72"
      />
    </>
  ),
  // Mixing bowl with a balloon whisk dipped in it.
  bowl: (
    <>
      <g transform="rotate(32 76 46)">
        <rect x="72" y="-8" width="8" height="34" rx="4" fill="white" />
        <g stroke="white" strokeWidth="3.5" fill="none">
          <ellipse cx="76" cy="50" rx="15" ry="26" />
          <ellipse cx="76" cy="50" rx="8" ry="26" />
          <path d="M76 24 L76 76" />
        </g>
      </g>
      <path fill="black" d="M8 54 L112 54 L112 64 L8 64 Z" />
      <path fill="white" d="M12 58 L108 58 C108 86 88 102 60 102 C32 102 12 86 12 58 Z" />
      <path {...CUT} d="M14 66 L106 66" />
      <path {...CUT} strokeWidth={2.5} d="M30 80 C40 90 54 94 66 94" />
      <rect x="44" y="104" width="32" height="7" rx="3.5" fill="white" />
    </>
  ),
  // Cupcake: pleated case, piped swirl, cherry.
  cupcake: (
    <>
      <path fill="white" d="M30 70 L90 70 L82 108 L38 108 Z" />
      <path {...CUT} strokeWidth={2.5} d="M44 74 L48 104 M60 74 L60 104 M76 74 L72 104" />
      <path
        fill="white"
        d="M24 66 C18 52 32 44 40 46 C38 32 52 26 60 30 C62 18 80 18 82 32 C92 32 100 46 94 54 C102 58 98 68 92 68 Z"
      />
      <path {...CUT} d="M30 60 C44 66 72 66 90 58 M44 46 C54 52 70 52 82 44" />
      <circle cx="74" cy="20" r="11" fill="black" />
      <circle cx="74" cy="20" r="8" fill="white" />
      <path
        d="M76 12 C78 6 84 4 88 4"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
};

const ART_BY_CATEGORY: [RegExp, Art][] = [
  [/tort/, 'cake'],
  [/^monopor/, 'mono'],
  [/^macaron/, 'macaron'],
  [/^(cookie|biscui|fursec)/, 'cookie'],
  [/^tart/, 'tart'],
  [/^felii/, 'slice'],
  [/^(praji|patiser|croissant|viennois)/, 'croissant'],
  [/^(semi|crem|blat|glazur|insert|mouss|ganache|pralin)/, 'bowl'],
];

export function categoryArt(category?: string | null, recipeType?: string | null): Art {
  const key = categoryKey(category);
  for (const [re, art] of ART_BY_CATEGORY) if (key && re.test(key)) return art;
  return recipeType === 'SEMIPREPARAT' ? 'bowl' : 'cupcake';
}

export function CategoryArt({
  category,
  recipeType,
  className,
}: {
  category?: string | null;
  recipeType?: string | null;
  className?: string;
}) {
  const id = `cat-art-${useId().replace(/[^\w-]/g, '')}`;
  const art = categoryArt(category, recipeType);
  return (
    <svg viewBox="0 0 120 120" aria-hidden focusable="false" className={className}>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
        {GLYPHS[art]}
      </mask>
      <rect width="120" height="120" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}
