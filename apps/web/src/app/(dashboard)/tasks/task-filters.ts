import { endOfDay, endOfWeek, startOfDay, startOfWeek } from 'date-fns';
import type { Task, TaskQuery } from '@/lib/types';
import { TaskStatus } from '@/lib/types';

export type ChipKey = 'today' | 'week' | 'mine' | 'unassigned' | 'blocked';

export const CHIPS: { value: ChipKey; label: string }[] = [
  { value: 'today', label: 'Azi' },
  { value: 'week', label: 'Săptămâna' },
  { value: 'mine', label: 'Ale mele' },
  { value: 'unassigned', label: 'Nealocate' },
  { value: 'blocked', label: 'Blocate' },
];

export const isChipKey = (v: string | null): v is ChipKey => CHIPS.some((c) => c.value === v);

/** Board columns, in workflow order. */
export const BOARD_COLUMNS = [
  TaskStatus.DE_FACUT,
  TaskStatus.IN_LUCRU,
  TaskStatus.BLOCAT,
  TaskStatus.FINALIZAT,
  TaskStatus.ANULAT,
] as const;
export type BoardStatus = (typeof BOARD_COLUMNS)[number];

/** Romanian URL slugs for /tasks/status/[status]. */
export const STATUS_SLUG: Record<BoardStatus, string> = {
  [TaskStatus.DE_FACUT]: 'de-facut',
  [TaskStatus.IN_LUCRU]: 'in-lucru',
  [TaskStatus.BLOCAT]: 'blocat',
  [TaskStatus.FINALIZAT]: 'finalizat',
  [TaskStatus.ANULAT]: 'anulat',
};

export function statusFromSlug(slug: string | undefined): BoardStatus | null {
  const hit = BOARD_COLUMNS.find((s) => STATUS_SLUG[s] === slug);
  return hit ?? null;
}

/** Finalizat / Anulat: latest closed first; every other column by due date. */
export const sortFor = (status: TaskStatus): 'due' | 'completed' =>
  status === TaskStatus.FINALIZAT || status === TaskStatus.ANULAT ? 'completed' : 'due';

/** Query for the chip + search, without paging or status. */
export function filterQuery(
  chip: ChipKey | null,
  search: string,
  userId: string | undefined,
): TaskQuery {
  const q: TaskQuery = {};
  if (search) q.search = search;
  const now = new Date();
  if (chip === 'today') {
    q.dueAfter = startOfDay(now).toISOString();
    q.dueBefore = endOfDay(now).toISOString();
  } else if (chip === 'week') {
    q.dueAfter = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
    q.dueBefore = endOfWeek(now, { weekStartsOn: 1 }).toISOString();
  } else if (chip === 'mine' && userId) {
    q.assignedToId = userId;
  } else if (chip === 'unassigned') {
    q.unassigned = true;
  } else if (chip === 'blocked') {
    q.status = TaskStatus.BLOCAT;
  }
  return q;
}

/**
 * "Ale mele" / "Nealocate" are re-checked client-side (the API honours
 * assignedToId only for managers).
 */
export function chipFilter(tasks: Task[], chip: ChipKey | null, userId: string | undefined) {
  if (chip === 'unassigned') return tasks.filter((t) => !t.assignedTo);
  if (chip === 'mine' && userId) return tasks.filter((t) => t.assignedToId === userId);
  return tasks;
}

/** Link to a status page that keeps the current search + chip. */
export function statusHref(status: BoardStatus, chip: ChipKey | null, search: string): string {
  const p = new URLSearchParams();
  if (search) p.set('search', search);
  if (chip) p.set('chip', chip);
  const qs = p.toString();
  return `/tasks/status/${STATUS_SLUG[status]}${qs ? `?${qs}` : ''}`;
}
