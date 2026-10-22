'use client';

import * as React from 'react';
import { format, isValid, parse } from 'date-fns';
import { ro } from 'react-day-picker/locale';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Selector de dată în format românesc (dd.MM.yyyy) — buton care deschide un
 * calendar react-day-picker cu locale ro. Valoarea rămâne string ISO
 * `yyyy-MM-dd` (identic cu `<input type="date">`), deci paginile existente o
 * pot trimite neschimbată către API. Spre deosebire de inputul nativ, afișarea
 * nu mai depinde de limba browserului (nu mai apare formatul US mm/dd/yyyy).
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Alege data',
  className,
  align = 'start',
  'aria-label': ariaLabel,
}: {
  /** ISO `yyyy-MM-dd` sau `''` (nimic selectat). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  align?: 'start' | 'center' | 'end';
  'aria-label'?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const parsed = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className={cn(
          'flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-ctl)] border border-input bg-card px-3 text-sm outline-hidden focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          className,
        )}
      >
        <span className={selected ? undefined : 'text-muted-foreground'}>
          {selected ? format(selected, 'dd.MM.yyyy') : placeholder}
        </span>
        <CalendarIcon className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0">
        <Calendar
          mode="single"
          locale={ro}
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (d) onChange(format(d, 'yyyy-MM-dd'));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
