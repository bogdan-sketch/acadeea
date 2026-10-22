'use client';

import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
} from 'lucide-react';
import { toast } from 'sonner';
import { isToday } from 'date-fns';
import { orders as ordersApi, integrations as integrationsApi } from '@/lib/api';
import type { Integration, Order, OrderQuery, OrderStats } from '@/lib/types';
import { OrderStatus } from '@/lib/types';
import { orderStatusLabels } from '@/lib/constants';
import { PillStrip, PinnedFilters } from '@/components/pinned-filters';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Truncate } from '@/components/truncate';
import { IconAction, PageHead, Pill } from '../stock/_ui/parts';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/contexts/auth-context';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import { BulkSelectBar, BulkSelectToggle } from '@/components/bulk-select-bar';
import type { BulkActionDef } from '@/components/bulk-actions';
import {
  isClosed,
  isSiteOrder,
  modeLabel,
  orderCustomer,
  orderTitle,
  statusTone,
  termLabel,
} from './order-ui';
import {
  DeliveryMethodFilter,
  OrderStatusFilter,
  OrderViewSwitch,
  statusesLabel,
  deliveryMethodLabel,
  focusGroupKey,
  groupOrdersByDay,
  useOrdersArea,
} from './orders-area';

const GRID = 'grid items-center gap-3 px-5';

