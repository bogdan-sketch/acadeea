/**
 * Order list views + delivery-method helpers shared by the list, calendar and
 * delivery-method summary endpoints.
 *
 * - `intrari` (default): newest placed first (createdAt desc).
 * - `livrari`: by delivery day, the furthest in the future first; an order
 *   without a due date counts as due TODAY (clients group it under "Azi").
 */

import { Prisma } from '@prisma/client';

export const ORDER_VIEWS = ['intrari', 'livrari'] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];

/** Separator the WooCommerce import uses when an order has several methods. */
export const DELIVERY_METHOD_SEPARATOR = ' + ';

const BUCHAREST_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` of the Romanian calendar day the instant falls on. */
export function bucharestDayKey(date: Date): string {
  return BUCHAREST_DAY.format(date);
}

/** "A + B" → ["A", "B"] (trimmed, no blanks). */
export function splitDeliveryMethods(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(DELIVERY_METHOD_SEPARATOR)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Orders whose delivery method is exactly `name` or contains it as one of the
 * " + "-joined parts — never a substring match ("Livrare în Cluj" must not
 * pick up "Livrare în Cluj-Napoca").
 */
export function deliveryMethodWhere(name: string): Prisma.OrderWhereInput {
  const sep = DELIVERY_METHOD_SEPARATOR;
  return {
    OR: [
      { deliveryMethod: name },
      { deliveryMethod: { startsWith: `${name}${sep}` } },
      { deliveryMethod: { endsWith: `${sep}${name}` } },
      { deliveryMethod: { contains: `${sep}${name}${sep}` } },
    ],
  };
}

export interface DeliverySortable {
  id: string;
  dueDate: Date | null;
  createdAt: Date;
}

/** Livrări order: delivery day desc (no date = today), then due time desc, then newest placed. */
export function sortForDeliveries<T extends DeliverySortable>(rows: T[], now = new Date()): T[] {
  const today = bucharestDayKey(now);
  const keyed = rows.map((row) => ({
    row,
    day: row.dueDate ? bucharestDayKey(row.dueDate) : today,
    // Undated orders sit with today's, after the timed ones of today.
    time: row.dueDate?.getTime() ?? -Infinity,
  }));
  keyed.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    if (a.time !== b.time) return b.time > a.time ? 1 : -1;
    return b.row.createdAt.getTime() - a.row.createdAt.getTime();
  });
  return keyed.map((k) => k.row);
}

const PICKUP_PREFIX = /^ridicare\s+(?:de\s+la|la|din)\s+/i;

/**
 * Label shown for a method without an admin short name: the pickup prefix is
 * implied by the filter, so "Ridicare la Acadeea Napoca" → "Acadeea Napoca".
 */
export function defaultDeliveryLabel(name: string): string {
  const stripped = name.replace(PICKUP_PREFIX, '').trim();
  if (!stripped) return name;
  return stripped.charAt(0).toLocaleUpperCase('ro') + stripped.slice(1);
}

/**
 * Ridicare vs Livrare for a method without an admin assignment: what its
 * orders resolved to on import (a matched pickup location makes them PICKUP),
 * else the name ("Ridicare …" = pickup).
 */
export function autoDeliveryKind(
  name: string,
  pickupOrders: number,
  deliveryOrders: number,
): 'PICKUP' | 'DELIVERY' {
  if (pickupOrders > deliveryOrders) return 'PICKUP';
  return /^ridicare\b/i.test(name.trim()) ? 'PICKUP' : 'DELIVERY';
}
