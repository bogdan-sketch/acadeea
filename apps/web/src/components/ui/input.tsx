import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

/**
 * Shared focus system (H-7/M-12): `outline-none` + `ring-3 ring-ring` (solid
 * accent, ≥3:1 on every scheme surface) + `border-ring`. Wrapped search
 * fields use the same ring via `focus-within:` on the <label>.
 */
export const FOCUS_RING =
  'outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring';
export const FOCUS_WITHIN_RING =
  'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-[var(--ctl-h)] w-full min-w-0 rounded-[var(--radius-ctl)] border border-input bg-transparent px-[13px] py-1 text-base transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        FOCUS_RING,
        className,
      )}
      {...props}
    />
  );
}

export { Input };
