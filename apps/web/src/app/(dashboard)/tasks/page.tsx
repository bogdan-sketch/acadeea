'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { tasks as tasksApi } from '@/lib/api';
import type { Task, TaskQuery } from '@/lib/types';
import { TaskStatus } from '@/lib/types';
import { FilterChips } from '@/components/filter-chips';
import { EmptyState } from '@/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Hint } from '@/components/hint';
import {
  Plus,
  Search,
  ClipboardList,
  LayoutGrid,
  List,
  ShoppingCart,
  Calendar,
} from 'lucide-react';
import { IconAction, PageHead } from '../stock/_ui/parts';
import { PinnedFilters } from '@/components/pinned-filters';
import { useAuth, usePermissions } from '@/contexts/auth-context';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import { BulkSelectBar, BulkSelectToggle } from '@/components/bulk-select-bar';
import type { BulkActionDef } from '@/components/bulk-actions';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { TaskBoard, TaskList } from './task-views';
import { taskName } from './task-ui';
import {
  BOARD_COLUMNS,
  CHIPS,
  chipFilter,
  filterQuery,
  isChipKey,
  statusHref,
  type ChipKey,
} from './task-filters';
import { useTaskColumns } from './use-task-columns';
import { toast } from 'sonner';

/** List view: one page of everything. */
const LIST_LIMIT = 100;
/** Board: cards per column page ("Afișează mai multe" loads the next 8). */
const COLUMN_PAGE = 8;

const BULK_ACTIONS: BulkActionDef[] = [
  {
    key: 'status',
    label: 'Status',
    param: {
      kind: 'enum',
      options: [
        { value: TaskStatus.DE_FACUT, label: 'De făcut' },
        { value: TaskStatus.IN_LUCRU, label: 'În lucru' },
        { value: TaskStatus.ANULAT, label: 'Anulează' },
      ],
    },
  },
  { key: 'assign', label: 'Asignează', paramName: 'assignedToId', param: { kind: 'user' } },
  { key: 'plannedDate', label: 'Data planificată', param: { kind: 'date' } },
  { key: 'dueDate', label: 'Termen', param: { kind: 'date' } },
  {
    key: 'priority',
    label: 'Prioritate',
    param: {
      kind: 'enum',
      options: [1, 2, 3, 4, 5].map((p) => ({ value: String(p), label: `Prioritate ${p}` })),
    },
  },
  { key: 'location', label: 'Locație', paramName: 'locationId', param: { kind: 'location' } },
];

