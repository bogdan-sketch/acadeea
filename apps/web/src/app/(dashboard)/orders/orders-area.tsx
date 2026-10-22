'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { format, parseISO } from 'date-fns';
import { ro } from 'date-fns/locale';
import { ListFilter, Pencil, Save } from 'lucide-react';
import { toast } from 'sonner';
import { orders as ordersApi } from '@/lib/api';
import type { DeliveryMethodKind, DeliveryMethodSummary, Order, OrderView } from '@/lib/types';
import { OrderStatus } from '@/lib/types';
import { orderStatusLabels } from '@/lib/constants';
import { bucharestDayKey, cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Hint } from '@/components/hint';
import { usePermissions } from '@/contexts/auth-context';
import { useWooDeliveryEnabled } from '@/hooks/use-woo-delivery';
import { IconAction, Pill } from '../stock/_ui/parts';
import { PillStrip } from '@/components/pinned-filters';
import { statusOrder, statusTone } from './order-ui';

// ---------------------------------------------------------------------------
// Shared orders-area state (list ⇄ calendar): Pregătiri/Intrări, method filter
// and status filter. Module-level so it survives client-side navigation between
// the two routes; a full reload starts again from the defaults (Pregătiri,
// Toate, only Nouă). The method filter is exclusive: Toate | one method | the
// Livrare kind. Statuses: null = Toate (no filter), else a non-empty subset.
// ---------------------------------------------------------------------------

type AreaState = {
  view: OrderView;
  method: string | null;
  kind: DeliveryMethodKind | null;
  statuses: OrderStatus[] | null;
};
/** Default status filter: only "Nouă". */
export const DEFAULT_STATUSES: OrderStatus[] = [OrderStatus.NOUA];
const DEFAULT_STATE: AreaState = {
  view: 'livrari',
  method: null,
  kind: null,
  statuses: DEFAULT_STATUSES,
};
let areaState: AreaState = DEFAULT_STATE;
const listeners = new Set<() => void>();

