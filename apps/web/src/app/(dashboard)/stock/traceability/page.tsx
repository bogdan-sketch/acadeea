'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { stock as stockApi } from '@/lib/api';
import type { StockTraceability, TraceabilityKind } from '@/lib/types';
import { formatUnitQty } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { PinnedFilters, PillStrip } from '@/components/pinned-filters';
import { CARD, PageHead, Pill } from '../_ui/parts';
import { fmtDayMonthTime, isoLocal, parseIsoLocal } from '../_ui/dates';
import { StatusTag } from '../../tasks/task-ui';

/**
 * "Trasabilitate produs": every production task that used one stock item
 * (raw material, consumable, semipreparat / product) — when, how much, where,
 * which intake lots — plus the tasks that produced a recipe. Reached from the
 * "Trasabilitate" button on the item pages. Filters live in the URL so a view
 * can be shared: ?rawMaterialId|consumableId|recipeId & range=7|30|month|custom
 * & from=yyyy-MM-dd & to=yyyy-MM-dd & kind=CONSUMED|RESERVED|PRODUCED.
 */

type Range = 'all' | '7' | '30' | 'month' | 'custom';

const KIND_LABEL: Record<TraceabilityKind, string> = {
  CONSUMED: 'Folosit',
  RESERVED: 'Rezervat',
  PRODUCED: 'Produs',
};
const KIND_TONE: Record<TraceabilityKind, string> = {
  CONSUMED: 'bg-primary/10 text-primary',
  RESERVED: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  PRODUCED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
};

const ITEM_HREF = {
  RAW_MATERIAL: (id: string) => `/stock/raw-materials/${id}`,
  CONSUMABLE: (id: string) => `/stock/consumables/${id}`,
  RECIPE: (id: string) => `/recipes/${id}`,
} as const;

/** [from, to] ISO instants for a range (local day bounds; `to` inclusive). */
function bounds(range: Range, from: string, to: string): { from?: string; to?: string } {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  if (range === '7' || range === '30') {
    const d = startOfDay(now);
    d.setDate(d.getDate() - (Number(range) - 1));
    return { from: d.toISOString() };
  }
  if (range === 'month')
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
  if (range === 'custom') {
    const out: { from?: string; to?: string } = {};
    if (from) out.from = parseIsoLocal(from).toISOString();
    if (to) {
      const end = parseIsoLocal(to);
      end.setHours(23, 59, 59, 999);
      out.to = end.toISOString();
    }
    return out;
  }
  return {};
}