export default function TasksPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { can } = usePermissions();
  const select = useBulkSelect();
  const canDelete = can('delete', 'Task');
  const canUpdate = can('update', 'Task');

  const [view, setView] = useState<'board' | 'list'>('board');
  const searchParams = useSearchParams();
  const [chip, setChip] = useState<ChipKey | null>(() => {
    const c = searchParams.get('chip');
    return isChipKey(c) ? c : null;
  });
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [debounced, setDebounced] = useState(() => (searchParams.get('search') ?? '').trim());
  const [data, setData] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(h);
  }, [search]);

  const baseQuery = useMemo<TaskQuery>(
    () => filterQuery(chip, debounced, user?.id),
    [chip, debounced, user?.id],
  );
  // Board: every column is paged on its own (real totals per status).
  const {
    columns: boardColumns,
    loading: boardLoading,
    reload: reloadBoard,
    loadMore: loadMoreColumn,
  } = useTaskColumns(view === 'board' ? baseQuery : null, COLUMN_PAGE);

  const load = useCallback(async () => {
    if (view !== 'list') return;
    setLoading(true);
    const q: TaskQuery = { ...baseQuery, page: 1, limit: LIST_LIMIT };
    try {
      const res = await tasksApi.list(q);
      setData(res.data);
      setTotal(res.total);
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [baseQuery, view]);

  useEffect(() => {
    // Fetch-on-filter-change; load() sets loading state before awaiting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // "Ale mele" / "Nealocate" are re-checked client-side (the API only honours
  // assignedToId for managers; unassigned has no server param).
  const visible = useMemo(() => chipFilter(data, chip, user?.id), [data, chip, user?.id]);
  const columns = useMemo(
    () =>
      Object.fromEntries(
        BOARD_COLUMNS.map((s) => [
          s,
          { ...boardColumns[s], tasks: chipFilter(boardColumns[s].tasks, chip, user?.id) },
        ]),
      ) as typeof boardColumns,
    [boardColumns, chip, user?.id],
  );

  const isBoard = view === 'board';
  const shownCount = isBoard
    ? BOARD_COLUMNS.reduce((n, s) => n + columns[s].total, 0)
    : visible.filter((t) => t.status !== TaskStatus.ANULAT).length;
  const doneCount = isBoard
    ? columns[TaskStatus.FINALIZAT].total
    : visible.filter((t) => t.status === TaskStatus.FINALIZAT).length;
  const busy = isBoard ? boardLoading && shownCount === 0 : loading && data.length === 0;
  const nothing = isBoard ? shownCount === 0 : visible.length === 0;
  const dateLabel = format(new Date(), 'EEEE, d MMMM', { locale: ro });
  const eyebrow = `${dateLabel.charAt(0).toUpperCase()}${dateLabel.slice(1)} · ${shownCount} taskuri, ${doneCount} finalizate`;

  // Segmented control inside the 42px header row: 42 outer, 36 inner (M-2).
  const segBtn = (on: boolean) =>
    `inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 ${
      on ? 'bg-card text-foreground shadow-sm' : 'text-secondary-foreground hover:text-foreground'
    }`;

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Producție" meta={eyebrow}>
        <label className="flex h-[42px] min-w-[220px] items-center gap-2 rounded-[var(--radius-ctl)] border border-border bg-card px-3.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 max-sm:min-w-0 max-sm:flex-1">
          <Search aria-hidden className="h-4 w-4 flex-none text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută task"
            aria-label="Caută task"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div
          role="group"
          aria-label="Mod de afișare"
          className="inline-flex h-[42px] items-center gap-0.5 rounded-[var(--radius-ctl)] bg-muted p-[3px]"
        >
          <Hint label="Tablă pe statusuri" detail="Tablă: o coloană pe fiecare stare">
            <button
              type="button"
              aria-pressed={view === 'board'}
              onClick={() => setView('board')}
              className={segBtn(view === 'board')}
            >
              <LayoutGrid className="size-4" />
              Tablă
            </button>
          </Hint>
          <Hint label="Listă" detail="Listă: toate taskurile, cu selecție multiplă">
            <button
              type="button"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
              className={segBtn(view === 'list')}
            >
              <List className="size-4" />
              Listă
            </button>
          </Hint>
        </div>
        <IconAction
          icon={Calendar}
          word="Calendar"
          href="/calendar"
          label="Calendar producție"
          title="Taskurile pe zile, Luni–Duminică"
        />
        <IconAction
          icon={ShoppingCart}
          word="Cumpărături"
          href="/tasks/shopping-list"
          label="Listă de cumpărături"
          title="Ce lipsește pentru taskurile de azi"
        />
        {can('create', 'Task') && (
          <IconAction
            icon={Plus}
            tone="primary"
            word="Nou"
            href="/tasks/new"
            label="Task nou"
            title="Rețetă, cantitate, termen, cine"
          />
        )}
      </PageHead>

      <PinnedFilters>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <FilterChips options={CHIPS} value={chip} onChange={setChip} />
          </div>
          {(canDelete || canUpdate) && view === 'list' && <BulkSelectToggle select={select} />}
        </div>
      </PinnedFilters>

      {busy ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-[14px]" />
          ))}
        </div>
      ) : nothing ? (
        <EmptyState
          icon={ClipboardList}
          title="Niciun task"
          description={
            chip || debounced
              ? 'Niciun task pentru filtrul ales.'
              : 'Creează primul task de producție.'
          }
          actionLabel={can('create', 'Task') && !chip && !debounced ? 'Creează task' : undefined}
          onAction={
            can('create', 'Task') && !chip && !debounced
              ? () => router.push('/tasks/new')
              : undefined
          }
        />
      ) : view === 'board' ? (
        <TaskBoard
          columns={columns}
          onLoadMore={(status) => void loadMoreColumn(status)}
          allHref={(status) => statusHref(status, chip, debounced)}
          onMove={
            can('update', 'Task')
              ? async (t, to) => {
                  if (to === TaskStatus.FINALIZAT) {
                    // Finishing needs the real yield: open the task with its dialog.
                    router.push(`/tasks/${t.id}?finish=1`);
                    return;
                  }
                  try {
                    await tasksApi.transition(t.id, { toStatus: to });
                    toast.success(
                      `${taskName(t)} mutat la ${to === TaskStatus.IN_LUCRU ? 'În lucru' : 'De făcut'}`,
                    );
                  } catch (e) {
                    toast.error('Nu s-a putut muta taskul', {
                      description: e instanceof Error ? e.message : undefined,
                    });
                  }
                  void reloadBoard(true);
                }
              : undefined
          }
        />
      ) : (
        <TaskList tasks={visible} select={select} onOpen={(t) => router.push(`/tasks/${t.id}`)} />
      )}

      {!isBoard && total > LIST_LIMIT && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Se afișează primele {LIST_LIMIT} din {total} taskuri — folosește căutarea sau filtrele.
        </p>
      )}

      <BulkSelectBar
        select={select}
        entityLabel="taskuri"
        onPreview={canDelete ? (ids) => tasksApi.bulkDeletePreview(ids) : undefined}
        onDelete={canDelete ? (ids) => tasksApi.bulkDelete(ids) : undefined}
        actions={canUpdate ? BULK_ACTIONS : undefined}
        onAction={(ids, key, params) =>
          tasksApi.bulkAction(
            ids,
            key,
            key === 'priority' ? { priority: Number(params.priority) } : params,
          )
        }
        onDone={() => (isBoard ? reloadBoard(true) : load())}
      />
    </div>
  );
}
