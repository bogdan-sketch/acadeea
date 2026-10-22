'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * Multi-select state for list pages ("Selectează" mode). Pair with
 * `<BulkSelectBar>` which renders the sticky action bar + confirm dialog.
 */
export function useBulkSelect() {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Select every id in `ids`; if all are already selected, deselect them. */
  const toggleAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allIn = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allIn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);
  const enter = useCallback(() => setActive(true), []);
  const exit = useCallback(() => {
    setActive(false);
    setSelected(new Set());
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return useMemo(
    () => ({ active, selected, toggle, toggleAll, clear, enter, exit, isSelected }),
    [active, selected, toggle, toggleAll, clear, enter, exit, isSelected],
  );
}

export type BulkSelect = ReturnType<typeof useBulkSelect>;
