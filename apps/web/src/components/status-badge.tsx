'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  label: string;
  colorClass: string;
  className?: string;
}

export function StatusBadge({ label, colorClass, className }: StatusBadgeProps) {
  // Design system: status badges are full capsules with a soft tinted
  // background + leading dot (prototype .badge) — colorClass is an `st-*`
  // utility.
  return (
    <Badge
      variant="secondary"
      className={cn(
        'gap-[5px] rounded-full border-0 px-[11px] py-1 text-xs font-semibold',
        colorClass,
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}
