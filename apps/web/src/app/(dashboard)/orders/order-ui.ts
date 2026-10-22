import { addDays, format, isToday, isTomorrow, isYesterday, isBefore, startOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';
import { OrderStatus } from '@/lib/types';
import type { Order } from '@/lib/types';
import { hasTimeOfDay } from '@/components/time-of-day';
import { formatQty, formatUnitQty } from '@/lib/utils';

/** Dot + pill classes per status (design: Nouă = accent, rest = semantic tokens). */
export const statusTone: Record<OrderStatus, { dot: string; pill: string }> = {
  [OrderStatus.NOUA]: { dot: 'bg-primary', pill: 'bg-accent text-primary' },
  [OrderStatus.IN_PREGATIRE]: {
    dot: 'bg-[var(--st-blue)]',
    pill: 'bg-[var(--st-blue-bg)] text-[var(--st-blue)]',
  },
  [OrderStatus.PREGATITA]: {
    dot: 'bg-[var(--st-green)]',
    pill: 'bg-[var(--st-green-bg)] text-[var(--st-green)]',
  },
  [OrderStatus.IN_TRANZIT]: {
    dot: 'bg-[var(--st-orange)]',
    pill: 'bg-[var(--st-orange-bg)] text-[var(--st-orange)]',
  },
  [OrderStatus.LIVRATA]: {
    dot: 'bg-[var(--st-gray)]',
    pill: 'bg-[var(--st-gray-bg)] text-[var(--st-gray)]',
  },
  [OrderStatus.ANULATA]: {
    dot: 'bg-[var(--st-red)]',
    pill: 'bg-[var(--st-red-bg)] text-[var(--st-red)]',
  },
};

export const statusOrder: OrderStatus[] = [
  OrderStatus.NOUA,
  OrderStatus.IN_PREGATIRE,
  OrderStatus.PREGATITA,
  OrderStatus.IN_TRANZIT,
  OrderStatus.LIVRATA,
  OrderStatus.ANULATA,
];

export const isClosed = (s: OrderStatus) => s === OrderStatus.LIVRATA || s === OrderStatus.ANULATA;

/** Orders imported from the site carry the WOO- prefix; manual ones CMD-. */
export const isSiteOrder = (o: Pick<Order, 'orderNumber'>) => o.orderNumber.startsWith('WOO-');

/** One item as the team reads it: "Macarons ×12" / "Tort vis de fistic 1 kg". */
export function orderItemLabel(i: Order['items'][number]): string {
  const name = i.label || i.recipeName;
  return !i.unit || i.unit === 'BUCATI'
    ? `${name} ×${formatQty(i.quantity)}`
    : `${name} ${formatUnitQty(i.quantity, i.unit)}`;
}

/**
 * What was ordered — the order's title everywhere (lists, calendars, cards):
 * "Tort vis de fistic 1 kg · Macarons ×12 +2". The WooCommerce/CMD number is
 * irrelevant to the team and only appears on the detail page and in search.
 */
export function orderTitle(o: Pick<Order, 'items'>): string {
  const items = o.items ?? [];
  if (!items.length) return 'Comandă fără produse';
  const head = items.slice(0, 2).map(orderItemLabel).join(' · ');
  return items.length > 2 ? `${head} +${items.length - 2}` : head;
}

/**
 * Who ordered: customer name, falling back to the delivery point. Imported
 * Woo delivery orders get `deliveryPoint` = the shop delivery method name —
 * that is not a customer, so it is skipped (it shows as "Metodă" instead).
 */
export function orderCustomer(
  o: Pick<Order, 'customerName' | 'deliveryPoint'> & { deliveryMethod?: string | null },
): string {
  const point = deliveryPointLabel(o);
  return o.customerName?.trim() || point || '';
}

/** The delivery point, unless it merely repeats the shop delivery method. */
export function deliveryPointLabel(
  o: Pick<Order, 'deliveryPoint'> & { deliveryMethod?: string | null },
): string {
  const point = o.deliveryPoint?.trim() || '';
  return point && point !== o.deliveryMethod?.trim() ? point : '';
}

/** "Comanda 11644" (site) / "Comanda CMD-…" (manual) — detail-page meta only. */
export function orderNumberMeta(o: Pick<Order, 'orderNumber'>): string {
  return `Comanda ${o.orderNumber.replace(/^WOO-/, '')}`;
}

/** Pickup/delivery is not stored by the API; an address is the only sure sign of delivery. */
export function modeLabel(o: Pick<Order, 'deliveryAddress' | 'fulfillmentType'>): string {
  if (o.fulfillmentType === 'PICKUP') return 'Ridicare';
  if (o.fulfillmentType === 'DELIVERY') return 'Livrare';
  return o.deliveryAddress ? 'Livrare' : '—';
}

/**
 * "azi 11:30" / "mâine 10:00" / "ieri 09:00" / "sâm 18 oct, 12:00" / "14 oct, 12:00".
 * Date-only due dates (midnight) show no time at all (QA M1).
 */
export function termLabel(iso: string | undefined | null): { text: string; today: boolean } {
  if (!iso) return { text: '—', today: false };
  const d = new Date(iso);
  const hm = hasTimeOfDay(d) ? ` ${format(d, 'HH:mm')}` : '';
  if (isToday(d)) return { text: `azi${hm}`, today: true };
  if (isTomorrow(d)) return { text: `mâine${hm}`, today: false };
  if (isYesterday(d)) return { text: `ieri${hm}`, today: false };
  const soon =
    !isBefore(d, startOfDay(new Date())) && isBefore(d, addDays(startOfDay(new Date()), 7));
  const day = format(d, soon ? 'EEE d MMM' : 'd MMM', { locale: ro }).replace('.', '');
  return { text: hm ? `${day},${hm}` : day, today: false };
}

/** "azi, 08:12" / "ieri, 08:12" / "14 oct, 08:12". */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const hm = format(d, 'HH:mm');
  if (isToday(d)) return `azi, ${hm}`;
  if (isYesterday(d)) return `ieri, ${hm}`;
  return `${format(d, 'd MMM', { locale: ro })}, ${hm}`;
}
