'use client';

import type { ReactNode } from 'react';
import { Pill } from '@/app/(dashboard)/stock/_ui/parts';
import { cn } from '@/lib/utils';

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: ReactNode;
  /** One-line explanation shown as the chip's hover title. */
  hint?: string;
  disabled?: boolean;
}

/**
 * Single-choice chips — the house replacement for a `<select>` with a short
 * option list (≤ ~10 values): every option is visible, one tap selects it.
 *
 * `onChange` receives `null` only when `allowClear` is set and the active chip
 * is tapped again (a "no value" state the form must be able to represent).
 */
export function ChoiceChips<T extends string = string>({
  value,
  options,
  onChange,
  allowClear = false,
  label,
  className,
  height,
}: {
  value: T | null | undefined;
  options: ChoiceOption<T>[];
  onChange: (value: T | null) => void;
  allowClear?: boolean;
  /** Accessible name of the group (the visible <Label> text, usually). */
  label?: string;
  className?: string;
  /** Pill height class; defaults to the Pill default (34px). */
  height?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <Pill
            key={opt.value}
            on={on}
            title={opt.hint}
            height={height}
            className={cn(opt.disabled && 'pointer-events-none opacity-50')}
            onClick={() => {
              if (opt.disabled) return;
              if (on) {
                if (allowClear) onChange(null);
                return;
              }
              onChange(opt.value);
            }}
          >
            {opt.label}
          </Pill>
        );
      })}
      {options.length === 0 && (
        <span className="text-[13px] text-muted-foreground">Nicio opțiune disponibilă.</span>
      )}
    </div>
  );
}
