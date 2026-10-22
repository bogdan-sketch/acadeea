import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import {
  Api,
  cleanup,
  content,
  expectNoSelect,
  expectToast,
  makePng,
  open,
  pickChip,
  pickFromList,
  qaName,
  settle,
  WEB_PREFIX,
} from './helpers';

test.describe.configure({ mode: 'serial' });

let api: Api;
let materialName = '';
let materialId = '';
let consumableName = '';
let recipeName = '';
let recipeId = '';
const transferIds: string[] = [];
const consumableIds: string[] = [];
const extraMaterialIds: string[] = [];

const dialog = (page: Page) => page.getByRole('dialog').last();

async function searchTable(page: Page, placeholder: string, q: string) {
  await settle(page);
  await content(page).getByPlaceholder(placeholder).fill(q);
  await settle(page);
}

/** Current stock of the QA material (sum over locations), via the API. */
async function stockOf(id: string): Promise<number> {
  const m = await api.get<{ stockCount?: number; currentStock?: number }>(`/raw-materials/${id}`);
  return Number(m.stockCount ?? m.currentStock ?? 0);
}

test.beforeAll(async ({}, testInfo) => {
  api = await Api.create();
  materialName = qaName(testInfo, 'Zahar');
  consumableName = qaName(testInfo, 'Cutie');
});

test.afterAll(async () => {
  await cleanup('stock', [
    () => api.discardQaSalesDrafts(),
    async () => {
      if (transferIds.length)
        await api.send('POST', '/stock/transfers/bulk-delete', { ids: transferIds, cascade: true });
    },
    async () => {
      if (recipeId) await api.removeRecipe(recipeId);
    },
    async () => {
      if (materialId) await api.removeRawMaterial(materialId);
    },
    ...extraMaterialIds.map((id) => () => api.removeRawMaterial(id)),
    ...consumableIds.map((id) => () => api.removeConsumable(id)),
  ]);
  await api.dispose();
});

test('stock overview: header actions, location chips, groups', async ({ page }) => {
  await open(page, '/stock');
  const main = content(page);
  await expect(page.getByRole('heading', { name: 'Stoc', level: 1 })).toBeVisible();
  await expect(main.getByText(/\d+ articole · \d+ epuizate · \d+ sub minim/)).toBeVisible();
  const quick = main.getByRole('navigation', { name: 'Acțiuni rapide stoc' });
  await expect(quick.getByRole('link', { name: 'Recepție marfă' })).toHaveAttribute(
    'href',
    '/stock/receive',
  );
  await expect(quick.getByRole('link', { name: 'Transfer între locații' })).toBeVisible();
  await expect(quick.getByRole('button', { name: 'Mișcare de stoc' })).toBeVisible();
  await expect(quick.getByRole('button', { name: 'Consum teste' })).toBeVisible();
  await expect(quick.getByRole('link', { name: 'Expirări' })).toBeVisible();
  await expect(quick.getByRole('link', { name: 'Necesar materii prime' })).toBeVisible();
  await expect(quick.getByRole('link', { name: 'Furnizori' })).toBeVisible();
  await expect(main.getByRole('button', { name: /^Materii prime prim/ }).first()).toBeVisible();
  await expectNoSelect(page);
});

test('raw material: create through the dialog with chips', async ({ page }) => {
  await open(page, '/stock/raw-materials');
  const main = content(page);
  await expect(main.getByRole('button', { name: 'Exportă Excel' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Importă Excel' })).toBeVisible();
  await main.getByRole('button', { name: 'Material nou' }).click();
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: 'Material nou' })).toBeVisible();
  const create = d.getByRole('button', { name: 'Creează materialul' });
  await expect(create).toBeDisabled();
  await d.getByRole('textbox', { name: 'Denumire *' }).fill(materialName);
  await d.getByRole('textbox', { name: 'Producător' }).fill('QA-E2E Producător');
  await pickChip(d, 'Locație', 'Cofetarie Napoca');
  await pickChip(d, 'Unitate', 'kg');
  await pickChip(d, 'Depozitare', 'Cald');
  await expect(d.locator('select')).toHaveCount(0);
  await create.click();
  await expectToast(page, 'Material creat');
  await searchTable(page, 'Caută material...', materialName);
  const row = main.getByRole('row', { name: new RegExp(materialName) });
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForURL(/\/stock\/raw-materials\/[0-9a-f-]{36}$/);
  materialId = page.url().split('/').pop()!;
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(materialName);
  await expect(content(page).getByText('QA-E2E Producător').first()).toBeVisible();
});

