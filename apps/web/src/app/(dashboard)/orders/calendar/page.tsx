'use client';

import { useEffect, useMemo, useState } from 'react';
import { orders as ordersApi } from '@/lib/api';
import type { Order } from '@/lib/types';
import { orderStatusLabels, orderStatusColors } from '@/lib/constants';
import { BackLink } from '@/components/back-link';
import { EmptyState } from '@/components/empty-state';
import { Hint } from '@/components/hint';
import { StatusBadge } from '@/components/status-badge';
import { Truncate } from '@/components/truncate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Truck, User } from 'lucide-react';
import Link from 'next/link';
import { PageHead } from '../../stock/_ui/parts';
import { PinnedFilters } from '@/components/pinned-filters';
import { deliveryPointLabel, orderCustomer, orderTitle } from '../order-ui';
import {
  DeliveryMethodFilter,
  OrderStatusFilter,
  OrderViewSwitch,
  deliveryMethodLabel,
  orderDayKey,
  segBtn,
  statusesLabel,
  useOrdersArea,
} from '../orders-area';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { bucharestDayKey } from '@/lib/utils';
import { ro } from 'date-fns/locale';

/** Range of the calendar: one day (default — "Azi"), a Mon–Sun week or a month. */
type Range = 'day' | 'week' | 'month';
const RANGES: { key: Range; label: string; hint: string }[] = [
  { key: 'day', label: 'Zi', hint: 'Comenzile unei singure zile' },
  { key: 'week', label: 'Săptămână', hint: 'Luni–Duminică' },
  { key: 'month', label: 'Lună', hint: 'Toată luna' },
];
const WEEK = { weekStartsOn: 1 as const };

