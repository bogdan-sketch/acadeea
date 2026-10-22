'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { tasks as tasksApi } from '@/lib/api';
import type { Task, TaskQuery } from '@/lib/types';
import { BOARD_COLUMNS, sortFor, type BoardStatus } from './task-filters';

export interface TaskColumn {
  tasks: Task[];
  /** Total for this status from the API (not the loaded count). */
  total: number;
  loadingMore: boolean;
}

export type TaskColumns = Record<BoardStatus, TaskColumn>;

const emptyColumns = (): TaskColumns =>
  Object.fromEntries(
    BOARD_COLUMNS.map((s) => [s, { tasks: [], total: 0, loadingMore: false }]),
  ) as unknown as TaskColumns;

/** Round `n` up to a whole number of pages (min one page). */
const wholePages = (n: number, size: number) => Math.max(size, Math.ceil(n / size) * size);

/**
 * Board data, paged per column: each status is its own `GET /tasks?status=…`
 * so counts are the real totals and "Afișează mai multe" loads the next page
 * of that column only.
 */
export function useTaskColumns(base: TaskQuery | null, pageSize: number) {
  const [columns, setColumns] = useState<TaskColumns>(emptyColumns);
  const [loading, setLoading] = useState(true);
  const columnsRef = useRef(columns);
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);
  // Ignore responses of superseded filter sets.
  const generation = useRef(0);
  const baseKey = JSON.stringify(base);

  const fetchColumn = useCallback(
    async (status: BoardStatus, page: number, limit: number) => {
      const q: TaskQuery = base ?? {};
      // A status filter on the base (chip "Blocate") empties the other columns.
      if (q.status && q.status !== status) return { data: [] as Task[], total: 0 };
      return tasksApi.list({ ...q, status, sort: sortFor(status), page, limit });
    },
    // baseKey captures `base` by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseKey],
  );

  /** Reload every column; `keepShown` keeps the pages already opened. */
  const reload = useCallback(
    async (keepShown = false) => {
      if (!base) return;
      const gen = ++generation.current;
      setLoading(true);
      const results = await Promise.all(
        BOARD_COLUMNS.map(async (status) => {
          const shown = keepShown ? columnsRef.current[status].tasks.length : 0;
          try {
            const res = await fetchColumn(status, 1, wholePages(shown, pageSize));
            return [status, { tasks: res.data, total: res.total, loadingMore: false }] as const;
          } catch {
            return [status, { tasks: [], total: 0, loadingMore: false }] as const;
          }
        }),
      );
      if (gen !== generation.current) return;
      setColumns(Object.fromEntries(results) as unknown as TaskColumns);
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchColumn, pageSize],
  );

  useEffect(() => {
    // Fetch-on-filter-change; reload() sets loading before awaiting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(false);
  }, [reload]);

  const loadMore = useCallback(
    async (status: BoardStatus) => {
      const col = columnsRef.current[status];
      if (col.loadingMore || col.tasks.length >= col.total) return;
      const gen = generation.current;
      setColumns((c) => ({ ...c, [status]: { ...c[status], loadingMore: true } }));
      try {
        // Columns always hold whole pages (reload rounds up), so the next page is exact.
        const page = Math.floor(col.tasks.length / pageSize) + 1;
        const res = await fetchColumn(status, page, pageSize);
        if (gen !== generation.current) return;
        setColumns((c) => {
          const seen = new Set(c[status].tasks.map((t) => t.id));
          return {
            ...c,
            [status]: {
              tasks: [...c[status].tasks, ...res.data.filter((t) => !seen.has(t.id))],
              total: res.total,
              loadingMore: false,
            },
          };
        });
      } catch {
        setColumns((c) => ({ ...c, [status]: { ...c[status], loadingMore: false } }));
      }
    },
    [fetchColumn, pageSize],
  );

  return { columns, loading, reload, loadMore };
}
