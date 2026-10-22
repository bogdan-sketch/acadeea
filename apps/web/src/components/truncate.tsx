'use client';

import type { ReactNode } from 'react';
import { Hint } from '@/components/hint';
import { cn } from '@/lib/utils';

/**
 * Single-line ellipsis that never loses content: hovering (or focusing) shows
 * the full text in a Hint. Use instead of a bare `.truncate` span.
 */
export function Truncate({
  text,
  className,
  children,
}: {
  /** Full text for the tooltip (and accessible name). */
  text: string;
  className?: string;
  /** Optional custom rendering; defaults to `text`. */
  children?: ReactNode;
}) {
  return (
    <Hint label={text}>
      <span className={cn('block min-w-0 truncate', className)}>{children ?? text}</span>
    </Hint>
  );
}
