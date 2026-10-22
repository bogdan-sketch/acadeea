import { test, expect, type Page } from '@playwright/test';
import {
  Api,
  chip,
  cleanup,
  content,
  expectNoSelect,
  expectToast,
  makePng,
  open,
  pickChip,
  pickDate,
  pickFromList,
  qaName,
  settle,
} from './helpers';

test.describe.configure({ mode: 'serial' });

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  deliveryPoint?: string;
  fulfillmentType?: string;
};

let api: Api;
let materialId = '';
let recipe = { id: '', name: '' };
let recipe2 = { id: '', name: '' };
let point = '';
let deliveryId = '';
let pickupId = '';

async function ourOrders(): Promise<Order[]> {
  const r = await api.get<{ data: Order[] }>('/orders?page=1&limit=100');
  return r.data.filter(
    (o) => (o.deliveryPoint ?? '').startsWith('QA-E2E-web-') && o.deliveryPoint === point,
  );
}

/** Orders are shown by what was ordered + who, never by number (owner rule). */
const re = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const steps = (page: Page) => content(page).locator('ol[aria-label="Stare comandă"]');

async function moveTo(page: Page, label: string, status: string, id: string) {
  await steps(page)
    .getByRole('button', { name: new RegExp(`^${label}`) })
    .click();
  await expectToast(page, `Comandă mutată la ${label}`);
  await expect.poll(async () => (await api.get<Order>(`/orders/${id}`)).status).toBe(status);
  await expect(steps(page).locator('button[aria-current=step]')).toContainText(label);
}

test.beforeAll(async ({}, testInfo) => {
  api = await Api.create();
  materialId = (await api.createRawMaterial(qaName(testInfo, 'Smantana'))).id;
  recipe = await api.createRecipe(qaName(testInfo, 'Tort'), materialId);
  recipe2 = await api.createRecipe(qaName(testInfo, 'Prajitura'), materialId);
  point = qaName(testInfo, 'Punct');
});

test.afterAll(async () => {
  await cleanup('orders', [
    async () =>
      api.removeOrders(
        [deliveryId, pickupId, ...(await ourOrders()).map((o) => o.id)].filter(Boolean),
      ),
    () => api.removeRecipe(recipe.id),
    () => api.removeRecipe(recipe2.id),
    () => api.removeRawMaterial(materialId),
  ]);
  await api.dispose();
});

test('list: status chips, source tabs, search and header links', async ({ page }) => {
  await open(page, '/orders');
  const main = content(page);
  await expect(page.getByRole('heading', { name: 'Comenzi', level: 1 })).toBeVisible();
  await expect(main.getByText(/\d+ active · \d+ ies azi/)).toBeVisible();
  for (const s of ['Nouă', 'În pregătire', 'Pregătită', 'În tranzit', 'Livrată', 'Anulată']) {
    await expect(main.getByRole('button', { name: new RegExp(`^${s} \\d+$`) })).toBeVisible();
  }
  for (const s of ['De pe site', 'Manuale', 'Arhivate']) {
    await expect(main.getByRole('button', { name: s, exact: true })).toBeVisible();
  }
  await expect(main.getByRole('link', { name: 'Calendar comenzi' })).toHaveAttribute(
    'href',
    '/orders/calendar',
  );
  await expect(main.getByRole('link', { name: 'Statistici comenzi' })).toHaveAttribute(
    'href',
    '/orders/stats',
  );
  await expect(main.getByRole('link', { name: 'Comandă nouă' })).toHaveAttribute(
    'href',
    '/orders/new',
  );
  for (const col of ['Comandă', 'Termen', 'Mod', 'Status', 'Acțiuni']) {
    await expect(main.getByRole('columnheader', { name: col, exact: true })).toBeAttached();
  }
  await expectNoSelect(page);
});

