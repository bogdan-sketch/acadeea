'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Single-row pill filters that stay PINNED while the list scrolls (every
 * width): under the collapsing page head on phones, at the top from `md`.
 * Bleeds to the content gutters with the page background so rows slide under
 * it. Publishes its height as `--pinned-h` (DataTable sticky headers,
 * scroll-margins and a stacked `<PinnedFilters sub>` use it). One primary
 * block per page; put several strips inside it rather than several blocks.
 */
export function PinnedFilters({
  children,
  className,
  sub,
}: {
  children: ReactNode;
  className?: string;
  /** Second pinned strip further down the page — stacks under the primary block. */
  sub?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || sub) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--pinned-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--pinned-h');
    };
  }, [sub]);

  return (
    <div
      ref={ref}
      className={cn(
        sub ? 'pinned-sub' : 'pinned-filters',
        '-mx-4 flex min-w-0 flex-col gap-2 bg-background/95 px-4 py-1.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One horizontally scrolling pill row (never wraps; vertical drags do nothing). */
export function PillStrip({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Accessible group name. */
  label?: string;
}) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={cn('pill-strip min-w-0 gap-2 py-0.5', className)}
    >
      {children}
    </div>
  );
}
