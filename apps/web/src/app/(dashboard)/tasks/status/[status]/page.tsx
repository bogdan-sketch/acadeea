'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notFound, useParams, useSearchParams } from 'next/navigation';
import { ClipboardList, Search } from 'lucide-react';
import { tasks as tasksApi } from '@/lib/api';
import type { Task, TaskQuery } from '@/lib/types';
import { TaskStatus } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { BackLink } from '@/components/back-link';
import { EmptyState } from '@/components/empty-state';
import { FilterChips } from '@/components/filter-chips';
import { PinnedFilters } from '@/components/pinned-filters';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHead } from '../../../stock/_ui/parts';
import { TASK_STATUS_STYLE } from '../../task-ui';
import { ShowMoreButton, TaskCard } from '../../task-views';
import {
  CHIPS,
  chipFilter,
  filterQuery,
  isChipKey,
  sortFor,
  statusFromSlug,
  type ChipKey,
} from '../../task-filters';

const PAGE_SIZE = 24;

const plural = (n: number) => (n === 1 ? '1 task' : `${n} taskuri`);

/** Every card of one status: /tasks/status/de-facut | in-lucru | blocat | finalizat. */
export default function TaskStatusPage() {
  const params = useParams<{ status: string }>();
  const status = statusFromSlug(params.status);
  if (!status) notFound();
  return <StatusGrid status={status} />;
}

function StatusGrid({ status }: { status: TaskStatus }) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const label = TASK_STATUS_STYLE[status].label;
  // The board's "Blocate" chip is a status filter — meaningless on a single-status page.
  const chips = useMemo(() => CHIPS.filter((c) => c.value !== 'blocked'), []);
  const [chip, setChip] = useState<ChipKey | null>(() => {
    const c = searchParams.get('chip');
    return isChipKey(c) && c !== 'blocked' ? c : null;
  });
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [debounced, setDebounced] = useState(() => (searchParams.get('search') ?? '').trim());
  const [data, setData] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(h);
  }, [search]);

  const query = useMemo<TaskQuery>(
    () => ({ ...filterQuery(chip, debounced, user?.id), status, sort: sortFor(status) }),
    [chip, debounced, user?.id, status],
  );

  const load = useCallback(async () => {
    const gen = ++generation.current;
    setLoading(true);
    try {
      const res = await tasksApi.list({ ...query, page: 1, limit: PAGE_SIZE });
      if (gen !== generation.current) return;
      setData(res.data);
      setTotal(res.total);
    } catch {
      if (gen !== generation.current) return;
      setData([]);
      setTotal(0);
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    // Fetch-on-filter-change; load() sets loading state before awaiting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const loadMore = async () => {
    if (loadingMore || data.length >= total) return;
    const gen = generation.current;
    setLoadingMore(true);
    try {
      const page = Math.floor(data.length / PAGE_SIZE) + 1;
      const res = await tasksApi.list({ ...query, page, limit: PAGE_SIZE });
      if (gen !== generation.current) return;
      setData((d) => {
        const seen = new Set(d.map((t) => t.id));
        return [...d, ...res.data.filter((t) => !seen.has(t.id))];
      });
      setTotal(res.total);
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = useMemo(() => chipFilter(data, chip, user?.id), [data, chip, user?.id]);
  const meta =
    status === TaskStatus.FINALIZAT
      ? `${plural(total)} · ultimele finalizate primele`
      : `${plural(total)} · după termen`;

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/tasks" label="Producție" />
      <PageHead title={label} meta={meta}>
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
      </PageHead>

      <PinnedFilters>
        <FilterChips options={chips} value={chip} onChange={setChip} />
      </PinnedFilters>

      {loading && data.length === 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3.5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-[14px]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Niciun task"
          description={
            chip || debounced
              ? 'Niciun task pentru filtrul ales.'
              : `Nimic în „${label}” deocamdată.`
          }
        />
      ) : (
        <section aria-label={`Taskuri ${label}`} className="flex flex-col gap-4">
          <div
            data-testid="task-status-grid"
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3.5"
          >
            {visible.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
          {data.length < total && (
            <div className="mx-auto w-full max-w-xs">
              <ShowMoreButton
                onClick={() => void loadMore()}
                loading={loadingMore}
                remaining={total - data.length}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