test('create a manual delivery order', async ({ page }) => {
  await open(page, '/orders/new');
  const main = content(page);
  const create = main.getByRole('button', { name: 'Creează comandă' });
  await expect(create).toBeDisabled();
  await main.getByRole('textbox', { name: 'Punct livrare' }).fill(point);
  await pickDate(page, main.getByRole('button', { name: 'Termen de livrare' }));
  await main
    .getByRole('textbox', { name: 'Adresă livrare' })
    .fill('Strada QA-E2E nr. 1, Cluj-Napoca');
  await pickChip(main, 'Asignare', 'Claude Verify');
  await main.getByRole('textbox', { name: 'Note' }).fill('QA-E2E comandă');
  await pickFromList(page, main.getByRole('button', { name: 'Produsul 1' }), recipe.name);
  await main.getByRole('spinbutton', { name: 'Cantitatea produsului 1' }).fill('2');
  await expectNoSelect(page);
  await expect(create).toBeEnabled();
  await create.click();
  await expectToast(page, 'Comandă creată cu succes');
  await page.waitForURL(/\/orders$/);
  await expect.poll(async () => (await ourOrders()).length).toBe(1);
  const [o] = await ourOrders();
  deliveryId = o.id;
  expect(o.status).toBe('NOUA');
  expect(o.fulfillmentType).toBe('DELIVERY');

  await open(page, `/orders/${deliveryId}`);
  const d = content(page);
  // Title = products; the number is only a small meta line under it.
  await expect(page.getByRole('heading', { level: 1 })).toContainText(recipe.name);
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText(o.orderNumber);
  await expect(d).toContainText(`Comanda ${o.orderNumber.replace(/^WOO-/, '')}`);
  await expect(d).toContainText(recipe.name);
  await expect(d).toContainText('Strada QA-E2E nr. 1');
  await expect(
    d.getByRole('group', { name: 'Mod de predare' }).locator('[aria-current=true]'),
  ).toHaveText('Livrare');
  // Due date is "sâmbătă, 17 oct" style (weekday, day before month).
  await expect(d).toContainText(
    /(luni|marți|miercuri|joi|vineri|sâmbătă|duminică), \d{1,2} [a-zăâîșț]+\.?/,
  );
});

test('create a manual pickup order from the form', async ({ page }) => {
  const locs = await api.get<{ id: string; name: string; isActive?: boolean }[]>('/locations');
  const loc = locs.find((l) => l.isActive !== false);
  test.skip(!loc, 'needs an active location');
  await open(page, '/orders/new');
  const main = content(page);
  const create = main.getByRole('button', { name: 'Creează comandă' });
  // Livrare is the default; Ridicare swaps the address field for location chips.
  await expect(chip(main, 'Mod de predare', 'Livrare')).toHaveAttribute('aria-pressed', 'true');
  await pickChip(main, 'Mod de predare', 'Ridicare');
  await expect(main.getByRole('textbox', { name: 'Adresă livrare' })).toHaveCount(0);
  await main.getByRole('textbox', { name: 'Client / nume la ridicare' }).fill(point);
  await pickFromList(page, main.getByRole('button', { name: 'Produsul 1' }), recipe.name);
  await main.getByRole('spinbutton', { name: 'Cantitatea produsului 1' }).fill('1');
  await expect(create).toBeDisabled(); // no pickup location yet
  await pickChip(main, 'Locație de ridicare', loc!.name);
  await expectNoSelect(page);
  await expect(create).toBeEnabled();
  await create.click();
  await expectToast(page, 'Comandă creată cu succes');
  await page.waitForURL(/\/orders$/);
  let created: (Order & { pickupLocationId?: string | null }) | undefined;
  await expect
    .poll(async () => {
      created = (await ourOrders()).find((o) => o.fulfillmentType === 'PICKUP');
      return created?.id ?? '';
    })
    .not.toBe('');
  const full = await api.get<Order & { pickupLocationId?: string | null }>(
    `/orders/${created!.id}`,
  );
  expect(full.fulfillmentType).toBe('PICKUP');
  expect(full.pickupLocationId).toBe(loc!.id);
  await api.removeOrders([created!.id]);
});

test('pickup order (created via API) shows Ridicare on its page', async ({ page }) => {
  const o = await api.post<Order>('/orders', {
    deliveryPoint: point,
    fulfillmentType: 'PICKUP',
    items: [{ recipeId: recipe.id, quantity: 1, unit: 'BUCATI' }],
  });
  pickupId = o.id;
  await open(page, `/orders/${pickupId}`);
  await expect(
    content(page).getByRole('group', { name: 'Mod de predare' }).locator('[aria-current=true]'),
  ).toHaveText('Ridicare');
});

