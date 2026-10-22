'use client';

/**
 * KPI card (redesign 10.2026): muted label + a tone dot top-right, big
 * Fraunces number, one hint line. With `onClick` it doubles as a FILTER —
 * `active` draws the accent ring and clicking again is expected to clear the
 * filter (toggle handled by caller). `icon` is accepted for compatibility
 * with older call sites and no longer rendered.
 */

export const STAT_TONES = {
  accent: 'bg-primary',
  blue: 'bg-[var(--st-blue)]',
  orange: 'bg-[var(--st-orange)]',
  green: 'bg-[var(--st-green)]',
  purple: 'bg-[var(--st-purple)]',
  red: 'bg-[var(--st-red)]',
} as const;

export type StatTone = keyof typeof STAT_TONES;

export function StatCard({
  tone = 'accent',
  label,
  value,
  valueClass,
  sub,
  subClass,
  onClick,
  active = false,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  sub?: string;
  subClass?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold text-muted-foreground">{label}</div>
        <span aria-hidden className={`h-2.5 w-2.5 flex-none rounded-full ${STAT_TONES[tone]}`} />
      </div>
      <div
        className={`mt-2.5 font-serif text-[38px] font-semibold leading-none tracking-[-.3px] ${valueClass ?? ''}`}
      >
        {value}
      </div>
      {/* Always rendered so sibling cards share one height. */}
      <div className={`mt-2.5 min-h-[18px] text-[12px] ${subClass ?? 'text-muted-foreground'}`}>
        {sub ?? '\u00a0'}
      </div>
    </>
  );

  const frame = `flex h-full flex-col rounded-[var(--radius-card)] border bg-card px-5 py-[18px] ${
    active ? 'border-primary ring-2 ring-primary/25' : 'border-border'
  }`;

  if (onClick) {
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={`${frame} cursor-pointer text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring`}
      >
        {body}
      </button>
    );
  }
  return <div className={frame}>{body}</div>;
}