function setAreaState(patch: Partial<AreaState>) {
  areaState = { ...areaState, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export interface OrdersArea {
  view: OrderView;
  setView: (v: OrderView) => void;
  /** Selected delivery-method `name`, only while the woo-delivery switch is on. */
  method: string | null;
  /** Select one method (clears the kind filter); null = Toate. */
  setMethod: (m: string | null) => void;
  /** Selected kind ("Livrare" chip = DELIVERY), only while the switch is on. */
  deliveryKind: DeliveryMethodKind | null;
  /** Select a kind (clears the method filter); null = Toate. */
  setDeliveryKind: (k: DeliveryMethodKind | null) => void;
  wooEnabled: boolean;
  /** Delivery methods (empty while the switch is off). */
  methods: DeliveryMethodSummary[];
  setMethods: (m: DeliveryMethodSummary[]) => void;
  /** Re-fetch the delivery methods (call on every list/calendar reload). Stable. */
  refreshMethods: () => void;
  /** Status filter (in `statusOrder` order); null = Toate. */
  statuses: OrderStatus[] | null;
  /** Set the status filter; empty / all six = Toate (null). */
  setStatuses: (s: OrderStatus[] | null) => void;
}

export function useOrdersArea(): OrdersArea {
  const state = useSyncExternalStore(
    subscribe,
    () => areaState,
    () => DEFAULT_STATE,
  );
  const wooEnabled = useWooDeliveryEnabled();
  const methods = useDeliveryMethods(wooEnabled);

  // After a (re)fetch: a selection that no longer matches any method falls back to Toate.
  const { list, loaded } = methods;
  useEffect(() => {
    if (!loaded) return;
    const s = areaState;
    if (s.method && !list.some((m) => m.name === s.method)) setAreaState({ method: null });
    if (s.kind && !list.some((m) => m.kind === s.kind)) setAreaState({ kind: null });
  }, [list, loaded]);

  return {
    view: state.view,
    setView: useCallback((view: OrderView) => setAreaState({ view }), []),
    method: wooEnabled ? state.method : null,
    setMethod: useCallback((method: string | null) => setAreaState({ method, kind: null }), []),
    deliveryKind: wooEnabled ? state.kind : null,
    setDeliveryKind: useCallback(
      (kind: DeliveryMethodKind | null) => setAreaState({ kind, method: null }),
      [],
    ),
    wooEnabled,
    methods: methods.list,
    setMethods: methods.setList,
    refreshMethods: methods.refresh,
    statuses: state.statuses,
    setStatuses: useCallback((s: OrderStatus[] | null) => {
      const picked = s ? statusOrder.filter((x) => s.includes(x)) : [];
      setAreaState({
        statuses: picked.length === 0 || picked.length === statusOrder.length ? null : picked,
      });
    }, []),
  };
}

/** Status filter differs from the default (only Nouă). */
export function statusesChanged(s: OrderStatus[] | null): boolean {
  return !s || s.length !== DEFAULT_STATUSES.length || s.some((x) => !DEFAULT_STATUSES.includes(x));
}

/** "Nouă" / "Nouă, Pregătită" / "Toate statusurile". */
export function statusesLabel(s: OrderStatus[] | null): string {
  return s ? s.map((x) => orderStatusLabels[x]).join(', ') : 'Toate statusurile';
}

/** `GET /orders/delivery-methods` when `enabled` (on mount + `refresh()`); empty otherwise. */
export function useDeliveryMethods(enabled: boolean) {
  const [list, setRawList] = useState<DeliveryMethodSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  const setList = useCallback((l: DeliveryMethodSummary[]) => {
    setRawList(l);
    setLoaded(true);
  }, []);
  const refresh = useCallback(() => {
    if (!enabledRef.current) return;
    ordersApi
      .deliveryMethods()
      .then(setList)
      .catch(() => {});
  }, [setList]);
  useEffect(() => {
    if (!enabled) return;
    ordersApi
      .deliveryMethods()
      .then(setList)
      .catch(() => {});
  }, [enabled, setList]);
  return { list: enabled ? list : [], loaded: enabled && loaded, setList, refresh };
}

/** "A + B" → each part mapped name → label (short name), joined back with " + ". */
export function deliveryMethodLabel(
  raw: string | null | undefined,
  methods: DeliveryMethodSummary[],
): string {
  if (!raw) return '';
  if (!methods.length) return raw;
  const byName = new Map(methods.map((m) => [m.name, m.label]));
  return raw
    .split(' + ')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => byName.get(p) ?? p)
    .join(' + ');
}

// ---------------------------------------------------------------------------
// Day groups (list): future days → Mâine → Azi → Ieri → Mai vechi.
// ---------------------------------------------------------------------------

/** Bucharest `YYYY-MM-DD` shifted by `days`. */
function shiftDayKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The day an order belongs to in a view (pregătiri: undated = today). */
export function orderDayKey(o: Order, view: OrderView, todayKey: string): string {
  if (view === 'intrari') return bucharestDayKey(o.createdAt);
  return o.dueDate ? bucharestDayKey(o.dueDate) : todayKey;
}

export interface OrderDayGroup {
  /** Day key, or `older` for the single "Mai vechi" group. */
  key: string;
  label: string;
  isToday: boolean;
  orders: Order[];
}

const OLDER = 'older';

export function groupOrdersByDay(orders: Order[], view: OrderView, now = new Date()) {
  const today = bucharestDayKey(now);
  const tomorrow = shiftDayKey(today, 1);
  const yesterday = shiftDayKey(today, -1);
  const groups = new Map<string, OrderDayGroup>();
  for (const o of orders) {
    const day = orderDayKey(o, view, today);
    const key = day < yesterday ? OLDER : day;
    let g = groups.get(key);
    if (!g) {
      let label: string;
      if (key === OLDER) label = 'Mai vechi';
      else if (key === today) label = 'Azi';
      else if (key === tomorrow) label = 'Mâine';
      else if (key === yesterday) label = 'Ieri';
      else {
        const d = parseISO(key);
        const sameYear = key.slice(0, 4) === today.slice(0, 4);
        label = format(d, sameYear ? 'EEEE, d MMM' : 'EEEE, d MMM yyyy', { locale: ro }).replace(
          '.',
          '',
        );
      }
      g = { key, label, isToday: key === today, orders: [] };
      groups.set(key, g);
    }
    g.orders.push(o);
  }
  // Day keys sort lexicographically; "older" goes last.
  return [...groups.values()].sort((a, b) => {
    if (a.key === b.key) return 0;
    if (a.key === OLDER) return 1;
    if (b.key === OLDER) return -1;
    return a.key < b.key ? 1 : -1;
  });
}

/** Group the list should bring into focus: Azi, else the nearest one after it (older). */
export function focusGroupKey(groups: OrderDayGroup[], now = new Date()): string | null {
  const today = bucharestDayKey(now);
  const hit = groups.find((g) => g.key === OLDER || g.key <= today);
  return hit?.key ?? null;
}

// ---------------------------------------------------------------------------
// UI: the bar at the top of the orders area.
// ---------------------------------------------------------------------------

// Pregătiri (API view=livrari) comes first and is the default.
const VIEWS: { key: OrderView; label: string; hint: string }[] = [
  { key: 'livrari', label: 'Pregătiri', hint: 'După ziua livrării, cele mai îndepărtate sus' },
  { key: 'intrari', label: 'Intrări', hint: 'După ziua plasării, cele mai noi sus' },
];

export const segBtn = (on: boolean) =>
  `inline-flex h-9 cursor-pointer items-center rounded-[9px] px-3 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 ${
    on
      ? 'bg-card text-foreground shadow-(--shadow-card-sm)'
      : 'text-muted-foreground hover:text-foreground'
  }`;

export function OrderViewSwitch({ area }: { area: OrdersArea }) {
  return (
    <div
      role="group"
      aria-label="Vizualizare comenzi"
      className="inline-flex h-[42px] flex-none items-center gap-0.5 rounded-[var(--radius-ctl)] bg-muted p-[3px]"
    >
      {VIEWS.map((v) => (
        <Hint key={v.key} label={v.label} detail={v.hint}>
          <button
            type="button"
            aria-pressed={area.view === v.key}
            onClick={() => area.setView(v.key)}
            className={segBtn(area.view === v.key)}
          >
            {v.label}
          </button>
        </Hint>
      ))}
    </div>
  );
}

/**
 * Delivery-method chips — Toate · each Ridicare method · Livrare (kind) · each
 * Livrare method (only when 2+) — horizontally scrolling, long names
 * truncated, exactly one selected; + the admin "Metode" editor. Renders
 * nothing while the woo-delivery switch is off or no order carries a method yet.
 */
export function DeliveryMethodFilter({ area }: { area: OrdersArea }) {
  const { can } = usePermissions();
  const [editing, setEditing] = useState(false);
  if (!area.wooEnabled || area.methods.length === 0) return null;
  const canEdit = can('manage', 'Organization');
  const pickup = area.methods.filter((m) => m.kind === 'PICKUP');
  const delivery = area.methods.filter((m) => m.kind === 'DELIVERY');
  const deliveryCount = delivery.reduce((n, m) => n + m.count, 0);
  const kindOn = area.deliveryKind === 'DELIVERY';
  const methodChip = (m: DeliveryMethodSummary) => {
    const on = area.method === m.name;
    return (
      <Pill
        key={m.name}
        on={on}
        title={m.label === m.name ? m.name : `${m.label} — ${m.name}`}
        onClick={() => area.setMethod(on ? null : m.name)}
      >
        <span className="max-w-[180px] truncate">{m.label}</span>
        <ChipCount on={on} n={m.count} />
      </Pill>
    );
  };
  return (
    <div className="flex min-w-0 items-center gap-2">
      <PillStrip label="Metodă de livrare" className="flex-1">
        <Pill
          on={area.method === null && area.deliveryKind === null}
          onClick={() => area.setMethod(null)}
        >
          Toate
        </Pill>
        {pickup.map(methodChip)}
        {delivery.length > 0 && (
          <Pill
            on={kindOn}
            title="Toate comenzile cu livrare la adresă"
            onClick={() => area.setDeliveryKind(kindOn ? null : 'DELIVERY')}
          >
            Livrare
            <ChipCount on={kindOn} n={deliveryCount} />
          </Pill>
        )}
        {delivery.length > 1 && delivery.map(methodChip)}
      </PillStrip>
      {canEdit && (
        <IconAction
          icon={Pencil}
          word="Metode"
          label="Metode de livrare: nume scurte și tip"
          title="Nume scurte și tipul (Ridicare / Livrare) pentru metodele de livrare"
          onClick={() => setEditing(true)}
        />
      )}
      {canEdit && (
        <DeliveryMethodNamesDialog
          open={editing}
          onOpenChange={setEditing}
          methods={area.methods}
          onSaved={area.setMethods}
        />
      )}
    </div>
  );
}

/**
 * Status filter (head, next to the calendar icon): multi-select of the six
 * statuses + "Toate". Default = only Nouă; a dot on the icon marks any other
 * selection. Shared by the list and the calendar through the area store.
 */
export function OrderStatusFilter({
  area,
  counts,
  disabled,
}: {
  area: OrdersArea;
  /** Optional per-status counts shown in the menu. */
  counts?: Partial<Record<OrderStatus, number>>;
  disabled?: boolean;
}) {
  const changed = statusesChanged(area.statuses);
  const all = area.statuses === null;
  const toggle = (s: OrderStatus, on: boolean) => {
    const cur = area.statuses ?? [];
    area.setStatuses(on ? [...cur, s] : cur.filter((x) => x !== s));
  };
  return (
    <DropdownMenu>
      <Hint label="Filtru status" detail={`Afișezi: ${statusesLabel(area.statuses)}`}>
        <DropdownMenuTrigger
          disabled={disabled}
          aria-label={`Filtru status: ${statusesLabel(area.statuses)}`}
          className="relative inline-flex h-[42px] flex-none cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-ctl)] border border-border bg-card pl-3 pr-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ListFilter className="h-[18px] w-[18px]" />
          <span>Status</span>
          {changed && (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 size-2.5 rounded-full bg-primary ring-2 ring-background"
            />
          )}
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" sideOffset={6} className="w-56 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Arată comenzile</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={all}
            closeOnClick={false}
            onCheckedChange={(on) => area.setStatuses(on ? null : DEFAULT_STATUSES)}
            className="py-1.5 font-semibold"
          >
            Toate
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {statusOrder.map((s) => (
            <DropdownMenuCheckboxItem
              key={s}
              checked={!all && (area.statuses?.includes(s) ?? false)}
              closeOnClick={false}
              onCheckedChange={(on) => toggle(s, on)}
              className="py-1.5"
            >
              <span aria-hidden className={`size-2 rounded-full ${statusTone[s].dot}`} />
              <span className="flex-1">{orderStatusLabels[s]}</span>
              {counts?.[s] !== undefined && (
                <span className="text-[11px] font-bold text-muted-foreground">{counts[s]}</span>
              )}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {changed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => area.setStatuses(DEFAULT_STATUSES)}
              className="py-1.5 text-muted-foreground"
            >
              Revino la implicit (doar Nouă)
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChipCount({ on, n }: { on: boolean; n: number }) {
  return (
    <span
      className={`text-[11px] font-bold ${on ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
    >
      {n}
    </span>
  );
}

function DeliveryMethodNamesDialog({
  open,
  onOpenChange,
  methods,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  methods: DeliveryMethodSummary[];
  onSaved: (list: DeliveryMethodSummary[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto rounded-2xl p-6 sm:max-w-[520px]"
        description="Nume scurte și tipul (Ridicare / Livrare) pentru metodele de livrare din magazin."
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Metode de livrare</DialogTitle>
          <p className="text-[13px] text-muted-foreground">
            Numele scurt apare în filtre și pe comenzi în locul denumirii din magazin (gol = numele
            implicit). Tipul decide dacă metoda apare ca ridicare sau sub „Livrare”.
          </p>
        </DialogHeader>
        <div className="flex flex-col divide-y divide-border">
          {methods.map((m) => (
            <MethodNameRow key={m.name} method={m} onSaved={onSaved} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const KINDS: { key: DeliveryMethodKind; label: string }[] = [
  { key: 'PICKUP', label: 'Ridicare' },
  { key: 'DELIVERY', label: 'Livrare' },
];

/** Default label when no short name is set (mirrors the server's strip). */
function defaultLabel(m: DeliveryMethodSummary): string {
  if (!m.shortName) return m.label;
  return m.name.replace(/^\s*ridicare\s+(?:de\s+la|la|din)\s+/i, '').trim() || m.name;
}

function MethodNameRow({
  method,
  onSaved,
}: {
  method: DeliveryMethodSummary;
  onSaved: (list: DeliveryMethodSummary[]) => void;
}) {
  const [value, setValue] = useState(method.shortName ?? '');
  const [saving, setSaving] = useState(false);
  const [savingKind, setSavingKind] = useState(false);
  const dirty = value.trim() !== (method.shortName ?? '');
  const save = async () => {
    setSaving(true);
    try {
      const list = await ordersApi.setDeliveryMethodAlias(method.name, {
        shortName: value.trim() || null,
      });
      onSaved(list);
      toast.success(value.trim() ? 'Nume scurt salvat' : 'Nume scurt șters');
    } catch {
      toast.error('Eroare la salvare');
    } finally {
      setSaving(false);
    }
  };
  const saveKind = async (kind: DeliveryMethodKind | null) => {
    setSavingKind(true);
    try {
      const list = await ordersApi.setDeliveryMethodAlias(method.name, { kind });
      onSaved(list);
      toast.success(kind ? 'Tip salvat' : 'Tip detectat automat');
    } catch {
      toast.error('Eroare la salvare');
    } finally {
      setSavingKind(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-1.5 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !saving) save();
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 break-words text-[12px] font-medium text-muted-foreground">
          {method.name}
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
          {method.count} {method.count === 1 ? 'comandă' : 'comenzi'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          maxLength={40}
          placeholder={defaultLabel(method)}
          aria-label={`Nume scurt pentru ${method.name}`}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="submit"
          disabled={!dirty || saving}
          aria-label={`Salvează numele scurt pentru ${method.name}`}
          className={cn(
            'inline-flex h-9 flex-none cursor-pointer items-center gap-1.5 rounded-[var(--radius-ctl)] px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            'bg-primary text-primary-foreground hover:bg-primary-pressed',
          )}
        >
          <Save className="size-4" />
          Salvează
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div
          role="group"
          aria-label={`Tipul metodei ${method.name}`}
          className="inline-flex h-[38px] flex-none items-center gap-0.5 rounded-[var(--radius-ctl)] bg-muted p-[3px]"
        >
          {KINDS.map((k) => {
            const on = method.kind === k.key;
            return (
              <button
                key={k.key}
                type="button"
                aria-pressed={on}
                disabled={savingKind}
                onClick={() => {
                  if (!on || !method.kindSet) saveKind(k.key);
                }}
                className={cn(segBtn(on), 'h-8 disabled:cursor-wait')}
              >
                {k.label}
              </button>
            );
          })}
        </div>
        {method.kindSet ? (
          <button
            type="button"
            disabled={savingKind}
            onClick={() => saveKind(null)}
            title="Revino la tipul detectat automat"
            className="cursor-pointer text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-wait"
          >
            Automat
          </button>
        ) : (
          <span
            className="text-[11px] font-semibold text-muted-foreground"
            title="Tip detectat automat din denumire"
          >
            auto
          </span>
        )}
      </div>
    </form>
  );
}
