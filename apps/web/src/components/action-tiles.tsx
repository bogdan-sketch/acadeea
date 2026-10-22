'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import { Loader2 } from 'lucide-react';
import { useTutorial } from '@/contexts/tutorial-context';
import { Hint } from '@/components/hint';
import { cn } from '@/lib/utils';

/**
 * Page-level action groups (form-header save/cancel, detail quick actions,
 * hub shortcuts).
 *
 * Default variant `icon` renders the header-action shell of the redesign:
 * 42px, `--radius-ctl`, icon + ONE visible word, with the full explanation in
 * a near-instant `Hint` (owner's rule: never icon-only in headers; icon-only
 * stays inside table rows). `variant: 'tile'` keeps the icon-above-label tile
 * for navigation hubs where the label carries meaning.
 *
 * Tones: default = accent fill; muted = outlined; destructive = red tint.
 * Everything derives from tokens — no hardcoded colors (white-label).
 */
export interface ActionTile {
  key: string;
  /** Full action name — accessible name and Hint fallback. */
  label: string;
  /**
   * The one visible word next to the icon (icon variant). Defaults to the
   * first word of `label` ("Salvează modificările" → "Salvează").
   */
  word?: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  href?: string;
  tone?: 'default' | 'destructive' | 'muted';
  disabled?: boolean;
  /**
   * Button type; 'submit' (with `form`) lets a tile submit a <form> it sits
   * outside of, keeping native validation (unlike form.submit()).
   */
  type?: 'button' | 'submit';
  /** id of the <form> this tile submits (used with type: 'submit'). */
  form?: string;
  /** Spin the icon (in-flight state, e.g. while saving/exporting). */
  spinning?: boolean;
  /** One-line hover explanation; defaults to the label. */
  title?: string;
  /** Tutorial-mode anchor id (see components/tutorial-anchor.tsx) — this tile
   * IS the real element for a TutorialStep.id, so config-driven action
   * arrays can still be live coachmark targets without wrapping JSX. */
  tutorialId?: string;
}

// Per tone: resting tint, hover tint, and the hover-cancel used when disabled
// (a disabled tile must keep ITS tone's resting tint under the cursor).
const TONE = {
  default: {
    base: 'bg-primary text-primary-foreground',
    hover: 'hover:bg-primary-pressed',
    disabledHover: 'hover:bg-primary',
  },
  destructive: {
    base: 'border border-[var(--st-red)]/30 bg-[var(--st-red-bg)] text-[var(--st-red)]',
    hover: 'hover:brightness-105',
    disabledHover: '',
  },
  muted: {
    base: 'border border-border bg-card text-foreground',
    hover: 'hover:bg-muted',
    disabledHover: 'hover:bg-card',
  },
} as const;

/** First word of the label, used when no explicit `word` is given. */
function firstWord(label: string): string {
  return label.trim().split(/\s+/)[0] ?? label;
}

export function ActionTiles({
  actions,
  columns,
  variant = 'icon',
}: {
  actions: ActionTile[];
  /** Grid columns for the 'tile' variant; defaults to 2. */
  columns?: 1 | 2 | 3 | 4;
  /** 'icon' (default): 42px icon + word buttons with Hint. 'tile': icon + label tiles. */
  variant?: 'icon' | 'tile';
}) {
  const visible = actions.filter(Boolean);
  // Hooks must run unconditionally — call before the early return below.
  const { setPeekedId } = useTutorial();
  if (visible.length === 0) return null;
  const cols =
    columns === 4
      ? 'grid-cols-4'
      : columns === 3
        ? 'grid-cols-3'
        : columns === 1
          ? 'grid-cols-1'
          : 'grid-cols-2';

  const worded = variant === 'icon';
  return (
    // 'icon': one wrapping row of 42px buttons. 'tile': grid on desktop, one
    // horizontal row on mobile (the iOS-style header swiper).
    <div
      className={
        worded
          ? 'flex flex-wrap items-center gap-2.5'
          : `grid ${cols} gap-2 max-sm:flex max-sm:flex-nowrap`
      }
    >
      {visible.map((a) => {
        // Disabled: dim but keep hover events — the Hint explains WHY it's
        // disabled, and pointer-events-none would swallow that tooltip.
        const tone = TONE[a.tone ?? 'default'];
        const cls = worded
          ? cn(
              'inline-flex h-[42px] flex-none cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-ctl)] pl-3 pr-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
              tone.base,
              a.disabled ? `cursor-not-allowed opacity-50 ${tone.disabledHover}` : tone.hover,
            )
          : cn(
              'flex cursor-pointer flex-col items-start gap-1.5 rounded-[var(--radius-ctl)] px-3.5 py-3 text-left text-[13px] font-semibold transition-colors max-sm:min-w-[max-content] max-sm:flex-row max-sm:items-center max-sm:gap-2 max-sm:py-2.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
              tone.base,
              a.disabled ? `cursor-not-allowed opacity-50 ${tone.disabledHover}` : tone.hover,
            );
        const Icon = a.spinning ? Loader2 : a.icon;
        const content = (
          <>
            <Icon className={cn('h-[18px] w-[18px]', a.spinning && 'animate-spin')} />
            {worded ? <span>{a.word ?? firstWord(a.label)}</span> : a.label}
          </>
        );
        const tutorialHover = a.tutorialId
          ? {
              onMouseEnter: () => setPeekedId(a.tutorialId!),
              onMouseLeave: () => setPeekedId((cur) => (cur === a.tutorialId ? null : cur)),
            }
          : {};
        const el =
          a.href && !a.disabled ? (
            <Link
              key={a.key}
              href={a.href}
              className={cls}
              aria-label={a.label}
              title={worded ? undefined : (a.title ?? a.label)}
              data-tutorial-id={a.tutorialId}
              {...tutorialHover}
            >
              {content}
            </Link>
          ) : (
            <button
              key={a.key}
              type={a.type ?? 'button'}
              form={a.form}
              onClick={a.onClick}
              disabled={a.disabled}
              className={cls}
              aria-label={a.label}
              title={worded ? undefined : (a.title ?? a.label)}
              data-tutorial-id={a.tutorialId}
              {...tutorialHover}
            >
              {content}
            </button>
          );
        return worded ? (
          <Hint key={a.key} label={a.label} detail={a.title}>
            {el}
          </Hint>
        ) : (
          el
        );
      })}
    </div>
  );
}
