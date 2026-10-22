'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  /** Click handler for the action button; use `actionHref` for a plain link. */
  onAction?: () => void;
  /** Link target for the action (rendered as a 42px primary link). */
  actionHref?: string;
  /** Tighter padding + smaller icon for in-card / in-column empty states. */
  compact?: boolean;
  className?: string;
}

/**
 * The one empty state of the app: round muted icon, title, one line of text,
 * optional worded action. Used for empty lists, columns, tables and not-found
 * screens so every "nothing here" reads the same.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  compact,
  className,
}: EmptyStateProps) {
  const action =
    actionLabel && actionHref ? (
      <Button
        render={<Link href={actionHref} />}
        className={cn('h-[42px]', compact ? 'mt-3' : 'mt-4')}
      >
        {actionLabel}
      </Button>
    ) : actionLabel && onAction ? (
      <Button onClick={onAction} className={cn('h-[42px]', compact ? 'mt-3' : 'mt-4')}>
        {actionLabel}
      </Button>
    ) : null;
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-3 py-8' : 'px-4 py-16',
        className,
      )}
    >
      <div className={cn('rounded-full bg-muted', compact ? 'mb-2.5 p-3' : 'mb-4 p-4')}>
        <Icon
          className={cn('text-muted-foreground', compact ? 'h-5 w-5' : 'h-8 w-8')}
          aria-hidden
        />
      </div>
      <h3 className={cn('font-semibold', compact ? 'text-[13px]' : 'text-lg')}>{title}</h3>
      {description && (
        <p
          className={cn(
            'mt-1 max-w-sm text-muted-foreground',
            compact ? 'text-xs leading-snug' : 'text-sm',
          )}
        >
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
