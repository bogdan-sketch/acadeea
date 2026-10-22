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
} from './helpers';

test.describe.configure({ mode: 'serial' });

let api: Api;
let materialName: string;
let materialId: string;
let recipeName: string;
let recipeId = '';
const recipeIds = new Set<string>();

/**
 * The list has no stale-response guard (BUG: an earlier, slower request can
 * overwrite the filtered result), so let each filter change settle first.
 */
async function filterList(page: Page, opts: { tab?: string; search?: string }) {
  await settle(page);
  if (opts.tab) {
    await content(page).getByRole('button', { name: opts.tab, exact: true }).click();
    await settle(page);
  }
  if (opts.search !== undefined) {
    await content(page).getByRole('searchbox', { name: 'Caută rețetă' }).fill(opts.search);
    await settle(page);
  }
}

async function openRecipeFromList(page: Page, name: string, tab?: string) {
  await open(page, '/recipes');
  await filterList(page, { tab, search: name });
  const card = content(page)
    .getByRole('link', { name: new RegExp(name.replace(/[()]/g, '\\$&')) })
    .first();
  await expect(card).toBeVisible();
  await card.click();
  await page.waitForURL(/\/recipes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  recipeIds.add(page.url().split('/').pop()!);
  return page.url().split('/').pop()!;
}

/** Fill the minimal valid form: name, yield, one ingredient + quantity. */
async function fillRecipe(page: Page, opts: { name: string; yieldQty: string; qty: string }) {
  const main = content(page);
  await main.getByRole('textbox', { name: 'Nume *' }).fill(opts.name);
  await main.getByRole('textbox', { name: 'Randament' }).fill(opts.yieldQty);
  await pickFromList(
    page,
    main.getByRole('button', { name: 'Alege ingredient' }).first(),
    materialName,
  );
  await expect(main.getByRole('button', { name: `Ingredient: ${materialName}` })).toBeVisible();
  await main.getByRole('textbox', { name: 'Cantitate' }).first().fill(opts.qty);
}

test.beforeAll(async ({}, testInfo) => {
  api = await Api.create();
  materialName = qaName(testInfo, 'Faina');
  materialId = (await api.createRawMaterial(materialName)).id;
  recipeName = qaName(testInfo, 'Tort');
});

test.afterAll(async () => {
  await cleanup('recipes', [
    ...[...recipeIds].map((id) => () => api.removeRecipe(id)),
    () => api.removeRawMaterial(materialId),
  ]);
  await api.dispose();
});

test('list: type chips, category chips, search and worded header actions', async ({ page }) => {
  await open(page, '/recipes');
  const main = content(page);
  await expect(page.getByRole('heading', { name: 'Rețete', level: 1 })).toBeVisible();
  await expect(main.getByText(/\d+ rețete · \d+ produse finale · \d+ semipreparate/)).toBeVisible();
  const finals = main
    .getByRole('group', { name: 'Tip rețetă' })
    .getByRole('button', { name: 'Produse finale' });
  await expect(finals).toHaveAttribute('aria-pressed', 'true');
  await pickChip(main, 'Tip rețetă', 'Semipreparate');
  await expect(finals).toHaveAttribute('aria-pressed', 'false');
  await pickChip(main, 'Tip rețetă', 'Produse finale');
  await expect(main.getByRole('link', { name: 'Rețetă nouă' })).toHaveAttribute(
    'href',
    '/recipes/new',
  );
  await expect(main.getByRole('link', { name: 'Prețuri și marje' })).toHaveAttribute(
    'href',
    '/pricing',
  );
  await expect(main.getByRole('button', { name: 'Schițe' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Arhivate' })).toBeVisible();
  await filterList(page, { search: 'QA-E2E-zzz-nu-exista' });
  await expect(main.getByRole('link', { name: /QA-E2E-zzz/ })).toHaveCount(0);
  await expectNoSelect(page);
});

test('create: validation needs yield > 0 and quantity > 0', async ({ page }) => {
  await open(page, '/recipes/new');
  const main = content(page);
  const create = main.getByRole('button', { name: 'Creează rețetă' });
  await expect(create).toBeDisabled();
  await expectNoSelect(page);

  await fillRecipe(page, { name: recipeName, yieldQty: '0', qty: '0.5' });
  await expect(create).toBeEnabled();
  await create.click();
  await expectToast(page, 'Introdu randamentul rețetei (mai mare decât 0)');
  await expect(page).toHaveURL(/\/recipes\/new/);

  await main.getByRole('textbox', { name: 'Randament' }).fill('8');
  await main.getByRole('textbox', { name: 'Cantitate' }).first().fill('0');
  await create.click();
  await expectToast(page, 'Fiecare ingredient are nevoie de o cantitate mai mare decât 0');
  await expect(page).toHaveURL(/\/recipes\/new/);
});

test('create with an ingredient from the picker', async ({ page }) => {
  await open(page, '/recipes/new');
  const main = content(page);
  await pickChip(main, 'Tip rețetă', 'Produs final');
  await pickChip(main, 'Categorie', 'Torturi');
  await pickChip(main, 'Unitate', 'buc');
  await pickChip(main, 'Termen de valabilitate', '1 lună');
  await fillRecipe(page, { name: recipeName, yieldQty: '8', qty: '0.5' });
  await main.getByRole('textbox', { name: 'Numele componentei' }).first().fill('Blat');
  await main.getByRole('textbox', { name: 'Detalii preparare' }).first().fill('cernută');
  await main.getByRole('button', { name: 'Creează rețetă' }).click();
  await expectToast(page, 'Rețetă creată cu succes');
  await page.waitForURL(/\/recipes$/);

  recipeId = await openRecipeFromList(page, recipeName);
  const detail = content(page);
  await expect(detail.getByText('Torturi').first()).toBeVisible();
  await expect(detail.getByText(materialName).first()).toBeVisible();
  await expect(detail.getByText(/8 buc/).first()).toBeVisible();
  for (const name of [
    'Duplică rețeta',
    'Tipărește fișa rețetei',
    'Arhivează rețeta',
    'Șterge rețeta',
  ]) {
    await expect(detail.getByRole('button', { name })).toBeVisible();
  }
  await expect(detail.getByRole('link', { name: 'Editează rețeta' })).toHaveAttribute(
    'href',
    `/recipes/${recipeId}/edit`,
  );
  await expect(detail.getByRole('link', { name: 'Task de producție din rețetă' })).toHaveAttribute(
    'href',
    `/tasks/new?recipeId=${recipeId}`,
  );
});

test('edit: rename and change yield', async ({ page }) => {
  test.skip(!recipeId, 'needs the created recipe');
  await open(page, `/recipes/${recipeId}`);
  await content(page).getByRole('link', { name: 'Editează rețeta' }).click();
  await page.waitForURL(/\/edit$/);
  const main = content(page);
  await expect(main.getByRole('textbox', { name: 'Nume *' })).toHaveValue(recipeName);
  await expect(main.getByRole('button', { name: `Ingredient: ${materialName}` })).toBeVisible();
  recipeName = `${recipeName}-v2`;
  await main.getByRole('textbox', { name: 'Nume *' }).fill(recipeName);
  await main.getByRole('textbox', { name: 'Randament' }).fill('10');
  await main.getByRole('button', { name: 'Salvează modificările' }).click();
  await expectToast(page, /Rețetă actualizată|Rețetă publicată/);
  await page.waitForURL(new RegExp(`/recipes/${recipeId}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(recipeName);
  await expect(
    content(page)
      .getByText(/10 buc/)
      .first(),
  ).toBeVisible();
});

test('recipe photos are off: no upload control on the recipe page', async ({ page }) => {
  test.skip(!recipeId, 'needs the created recipe');
  await open(page, `/recipes/${recipeId}`);
  await expect(content(page).locator('input[type=file][accept^="image"]')).toHaveCount(0);
});

// RECIPE_PHOTOS_ENABLED is false for current clients; re-enable with the flag.
test.skip('photo upload with a generated PNG', async ({ page }) => {
  test.skip(!recipeId, 'needs the created recipe');
  await open(page, `/recipes/${recipeId}`);
  const input = content(page).locator('input[type=file][accept^="image"]').first();
  const uploaded = page.waitForResponse(
    (r) => /\/recipes\/[^/]+\/photo/.test(r.url()) && r.request().method() !== 'GET',
  );
  await input.setInputFiles({ name: 'qa-e2e.png', mimeType: 'image/png', buffer: makePng(64) });
  const res = await uploaded;
  expect(res.status(), await res.text()).toBeLessThan(300);
  await expect(content(page).getByRole('button', { name: 'Șterge poza' })).toBeAttached();
  const img = content(page).locator('header img').first();
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
    .toBeGreaterThan(0);
  // Survives a reload (stored server-side).
  await page.reload();
  await expect(content(page).locator('header img').first()).toBeVisible();
});

test('duplicate creates a draft copy and opens it for editing', async ({ page }) => {
  test.skip(!recipeId, 'needs the created recipe');
  await open(page, `/recipes/${recipeId}`);
  await content(page).getByRole('button', { name: 'Duplică rețeta' }).click();
  await expectToast(page, 'Rețetă duplicată ca schiță');
  await page.waitForURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);
  const copyId = page.url().split('/').slice(-2)[0];
  recipeIds.add(copyId);
  expect(copyId).not.toBe(recipeId);
  await expect(content(page).getByRole('textbox', { name: 'Nume *' })).toHaveValue(
    `${recipeName} (copie)`,
  );
  await expect(
    content(page).getByRole('button', { name: `Ingredient: ${materialName}` }),
  ).toBeVisible();
  // The copy is a draft: it is listed under "Schițe".
  await open(page, '/recipes');
  await filterList(page, { tab: 'Schițe', search: `${recipeName} (copie)` });
  await expect(
    content(page)
      .getByRole('link', { name: /\(copie\)/ })
      .first(),
  ).toBeVisible();
});

test('archive hides the recipe from the catalogue; reactivate brings it back', async ({ page }) => {
  test.skip(!recipeId, 'needs the created recipe');
  await open(page, `/recipes/${recipeId}`);
  await content(page).getByRole('button', { name: 'Arhivează rețeta' }).click();
  await expectToast(page, 'Rețetă arhivată');
  await expect(content(page).getByText('Arhivată').first()).toBeVisible();
  await expect(content(page).getByRole('button', { name: 'Reactivează rețeta' })).toBeVisible();

  await open(page, '/recipes');
  await filterList(page, { search: recipeName });
  await expect(content(page).getByRole('link', { name: new RegExp(recipeName) })).toHaveCount(0);
  await filterList(page, { tab: 'Arhivate' });
  await expect(
    content(page)
      .getByRole('link', { name: new RegExp(recipeName) })
      .first(),
  ).toBeVisible();

  await open(page, `/recipes/${recipeId}`);
  await content(page).getByRole('button', { name: 'Reactivează rețeta' }).click();
  await expectToast(page, 'Rețetă reactivată');
});

test('pricing page lists recipes with cost, price and margin', async ({ page }) => {
  await open(page, '/pricing');
  const main = content(page);
  await expect(page.getByRole('heading', { name: 'Prețuri și Marje' })).toBeVisible();
  await expect(main.getByRole('tab', { name: 'Marje' })).toHaveAttribute('aria-selected', 'true');
  for (const col of ['Rețetă', 'Cost', 'Preț vânzare', 'Marjă', 'Marjă %']) {
    await expect(main.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
  }
  await expect(main.getByText('Se încarcă...')).toHaveCount(0, { timeout: 20_000 });
  await expect(main.getByRole('row').nth(1)).toBeVisible();
  await main.getByRole('tab', { name: 'Istoric' }).click();
  await expect(main.getByRole('tab', { name: 'Istoric' })).toHaveAttribute('aria-selected', 'true');
  await expectNoSelect(page);
});

test('delete the duplicate through the in-app confirm dialog', async ({ page }) => {
  const copyId = [...recipeIds].find((id) => id !== recipeId);
  test.skip(!copyId, 'needs the duplicate');
  await open(page, `/recipes/${copyId}`);
  await content(page).getByRole('button', { name: 'Șterge rețeta' }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await expect(dialog.getByText('Ștergi rețeta?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Șterge rețeta' }).click();
  await expectToast(page, 'Rețetă ștearsă');
  await page.waitForURL(/\/recipes$/);
  recipeIds.delete(copyId!);
});

// Fixed: /recipes drops stale responses — toggling "Schițe" and typing right
// away must leave only the rows of the latest search on screen.
test('search right after a filter toggle shows only matching rows', async ({ page }) => {
  await page.goto('/recipes');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await content(page).getByRole('button', { name: 'Schițe', exact: true }).click();
  await content(page).getByRole('searchbox', { name: 'Caută rețetă' }).fill('QA-E2E-zzz-nu-exista');
  await page.waitForTimeout(5_000);
  await expect(
    content(page).locator('a[href^="/recipes/"]:not([href="/recipes/new"])'),
  ).toHaveCount(0);
});