test('raw material: edit producer and minimum stock', async ({ page }) => {
  test.skip(!materialId, 'needs the material');
  await open(page, `/stock/raw-materials/${materialId}`);
  await content(page).getByRole('button', { name: 'Editează', exact: true }).click();
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: 'Editează materia primă' })).toBeVisible();
  await expect(d.getByLabel('Denumire')).toHaveValue(materialName);
  await d.getByLabel('Producător / distribuitor').fill('QA-E2E Moara');
  await d.getByLabel('Stoc minim').fill('2');
  await d.getByRole('button', { name: 'Salvează' }).click();
  await expect(d).toBeHidden();
  await expect(content(page).getByText('QA-E2E Moara').first()).toBeVisible();
  await expect(
    content(page)
      .getByText(/prag minim 2 kg|Stoc minim\s*2 kg/)
      .first(),
  ).toBeVisible();
});

test('consumable: create', async ({ page }) => {
  await open(page, '/stock/consumables');
  const main = content(page);
  await main.getByRole('button', { name: 'Consumabil nou' }).click();
  const d = dialog(page);
  await expect(d.getByText('Consumabilele se numără în buc')).toBeVisible();
  await expect(d.getByRole('button', { name: 'Creează consumabilul' })).toBeDisabled();
  await d.getByRole('textbox', { name: 'Denumire *' }).fill(consumableName);
  await d.getByRole('button', { name: 'Creează consumabilul' }).click();
  await expectToast(page, 'Consumabil creat');
  await searchTable(page, 'Caută...', consumableName);
  const row = main.getByRole('row', { name: new RegExp(consumableName) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('0 buc');
  await row.click();
  await page.waitForURL(/\/stock\/consumables\/[0-9a-f-]{36}$/);
  consumableIds.push(page.url().split('/').pop()!);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(consumableName);
});

test('receive: one material with lot, price and expiry', async ({ page }) => {
  test.skip(!materialId, 'needs the material');
  await open(page, '/stock/receive');
  const main = content(page);
  const save = main.getByRole('button', { name: 'Salvează recepția' });
  await expect(save).toBeDisabled();
  await pickChip(main, 'Locație destinație', 'Cofetarie Napoca');
  await main.getByRole('textbox', { name: 'ex: FAC-2026-1021' }).fill('QA-E2E-FAC-1');
  await pickFromList(page, main.getByRole('button', { name: 'Materialul 1' }), materialName);
  await main.getByRole('spinbutton', { name: 'Cantitate (kg)' }).fill('5');
  await main.getByRole('textbox', { name: 'Lot' }).fill('QA-E2E-L1');
  await main.getByRole('spinbutton', { name: 'Preț (RON/kg)' }).fill('12.5');
  await expect(main.getByRole('switch', { name: 'Prețurile includ TVA' })).toBeVisible();
  // Expiry defaults to a day-first date.
  await expect(main.getByRole('button', { name: 'Data expirării materialului 1' })).toHaveText(
    /^\d{2}\.\d{2}\.\d{4}$/,
  );
  await expect(save).toBeEnabled();
  await save.click();
  await expectToast(page, 'Recepție făcută');
  await page.waitForURL(/\/stock\/movements/);
  await expect(content(page).getByText(materialName).first()).toBeVisible();
  await expect.poll(() => stockOf(materialId)).toBe(5);

  await open(page, `/stock/raw-materials/${materialId}`);
  await expect(content(page).getByText('QA-E2E-L1').first()).toBeVisible();
  await expect(content(page).getByText(/5 kg/).first()).toBeVisible();
  // Prices use the Romanian decimal comma ("12,50 RON/kg"), never "12.50".
  await expect(
    content(page)
      .getByText(/\d,\d{2} RON\/kg/)
      .first(),
  ).toBeVisible();
  await expect(content(page)).not.toContainText(/\d\.\d{2} RON/);
});

test('movement dialog: adjustment with a reason chip', async ({ page }) => {
  test.skip(!materialId, 'needs the material');
  await open(page, '/stock');
  await content(page).getByRole('button', { name: 'Mișcare de stoc' }).click();
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: 'Mișcare stoc' })).toBeVisible();
  await d.getByRole('button', { name: 'Ajustare', exact: true }).click();
  await pickFromList(page, d.getByRole('button', { name: 'Material' }), materialName);
  await d.getByRole('spinbutton').first().fill('-1');
  await pickChip(d, 'Motiv', 'Pierdere');
  await d.getByRole('textbox', { name: 'Detalii suplimentare' }).fill('QA-E2E mișcare');
  await d.getByRole('button', { name: 'Salvează mișcarea de stoc' }).click();
  await expect(page.locator('[data-sonner-toast][data-type=success]').first()).toBeVisible();
  await expect.poll(() => stockOf(materialId)).toBe(4);
});

