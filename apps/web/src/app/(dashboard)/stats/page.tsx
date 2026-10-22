'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
  subWeeks,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import { analytics } from '@/lib/api';
import type { OrderAnalytics, ProductionAnalytics, UserProductivity } from '@/lib/types';
import { Truncate } from '@/components/truncate';
import { PageHead, Pill } from '../stock/_ui/parts';

type PeriodKey = 'week' | 'fortnight' | 'month' | 'year';

/** Week windows start on Monday (owner's rule) and run to today; month/year are rolling. */
const PERIODS: { key: PeriodKey; label: string; hint: string }[] = [
  { key: 'week', label: 'Săptămâna', hint: 'De luni până azi' },
  { key: 'fortnight', label: '2 săptămâni', hint: 'De lunea trecută până azi' },
  { key: 'month', label: 'Luna', hint: 'Ultimele 30 de zile' },
  { key: 'year', label: 'Anul', hint: 'Ultimele 12 luni' },
];

const WEEK = { weekStartsOn: 1 as const };

/** "Lu Ma Mi Jo Vi Sâ Du" — two letters, never the ambiguous single "M". */
const dow = (d: Date) => {
  const t = format(d, 'EEEEEE', { locale: ro });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const endOfDay = (d: Date) => `${iso(d)}T23:59:59.999`;
const fmtDay = (d: Date) => format(d, 'd MMM yyyy', { locale: ro });

type Bucket = { label: string; title: string; total: number };

/** Run async jobs a few at a time so a 30-bucket chart does not flood the API. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface Loaded {
  orders: OrderAnalytics;
  prevOrders: OrderAnalytics | null;
  production: ProductionAnalytics | null;
  prevProduction: ProductionAnalytics | null;
  people: UserProductivity[];
  buckets: Bucket[];
}

function Delta({ cur, prev, pp }: { cur: number | null; prev: number | null; pp?: boolean }) {
  if (cur === null || prev === null) return null;
  if (pp) {
    const d = Math.round(cur - prev);
    return (
      <span className={`text-xs font-bold ${deltaTone(d)}`}>
        {d > 0 ? '+' : ''}
        {d} pp față de perioada anterioară
      </span>
    );
  }
  if (prev === 0) return null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return (
    <span className={`text-xs font-bold ${deltaTone(d)}`}>
      {d > 0 ? '+' : ''}
      {d}% față de perioada anterioară
    </span>
  );
}

function deltaTone(d: number) {
  if (d > 0) return 'text-[var(--st-green)]';
  if (d < 0) return 'text-[var(--st-red)]';
  return 'text-muted-foreground';
}

export default function StatsPage() {
  const [period, setPeriod] = useState<PeriodKey>('fortnight');
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const range = useMemo(() => {
    const to = new Date();
    const from =
      period === 'week'
        ? startOfWeek(to, WEEK)
        : period === 'fortnight'
          ? subWeeks(startOfWeek(to, WEEK), 1)
          : subDays(to, (period === 'month' ? 30 : 365) - 1);
    const days = differenceInCalendarDays(to, from) + 1;
    const prevTo = subDays(from, 1);
    const prevFrom = subDays(prevTo, days - 1);
    return { days, from, to, prevFrom, prevTo };
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    const { from, to, prevFrom, prevTo, days } = range;
    setLoading(true);
    setFailed(false);

    // Chart buckets: one per day (≤ 30 days) or one per calendar month (year).
    const spans: { from: Date; to: Date; label: string; title: string }[] = [];
    if (days <= 30) {
      for (let i = 0; i < days; i++) {
        const d = addDays(from, i);
        spans.push({
          from: d,
          to: d,
          label: days <= 14 ? dow(d) : format(d, 'd'),
          title: fmtDay(d),
        });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const m = startOfMonth(addMonths(to, -i));
        const last = i === 0 ? to : subDays(startOfMonth(addMonths(m, 1)), 1);
        spans.push({
          from: m,
          to: last,
          label: format(m, 'MMM', { locale: ro }),
          title: format(m, 'LLLL yyyy', { locale: ro }),
        });
      }
    }

    (async () => {
      try {
        const [orders, prevOrders, production, prevProduction, people] = await Promise.all([
          analytics.orders(iso(from), endOfDay(to)),
          analytics.orders(iso(prevFrom), endOfDay(prevTo)).catch(() => null),
          analytics.production(iso(from), endOfDay(to)).catch(() => null),
          analytics.production(iso(prevFrom), endOfDay(prevTo)).catch(() => null),
          analytics.users().catch(() => [] as UserProductivity[]),
        ]);
        const totals = await mapLimited(spans, 6, (s) =>
          analytics
            .orders(iso(s.from), endOfDay(s.to))
            .then((r) => r.totalOrders)
            .catch(() => 0),
        );
        if (cancelled) return;
        setData({
          orders,
          prevOrders,
          production,
          prevProduction,
          people,
          buckets: spans.map((s, i) => ({ label: s.label, title: s.title, total: totals[i] })),
        });
      } catch {
        if (!cancelled) {
          setData(null);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const periodLabel = `${fmtDay(range.from)} – ${fmtDay(range.to)} (${differenceInCalendarDays(range.to, range.from) + 1} zile)`;

  const sold = (o: OrderAnalytics | null) =>
    o ? o.popularProducts.reduce((s, p) => s + p.quantity, 0) : null;
  const pct = (o: OrderAnalytics | null) =>
    o && o.onTimeRate !== undefined ? Math.round(o.onTimeRate * 100) : null;

  const kpis = data
    ? [
        {
          label: 'Comenzi',
          value: String(data.orders.totalOrders),
          delta: (
            <Delta cur={data.orders.totalOrders} prev={data.prevOrders?.totalOrders ?? null} />
          ),
        },
        {
          label: 'Produse vândute',
          value: String(sold(data.orders)),
          delta: <Delta cur={sold(data.orders)} prev={sold(data.prevOrders)} />,
        },
        {
          label: 'Comenzi livrate la timp',
          value: pct(data.orders) !== null ? `${pct(data.orders)}%` : '—',
          delta: <Delta pp cur={pct(data.orders)} prev={pct(data.prevOrders)} />,
        },
        {
          label: 'Taskuri finalizate',
          value: data.production ? String(data.production.totalTasksCompleted) : '—',
          delta: (
            <Delta
              cur={data.production?.totalTasksCompleted ?? null}
              prev={data.prevProduction?.totalTasksCompleted ?? null}
            />
          ),
        },
      ]
    : [];

  const maxBar = data ? Math.max(1, ...data.buckets.map((b) => b.total)) : 1;
  const topMax = data ? Math.max(1, ...data.orders.popularProducts.map((p) => p.quantity)) : 1;
  const people = data ? [...data.people].sort((a, b) => b.tasksCompleted - a.tasksCompleted) : [];

  const card =
    'flex flex-col gap-3.5 rounded-[var(--radius-card)] border border-border bg-card px-5 py-[18px]';

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Statistici" meta={periodLabel} />

      <div role="group" aria-label="Perioadă" className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Pill key={p.key} on={p.key === period} title={p.hint} onClick={() => setPeriod(p.key)}>
            {p.label}
          </Pill>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Se încarcă…</p>
      ) : !data ? (
        <p className="text-muted-foreground">
          {failed ? 'Nu s-au putut încărca datele' : 'Fără date'}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
            {kpis.map((k) => (
              <div
                key={k.label}
                className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-card px-5 py-[18px]"
              >
                <span className="text-[13px] font-semibold text-muted-foreground">{k.label}</span>
                <span className="text-[34px] font-semibold leading-none">{k.value}</span>
                {k.delta}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-start gap-[18px]">
            <section className={`min-w-0 flex-[2_1_460px] ${card}`}>
              <div className="flex items-center justify-between gap-2.5">
                <h2 className="text-base font-bold">
                  {range.days > 30 ? 'Comenzi pe lună' : 'Comenzi pe zi'}
                </h2>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-primary" />
                  Total comenzi (API-ul nu separă site de manual)
                </span>
              </div>
              <div className="flex h-[200px] items-end gap-1.5 pt-2.5">
                {data.buckets.map((b, i) => (
                  <div
                    key={i}
                    title={`${b.title}: ${b.total}`}
                    className="flex h-full min-w-0 flex-1 flex-col items-stretch justify-end gap-0.5"
                  >
                    <span className="text-center text-[10px] font-bold text-muted-foreground">
                      {b.total > 0 && data.buckets.length <= 14 ? b.total : ''}
                    </span>
                    <span
                      className="rounded-t-[5px] bg-primary"
                      style={{ height: `${(b.total / maxBar) * 85}%`, minHeight: b.total ? 3 : 0 }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                {data.buckets.map((b, i) => (
                  <span
                    key={i}
                    className="min-w-0 flex-1 overflow-hidden text-center text-[11px] font-bold text-muted-foreground"
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            </section>

            <section className={`min-w-0 flex-[1_1_260px] ${card} !gap-3`}>
              <h2 className="text-base font-bold">Top produse</h2>
              {data.orders.popularProducts.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Fără vânzări în perioadă</p>
              ) : (
                data.orders.popularProducts.slice(0, 6).map((p) => (
                  <div key={p.name} className="flex flex-col gap-1">
                    <span className="flex justify-between gap-2 text-[13px]">
                      <Truncate text={p.name} className="font-semibold" />
                      <span className="flex-none font-bold">{p.quantity}</span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${(p.quantity / topMax) * 100}%` }}
                      />
                    </span>
                  </div>
                ))
              )}
            </section>
          </div>

          <section className={`${card} !gap-3`}>
            <h2 className="text-base font-bold">Producție pe persoană</h2>
            {people.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Fără date</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-8 gap-y-3">
                {people.map((m) => (
                  <div key={m.userId} className="flex items-center gap-2.5 text-[13px]">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent text-xs font-bold text-primary">
                      {`${m.firstName?.[0] ?? ''}${m.lastName?.[0] ?? ''}`.toUpperCase()}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">
                        {m.firstName} {m.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {m.avgCompletionHours != null
                          ? `medie ${m.avgCompletionHours.toLocaleString('ro-RO')} h / task`
                          : 'taskuri finalizate'}
                      </span>
                    </span>
                    <span className="text-xl font-semibold">{m.tasksCompleted}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