export default function OrderCalendarPage() {
  const area = useOrdersArea();
  const [range, setRange] = useState<Range>('day');
  const [anchor, setAnchor] = useState(() => new Date());
  const [calendar, setCalendar] = useState<Record<string, Order[]>>({});
  const [loading, setLoading] = useState(true);

  const { from, to } = useMemo(() => {
    if (range === 'day') {
      const k = bucharestDayKey(anchor);
      return { from: k, to: k };
    }
    if (range === 'week') {
      return {
        from: format(startOfWeek(anchor, WEEK), 'yyyy-MM-dd'),
        to: format(endOfWeek(anchor, WEEK), 'yyyy-MM-dd'),
      };
    }
    return {
      from: format(startOfMonth(anchor), 'yyyy-MM-dd'),
      to: format(endOfMonth(anchor), 'yyyy-MM-dd'),
    };
  }, [range, anchor]);

  const { view, method, deliveryKind, refreshMethods, statuses } = area;
  useEffect(() => {
    let cancelled = false;
    // Delivery methods (chips + labels) are re-fetched with every calendar reload.
    refreshMethods();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    ordersApi
      .calendar(from, to, statuses ?? undefined, {
        view,
        deliveryMethod: method ?? undefined,
        deliveryKind: deliveryKind ?? undefined,
      })
      // Regrupăm pe ziua din ora României după aceeași regulă ca serverul
      // (pregătiri: ziua termenului, fără termen = azi; intrări: ziua plasării).
      .then((byDay) => {
        if (cancelled) return;
        const todayKey = bucharestDayKey(new Date());
        const regrouped: Record<string, Order[]> = {};
        for (const list of Object.values(byDay)) {
          for (const o of list) {
            const day = orderDayKey(o, view, todayKey);
            if (day < from || day > to) continue;
            (regrouped[day] ??= []).push(o);
          }
        }
        const time = (o: Order) =>
          view === 'intrari' ? o.createdAt : (o.dueDate ?? `${todayKey}T23:59:59`);
        for (const list of Object.values(regrouped)) {
          list.sort((a, b) => time(a).localeCompare(time(b)));
        }
        setCalendar(regrouped);
      })
      .catch(() => {
        if (!cancelled) setCalendar({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, view, method, deliveryKind, refreshMethods, statuses]);

  const sortedDates = Object.keys(calendar).sort();
  const todayKey = bucharestDayKey(new Date());

  const step = (dir: 1 | -1) =>
    setAnchor((d) =>
      range === 'day' ? addDays(d, dir) : range === 'week' ? addWeeks(d, dir) : addMonths(d, dir),
    );
  const rangeLabel =
    range === 'day'
      ? from === todayKey
        ? 'Azi'
        : format(parseISO(from), 'EEEE, d MMMM', { locale: ro })
      : range === 'week'
        ? `${format(parseISO(from), 'd MMM', { locale: ro })} – ${format(parseISO(to), 'd MMM', { locale: ro })}`
        : format(parseISO(from), 'LLLL yyyy', { locale: ro });

  const navBtn =
    'inline-flex h-[42px] cursor-pointer items-center gap-1 border border-border bg-card text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60';

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/orders" label="Comenzi" />
      <PageHead
        title={view === 'livrari' ? 'Calendar pregătiri' : 'Calendar intrări'}
        meta={
          view === 'livrari'
            ? `Comenzi de pregătit, pe data de livrare · fără termen = azi · ${statusesLabel(statuses)}`
            : `Comenzi organizate pe ziua plasării · ${statusesLabel(statuses)}`
        }
      >
        <div className="inline-flex gap-0.5">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Perioada anterioară"
            className={`${navBtn} rounded-l-[var(--radius-ctl)] rounded-r-[4px] pl-2.5 pr-3`}
          >
            <ChevronLeft className="h-4 w-4" />
            Înapoi
          </button>
          <Hint label="Azi" detail="Sari la ziua de azi">
            <button
              type="button"
              onClick={() => {
                setRange('day');
                setAnchor(new Date());
              }}
              aria-label="Azi"
              className={`${navBtn} px-3.5 font-bold`}
            >
              Azi
            </button>
          </Hint>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Perioada următoare"
            className={`${navBtn} rounded-l-[4px] rounded-r-[var(--radius-ctl)] pl-3 pr-2.5`}
          >
            Înainte
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div
          role="group"
          aria-label="Perioadă"
          className="inline-flex h-[42px] items-center gap-0.5 rounded-[var(--radius-ctl)] bg-muted p-[3px]"
        >
          {RANGES.map((r) => (
            <Hint key={r.key} label={r.label} detail={r.hint}>
              <button
                type="button"
                aria-pressed={range === r.key}
                onClick={() => setRange(r.key)}
                className={segBtn(range === r.key)}
              >
                {r.label}
              </button>
            </Hint>
          ))}
        </div>
        <OrderStatusFilter area={area} />
      </PageHead>

      {/* Fixate sus la derulare: Pregătiri/Intrări + metoda de livrare (comun cu lista). */}
      <PinnedFilters>
        <div className="flex min-w-0 items-center gap-2.5">
          <OrderViewSwitch area={area} />
          <div className="min-w-0 flex-1">
            <DeliveryMethodFilter area={area} />
          </div>
        </div>
      </PinnedFilters>

      <p className="-mt-1 text-[13px] font-semibold text-muted-foreground first-letter:uppercase">
        {rangeLabel}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : sortedDates.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={
            view === 'livrari' ? 'Nimic de pregătit în perioada aleasă' : 'Nicio comandă plasată'
          }
          description="Schimbă perioada, statusul sau filtrul ca să vezi alte comenzi."
        />
      ) : (
        <div className="space-y-6">
          {sortedDates.map((dateKey) => {
            const orders = calendar[dateKey] ?? [];
            const dateObj = parseISO(dateKey);
            const isToday = todayKey === dateKey;
            const isPast = dateKey < todayKey;

            return (
              <Card key={dateKey} className={isPast ? 'border-dashed bg-muted/30' : ''}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="h-4 w-4" />
                    {format(dateObj, 'EEEE, d MMMM yyyy', { locale: ro })}
                    {isToday && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                        Azi
                      </span>
                    )}
                    <span className="ml-auto text-sm font-normal text-muted-foreground">
                      {orders.length} {orders.length === 1 ? 'comandă' : 'comenzi'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {orders.map((order) => {
                    const point = deliveryPointLabel(order);
                    const methodLabel = deliveryMethodLabel(order.deliveryMethod, area.methods);
                    return (
                      <Link
                        key={order.id}
                        href={`/orders/${order.id}`}
                        className="flex items-center gap-4 rounded-[var(--radius-ctl)] border border-border p-3 transition-colors hover:bg-muted/60"
                      >
                        <StatusBadge
                          label={orderStatusLabels[order.status] ?? order.status}
                          colorClass={orderStatusColors[order.status] ?? ''}
                        />
                        <div className="min-w-0 flex-1">
                          <Truncate text={orderTitle(order)} className="text-sm font-semibold" />
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                            {orderCustomer(order) && (
                              <Truncate text={orderCustomer(order)} className="font-medium" />
                            )}
                            {order.customerName && point && (
                              <span className="flex min-w-0 items-center gap-1">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <Truncate text={point} />
                              </span>
                            )}
                            {methodLabel && (
                              <span className="flex min-w-0 items-center gap-1">
                                <Truck className="h-3 w-3 shrink-0" />
                                <Truncate text={order.deliveryMethod ?? methodLabel}>
                                  {methodLabel}
                                </Truncate>
                              </span>
                            )}
                            {order.assignedTo && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {order.assignedTo.firstName} {order.assignedTo.lastName}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