test('test consumption: comma decimal quantity', async ({ page }) => {
  test.skip(!materialId, 'needs the material');
  await open(page, '/stock');
  await content(page).getByRole('button', { name: 'Consum teste' }).click();
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: 'Consum teste' })).toBeVisible();
  await pickChip(d, 'Locație', 'Cofetarie Napoca');
  const submit = d.getByRole('button', { name: 'Înregistrează consumul' });
  await expect(submit).toBeDisabled();
  await pickFromList(page, d.getByRole('button', { name: 'Materialul 1' }), materialName);
  await d.getByRole('textbox', { name: 'Cantitate' }).fill('0,5');
  await d.getByRole('textbox', { name: 'ex: teste glazură nouă' }).fill('QA-E2E test');
  await submit.click();
  await expectToast(page, 'Consum teste înregistrat');
  await expect.poll(() => stockOf(materialId)).toBe(3.5);
});

test('transfer: new transfer with chips, then cancel it', async ({ page }) => {
  test.skip(!materialId, 'needs the material');
  await open(page, '/stock/transfers/new');
  const main = content(page);
  const create = main.getByRole('button', { name: 'Creează transfer' });
  await expect(create).toBeDisabled();
  await pickChip(main, 'Locație sursă', 'Cofetarie Napoca');
  await main.getByPlaceholder('Caută produs...').fill(materialName);
  await main
    .getByRole('button', { name: new RegExp(materialName) })
    .first()
    .click();
  const qty = main.locator('input[type=number]').first();
  await qty.fill('1');
  await pickChip(main, 'Destinație', 'Laborator Cernavoda');
  await pickChip(main, 'Transport', 'Neasignat');
  await main.getByPlaceholder('Note opționale...').fill('QA-E2E transfer');
  await expect(create).toBeEnabled();
  await create.click();
  await expectToast(page, 'Transferul a fost inițiat');
  await page.waitForURL(/\/stock\/transfers\/[0-9a-f-]{36}$/);
  transferIds.push(page.url().split('/').pop()!);
  await expect(content(page).getByText(materialName).first()).toBeVisible();
  await expect(content(page).getByText('QA-E2E transfer').first()).toBeVisible();
  await expect(content(page).getByText('Laborator Cernavoda').first()).toBeVisible();
});

test('expiring: the received lot shows within a year', async ({ page }) => {
  test.skip(!materialId, 'needs the material');
  await open(page, '/stock/expiring');
  const main = content(page);
  await expect(main.getByRole('spinbutton')).toHaveValue('30');
  await main.getByRole('spinbutton').fill('400');
  await main.getByRole('spinbutton').press('Enter');
  await settle(page);
  await expect(main.getByText(materialName).first()).toBeVisible();
  await expectNoSelect(page);
});