function TraceabilityContent() {
  const router = useRouter();
  const params = useSearchParams();
  const rawMaterialId = params.get('rawMaterialId') ?? undefined;
  const consumableId = params.get('consumableId') ?? undefined;
  const recipeId = params.get('recipeId') ?? undefined;
  const range = (params.get('range') as Range) || 'all';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const kind = (params.get('kind') as TraceabilityKind | null) ?? null;

  const [data, setData] = useState<StockTraceability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`/stock/traceability?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  useEffect(() => {
    if (!rawMaterialId && !consumableId && !recipeId) {
      setError('Lipsește produsul.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    stockApi
      .traceability({ rawMaterialId, consumableId, recipeId, ...bounds(range, from, to) })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Eroare la încărcare'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [rawMaterialId, consumableId, recipeId, range, from, to]);

  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => !kind || r.kind === kind),
    [data, kind],
  );
  const isRecipe = data?.item.kind === 'RECIPE';
  const unit = data?.item.unit ?? '';

  const rangePill = (value: Range, label: string) => (
    <Pill
      on={range === value}
      onClick={() =>
        setParam({
          range: value === 'all' ? null : value,
          ...(value === 'custom'
            ? {
                from: from || isoLocal(new Date(Date.now() - 6 * 864e5)),
                to: to || isoLocal(new Date()),
              }
            : { from: null, to: null }),
        })
      }
    >
      {label}
    </Pill>
  );

  return (
    <div className="flex flex-col gap-4">
      {data && (
        <Link
          href={ITEM_HREF[data.item.kind](data.item.id)}
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {data.item.name}
        </Link>
      )}
      <PageHead meta="Trasabilitate" title={data?.item.name ?? 'Trasabilitate produs'} />

      <PinnedFilters>
        <PillStrip label="Perioadă">
          {rangePill('all', 'Tot')}
          {rangePill('7', 'Ultimele 7 zile')}
          {rangePill('30', 'Ultimele 30 de zile')}
          {rangePill('month', 'Luna asta')}
          {rangePill('custom', 'Interval…')}
          {range === 'custom' && (
            <span className="flex flex-none items-center gap-2 pl-1">
              <DatePicker
                value={from}
                onChange={(v) => setParam({ from: v || null })}
                aria-label="De la"
                placeholder="De la"
                className="h-[34px] w-[150px]"
              />
              <span className="text-muted-foreground">–</span>
              <DatePicker
                value={to}
                onChange={(v) => setParam({ to: v || null })}
                aria-label="Până la"
                placeholder="Până la"
                className="h-[34px] w-[150px]"
                align="end"
              />
            </span>
          )}
        </PillStrip>
        <PillStrip label="Tip">
          <Pill on={!kind} onClick={() => setParam({ kind: null })}>
            Toate
          </Pill>
          <Pill
            on={kind === 'CONSUMED'}
            onClick={() => setParam({ kind: kind === 'CONSUMED' ? null : 'CONSUMED' })}
          >
            Folosit în taskuri
          </Pill>
          <Pill
            on={kind === 'RESERVED'}
            onClick={() => setParam({ kind: kind === 'RESERVED' ? null : 'RESERVED' })}
          >
            Rezervat
          </Pill>
          {isRecipe && (
            <Pill
              on={kind === 'PRODUCED'}
              onClick={() => setParam({ kind: kind === 'PRODUCED' ? null : 'PRODUCED' })}
            >
              Produs de taskuri
            </Pill>
          )}
        </PillStrip>
      </PinnedFilters>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Folosit" value={formatUnitQty(data.totals.consumed, unit)} />
          <Stat label="Rezervat" value={formatUnitQty(data.totals.reserved, unit)} />
          {isRecipe && <Stat label="Produs" value={formatUnitQty(data.totals.produced, unit)} />}
          <Stat label="Taskuri" value={String(data.totals.taskCount)} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : error ? (
        <p className="py-10 text-center text-destructive">{error}</p>
      ) : rows.length === 0 ? (
        <p className={`${CARD} px-5 py-12 text-center text-muted-foreground`}>
          Niciun task în perioada aleasă.
        </p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="hidden grid-cols-[150px_minmax(0,2fr)_110px_120px_120px_minmax(0,1fr)] gap-3 border-b border-border px-5 py-2.5 text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Data</span>
            <span>Task</span>
            <span>Tip</span>
            <span>Status</span>
            <span className="text-right">Cantitate</span>
            <span>Locație · loturi</span>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={`${r.taskId}:${r.kind}`}>
                <Link
                  href={`/tasks/${r.taskId}`}
                  className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-muted/60 lg:grid-cols-[150px_minmax(0,2fr)_110px_120px_120px_minmax(0,1fr)] lg:items-center"
                >
                  <span className="order-3 text-[12.5px] text-muted-foreground tabular-nums lg:order-none lg:text-[13px] lg:text-foreground">
                    {fmtDayMonthTime(new Date(r.date))}
                  </span>
                  <span className="order-1 min-w-0 lg:order-none">
                    <span className="block truncate font-semibold">{r.taskName}</span>
                    {(r.taskName !== r.recipeName || r.assignedToName) && (
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {[r.taskName !== r.recipeName ? r.recipeName : null, r.assignedToName]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="order-4 lg:order-none">
                    <span
                      className={`inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-bold ${KIND_TONE[r.kind]}`}
                    >
                      {KIND_LABEL[r.kind]}
                    </span>
                  </span>
                  <span className="order-5 lg:order-none">
                    <StatusTag status={r.taskStatus} />
                  </span>
                  <span className="order-2 text-right font-serif text-[16px] font-semibold tabular-nums lg:order-none">
                    {formatUnitQty(r.quantity, r.unit)}
                  </span>
                  <span className="order-6 col-span-2 min-w-0 text-[12.5px] text-muted-foreground lg:order-none lg:col-span-1">
                    {[
                      r.locationName,
                      ...r.lots.map(
                        (l) => `Lot ${l.lotNumber ?? '—'} · ${formatUnitQty(l.quantity, r.unit)}`,
                      ),
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${CARD} px-4 py-3`}>
      <div className="text-[12px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-serif text-[22px] font-semibold tabular-nums">{value || '0'}</div>
    </div>
  );
}

export default function StockTraceabilityPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      }
    >
      <TraceabilityContent />
    </Suspense>
  );
}
