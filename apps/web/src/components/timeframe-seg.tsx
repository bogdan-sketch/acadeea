'use client';

import { Calendar, CalendarRange, CalendarDays } from 'lucide-react';
import { isToday, isThisWeek, isSameMonth } from 'date-fns';

export type Timeframe = 'today' | 'week' | 'month';

/** Does `date` fall inside the timeframe? (week starts Monday, month = current). */
export function inTimeframe(date: Date, tf: Timeframe): boolean {
  if (tf === 'today') return isToday(date);
  if (tf === 'week') return isThisWeek(date, { weekStartsOn: 1 });
  return isSameMonth(date, new Date());
}

const SEGMENTS: { value: Timeframe; label: string; icon: typeof Calendar }[] = [
  { value: 'today', label: 'Azi', icon: Calendar },
  { value: 'week', label: 'Săptămâna', icon: CalendarRange },
  { value: 'month', label: 'Luna', icon: CalendarDays },
];

/**
 * Apple-Calendar-style timeframe switch (Azi / Săptămâna / Luna, with icons).
 * Single-select; clicking the active segment clears it (null = all).
 */
export function TimeframeSeg({
  value,
  onChange,
}: {
  value: Timeframe | null;
  onChange: (v: Timeframe | null) => void;
}) {
  return (
    <div className="inline-flex shrink-0 gap-0.5 rounded-[var(--radius-ctl)] border border-input bg-card p-[3px]">
      {SEGMENTS.map((s) => {
        const on = value === s.value;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : s.value)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-[13px] py-[7px] text-[13px] font-semibold transition-colors ${
              on ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <s.icon className="h-4 w-4" />
            <span className="max-sm:hidden">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