test('requirements: plan a recipe and calculate raw materials', async ({ page }, testInfo) => {
  test.skip(!materialId, 'needs the material');
  recipeName = qaName(testInfo, 'Plan');
  recipeId = (await api.createRecipe(recipeName, materialId)).id;
  await open(page, '/stock/requirements');
  const main = content(page);
  await expect(main.getByText(/Plan de producție · \S+ \d{1,2} [a-zăâîșț]+/)).toBeVisible();
  await expect(main.getByRole('button', { name: 'Calculează necesarul' })).toBeDisabled();
  await pickFromList(page, main.getByRole('button', { name: 'Produsul 1' }), recipeName);
  await main.getByRole('spinbutton', { name: /^Cantitate în/ }).fill('8');
  await main.getByRole('button', { name: 'Calculează necesarul' }).click();
  await expect(main.getByText(materialName).first()).toBeVisible();
  // 8 buc of a 4-buc batch with 0.1 kg → 0.2 kg.
  await expect(main.getByText(/0[.,]2\d* kg|200 g/).first()).toBeVisible();
  await expect(main.getByRole('button', { name: 'Export Excel' })).toBeEnabled();
});

test('review: export downloads an .xlsx, a wrong file is rejected', async ({ page }) => {
  await open(page, '/stock/review');
  const main = content(page);
  await expect(main.getByRole('link', { name: 'Istoricul reviziilor' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    main.getByRole('button', { name: 'Exportă Excel' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  await expectToast(page, 'Revizia a fost exportată');

  const input = main.locator('input[type=file]');
  await expect(input).toHaveAttribute('accept', /\.xlsx/);
  await input.setInputFiles({
    name: 'qa-e2e-not-excel.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: makePng(8),
  });
  await expect(page.locator('[data-sonner-toast][data-type=error]').first()).toBeVisible();
  await expect(main.getByRole('button', { name: /Aplică/ })).toHaveCount(0);
});

test('sales deduction: upload the eBriza CSV as a draft, then discard', async ({ page }) => {
  await open(page, '/stock/sales');
  const main = content(page);
  await main.getByRole('button', { name: 'Scădere nouă' }).click();
  await expect(main.getByRole('heading', { name: /^Scădere nouă/ })).toBeVisible();
  const napoca = main.getByRole('button', { name: 'Cofetarie Napoca', exact: true });
  await napoca.click();
  await expect(napoca).toHaveAttribute('aria-pressed', 'true');
  const report = main.getByRole('button', { name: /^Raport Excel \/ CSV/ });
  await report.click();
  await expect(report).toHaveAttribute('aria-pressed', 'true');
  const csv = path.join(__dirname, 'fixtures', 'vanzari-2026-10-16.csv');
  await main.locator('input[type=file]').setInputFiles({
    name: `${WEB_PREFIX}vanzari-2026-10-16.csv`,
    mimeType: 'text/csv',
    buffer: readFileSync(csv),
  });
  const cont = main.getByRole('button', { name: 'Continuă la verificare' });
  await expect(cont).toBeEnabled();
  await cont.click();
  await page.waitForURL(/\/stock\/sales\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const detail = content(page);
  await expect(page.getByRole('heading', { name: 'Confirmă vânzările', level: 1 })).toBeVisible();
  await expect(detail.getByText(/Stocul se modifică doar după „Confirmă tot”/)).toBeVisible();
  // 29 product rows from the eBriza export, decoded from UTF-16.
  await expect(detail.getByRole('button', { name: 'Toate · 29' })).toBeVisible();
  await expect(detail).toContainText(/Macarons\s*raport:\s*28/);
  await expect(detail).toContainText(/Americano\s*raport:\s*2\b/);
  await expect(detail.getByRole('textbox', { name: 'Cantitate vândută' }).first()).toHaveValue(
    '28',
  );
  await expect(detail.getByRole('button', { name: 'Confirmă tot' })).toBeVisible();
  await detail.getByRole('button', { name: 'Renunță' }).click();
  await expectToast(page, 'Scăderea a fost abandonată — stocul nu s-a modificat');
  await page.waitForURL(/\/stock\/sales$/);
});
