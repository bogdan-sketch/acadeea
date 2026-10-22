/**
 * Reads the delivery data written by Pickupia (the WooCommerce delivery-date
 * plugin) — or by its predecessor Scheduled Pickup, same data under `_spw_*`
 * keys — from a Woo REST order. This is the preferred source for imported
 * orders; the legacy free-text "Comanda se ridică…" line-item field is only a
 * fallback (see `extractWooPickupText`).
 *
 * Pickupia writes, per order:
 * - `meta_data._pickupia_delivery_groups`: `[{ method_id, method, external_id, date }]`,
 *   one per (method, date) — `date` is `YYYY-MM-DD`, empty for no-date methods;
 * - `meta_data._pickupia_pickup_date`: the earliest date (`YYYY-MM-DD`);
 * - `meta_data._pickupia_delivery_method_name` / `_external_id`: the first method;
 * and per line item `_pickupia_pickup_date`, `_pickupia_delivery_method` (method
 * post id), `_pickupia_delivery_method_external_id`.
 */

import type { WooLineItem, WooMeta, WooOrder } from './woocommerce.client';

export interface PickupiaGroup {
  /** Method name as shown in the shop ("Ridicare Napoca 15"); may be empty. */
  method: string;
  /** Location id the shop admin set on the method (matches Location.externalId). */
  externalId: string | null;
  /** `YYYY-MM-DD`, or null for a method without a date. */
  date: string | null;
}

export interface PickupiaDelivery {
  /** Distinct (method, date) groups, earliest date first, no-date ones last. */
  groups: PickupiaGroup[];
  /** Earliest delivery date as UTC midnight (same convention as the ro-deadline parser). */
  dueDate: Date | null;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** `YYYY-MM-DD` when valid, else null. */
function isoDay(value: unknown): string | null {
  const s = str(value);
  const m = ISO_DAY.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
    ? s
    : null;
}

/**
 * Meta keys are written as `_pickupia_<name>` by Pickupia and `_spw_<name>` by
 * its predecessor "Scheduled Pickup for WooCommerce" (same data, still live on
 * shops that never upgraded). Callers pass the name without prefix.
 */
const META_PREFIXES = ['_pickupia_', '_spw_'] as const;

function metaValue(metas: WooMeta[] | undefined, name: string): unknown {
  if (!Array.isArray(metas)) return undefined;
  for (const prefix of META_PREFIXES) {
    const hit = metas.find((m) => m?.key === `${prefix}${name}`);
    if (hit) return hit.value;
  }
  return undefined;
}

/** Method label on a line item: Pickupia stores the name under a visible (translated) key. */
function lineItemMethodName(item: WooLineItem): string {
  const metas = Array.isArray(item.meta_data) ? item.meta_data : [];
  for (const m of metas) {
    const key = str(m?.key);
    if (!key || key.startsWith('_')) continue;
    const folded = key.toLowerCase();
    if (folded.includes('metod') || folded.includes('method') || folded.includes('livrare')) {
      // Skip the visible date label ("Data livrării") — its value is a formatted date.
      if (folded.includes('data') || folded.includes('date')) continue;
      const display = str((m as { display_value?: unknown }).display_value) || str(m?.value);
      if (display) return display;
    }
  }
  return '';
}

function fromOrderGroups(order: WooOrder): PickupiaGroup[] {
  const raw = metaValue(order.meta_data as WooMeta[] | undefined, 'delivery_groups');
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map((g) => ({
      method: str(g.method),
      externalId: str(g.external_id) || null,
      date: isoDay(g.date),
    }));
}

function fromLineItems(order: WooOrder): PickupiaGroup[] {
  const items = Array.isArray(order.line_items) ? order.line_items : [];
  const groups: PickupiaGroup[] = [];
  for (const item of items) {
    const metas = item?.meta_data;
    const date = isoDay(metaValue(metas, 'pickup_date'));
    const methodId = str(metaValue(metas, 'delivery_method'));
    const externalId = str(metaValue(metas, 'delivery_method_external_id')) || null;
    if (!date && !methodId && !externalId) continue;
    groups.push({ method: lineItemMethodName(item), externalId, date });
  }
  return groups;
}

function fromOrderSingle(order: WooOrder): PickupiaGroup[] {
  const metas = order.meta_data as WooMeta[] | undefined;
  const date = isoDay(metaValue(metas, 'pickup_date'));
  const method = str(metaValue(metas, 'delivery_method_name'));
  const externalId = str(metaValue(metas, 'delivery_method_external_id')) || null;
  if (!date && !method && !externalId) return [];
  return [{ method, externalId, date }];
}

/**
 * Pickupia delivery data of a Woo order, or null when the order carries none
 * (placed before the plugin, or by a shop without it) — callers then fall back
 * to the legacy free-text pickup field.
 */
export function extractPickupiaDelivery(
  order: WooOrder | null | undefined,
): PickupiaDelivery | null {
  if (!order) return null;

  let groups = fromOrderGroups(order);
  if (groups.length === 0) groups = fromLineItems(order);
  if (groups.length === 0) groups = fromOrderSingle(order);
  if (groups.length === 0) return null;

  // Dedupe (line items repeat their group) and order: dated first, by date.
  const seen = new Set<string>();
  const unique = groups.filter((g) => {
    const key = `${g.date ?? ''}|${g.externalId ?? ''}|${g.method}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => {
    if (a.date === b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : 1;
  });

  // The order-level earliest date wins when the groups have none (no-date methods + old meta).
  const earliest =
    unique.find((g) => g.date)?.date ??
    isoDay(metaValue(order.meta_data as WooMeta[] | undefined, 'pickup_date'));
  const dueDate = earliest ? new Date(`${earliest}T00:00:00.000Z`) : null;

  return { groups: unique, dueDate };
}

/** Distinct method names in group order ("Ridicare Napoca 15 + Livrare la domiciliu"). */
export function pickupiaMethodLabel(delivery: PickupiaDelivery): string | null {
  const names = [...new Set(delivery.groups.map((g) => g.method).filter((m) => m.length > 0))];
  return names.length > 0 ? names.join(' + ') : null;
}