test('add a product to the order', async ({ page }) => {
  test.skip(!deliveryId, 'needs the order');
  await open(page, `/orders/${deliveryId}`);
  await content(page).getByRole('button', { name: 'Adaugă produs în comandă' }).click();
  const d = page.getByRole('dialog').last();
  await expect(d.getByRole('heading', { name: 'Adaugă produs' })).toBeVisible();
  await d.getByPlaceholder('Caută rețetă...').fill(recipe2.name);
  await d.getByRole('option', { name: recipe2.name }).click();
  await d.locator('input[type=number]').fill('3');
  await d.getByRole('button', { name: 'Adaugă în comandă' }).click();
  await expectToast(page, 'Produs adăugat');
  await expect(content(page)).toContainText(recipe2.name);
  const full = await api.get<{ items: { recipeId: string; quantity: number }[] }>(
    `/orders/${deliveryId}`,
  );
  expect(full.items.find((i) => i.recipeId === recipe2.id)?.quantity).toBe(3);
});

test('invoice upload: wrong type rejected, PNG accepted, then removed', async ({ page }) => {
  test.skip(!deliveryId, 'needs the order');
  await open(page, `/orders/${deliveryId}`);
  const main = content(page);
  await expect(main.getByText(/Nicio factură încărcată/)).toBeVisible();
  const input = main.locator('input[type=file][accept=".pdf,.jpg,.jpeg,.png"]');
  await input.setInputFiles({
    name: 'qa-e2e.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('QA-E2E'),
  });
  await expectToast(page, 'Fișier neacceptat');
  await expect(main.getByText(/Nicio factură încărcată/)).toBeVisible();
  await input.setInputFiles({
    name: 'qa-e2e-factura.png',
    mimeType: 'image/png',
    buffer: makePng(32),
  });
  await expectToast(page, 'Factură încărcată');
  await expect(main.getByRole('button', { name: 'Descarcă factura' })).toBeVisible();
  await main.getByRole('button', { name: 'Șterge factura' }).click();
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  if (await confirm.count())
    await confirm
      .last()
      .getByRole('button', { name: /Șterge/ })
      .last()
      .click();
  await expectToast(page, 'Factură ștearsă');
  await expect(main.getByRole('button', { name: 'Încarcă factură' })).toBeVisible();
});

test('delivery note (aviz) is generated', async ({ page }) => {
  test.skip(!deliveryId, 'needs the order');
  await open(page, `/orders/${deliveryId}`);
  const gen = content(page).getByRole('button', { name: 'Generează aviz de livrare' });
  await expect(gen).toBeVisible();
  await gen.click();
  await expectToast(page, 'Aviz de livrare creat');
  await expect(content(page).getByRole('button', { name: 'Aviz de livrare PDF' })).toBeVisible();
});

test('status progression: Nouă → În pregătire → Pregătită → În tranzit', async ({ page }) => {
  test.skip(!deliveryId, 'needs the order');
  await open(page, `/orders/${deliveryId}`);
  await expect(steps(page).locator('button[aria-current=step]')).toContainText('Nouă');
  // Steps go in order: "Livrată" is not reachable yet.
  await expect(steps(page).getByRole('button', { name: /^Livrată/ })).toBeDisabled();
  await moveTo(page, 'În pregătire', 'IN_PREGATIRE', deliveryId);
  await moveTo(page, 'Pregătită', 'PREGATITA', deliveryId);
  await moveTo(page, 'În tranzit', 'IN_TRANZIT', deliveryId);
});

test('cancel the pickup order through the in-app confirm dialog', async ({ page }) => {
  test.skip(!pickupId, 'needs the pickup order');
  await open(page, `/orders/${pickupId}`);
  await content(page).getByRole('button', { name: 'Anulează comanda' }).click();
  const d = page.getByRole('alertdialog').or(page.getByRole('dialog')).last();
  await expect(d.getByText('Anulezi comanda?')).toBeVisible();
  await d.getByRole('button', { name: 'Anulează comanda' }).click();
  await expectToast(page, 'Comandă anulată');
  await expect
    .poll(async () => (await api.get<Order>(`/orders/${pickupId}`)).status)
    .toBe('ANULATA');
  await expect(content(page).getByRole('button', { name: 'Arhivează comanda' })).toBeVisible();
});

