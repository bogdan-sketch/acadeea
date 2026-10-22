/**
 * Minimal WooCommerce REST (v3) client + helpers for the order-import flow.
 *
 * Credentials live in `Integration.config` (Json). Reading is deliberately
 * lenient about key names (`storeUrl`/`url`, `consumerKey`/`ck`,
 * `consumerSecret`/`cs`) because the config is entered by hand in the admin UI.
 * Auth is HTTP Basic over HTTPS (ck as user, cs as password) — what the
 * WooCommerce v3 REST API expects. Secrets are NEVER logged or put in errors.
 */

export interface WooCredentials {
  /** Store base URL, no trailing slash, e.g. https://shop.example.com */
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface FetchOrdersParams {
  /** ISO-8601 lower bound on `date_created` (WooCommerce `after` filter). */
  after?: string;
  /** Comma-separated WooCommerce status filter (e.g. "processing,completed"). */
  status?: string;
  page: number;
  perPage: number;
}

/**
 * Only paid/fulfilled WooCommerce orders are importable. `pending` (payment
 * pending), `on-hold`, `cancelled`, `refunded`, `failed`, `trash` are not —
 * unfinished checkouts must never become production orders.
 */
export const IMPORTABLE_WOO_STATUSES = ['processing', 'completed'] as const;

/** `status=` query value matching {@link IMPORTABLE_WOO_STATUSES}. */
export const IMPORTABLE_WOO_STATUS_FILTER = IMPORTABLE_WOO_STATUSES.join(',');

/** Whether a Woo order status is importable. Missing status = legacy payload → allowed. */
export function isImportableWooStatus(status: unknown): boolean {
  if (typeof status !== 'string' || status.trim() === '') return true;
  return (IMPORTABLE_WOO_STATUSES as readonly string[]).includes(status.trim().toLowerCase());
}

export interface FetchOrdersResult {
  orders: WooOrder[];
  /** From the `X-WP-TotalPages` response header (>= 1). */
  totalPages: number;
}

/** Only the fields we actually read — WooCommerce sends much more. */
export interface WooOrder {
  id: number;
  status?: string;
  date_created?: string;
  date_created_gmt?: string;
  billing?: WooBilling;
  line_items?: WooLineItem[];
  [key: string]: unknown;
}

export interface WooBilling {
  first_name?: string;
  last_name?: string;
  [key: string]: unknown;
}

export interface WooLineItem {
  id?: number;
  product_id?: number;
  variation_id?: number;
  name?: string;
  quantity?: number;
  meta_data?: WooMeta[];
  [key: string]: unknown;
}

export interface WooMeta {
  key?: string;
  value?: unknown;
  [key: string]: unknown;
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalize a raw `Integration.config` blob into usable credentials.
 * Throws a clear (secret-free) error when a required field is missing.
 */
export function parseWooConfig(config: unknown): WooCredentials {
  const c = (config ?? {}) as Record<string, unknown>;

  const storeUrl = asTrimmedString(c.storeUrl ?? c.url).replace(/\/+$/, '');
  const consumerKey = asTrimmedString(c.consumerKey ?? c.ck);
  const consumerSecret = asTrimmedString(c.consumerSecret ?? c.cs);

  const missing: string[] = [];
  if (!storeUrl) missing.push('storeUrl');
  if (!consumerKey) missing.push('consumerKey');
  if (!consumerSecret) missing.push('consumerSecret');
  if (missing.length > 0) {
    throw new Error(`WooCommerce config missing required field(s): ${missing.join(', ')}`);
  }

  if (!/^https?:\/\//i.test(storeUrl)) {
    throw new Error('WooCommerce storeUrl must be an absolute http(s) URL');
  }

  return { storeUrl, consumerKey, consumerSecret };
}

/**
 * Strip diacritics + lowercase so meta keys like "Comanda se ridică…" match a
 * plain "ridic" needle regardless of accents/casing.
 */
function foldForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[şșŞȘ]/g, 's')
    .replace(/[ţțŢȚ]/g, 't')
    .replace(/[ăâĂÂ]/g, 'a')
    .replace(/[îÎ]/g, 'i')
    .toLowerCase();
}

/**
 * Find the customer-entered pickup deadline on a WooCommerce order. It lives in
 * a `line_items[].meta_data[]` entry whose key contains "ridic" (e.g. "Comanda
 * se ridică de la cofetărie…"). Returns the first matching `.value` as a string,
 * or null when none is present.
 */
export function extractWooPickupText(order: WooOrder | null | undefined): string | null {
  const lineItems = order?.line_items;
  if (!Array.isArray(lineItems)) return null;

  for (const item of lineItems) {
    const metas = item?.meta_data;
    if (!Array.isArray(metas)) continue;
    for (const meta of metas) {
      const key = typeof meta?.key === 'string' ? meta.key : '';
      if (!key || !foldForMatch(key).includes('ridic')) continue;

      const value = meta?.value;
      if (value == null) continue;
      const text = typeof value === 'string' ? value : String(value);
      if (text.trim().length === 0) continue;
      return text;
    }
  }

  return null;
}

/**
 * Customer name from the order's billing block ("first_name last_name"),
 * or null when the store sent neither part.
 */
export function extractWooCustomerName(order: WooOrder | null | undefined): string | null {
  const billing = order?.billing;
  if (!billing || typeof billing !== 'object') return null;
  const first = typeof billing.first_name === 'string' ? billing.first_name.trim() : '';
  const last = typeof billing.last_name === 'string' ? billing.last_name.trim() : '';
  const name = `${first} ${last}`.trim();
  return name.length > 0 ? name : null;
}

export class WooCommerceClient {
  constructor(private readonly creds: WooCredentials) {}

  /**
   * GET a page of orders (oldest first). Reads `X-WP-TotalPages` for pagination.
   * Throws on any non-2xx response — the message carries status + a short body
   * snippet but never the credentials.
   */
  async fetchOrders({
    after,
    status,
    page,
    perPage,
  }: FetchOrdersParams): Promise<FetchOrdersResult> {
    const url = new URL(`${this.creds.storeUrl}/wp-json/wc/v3/orders`);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));
    url.searchParams.set('orderby', 'id');
    url.searchParams.set('order', 'asc');
    if (after) url.searchParams.set('after', after);
    if (status) url.searchParams.set('status', status);

    const auth = Buffer.from(`${this.creds.consumerKey}:${this.creds.consumerSecret}`).toString(
      'base64',
    );

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      let snippet = '';
      try {
        snippet = (await res.text()).slice(0, 200);
      } catch {
        // ignore — body is best-effort context only
      }
      throw new Error(
        `WooCommerce API request failed: ${res.status} ${res.statusText}${
          snippet ? ` — ${snippet}` : ''
        }`,
      );
    }

    const totalPages = Number.parseInt(res.headers.get('x-wp-totalpages') ?? '1', 10) || 1;
    const body = (await res.json()) as unknown;
    const orders = Array.isArray(body) ? (body as WooOrder[]) : [];

    return { orders, totalPages };
  }
}
