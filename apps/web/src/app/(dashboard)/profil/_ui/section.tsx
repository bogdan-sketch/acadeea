'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CARD } from '@/app/(dashboard)/stock/_ui/parts';

/**
 * One card of the Profil page: title + one-line description on top, rows or
 * free content below, optional footer with a summary on the left and ONE
 * worded action on the right. `tag` = "doar root" capsule next to the title.
 */
export function Section({
  id,
  title,
  desc,
  tag,
  aside,
  tone = 'default',
  children,
  footer,
  footerNote,
  className,
}: {
  id?: string;
  title: string;
  desc?: ReactNode;
  tag?: string;
  /** Right side of the header (e.g. "Acum: Atelier · luminos"). */
  aside?: ReactNode;
  tone?: 'default' | 'danger';
  children?: ReactNode;
  /** Right side of the footer — the section's action. */
  footer?: ReactNode;
  /** Left side of the footer — muted summary line. */
  footerNote?: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn(
        CARD,
        'flex scroll-mt-4 flex-col overflow-hidden',
        tone === 'danger' && 'border-destructive/40',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pb-4 pt-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            id={id ? `${id}-title` : undefined}
            className={cn(
              'flex items-center gap-2 text-base font-bold tracking-[-.1px]',
              tone === 'danger' && 'text-destructive',
            )}
          >
            {title}
            {tag && (
              <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-bold tracking-[.2px] text-muted-foreground">
                {tag}
              </span>
            )}
          </h2>
          {desc && <p className="text-[13px] text-muted-foreground">{desc}</p>}
        </div>
        {aside && <div className="text-[12.5px] text-muted-foreground">{aside}</div>}
      </header>
      {children}
      {(footer || footerNote) && (
        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3.5">
          <span className="text-[12.5px] text-muted-foreground">{footerNote}</span>
          <div className="flex flex-wrap items-center gap-2">{footer}</div>
        </footer>
      )}
    </section>
  );
}

/** A row inside a Section: icon/avatar slot, title + sub, actions on the right. */
export function Row({
  lead,
  title,
  sub,
  children,
  className,
}: {
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-border px-6 py-3.5',
        className,
      )}
    >
      {lead}
      <span className="flex min-w-0 flex-1 basis-[200px] flex-col leading-tight">
        <span className="text-sm font-semibold">{title}</span>
        {sub && <span className="mt-0.5 text-[12.5px] text-muted-foreground">{sub}</span>}
      </span>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Label above a read-only or editable field. */
export const FIELD_LABEL = 'mb-[7px] block text-[12.5px] font-semibold text-muted-foreground';
/** Read-only value box, same 42px shell as an input. */
export const FIELD_RO =
  'flex h-[var(--ctl-h)] items-center rounded-[var(--radius-ctl)] bg-muted px-[13px] text-sm';