test('Manuale tab lists our orders; site tab paginates client-side', async ({ page }) => {
  test.skip(!deliveryId, 'needs the order');
  await open(page, '/orders');
  const main = content(page);
  await settle(page);
  await main.getByRole('button', { name: 'Manuale', exact: true }).click();
  await settle(page);
  await expect(main.getByRole('button', { name: 'Manuale', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const o = await api.get<Order>(`/orders/${deliveryId}`);
  await expect(main.getByRole('row', { name: re(recipe.name) }).first()).toBeVisible();
  await expect(main.getByRole('row').filter({ hasText: '· Site' })).toHaveCount(0);
  await expect(main).not.toContainText(o.orderNumber);
  await expect(main).not.toContainText(/WOO-\d+/);
  await expect(main.getByText(/^\d+ din \d+ comenzi/)).toBeVisible();

  await main.getByRole('button', { name: 'De pe site', exact: true }).click();
  await settle(page);
  const footer = main.getByText(/^\d+ din \d+ comenzi/);
  const next = main.getByRole('button', { name: 'Pagina următoare' });
  const prev = main.getByRole('button', { name: 'Pagina anterioară' });
  await expect(prev).toBeDisabled();
  const firstRow = await main.getByRole('row').nth(1).innerText();
  if (await next.isEnabled()) {
    await next.click();
    await expect(prev).toBeEnabled();
    await expect(main.getByRole('row').nth(1)).not.toHaveText(firstRow);
    await prev.click();
    await expect(prev).toBeDisabled();
  }
  await expect(footer).toBeVisible();
});

test('delivery calendar lists the order under a day-first Romanian heading', async ({ page }) => {
  test.skip(!deliveryId, 'needs the order');
  const o = await api.get<Order>(`/orders/${deliveryId}`);
  await open(page, '/orders/calendar');
  const main = content(page);
  await expect(page.getByRole('heading', { name: 'Calendar livrări', level: 1 })).toBeVisible();
  await expect(
    main
      .getByText(/^(luni|marți|miercuri|joi|vineri|sâmbătă|duminică), \d{1,2} [a-zăâîșț]+ \d{4}/)
      .first(),
  ).toBeVisible();
  await expect(main.locator(`a[href="/orders/${o.id}"]`)).toContainText(recipe.name);
  await expect(main).not.toContainText(o.orderNumber);
  await expect(main).not.toContainText(/WOO-\d+/);
  await expect(main).not.toContainText(/\b(AM|PM)\b/);
});

// Fixed: the form sends the due date as YYYY-MM-DD and the calendar groups by
// the day in Romanian time, so a manual order shows on its own day.
test('delivery calendar shows the order on its due day (today)', async ({ page }) => {
  test.skip(!deliveryId, 'needs the order');
  const o = await api.get<Order>(`/orders/${deliveryId}`);
  await open(page, '/orders/calendar');
  const today = content(page)
    .locator('div', { hasText: /Azi/ })
    .filter({ has: page.locator(`a[href="/orders/${o.id}"]`) });
  await expect(today.first()).toBeVisible();
});

test('stats: totals, on-time rate and status distribution', async ({ page }) => {
  await open(page, '/orders/stats');
  const main = content(page);
  await expect(page.getByRole('heading', { name: 'Statistici comenzi', level: 1 })).toBeVisible();
  await expect(main.getByText('Total comenzi')).toBeVisible();
  await expect(main.getByText('Rata la timp')).toBeVisible();
  await expect(main.getByText('Distribuție status')).toBeVisible();
  await expect(main.getByRole('application').first()).toContainText(/Nouă: \d+/);
  await expectNoSelect(page);
});

test('stats date range uses the day-first DatePicker, not native date inputs', async ({ page }) => {
  await open(page, '/orders/stats');
  const main = content(page);
  await expect(main.locator('input[type=date]')).toHaveCount(0);
  const to = main.getByRole('button', { name: 'Statistici până la data' });
  await expect(to).toHaveText(/^\d{2}\.\d{2}\.\d{4}$/);
  await pickDate(page, main.getByRole('button', { name: 'Statistici de la data' }));
  await expect(main.getByText('Total comenzi')).toBeVisible();
});
