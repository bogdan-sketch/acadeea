'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { orders as ordersApi, tasks as tasksApi, stock as stockApi } from '@/lib/api';
import type { Order, Task, ExpiringItem, TaskQuery } from '@/lib/types';
import { OrderStatus, TaskStatus } from '@/lib/types';
import { orderStatusLabels } from '@/lib/constants';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { EmptyState } from '@/components/empty-state';
import { Hint } from '@/components/hint';
import { useIsMobile } from '@/hooks/use-mobile';
import { hasTimeOfDay } from '@/components/time-of-day';
import { formatUnitQty } from '@/lib/utils';
import { CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  eachDayOfInterval,
  differenceInCalendarDays,
  getISOWeek,
  isSameDay,
  isSameMonth,
  isToday,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import { IconAction, PageHead, Pill } from '../stock/_ui/parts';
import { PillStrip, PinnedFilters } from '@/components/pinned-filters';
import { orderCustomer, orderTitle } from '../orders/order-ui';

/** `day` = one day's agenda (default on phones); `week`/`month` = grids. */
type ViewMode = 'day' | 'week' | 'month';
const VIEWS: { key: ViewMode; label: string; hint: string }[] = [
  { key: 'day', label: 'Zi', hint: 'Agenda unei zile, cu zilele săptămânii ca pastile' },
  { key: 'week', label: 'Săptămână', hint: 'Șapte coloane, Luni–Duminică' },
  { key: 'month', label: 'Lună', hint: 'Toată luna; apasă o zi ca să-i deschizi săptămâna' },
];
type Layer = 'order' | 'task' | 'exp';

// Weeks run Monday → Sunday, always.
const WEEK = { weekStartsOn: 1 as const };

// Only show active orders - not delivered or cancelled
const ACTIVE_STATUSES = [
  OrderStatus.NOUA,
  OrderStatus.IN_PREGATIRE,
  OrderStatus.PREGATITA,
  OrderStatus.IN_TRANZIT,
];

/** Layer styling: accent = orders, blue = production tasks, amber = expiries. */
const LAYERS: Record<Layer, { label: string; dot: string; block: string; border: string }> = {
  order: {
    label: 'Comenzi',
    dot: 'var(--primary)',
    block: 'bg-accent text-primary',
    border: 'var(--primary)',
  },
  task: {
    label: 'Producție',
    dot: 'var(--st-blue)',
    block: 'bg-[var(--st-blue-bg)] text-[var(--st-blue)]',
    border: 'var(--st-blue)',
  },
  exp: {
    label: 'Expirări',
    dot: 'var(--chart-5)',
    block: 'bg-[var(--st-orange-bg)] text-[var(--st-orange)]',
    border: 'var(--chart-5)',
  },
};

interface CalEvent {
  id: string;
  kind: Layer;
  /** yyyy-MM-dd */
  day: string;
  /** HH:mm or '' when the source has no time of day */
  time: string;
  text: string;
  /** Optional second line (orders: the customer). */
  sub?: string;
  href: string;
  title: string;
}

const DOW_SHORT = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
const DOW_LONG = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

/** HH:mm in the 24h clock, or '' when the source carries no time of day (UTC or local midnight). */
function timeOf(iso?: string | null): string {
  if (!iso) return '';
  const d = parseISO(iso);
  if (!hasTimeOfDay(d)) return '';
  return format(d, 'HH:mm');
}

function orderEvent(day: string, o: Order): CalEvent {
  const text = orderTitle(o);
  const who = orderCustomer(o);
  return {
    id: `o-${o.id}`,
    kind: 'order',
    day,
    time: timeOf(o.dueDate),
    text,
    sub: who || undefined,
    href: `/orders/${o.id}`,
    title: `${text}${who ? ` — ${who}` : ''} · ${orderStatusLabels[o.status] ?? o.status}`,
  };
}

function taskEvent(t: Task): CalEvent | null {
  const iso = t.dueDate ?? t.plannedDate;
  if (!iso) return null;
  const d = parseISO(iso);
  if (Number.isNaN(d.getTime())) return null;
  const name = t.displayName ?? t.title ?? t.recipeName;
  const qty = t.targetQuantity ? ` ×${formatUnitQty(t.targetQuantity, t.targetUnit)}` : '';
  return {
    id: `t-${t.id}`,
    kind: 'task',
    day: dayKey(d),
    time: timeOf(iso),
    text: `${name}${qty}`,
    href: `/tasks/${t.id}`,
    title: `Task: ${name}`,
  };
}

function expEvent(e: ExpiringItem): CalEvent | null {
  const d = parseISO(e.expiryDate);
  if (Number.isNaN(d.getTime())) return null;
  return {
    id: `e-${e.lotId}`,
    kind: 'exp',
    day: dayKey(d),
    time: '',
    text: `${e.materialTitle} · ${formatUnitQty(e.quantity, e.unit)}`,
    href: '/stock/expiring',
    title: `Expiră: ${e.materialTitle}${e.locationName ? ` (${e.locationName})` : ''}`,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function CalendarPage() {
  const [orderCal, setOrderCal] = useState<Record<string, Order[]>>({});
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [expList, setExpList] = useState<ExpiringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [view, setView] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Below 768 the week grid cannot fit (audit M-7): open the day agenda instead.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isMobile) setView((v) => (v === 'week' ? 'day' : v));
  }, [isMobile]);
  // Layer filter: nothing picked = everything shown. Picking chips shows only
  // those layers; picking all of them clears the filter again.
  const [picked, setPicked] = useState<Layer[]>([]);
  // Layers the user has no access to (403) are hidden entirely.
  const [denied, setDenied] = useState<Record<Layer, boolean>>({
    order: false,
    task: false,
    exp: false,
  });
  const layersOn = useMemo<Record<Layer, boolean>>(
    () => ({
      order: picked.length === 0 || picked.includes('order'),
      task: picked.length === 0 || picked.includes('task'),
      exp: picked.length === 0 || picked.includes('exp'),
    }),
    [picked],
  );
  const togglePick = (k: Layer) => {
    const available = (['order', 'task', 'exp'] as Layer[]).filter((l) => !denied[l]);
    const next = picked.includes(k) ? picked.filter((l) => l !== k) : [...picked, k];
    setPicked(available.every((l) => next.includes(l)) ? [] : next);
  };

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view !== 'month') {
      return { rangeStart: startOfWeek(currentDate, WEEK), rangeEnd: endOfWeek(currentDate, WEEK) };
    }
    return { rangeStart: startOfMonth(currentDate), rangeEnd: endOfMonth(currentDate) };
  }, [view, currentDate]);

  const load = useCallback(async () => {
    setLoading(true);
    const from = dayKey(rangeStart);
    const to = dayKey(rangeEnd);
    const isDenied = (e: unknown) => (e as { status?: number })?.status === 403;
    // Expiries: the endpoint counts forward from today.
    const daysAhead = Math.min(
      366,
      Math.max(1, differenceInCalendarDays(rangeEnd, new Date()) + 1),
    );
    const [o, t, x] = await Promise.allSettled([
      ordersApi.calendar(from, to, ACTIVE_STATUSES),
      tasksApi.list({
        dueAfter: rangeStart.toISOString(),
        dueBefore: rangeEnd.toISOString(),
        limit: 500,
      } as TaskQuery),
      stockApi.expiring(daysAhead),
    ]);
    setOrderCal(o.status === 'fulfilled' ? o.value : {});
    setTaskList(t.status === 'fulfilled' ? t.value.data : []);
    setExpList(x.status === 'fulfilled' ? x.value : []);
    setDenied({
      order: o.status === 'rejected' && isDenied(o.reason),
      task: t.status === 'rejected' && isDenied(t.reason),
      exp: x.status === 'rejected' && isDenied(x.reason),
    });
    setLoading(false);
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    load();
  }, [load]);

  // All events of the visible range, grouped per day, sorted by time.
  const eventsByDay = useMemo(() => {
    const from = dayKey(rangeStart);
    const to = dayKey(rangeEnd);
    const all: CalEvent[] = [];
    for (const [day, list] of Object.entries(orderCal)) {
      for (const o of list) all.push(orderEvent(day, o));
    }
    for (const t of taskList) {
      if (t.status === TaskStatus.ANULAT) continue;
      const ev = taskEvent(t);
      if (ev) all.push(ev);
    }
    for (const x of expList) {
      const ev = expEvent(x);
      if (ev) all.push(ev);
    }
    const map: Record<string, CalEvent[]> = {};
    for (const ev of all) {
      if (ev.day < from || ev.day > to) continue;
      (map[ev.day] ??= []).push(ev);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    }
    return map;
  }, [orderCal, taskList, expList, rangeStart, rangeEnd]);

  const visible = useCallback(
    (ev: CalEvent) => layersOn[ev.kind] && !denied[ev.kind],
    [layersOn, denied],
  );

  const totals = useMemo(() => {
    const c: Record<Layer, number> = { order: 0, task: 0, exp: 0 };
    for (const list of Object.values(eventsByDay)) for (const ev of list) c[ev.kind]++;
    return c;
  }, [eventsByDay]);

  const weekDays = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  );

  // Month grid: leading blanks so the 1st lands on its Monday-first column.
  const monthCells = useMemo(() => {
    if (view !== 'month') return [];
    const lead = (rangeStart.getDay() + 6) % 7; // Monday = 0
    const cells: (Date | null)[] = Array(lead).fill(null);
    cells.push(...eachDayOfInterval({ start: rangeStart, end: rangeEnd }));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view, rangeStart, rangeEnd]);

  const navigate = (dir: -1 | 1) => {
    if (view === 'day')
      setCurrentDate(dir === 1 ? addDays(currentDate, 1) : subDays(currentDate, 1));
    else if (view === 'week')
      setCurrentDate(dir === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
  };

  const rangeLabel = useMemo(() => {
    if (view === 'month') return format(currentDate, 'LLLL yyyy', { locale: ro });
    if (view === 'day') return format(currentDate, 'EEEE, d MMMM', { locale: ro });
    if (isSameMonth(rangeStart, rangeEnd)) {
      return `${format(rangeStart, 'd')} – ${format(rangeEnd, 'd MMMM', { locale: ro })}`;
    }
    return `${format(rangeStart, 'd MMM', { locale: ro })} – ${format(rangeEnd, 'd MMM', { locale: ro })}`;
  }, [view, currentDate, rangeStart, rangeEnd]);

  const meta = useMemo(() => {
    const parts: string[] = [];
    if (layersOn.order && !denied.order) parts.push(plural(totals.order, 'comandă', 'comenzi'));
    if (layersOn.task && !denied.task) parts.push(plural(totals.task, 'task', 'taskuri'));
    if (layersOn.exp && !denied.exp) parts.push(plural(totals.exp, 'expirare', 'expirări'));
    const lead =
      view === 'month' ? format(currentDate, 'yyyy') : `Săptămâna ${getISOWeek(rangeStart)}`;
    return [lead, parts.join(', ')].filter(Boolean).join(' · ');
  }, [view, rangeStart, currentDate, layersOn, denied, totals]);

  const unit = view === 'day' ? 'Ziua' : view === 'week' ? 'Săptămâna' : 'Luna';
  const prevHint = `${unit} anterioară`;
  const nextHint = `${unit} următoare`;

  const dayEvents = (eventsByDay[dayKey(currentDate)] ?? []).filter(visible);

  // Segmented control inside the 42px header row: 42 outer, 36 inner (M-2).
  const segBtn = (on: boolean) =>
    `inline-flex h-9 cursor-pointer items-center rounded-[9px] px-3 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 ${
      on
        ? 'bg-card text-foreground shadow-(--shadow-card-sm)'
        : 'text-muted-foreground hover:text-foreground'
    }`;

  const eventRow = (e: CalEvent, dense: boolean) => (
    <Link
      key={e.id}
      href={e.href}
      title={e.title}
      className={`flex min-w-0 flex-col gap-0.5 rounded-[9px] border-l-[3px] transition-opacity hover:opacity-80 ${LAYERS[e.kind].block} ${
        dense ? 'px-[9px] py-[7px]' : 'px-3 py-2.5'
      }`}
      style={{ borderLeftColor: LAYERS[e.kind].border }}
    >
      {e.time && <span className="text-[11px] font-bold">{e.time}</span>}
      <span className={`font-semibold leading-[1.3] ${dense ? 'line-clamp-2 text-xs' : 'text-sm'}`}>
        {e.text}
      </span>
      {e.sub && (
        <span className={`truncate font-medium opacity-80 ${dense ? 'text-[11px]' : 'text-xs'}`}>
          {e.sub}
        </span>
      )}
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body * { visibility: hidden !important; }
          #cal-print, #cal-print * { visibility: visible !important; }
          #cal-print { position: absolute; left: 0; top: 0; width: 100%; }
          #cal-print .cal-noprint { display: none !important; }
          #cal-print .cal-scroll { overflow: visible !important; }
          #cal-print .cal-min { min-width: 0 !important; }
        }
      `}</style>

      <div id="cal-print" className="flex flex-col gap-5">
        <PageHead title={rangeLabel} meta={meta}>
          <TutorialAnchor id="calendar.myDay.calendar">
            <div className="cal-noprint flex flex-wrap items-center gap-2.5">
              <div className="inline-flex gap-0.5">
                <Hint label={prevHint}>
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    aria-label={prevHint}
                    className="inline-flex h-[42px] cursor-pointer items-center gap-1 rounded-l-[var(--radius-ctl)] rounded-r-[4px] border border-border bg-card pl-2.5 pr-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Înapoi
                  </button>
                </Hint>
                <Hint label="Azi" detail="Sari la perioada curentă">
                  <button
                    type="button"
                    onClick={() => setCurrentDate(new Date())}
                    aria-label="Azi"
                    className="h-[42px] cursor-pointer border border-border bg-card px-3.5 text-[13px] font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                  >
                    Azi
                  </button>
                </Hint>
                <Hint label={nextHint}>
                  <button
                    type="button"
                    onClick={() => navigate(1)}
                    aria-label={nextHint}
                    className="inline-flex h-[42px] cursor-pointer items-center gap-1 rounded-l-[4px] rounded-r-[var(--radius-ctl)] border border-border bg-card pl-3 pr-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                  >
                    Înainte
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </Hint>
              </div>
              <div
                role="group"
                aria-label="Perioadă"
                className="inline-flex h-[42px] items-center gap-0.5 rounded-[var(--radius-ctl)] bg-muted p-[3px]"
              >
                {VIEWS.map((m) => (
                  <Hint key={m.key} label={m.label} detail={m.hint}>
                    <button
                      type="button"
                      aria-pressed={view === m.key}
                      onClick={() => setView(m.key)}
                      className={`${segBtn(view === m.key)} ${m.key === 'week' ? 'max-md:hidden' : ''}`}
                    >
                      {m.label}
                    </button>
                  </Hint>
                ))}
              </div>
              <IconAction
                icon={Download}
                word="PDF"
                label="Exportă calendarul în PDF"
                title="Tipărește sau salvează calendarul ca PDF"
                onClick={() => window.print()}
              />
            </div>
          </TutorialAnchor>
        </PageHead>

        <PinnedFilters className="cal-noprint">
          <PillStrip label="Ce afișezi">
            {(Object.keys(LAYERS) as Layer[])
              .filter((k) => !denied[k])
              .map((k) => {
                const on = picked.includes(k);
                return (
                  <Pill
                    key={k}
                    on={on}
                    title={
                      on
                        ? `Scoate „${LAYERS[k].label}” din filtru`
                        : `Arată doar ${LAYERS[k].label.toLowerCase()} (poți alege mai multe)`
                    }
                    onClick={() => togglePick(k)}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${on ? 'ring-2 ring-white/80' : ''}`}
                      style={{ background: LAYERS[k].dot }}
                      aria-hidden
                    />
                    {LAYERS[k].label}
                  </Pill>
                );
              })}
            <span className="ml-1.5 whitespace-nowrap text-xs text-muted-foreground">
              {picked.length === 0
                ? 'Toate afișate · alege ce vrei să vezi'
                : 'Filtrat · apasă din nou ca să scoți'}
            </span>
          </PillStrip>
        </PinnedFilters>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : view === 'day' ? (
          <section className="flex flex-col gap-3">
            {/* Day chips: Monday → Sunday of the current week, with event counts. */}
            <PinnedFilters sub className="cal-noprint">
              <PillStrip label="Ziua">
                {weekDays.map((d, i) => {
                  const n = (eventsByDay[dayKey(d)] ?? []).filter(visible).length;
                  const on = isSameDay(d, currentDate);
                  return (
                    <Pill
                      key={dayKey(d)}
                      on={on}
                      title={format(d, 'EEEE, d MMMM', { locale: ro })}
                      onClick={() => setCurrentDate(d)}
                      className={isToday(d) && !on ? 'border-primary text-primary' : ''}
                    >
                      {DOW_SHORT[i]} {format(d, 'd')}
                      {n > 0 && (
                        <span
                          className={`text-[11px] font-bold ${on ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
                        >
                          {n}
                        </span>
                      )}
                    </Pill>
                  );
                })}
              </PillStrip>
            </PinnedFilters>
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-card">
              {dayEvents.length === 0 ? (
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title="Nimic programat"
                  description="Nicio comandă, task sau expirare în ziua asta."
                />
              ) : (
                <div className="flex flex-col gap-2 p-3">
                  {dayEvents.map((e) => eventRow(e, false))}
                </div>
              )}
            </div>
          </section>
        ) : view === 'week' ? (
          <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-card">
            <div className="cal-scroll overflow-x-auto">
              <div className="cal-min grid min-w-[980px] grid-cols-7">
                {weekDays.map((d, i) => {
                  const today = isToday(d);
                  const shown = (eventsByDay[dayKey(d)] ?? []).filter(visible);
                  return (
                    <div
                      key={dayKey(d)}
                      className={`min-w-0 border-r border-border last:border-r-0 ${today ? 'bg-background' : ''}`}
                    >
                      <div className="flex items-center gap-1.5 border-b border-border px-3 pb-2 pt-3">
                        <span className="text-[11px] font-bold uppercase tracking-[.5px] text-muted-foreground">
                          {DOW_SHORT[i]}
                        </span>
                        <span
                          className={
                            today
                              ? 'inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary font-serif text-base font-semibold text-primary-foreground'
                              : 'font-serif text-[20px] font-semibold'
                          }
                        >
                          {format(d, 'd')}
                        </span>
                        <span className="flex-1" />
                        <span className="text-[11px] font-bold text-muted-foreground">
                          {shown.length || ''}
                        </span>
                      </div>
                      <div className="flex min-h-[560px] flex-col gap-1.5 p-2.5">
                        {shown.map((e) => eventRow(e, true))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-card">
            <div className="grid grid-cols-7 border-b border-border">
              {DOW_LONG.map((w) => (
                <span
                  key={w}
                  className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-[.5px] text-muted-foreground max-sm:px-1.5"
                >
                  <span className="max-sm:hidden">{w}</span>
                  <span className="sm:hidden">{w.slice(0, 2)}</span>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthCells.map((d, i) => {
                if (!d) {
                  return (
                    <div
                      key={`b-${i}`}
                      className="min-h-[96px] border-b border-r border-border bg-background"
                    />
                  );
                }
                const shown = (eventsByDay[dayKey(d)] ?? []).filter(visible);
                const kinds = [...new Set(shown.map((e) => e.kind))];
                const today = isSameDay(d, new Date());
                return (
                  <button
                    key={dayKey(d)}
                    type="button"
                    onClick={() => {
                      setCurrentDate(d);
                      setView('week');
                    }}
                    title={`Deschide săptămâna ${format(d, 'd MMMM', { locale: ro })}`}
                    className={`flex min-h-[96px] cursor-pointer flex-col items-start gap-1.5 border-b border-r border-border p-2 text-left transition-colors hover:bg-muted max-sm:p-1.5 ${
                      today ? 'bg-background' : 'bg-card'
                    }`}
                  >
                    <span
                      className={`text-[13px] font-bold ${today ? 'text-primary' : 'text-foreground'}`}
                    >
                      {format(d, 'd')}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {kinds.map((k) => (
                        <span
                          key={k}
                          className="h-[7px] w-[7px] rounded-full"
                          style={{ background: LAYERS[k].dot }}
                        />
                      ))}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {shown.length ? plural(shown.length, 'eveniment', 'evenimente') : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
