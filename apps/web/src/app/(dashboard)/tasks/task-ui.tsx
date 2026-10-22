'use client';

import {
  format,
  isToday,
  isTomorrow,
  isYesterday,
  differenceInCalendarDays,
  startOfDay,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import { TaskStatus } from '@/lib/types';
import type { Task } from '@/lib/types';
import { formatUnitQty, formatQty } from '@/lib/utils';

/**
 * Status palette of the Producție design: De făcut = gray, În lucru = blue,
 * Blocat = orange, Finalizat = green. Built on the semantic st-* tokens so it
 * re-tints in dark mode.
 */
export const TASK_STATUS_STYLE: Record<
  TaskStatus,
  { label: string; fg: string; bg: string; progress: number }
> = {
  [TaskStatus.DE_FACUT]: {
    label: 'De făcut',
    fg: 'var(--st-gray)',
    bg: 'var(--st-gray-bg)',
    progress: 0,
  },
  [TaskStatus.IN_LUCRU]: {
    label: 'În lucru',
    fg: 'var(--st-blue)',
    bg: 'var(--st-blue-bg)',
    progress: 50,
  },
  [TaskStatus.BLOCAT]: {
    label: 'Blocat',
    fg: 'var(--st-orange)',
    bg: 'var(--st-orange-bg)',
    progress: 0,
  },
  [TaskStatus.FINALIZAT]: {
    label: 'Finalizat',
    fg: 'var(--st-green)',
    bg: 'var(--st-green-bg)',
    progress: 100,
  },
  [TaskStatus.ANULAT]: {
    label: 'Anulat',
    fg: 'var(--st-red)',
    bg: 'var(--st-red-bg)',
    progress: 0,
  },
};

/** Design tag: 22px capsule, 11px/700. */
export function StatusTag({ status }: { status: TaskStatus }) {
  const s = TASK_STATUS_STYLE[status];
  return (
    <span
      className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[11px] font-bold"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

/** Thin progress bar coloured by status. */
export function StatusBar({ status, height = 5 }: { status: TaskStatus; height?: number }) {
  const s = TASK_STATUS_STYLE[status];
  return (
    <span
      className="block overflow-hidden rounded-full bg-muted"
      style={{ height }}
      aria-hidden="true"
    >
      <span
        className="block h-full rounded-full"
        style={{ width: `${s.progress}%`, background: s.fg }}
      />
    </span>
  );
}

/** "×6" for pieces, "2,5 kg" for mass/volume. */
export function taskQty(t: Pick<Task, 'targetQuantity' | 'targetUnit'>): string {
  return t.targetUnit === 'BUCATI'
    ? `×${formatQty(t.targetQuantity)}`
    : formatUnitQty(t.targetQuantity, t.targetUnit);
}

export function initials(first?: string, last?: string): string {
  return `${first?.charAt(0) ?? ''}${last?.charAt(0) ?? ''}`.toUpperCase() || '—';
}

export function shortName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName ? `${p.lastName.charAt(0)}.` : ''}`.trim();
}

const AVATAR_COLORS = [
  'var(--st-blue)',
  'var(--st-green)',
  'var(--st-purple)',
  'var(--st-indigo)',
  'var(--st-orange)',
];

/** Stable avatar colour per user id. */
export function avatarColor(id?: string | null): string {
  if (!id) return 'var(--muted-foreground)';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({
  id,
  first,
  last,
  size = 20,
}: {
  id?: string | null;
  first?: string;
  last?: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-none items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        background: avatarColor(id),
      }}
    >
      {id ? initials(first, last) : '—'}
    </span>
  );
}

export function isOverdue(t: Pick<Task, 'dueDate' | 'status'>): boolean {
  if (!t.dueDate || t.status === TaskStatus.FINALIZAT || t.status === TaskStatus.ANULAT) {
    return false;
  }
  const d = new Date(t.dueDate);
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return hasTime ? d < new Date() : d < startOfDay(new Date());
}

/** "azi 12:00", "mâine 09:00", "vineri 10:00", "ieri", "18 oct". 24h, day before month. */
export function formatDue(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  const time = hasTime ? format(d, 'HH:mm') : '';
  const diff = differenceInCalendarDays(d, new Date());
  let day: string;
  if (isToday(d)) day = 'azi';
  else if (isTomorrow(d)) day = 'mâine';
  else if (isYesterday(d)) day = 'ieri';
  else if (diff > 1 && diff < 7) day = format(d, 'EEEE', { locale: ro });
  else day = format(d, 'd MMM', { locale: ro });
  return time ? `${day} ${time}` : day;
}

export function taskName(t: Pick<Task, 'displayName' | 'recipeName'>): string {
  return t.displayName ?? t.recipeName;
}