export default function OrdersPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const select = useBulkSelect();
  const { ask, dialog } = useConfirmDialog();
  const canDelete = can('delete', 'Order');
  const canUpdate = can('update', 'Order');
  const bulkActions: BulkActionDef[] = [
    {
      key: 'status',
      label: 'Status',
      param: {
        kind: 'enum',
        options: Object.values(OrderStatus).map((s) => ({ value: s, label: orderStatusLabels[s] })),
      },
    },
    {
      key: 'assign',
      label: 'Asignează livrator',
      paramName: 'assignedToId',
      param: { kind: 'user' },
    },
    { key: 'dueDate', label: 'Termen', param: { kind: 'date' } },
    {
      key: 'archive',
      label: 'Arhivare',
      paramName: 'archived',
      param: { kind: 'bool', trueLabel: 'Arhivează', falseLabel: 'Dezarhivează' },
    },
  ];

  const [data, setData] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<OrderQuery>({ page: 1, limit: 20 });
  const [source, setSource] = useState<'site' | 'manual' | null>(null);
  const [loading, setLoading] = useState(true);
  /** View the rows on screen were fetched for (focus waits for fresh data). */
  const [loadedView, setLoadedView] = useState<OrderQuery['view']>(undefined);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [dueToday, setDueToday] = useState<number | null>(null);
  const [wooIntegration, setWooIntegration] = useState<Integration | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // Pregătiri/Intrări + delivery-method + status filter, shared with the calendar.
  const area = useOrdersArea();
  // Archived orders are all delivered/cancelled: the status filter is off there.
  const statuses = query.archived ? undefined : (area.statuses ?? undefined);
  // Back to page 1 whenever the view or a filter changes; a view change (and
  // the first load) also brings the "Azi" group into focus.
  const areaKey = `${area.view}|${area.method ?? ''}|${area.deliveryKind ?? ''}|${statuses?.join(',') ?? ''}`;
  const [seenAreaKey, setSeenAreaKey] = useState(areaKey);
  // View whose "Azi" group was last brought into focus (null = not yet).
  const focusedView = useRef<OrderQuery['view'] | null>(null);
  if (seenAreaKey !== areaKey) {
    setSeenAreaKey(areaKey);
    setQuery((q) => ({ ...q, page: 1 }));
  }

  const loadMeta = useCallback(() => {
    ordersApi
      .stats()
      .then(setStats)
      .catch(() => {});
    // "ies azi" = open orders due today (one wide page, counted client-side).
    ordersApi
      .list({ page: 1, limit: 200 })
      .then((r) =>
        setDueToday(
          r.data.filter((o) => !isClosed(o.status) && o.dueDate && isToday(new Date(o.dueDate)))
            .length,
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!can('manage', 'Integration')) return;
    integrationsApi
      .list()
      .then((list) => setWooIntegration(list.find((i) => i.provider === 'woocommerce') ?? null))
      .catch(() => {});
  }, [can]);

  // Pregătiri: future days come first, so one wide page keeps "Azi" on page 1.
  const limit = area.view === 'livrari' ? 200 : (query.limit ?? 20);
  const page = query.page ?? 1;

  // "De pe site" / "Manuale" has no server filter: fetch one wide page and
  // filter, count and paginate it client-side so the footer, the chips and
  // page 2 agree with what is on screen (QA M6).
  const serverQuery = useMemo<OrderQuery>(
    () =>
      source === null
        ? {
            ...query,
            limit,
            view: area.view,
            deliveryMethod: area.method ?? undefined,
            deliveryKind: area.deliveryKind ?? undefined,
            statuses,
          }
        : {
            page: 1,
            limit: 200,
            search: query.search,
            archived: query.archived,
            view: area.view,
            deliveryMethod: area.method ?? undefined,
            deliveryKind: area.deliveryKind ?? undefined,
            statuses,
          },
    [query, source, limit, area.view, area.method, area.deliveryKind, statuses],
  );

  const { refreshMethods } = area;
  const load = useCallback(async () => {
    setLoading(true);
    // Delivery methods (chips + labels) are re-fetched with every list reload.
    refreshMethods();
    try {
      const res = await ordersApi.list(serverQuery);
      setData(res.data);
      setTotal(res.total);
      setLoadedView(serverQuery.view);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [serverQuery, refreshMethods]);

  useEffect(() => {
    load();
  }, [load]);

  const bySource = useMemo(
    () => (source === null ? data : data.filter((o) => (source === 'site') === isSiteOrder(o))),
    [data, source],
  );
  const filtered = bySource;
  const visible = useMemo(
    () => (source === null ? filtered : filtered.slice((page - 1) * limit, page * limit)),
    [filtered, source, page, limit],
  );
  const shownTotal = source === null ? total : filtered.length;
  // Server order (intrări: placed desc; pregătiri: delivery day desc) is kept
  // inside each group; groups run future → Mâine → Azi → Ieri → Mai vechi.
  const groups = useMemo(() => groupOrdersByDay(visible, area.view), [visible, area.view]);

  useEffect(() => {
    if (focusedView.current === area.view || loading || loadedView !== area.view) return;
    focusedView.current = area.view;
    const key = focusGroupKey(groups);
    // Already the first group → it is in view; scrolling would hide the filters.
    if (!key || key === groups[0]?.key) return;
    document
      .querySelector(`[data-day-group="${key}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [groups, loading, loadedView, area.view]);

  const active = stats
    ? (stats.statusCounts?.[OrderStatus.NOUA] ?? 0) +
      (stats.statusCounts?.[OrderStatus.IN_PREGATIRE] ?? 0) +
      (stats.statusCounts?.[OrderStatus.PREGATITA] ?? 0) +
      (stats.statusCounts?.[OrderStatus.IN_TRANZIT] ?? 0)
    : null;

  const lastPage = Math.max(1, Math.ceil(shownTotal / limit));
  const isUnfiltered =
    source === null && !query.search && !statuses && !area.method && !area.deliveryKind;

  const sync = async () => {
    if (!wooIntegration) return;
    setSyncing(true);
    try {
      const r = await integrationsApi.sync(wooIntegration.id);
      toast.success(
        r.failed > 0 ? `${r.synced} sincronizate, ${r.failed} eșuate` : `${r.synced} sincronizate`,
      );
      await load();
      loadMeta();
    } catch {
      toast.error('Sincronizarea a eșuat');
    } finally {
      setSyncing(false);
    }
  };

  const allIds = visible.map((o) => o.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => select.isSelected(id));
  const gridCols = select.active
    ? 'grid-cols-[28px_minmax(0,1fr)_150px_150px_130px_84px]'
    : 'grid-cols-[minmax(0,1fr)_150px_150px_130px_84px]';

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Comenzi"
        meta={`${active === null ? '…' : active} active · ${dueToday === null ? '…' : dueToday} ies azi`}
      >
        <label className="flex h-[42px] min-w-[240px] items-center gap-2 rounded-[var(--radius-ctl)] border border-border bg-card px-3.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 max-sm:min-w-0 max-sm:flex-[1_1_100%]">
          <Search aria-hidden className="h-4 w-4 flex-none text-muted-foreground" />
          <input
            type="search"
            placeholder="Nr. comandă, client, produs"
            aria-label="Caută comandă"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            value={query.search || ''}
            onChange={(e) => setQuery({ ...query, search: e.target.value, page: 1 })}
          />
        </label>
        <IconAction
          icon={CalendarDays}
          word="Calendar"
          href="/orders/calendar"
          label="Calendar comenzi"
          title="Comenzile pe zile, Luni–Duminică"
        />
        <OrderStatusFilter
          area={area}
          counts={source === null ? stats?.statusCounts : undefined}
          disabled={!!query.archived}
        />
        <IconAction
          icon={PieChart}
          word="Statistici"
          href="/orders/stats"
          label="Statistici comenzi"
          title="Vânzări, produse, clienți"
        />
        {wooIntegration && canUpdate && (
          <IconAction
            icon={RefreshCw}
            word="Sincronizează"
            label="Sincronizează comenzile de pe site"
            title="Aduce acum comenzile noi de pe site (WooCommerce)"
            onClick={sync}
            disabled={syncing}
            spinning={syncing}
          />
        )}
        {can('create', 'Order') && (
          <IconAction
            icon={Plus}
            tone="primary"
            word="Nouă"
            href="/orders/new"
            label="Comandă nouă"
            title="Client, produse, termen, livrare sau ridicare"
          />
        )}
      </PageHead>

      {/* Fixate sus la derulare: Pregătiri/Intrări + metoda de livrare (comun cu calendarul). */}
      <PinnedFilters>
        <div className="flex min-w-0 items-center gap-2.5">
          <OrderViewSwitch area={area} />
          <div className="min-w-0 flex-1">
            <DeliveryMethodFilter area={area} />
          </div>
        </div>
      </PinnedFilters>

      {/* Sursă, arhivă, selecție — statusul e în meniul „Status” din antet. */}
      <PillStrip label="Filtre comenzi">
        {(
          [
            ['site', 'De pe site'],
            ['manual', 'Manuale'],
          ] as const
        ).map(([k, label]) => (
          <Pill key={k} on={source === k} onClick={() => setSource(source === k ? null : k)}>
            {label}
          </Pill>
        ))}
        <Pill
          on={!!query.archived}
          onClick={() =>
            setQuery({
              ...query,
              archived: query.archived ? undefined : true,
              page: 1,
            })
          }
        >
          <Archive className="size-3.5" />
          Arhivate
        </Pill>
        {(canDelete || canUpdate) && <BulkSelectToggle select={select} />}
        {canUpdate && !query.archived && (
          <Pill
            on={false}
            className="disabled:opacity-50"
            title="Arhivează toate comenzile livrate și anulate"
            onClick={async () => {
              if (archiving) return;
              const ok = await ask({
                title: 'Arhivezi comenzile finalizate?',
                description:
                  'Toate comenzile livrate și anulate dispar din liste, statistici și calendar. Le regăsești oricând sub „Arhivate”.',
                confirmLabel: 'Arhivează',
              });
              if (!ok) return;
              setArchiving(true);
              try {
                const { archived } = await ordersApi.archiveCompleted();
                toast.success(
                  archived > 0
                    ? `${archived} comenzi arhivate`
                    : 'Nicio comandă de arhivat — totul e deja curat',
                );
                await load();
                loadMeta();
              } finally {
                setArchiving(false);
              }
            }}
          >
            <Archive className="size-3.5" />
            Arhivează finalizatele
          </Pill>
        )}
      </PillStrip>

      <p className="-mt-2 text-[13px] font-semibold text-muted-foreground">
        {query.archived
          ? 'Arhivate · toate statusurile'
          : area.statuses
            ? `Doar: ${statusesLabel(area.statuses)}`
            : statusesLabel(null)}
      </p>

      {query.archived && (
        <p className="text-sm text-muted-foreground">
          Vezi comenzile arhivate — ele nu apar în liste, statistici sau calendar. Comenzile
          livrate/anulate se arhivează automat după 60 de zile.
        </p>
      )}

      {visible.length === 0 && !loading && query.archived ? (
        <EmptyState
          icon={Archive}
          title="Nicio comandă arhivată"
          description="Comenzile livrate/anulate arhivate manual sau automat apar aici."
        />
      ) : visible.length === 0 && !loading && isUnfiltered ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nicio comandă"
          description="Creează prima comandă."
          actionLabel={can('create', 'Order') ? 'Comandă nouă' : undefined}
          onAction={can('create', 'Order') ? () => router.push('/orders/new') : undefined}
        />
      ) : (
        <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-card">
          <div className="overflow-x-auto">
            <div className="min-w-[990px]" role="table" aria-label="Comenzi">
              <div
                role="row"
                className={`${GRID} ${gridCols} py-3 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground`}
              >
                {select.active && (
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => select.toggleAll(allIds)}
                    aria-label="Selectează tot"
                  />
                )}
                <span role="columnheader">Comandă</span>
                <span role="columnheader">Termen</span>
                <span role="columnheader">Mod</span>
                <span role="columnheader">Status</span>
                <span role="columnheader" className="sr-only">
                  Acțiuni
                </span>
              </div>
              {!loading && visible.length === 0 && (
                <div
                  role="row"
                  className="border-t border-border px-5 py-8 text-center text-[13px] text-muted-foreground"
                >
                  Nicio comandă pentru filtrele alese.
                  {statuses && ' Alege alte statusuri din „Status”.'}
                </div>
              )}
              {loading && visible.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="border-t border-border px-5 py-3">
                      <Skeleton className="h-6 w-full" />
                    </div>
                  ))
                : groups.map((g) => (
                    <Fragment key={g.key}>
                      <div
                        role="row"
                        data-day-group={g.key}
                        className="flex scroll-mt-[calc(var(--pinned-h,0px)+1rem)] items-center gap-2 border-t border-border bg-muted/40 px-5 py-2 max-md:scroll-mt-[calc(3rem+var(--pinned-h,0px)+0.5rem)]"
                      >
                        <span
                          role="rowheader"
                          className={`text-[12px] font-bold uppercase tracking-[0.5px] ${g.isToday ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                          {g.label}
                        </span>
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {g.orders.length}
                        </span>
                      </div>
                      {g.orders.map((o) => {
                        const term = termLabel(o.dueDate);
                        const closed = isClosed(o.status);
                        const site = isSiteOrder(o);
                        return (
                          <div
                            key={o.id}
                            role="row"
                            className={`${GRID} ${gridCols} cursor-pointer border-t border-border py-2.5 text-[13px] transition-colors hover:bg-muted/40`}
                            onClick={() =>
                              select.active ? select.toggle(o.id) : router.push(`/orders/${o.id}`)
                            }
                          >
                            {select.active && (
                              <Checkbox
                                checked={select.isSelected(o.id)}
                                onCheckedChange={() => select.toggle(o.id)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Selectează ${orderTitle(o)}`}
                              />
                            )}
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <Truncate text={orderTitle(o)} className="font-bold" />
                              <span className="flex min-w-0 items-center gap-1.5 text-[12px]">
                                <Truncate
                                  text={orderCustomer(o) || '—'}
                                  className="font-semibold text-foreground/80"
                                />
                                <span
                                  className={`shrink-0 text-[11px] font-semibold ${site ? 'text-primary' : 'text-muted-foreground'}`}
                                >
                                  · {site ? 'Site' : 'Manuală'}
                                </span>
                              </span>
                            </span>
                            <span
                              className={`whitespace-nowrap ${
                                closed ? 'font-medium text-muted-foreground' : 'font-bold'
                              } ${term.today && !closed ? 'text-primary' : ''}`}
                            >
                              {term.text}
                            </span>
                            {/* Shop delivery method (Woo) when known, else Ridicare/Livrare. */}
                            <Truncate
                              text={o.deliveryMethod ? `Metodă: ${o.deliveryMethod}` : modeLabel(o)}
                              className="text-muted-foreground"
                            >
                              {deliveryMethodLabel(o.deliveryMethod, area.methods) || modeLabel(o)}
                            </Truncate>
                            <span>
                              <span
                                className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-[9px] text-xs font-bold ${statusTone[o.status].pill}`}
                              >
                                {orderStatusLabels[o.status]}
                              </span>
                            </span>
                            <span
                              className="flex justify-end gap-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <IconAction
                                row
                                icon={ClipboardList}
                                href={`/tasks?search=${encodeURIComponent(o.orderNumber)}`}
                                label="Taskurile comenzii"
                                title="Taskurile de producție ale comenzii"
                              />
                              <IconAction
                                row
                                icon={FileText}
                                href={`/orders/${o.id}`}
                                label="Aviz de livrare"
                                title="Aviz de livrare (PDF)"
                              />
                            </span>
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
            <span>
              {visible.length} din {shownTotal} comenzi ·{' '}
              {area.view === 'livrari'
                ? 'ordonate după ziua livrării, cele mai îndepărtate sus'
                : 'ordonate după data plasării, cele mai noi sus'}
            </span>
            <span className="inline-flex gap-1.5">
              <button
                type="button"
                className="inline-flex size-[34px] cursor-pointer items-center justify-center rounded-[var(--radius-ctl)] border border-border bg-card text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setQuery({ ...query, page: page - 1 })}
                title="Pagina anterioară"
                aria-label="Pagina anterioară"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex size-[34px] cursor-pointer items-center justify-center rounded-[var(--radius-ctl)] border border-border bg-card text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page >= lastPage}
                onClick={() => setQuery({ ...query, page: page + 1 })}
                title="Pagina următoare"
                aria-label="Pagina următoare"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </span>
          </div>
        </section>
      )}

      {dialog}
      <BulkSelectBar
        select={select}
        entityLabel="comenzi"
        warning="Se șterg și articolele, istoricul, avizul și certificatul de conformitate."
        onPreview={canDelete ? (ids) => ordersApi.bulkDeletePreview(ids) : undefined}
        onDelete={canDelete ? (ids) => ordersApi.bulkDelete(ids) : undefined}
        actions={canUpdate ? bulkActions : undefined}
        onAction={(ids, key, params) => ordersApi.bulkAction(ids, key, params)}
        onDone={async () => {
          await load();
          loadMeta();
        }}
      />
    </div>
  );
}
