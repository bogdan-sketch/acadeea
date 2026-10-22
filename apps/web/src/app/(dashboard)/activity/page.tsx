'use client';

import { BackLink } from '@/components/back-link';

import { useEffect, useState, useCallback } from 'react';
import { activity as activityApi } from '@/lib/api';
import type { Activity } from '@/lib/types';
import { ActivityType } from '@/lib/types';
import { activityTypeLabels } from '@/lib/constants';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import {
  Activity as ActivityIcon,
  ArrowDownUp,
  Package,
  ShoppingCart,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
} from 'lucide-react';
import { PageHead } from '../stock/_ui/parts';
import { format, isToday, isYesterday } from 'date-fns';
import { ro } from 'date-fns/locale';

/**
 * Activity feed per the Claude Design prototype (isActivity): 22/700 header +
 * 13px subtitle, then one max-w-760 card with hairline-separated rows — 26px
 * tinted type icon, 13.5/500 title, 11.5px "tip · autor · azi" meta (date only, no clock time).
 */

// Per-type icon + tint (design): task → green check, stock movement → accent
// arrow-down-up, low stock → orange alert, orders → blue cart, stock
// available → green package. Tints are the semantic st-* utilities; the
// accent one uses the brand tokens (white-label — never hardcoded).
const typeIcons: Record<ActivityType, React.ElementType> = {
  [ActivityType.TASK_TRANSITION]: CheckCircle,
  [ActivityType.STOCK_MOVEMENT]: ArrowDownUp,
  [ActivityType.ORDER_CREATED]: ShoppingCart,
  [ActivityType.ORDER_STATUS]: ShoppingCart,
  [ActivityType.LOW_STOCK]: AlertTriangle,
  [ActivityType.STOCK_AVAILABLE]: Package,
};

const typeTints: Record<ActivityType, string> = {
  [ActivityType.TASK_TRANSITION]: 'st-green',
  [ActivityType.STOCK_MOVEMENT]: 'bg-primary/10 text-primary',
  [ActivityType.ORDER_CREATED]: 'st-blue',
  [ActivityType.ORDER_STATUS]: 'st-blue',
  [ActivityType.LOW_STOCK]: 'st-orange',
  [ActivityType.STOCK_AVAILABLE]: 'st-green',
};

/** Timestamps are date-only: "azi" / "ieri", older → "9 iul". */
function formatWhen(timestamp: string): string {
  const date = new Date(timestamp);
  if (isToday(date)) return 'azi';
  if (isYesterday(date)) return 'ieri';
  return format(date, 'd MMM', { locale: ro });
}

export default function ActivityPage() {
  const [data, setData] = useState<Activity[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await activityApi.list({ page, limit: 30 });
      if (page === 1) setData(res.data);
      else setData((prev) => [...prev, ...res.data]);
      setHasMore(res.page < res.totalPages);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <PageHead title="Activitate" meta="Jurnalul acțiunilor din organizație" />

      {data.length === 0 && !loading ? (
        <div className="max-w-[760px]">
          <EmptyState
            icon={ActivityIcon}
            title="Nicio activitate"
            description="Acțiunile din organizație apar aici pe măsură ce se întâmplă."
          />
        </div>
      ) : (
        <>
          <div className="max-w-[760px] overflow-hidden rounded-[var(--radius-card)] border border-border bg-card shadow-(--shadow-card-sm)">
            {data.map((item, i) => {
              const Icon = typeIcons[item.type] || ActivityIcon;
              const userName =
                typeof item.metadata?.userName === 'string' ? item.metadata.userName : 'sistem';
              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-[11px] px-[18px] py-[13px] ${
                    i > 0 ? 'border-t border-border' : ''
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full ${typeTints[item.type] ?? 'bg-primary/10 text-primary'}`}
                  >
                    <Icon className="h-[13px] w-[13px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium">{item.title}</div>
                    <div className="mt-px text-xs text-muted-foreground">
                      {activityTypeLabels[item.type]} · {userName} · {formatWhen(item.timestamp)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="max-w-[760px] text-center">
              <Button
                variant="outline"
                className="h-[42px]"
                onClick={() => setPage((p) => p + 1)}
                disabled={loading}
              >
                <ChevronDown className="h-4 w-4" />
                Încarcă mai multe
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
