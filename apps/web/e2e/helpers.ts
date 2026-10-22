import { readFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import {
  expect,
  request,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { API_URL, QA_PREFIX, STORAGE_STATE } from './constants';

export { QA_PREFIX };

/** Marker of THIS suite's rows (other agents also use `QA-E2E-`). */
export const WEB_PREFIX = `${QA_PREFIX}web-`;

/** `QA-E2E-web-<label>-<d|m><time>` — unique per project and run. */
export function qaName(testInfo: TestInfo, label: string): string {
  const proj = testInfo.project.name === 'iphone' ? 'm' : 'd';
  const stamp = (Date.now() + Math.floor(Math.random() * 1000)).toString(36).slice(-5);
  return `${WEB_PREFIX}${label}-${proj}${stamp}`;
}

export const isMobile = (testInfo: TestInfo) => testInfo.project.name === 'iphone';

// ---------------------------------------------------------------------------
// API client for setup/cleanup. Reuses the access token captured by the setup
// project (valid 12h) and NEVER refreshes: refresh rotates the token and would
// log the browser contexts out.
// ---------------------------------------------------------------------------
function accessToken(): string {
  const state = JSON.parse(readFileSync(STORAGE_STATE, 'utf8')) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  for (const o of state.origins) {
    const hit = o.localStorage.find((e) => e.name === 'accessToken');
    if (hit) return hit.value;
  }
  throw new Error('No accessToken in storage state — did the setup project run?');
}

export class Api {
  private constructor(private readonly ctx: APIRequestContext) {}

  static async create(): Promise<Api> {
    const ctx = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${accessToken()}` },
    });
    return new Api(ctx);
  }

  /** fetch with a short retry on gateway errors (the test API restarts on deploy). */
  private async fetch(method: string, path: string, data?: unknown) {
    for (let attempt = 0; ; attempt++) {
      const res = await this.ctx.fetch(`/api/v1${path}`, { method, data });
      if (![502, 503, 504].includes(res.status()) || attempt >= 4) return res;
      await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    const res = await this.fetch('GET', path);
    if (!res.ok())
      throw new Error(`GET ${path} → ${res.status()} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  async send(method: 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown) {
    const res = await this.fetch(method, path, data);
    return { ok: res.ok(), status: res.status(), body: await res.text() };
  }

  /** Discard every DRAFT sales deduction this suite uploaded. */
  async discardQaSalesDrafts() {
    const list = await this.get<{
      data: { id: string; status: string; fileName: string | null }[];
    }>('/sales-deductions?page=1&limit=50');
    for (const d of list.data) {
      if (d.status === 'DRAFT' && (d.fileName ?? '').startsWith(WEB_PREFIX)) {
        await this.send('POST', `/sales-deductions/${d.id}/discard`);
      }
    }
  }

  async post<T = Record<string, unknown>>(path: string, data: unknown): Promise<T> {
    const r = await this.send('POST', path, data);
    if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${r.body.slice(0, 300)}`);
    return JSON.parse(r.body) as T;
  }

  // ---- fixtures -----------------------------------------------------------
  async locations(): Promise<{ id: string; name: string; isDefault?: boolean }[]> {
    return this.get('/locations');
  }

  /** Stock intake (INTRARE) at a location — gives a QA material something to consume. */
  async receive(rawMaterialId: string, quantity: number, locationId: string) {
    return this.post('/stock/movements', {
      movementType: 'INTRARE',
      rawMaterialId,
      quantity,
      unit: 'KILOGRAME',
      locationId,
      lotNumber: 'QA-E2E-LOT',
      purchasePrice: 10,
      priceIncludesVat: true,
      referenceNote: 'QA-E2E intake',
    });
  }

  async defaultLocation() {
    const locs = await this.locations();
    return locs.find((l) => l.isDefault) ?? locs.find((l) => /Napoca/.test(l.name)) ?? locs[0];
  }

  /** QA raw material in kg. */
  async createRawMaterial(title: string, extra: Record<string, unknown> = {}) {
    return this.post<{ id: string; title: string }>('/raw-materials', {
      title,
      unit: 'KILOGRAME',
      ...extra,
    });
  }

  async createConsumable(title: string) {
    return this.post<{ id: string; title: string }>('/consumables', { title });
  }

  /** Final-product recipe (buc) with one ingredient of `rawMaterialId`. */
  async createRecipe(name: string, rawMaterialId: string, extra: Record<string, unknown> = {}) {
    return this.post<{ id: string; name: string }>('/recipes', {
      name,
      type: 'FINAL',
      unit: 'BUCATI',
      yieldQuantity: 4,
      components: [
        {
          name: 'Principal',
          sortOrder: 0,
          ingredients: [
            { rawMaterialId, name: 'QA', quantity: 0.1, unit: 'KILOGRAME', sortOrder: 0 },
          ],
        },
      ],
      ...extra,
    });
  }

  // ---- teardown -----------------------------------------------------------
  /** Delete a recipe; when it is referenced (orders/tasks) archive it instead. */
  async removeRecipe(id: string): Promise<'deleted' | 'archived' | 'failed'> {
    const del = await this.send('DELETE', `/recipes/${id}`);
    if (del.ok || del.status === 404) return 'deleted';
    // Only our own QA tasks/stock reference it (orders were deleted first).
    const preview = await this.send('POST', '/recipes/bulk-delete/preview', { ids: [id] });
    const deps = preview.ok
      ? (JSON.parse(preview.body) as { dependents: { key: string; count: number }[] }).dependents
      : [{ key: 'unknown', count: 1 }];
    const orderLines = deps.filter((d) => /order/i.test(d.key)).reduce((n, d) => n + d.count, 0);
    if (preview.ok && orderLines === 0) {
      const bulk = await this.send('POST', '/recipes/bulk-delete', { ids: [id], cascade: true });
      if (bulk.ok) return 'deleted';
    }
    const arch = await this.send('PATCH', `/recipes/${id}/archive`, { archived: true });
    if (arch.ok) {
      console.warn(`[cleanup] recipe ${id} is referenced — archived instead (${del.status})`);
      return 'archived';
    }
    return 'failed';
  }

  /**
   * Permanent delete of OUR material (bulk-delete cascade drops its lots,
   * movements and the ingredient lines of our QA recipes). The plain DELETE
   * only marks it "Întrerupt".
   */
  async removeRawMaterial(id: string) {
    const r = await this.send('POST', '/raw-materials/bulk-delete', { ids: [id], cascade: true });
    if (!r.ok) throw new Error(`raw material ${id}: ${r.status} ${r.body.slice(0, 200)}`);
  }

  async removeConsumable(id: string) {
    const r = await this.send('POST', '/consumables/bulk-delete', { ids: [id], cascade: true });
    if (!r.ok) throw new Error(`consumable ${id}: ${r.status} ${r.body.slice(0, 200)}`);
  }

  async removeTasks(ids: string[]) {
    if (ids.length) await this.send('POST', '/tasks/bulk-delete', { ids, cascade: true });
  }

  async removeOrders(ids: string[]) {
    if (ids.length) await this.send('POST', '/orders/bulk-delete', { ids, cascade: true });
  }

  /** Paginated list → rows whose `name`/other field starts with the QA prefix. */
  async listQa<T extends Record<string, unknown>>(
    path: string,
    field: keyof T = 'name' as keyof T,
    extra = '',
  ): Promise<T[]> {
    const sep = path.includes('?') ? '&' : '?';
    const body = await this.get<{ data: T[] } | T[]>(
      `${path}${sep}search=${encodeURIComponent(WEB_PREFIX)}&limit=100${extra}`,
    );
    const rows = Array.isArray(body) ? body : body.data;
    return rows.filter((r) => String(r[field] ?? '').startsWith(WEB_PREFIX));
  }

  async dispose() {
    await this.ctx.dispose();
  }
}

/** Best-effort: run every cleanup step even when one throws, log what failed. */
export async function cleanup(label: string, steps: (() => Promise<unknown>)[]) {
  for (const step of steps) {
    try {
      await step();
    } catch (e) {
      console.warn(`[cleanup:${label}]`, (e as Error).message.slice(0, 300));
    }
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
/** A real `size`×`size` RGB PNG, generated in memory (no fixture file). */
export function makePng(size = 16, rgb: [number, number, number] = [214, 92, 64]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3).fill(Buffer.from(rgb))]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
/** The page's own content (the app shell nests <main> inside <main>). */
export const content = (page: Page) => page.locator('main main').first();

/** Navigate and wait for the page heading. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
}

/** Chip inside a labelled `[role=group]`. */
export function chip(scope: Page | Locator, group: string | RegExp, name: string | RegExp) {
  return scope
    .getByRole('group', { name: group })
    .getByRole('button', { name, exact: typeof name === 'string' });
}

export async function pickChip(
  scope: Page | Locator,
  group: string | RegExp,
  name: string | RegExp,
) {
  const c = chip(scope, group, name);
  await c.click();
  await expect(c).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Searchable list dialog: click the trigger, type the query, pick the first
 * matching option (or the one named `option`).
 */
export async function pickFromList(
  page: Page,
  trigger: Locator,
  query: string,
  option?: string | RegExp,
) {
  await trigger.filter({ visible: true }).first().click();
  // The list dialog is the one holding the search combobox (a parent dialog
  // becomes inert, so counting dialogs is unreliable).
  const list = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('combobox') })
    .last();
  await expect(list).toBeVisible();
  await list.getByRole('combobox').fill(query);
  const opt = option
    ? list.getByRole('option', { name: option }).first()
    : list.getByRole('option').first();
  await expect(opt).toBeVisible();
  await opt.click();
  await expect(page.getByRole('dialog').filter({ has: page.getByRole('combobox') })).toHaveCount(0);
}

/** `dd.MM.yyyy`, the app's (and the calendar's `data-day`) format. */
export function dayFirst(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** DatePicker (button → react-day-picker popover): pick `date` (default today). */
export async function pickDate(page: Page, trigger: Locator, date = new Date()) {
  await trigger.click();
  const cal = page.locator('[data-slot="calendar"]').last();
  await expect(cal).toBeVisible();
  const day = cal.locator(`button[data-day="${dayFirst(date)}"]`);
  for (let i = 0; i < 12 && !(await day.isVisible()); i++) {
    await cal.getByRole('button', { name: /Next Month|luna următoare/i }).click();
  }
  await day.click();
  await expect(trigger).toHaveText(dayFirst(date));
}

/** In-app confirm dialog: press the confirming button. */
export async function confirmDialog(page: Page, name: string | RegExp) {
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog')).last();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name }).last().click();
}

/** Assert a sonner toast with the text appears. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible();
}

/** The app never renders a native <select>. */
export async function expectNoSelect(page: Page) {
  await expect(page.locator('select:visible')).toHaveCount(0);
}

/** No horizontal page scroll (1px tolerance). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page scrolls horizontally').toBeLessThanOrEqual(1);
}

/** Wait until list/skeleton loaders are gone. */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}
