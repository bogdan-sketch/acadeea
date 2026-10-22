import { test, expect, type Page } from '@playwright/test';
import {
  Api,
  cleanup,
  content,
  expectNoSelect,
  expectToast,
  isMobile,
  open,
  pickChip,
  pickDate,
  pickFromList,
  qaName,
  settle,
} from './helpers';

test.describe.configure({ mode: 'serial' });

let api: Api;
let materialId = '';
let recipeA = { id: '', name: '' };
let recipeB = { id: '', name: '' };
let singleTitle = '';
let groupName = '';
let singleId = '';

async function taskIdsByRecipe(
  recipeId: string,
): Promise<{ id: string; status: string; title?: string }[]> {
  const r = await api.get<{
    data: { id: string; status: string; title?: string; recipeId: string }[];
  }>(`/tasks?limit=100&search=${encodeURIComponent('QA-E2E-web')}`);
  return r.data.filter((t) => t.recipeId === recipeId);
}

async function searchTasks(page: Page, q: string) {
  await settle(page);
  await content(page).getByRole('searchbox', { name: 'Caută task' }).fill(q);
  await settle(page);
}

test.beforeAll(async ({}, testInfo) => {
  api = await Api.create();
  const loc = await api.defaultLocation();
  materialId = (await api.createRawMaterial(qaName(testInfo, 'Unt'))).id;
  await api.receive(materialId, 20, loc.id);
  recipeA = await api.createRecipe(qaName(testInfo, 'Eclair'), materialId);
  recipeB = await api.createRecipe(qaName(testInfo, 'Choux'), materialId);
  singleTitle = qaName(testInfo, 'Task');
  groupName = qaName(testInfo, 'Grup');
});

test.afterAll(async () => {
  await cleanup('tasks', [
    async () => {
      const ids = [
        ...(await taskIdsByRecipe(recipeA.id)),
        ...(await taskIdsByRecipe(recipeB.id)),
      ].map((t) => t.id);
      await api.removeTasks(ids);
    },
    () => api.removeRecipe(recipeA.id),
    () => api.removeRecipe(recipeB.id),
    () => api.removeRawMaterial(materialId),
  ]);
  await api.dispose();
});

test('board: columns, view switch, filter chips and header links', async ({ page }, testInfo) => {
  await open(page, '/tasks');
  const main = content(page);
  await expect(page.getByRole('heading', { name: 'Producție', level: 1 })).toBeVisible();
  await expect(
    main.getByText(
      /^(Luni|Marți|Miercuri|Joi|Vineri|Sâmbătă|Duminică), \d{1,2} [a-zăâîșț]+ · \d+ taskuri/,
    ),
  ).toBeVisible();
  await expect(
    main.getByRole('group', { name: 'Mod de afișare' }).getByRole('button', { name: 'Tablă' }),
  ).toHaveAttribute('aria-pressed', 'true');
  for (const col of ['De făcut', 'În lucru', 'Blocat', 'Finalizat']) {
    const section = main.locator(`section[aria-label="${col}"]`);
    if (isMobile(testInfo)) await expect(section).toBeAttached();
    else await expect(section).toBeVisible();
  }
  for (const f of ['Azi', 'Săptămâna', 'Ale mele', 'Nealocate', 'Blocate']) {
    await expect(main.getByRole('button', { name: f, exact: true })).toBeVisible();
  }
  await expect(main.getByRole('link', { name: 'Calendar producție' })).toHaveAttribute(
    'href',
    '/calendar',
  );
  await expect(main.getByRole('link', { name: 'Listă de cumpărături' })).toHaveAttribute(
    'href',
    '/tasks/shopping-list',
  );
  await expect(main.getByRole('link', { name: 'Task nou' })).toHaveAttribute('href', '/tasks/new');
  await expectNoSelect(page);
});

test('board: Finalizat column is paged, "Toate" opens the status grid', async ({
  page,
}, testInfo) => {
  const { total } = await api.get<{ total: number }>('/tasks?status=FINALIZAT&limit=1');
  await open(page, '/tasks');
  const main = content(page);
  if (isMobile(testInfo)) {
    await main
      .getByRole('group', { name: 'Coloană' })
      .getByRole('button', { name: /^Finalizat/ })
      .click();
  }
  const col = main.locator('section[aria-label="Finalizat"]');
  await expect(col).toBeVisible();
  await settle(page);
  const cards = col.locator('a[href^="/tasks/"]:not([href^="/tasks/status/"])');
  expect(await cards.count()).toBeLessThanOrEqual(8);
  const more = col.getByRole('button', { name: /Afișează mai multe/ });
  if (total > 8) {
    await expect(cards).toHaveCount(8);
    await expect(more).toBeVisible();
    await expect(more).toHaveCSS('height', '42px');
    await more.click();
    await expect(cards).toHaveCount(Math.min(16, total));
  } else {
    await expect(more).toHaveCount(0);
  }
  test.skip(total === 0, 'no finished tasks to list');
  const all = col.getByRole('link', { name: /^Toate \(\d+\)/ });
  await expect(all).toHaveAttribute('href', /^\/tasks\/status\/finalizat/);
  await all.click();
  await page.waitForURL(/\/tasks\/status\/finalizat/);
  await expect(page.getByRole('heading', { name: 'Finalizat', level: 1 })).toBeVisible();
  await expect(content(page).getByRole('link', { name: 'Producție' })).toHaveAttribute(
    'href',
    '/tasks',
  );
  const grid = content(page).getByTestId('task-status-grid');
  await expect(grid).toBeVisible();
  const gridCards = grid.locator('a[href^="/tasks/"]');
  await expect(gridCards).toHaveCount(Math.min(24, total));
  if (total > 24) {
    await content(page)
      .getByRole('button', { name: /Afișează mai multe/ })
      .click();
    await expect(gridCards).toHaveCount(Math.min(48, total));
  }
  await expectNoSelect(page);
});

test('create a single task with chips and a day-first date', async ({ page }) => {
  await open(page, '/tasks/new');
  const main = content(page);
  const create = main.getByRole('button', { name: 'Creează task' });
  await expect(create).toBeDisabled();
  await expect(
    main.getByRole('group', { name: 'Mod' }).getByRole('button', { name: 'Un produs' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await main.getByRole('textbox', { name: 'Nume task (opțional)' }).fill(singleTitle);
  await pickFromList(page, main.getByRole('button', { name: 'Alege rețeta' }), recipeA.name);
  await main.getByRole('spinbutton', { name: 'Cantitate *' }).fill('4');
  await expect(main.getByRole('textbox', { name: 'Unitate' })).toHaveValue('buc');
  await pickChip(main, 'Locație producție', 'Cofetarie Napoca');
  await pickChip(main, 'Prioritate', '2 — Important');
  await pickDate(page, main.getByRole('button', { name: 'Data planificării' }));
  await pickChip(main, 'Asignare', 'Claude Verify');
  await pickChip(main, 'Vizibilitate', 'Toată lumea');
  await main.getByRole('textbox', { name: 'Note' }).fill('QA-E2E note');
  await expectNoSelect(page);
  await expect(create).toBeEnabled();
  await create.click();
  await expectToast(page, 'Task creat cu succes');
  await page.waitForURL(/\/tasks$/);
  const tasks = await taskIdsByRecipe(recipeA.id);
  expect(tasks).toHaveLength(1);
  singleId = tasks[0].id;

  await open(page, `/tasks/${singleId}`);
  await expect(content(page)).toContainText(`Nume task: „${singleTitle}”`);
  await expect(content(page)).toContainText(recipeA.name);
  await expect(content(page)).toContainText('Cofetarie Napoca');
});

test('create several tasks at once (multi mode)', async ({ page }) => {
  await open(page, '/tasks/new');
  const main = content(page);
  await pickChip(main, 'Mod', 'Mai multe produse');
  await pickFromList(page, main.getByRole('button', { name: 'Rețeta 1' }), recipeB.name);
  await main.getByRole('spinbutton', { name: 'Cantitate' }).first().fill('2');
  await main.getByRole('button', { name: 'Adaugă produs' }).click();
  await pickFromList(page, main.getByRole('button', { name: 'Rețeta 2' }), recipeB.name);
  await main.getByRole('spinbutton', { name: 'Cantitate' }).nth(1).fill('3');
  await main.getByRole('textbox', { name: 'Nume grup (opțional)' }).fill(groupName);
  await pickDate(page, main.getByRole('button', { name: 'Data planificării' }));
  await main.getByRole('button', { name: 'Creează taskuri' }).click();
  await expect(page.locator('[data-sonner-toast][data-type=success]').first()).toBeVisible();
  await page.waitForURL(/\/tasks$/);
  await expect.poll(async () => (await taskIdsByRecipe(recipeB.id)).length).toBe(2);
});

test('board: drag a card from De făcut to În lucru', async ({ page }, testInfo) => {
  test.skip(!singleId, 'needs the task');
  await open(page, '/tasks');
  const main = content(page);
  await searchTasks(page, singleTitle);
  if (isMobile(testInfo)) {
    // < 640 px the board shows one column chosen by chips; no drag and drop.
    await main
      .getByRole('group', { name: 'Coloană' })
      .getByRole('button', { name: 'De făcut' })
      .click();
    await expect(
      main.locator('section[aria-label="De făcut"] a', { hasText: singleTitle }),
    ).toBeVisible();
    await open(page, `/tasks/${singleId}`);
    await content(page).getByRole('button', { name: 'Începe taskul' }).click();
  } else {
    const card = main.locator('section[aria-label="De făcut"] a[draggable=true]', {
      hasText: singleTitle,
    });
    await expect(card).toBeVisible();
    // HTML5 drag-and-drop through the real handlers. Each event is its own
    // round-trip so React commits `dragging` (set on dragstart) before the
    // column's dragover/drop read it — a synthetic mouse drag raced that.
    const target = main.locator('section[aria-label="În lucru"]');
    const dt = await page.evaluateHandle(() => new DataTransfer());
    await card.dispatchEvent('dragstart', { dataTransfer: dt });
    await target.dispatchEvent('dragenter', { dataTransfer: dt });
    await target.dispatchEvent('dragover', { dataTransfer: dt });
    await target.dispatchEvent('drop', { dataTransfer: dt });
    await card.dispatchEvent('dragend', { dataTransfer: dt }).catch(() => {});
  }
  await expect(page.locator('[data-sonner-toast][data-type=success]').first()).toBeVisible();
  await expect
    .poll(async () => (await api.get<{ status: string }>(`/tasks/${singleId}`)).status)
    .toBe('IN_LUCRU');
  if (!isMobile(testInfo)) {
    await expect(
      main.locator('section[aria-label="În lucru"] a', { hasText: singleTitle }),
    ).toBeVisible();
  }
});

test('finish through the yield dialog', async ({ page }) => {
  test.skip(!singleId, 'needs the task');
  await open(page, `/tasks/${singleId}`);
  await content(page).getByRole('button', { name: 'Finalizează taskul' }).click();
  const d = page.getByRole('dialog').last();
  await expect(d.getByRole('heading', { name: 'Captură randament' })).toBeVisible();
  await expect(d).toContainText('Cantitate țintă');
  await expect(d).toContainText(/4 buc/);
  await d.locator('input[inputmode=decimal]').first().fill('0');
  await d.getByRole('button', { name: 'Confirmă și finalizează' }).click();
  await expectToast(page, 'Cantitatea obținută trebuie să fie mai mare decât 0');
  await d.locator('input[inputmode=decimal]').first().fill('3');
  await d.getByRole('button', { name: 'Confirmă și finalizează' }).click();
  await expectToast(page, 'Task finalizat!');
  await expect
    .poll(async () => (await api.get<{ status: string }>(`/tasks/${singleId}`)).status)
    .toBe('FINALIZAT');
  await expect(content(page).getByText('Finalizat').first()).toBeVisible();
  // Finished stock entered the product (3 buc of the recipe).
  await page.reload();
  await expect(content(page).getByRole('button', { name: 'Trasabilitate' }).first()).toBeVisible();
});

test('cancel a task with a reason', async ({ page }) => {
  const [t] = await taskIdsByRecipe(recipeB.id);
  test.skip(!t, 'needs a multi task');
  await open(page, `/tasks/${t.id}`);
  await content(page).getByRole('button', { name: 'Anulează taskul' }).click();
  const d = page.getByRole('dialog').last();
  await expect(d.getByRole('heading', { name: 'Anulare task' })).toBeVisible();
  await d.getByPlaceholder('De ce anulezi acest task?').fill('QA-E2E anulare');
  await d.getByRole('button', { name: 'Anulează task' }).click();
  await expectToast(page, 'Task anulat');
  await expect
    .poll(async () => (await api.get<{ status: string }>(`/tasks/${t.id}`)).status)
    .toBe('ANULAT');
});

test('list view: search and filter chips', async ({ page }) => {
  await open(page, '/tasks');
  const main = content(page);
  await pickChip(main, 'Mod de afișare', 'Listă');
  await searchTasks(page, singleTitle);
  await expect(main.getByText(singleTitle).first()).toBeVisible();
  for (const f of ['Azi', 'Ale mele']) {
    const chipBtn = main.getByRole('button', { name: f, exact: true });
    await chipBtn.click();
    await settle(page);
    await expect(chipBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(main.getByText(singleTitle).first()).toBeVisible();
    await chipBtn.click();
  }
  const blocked = main.getByRole('button', { name: 'Blocate', exact: true });
  await blocked.click();
  await settle(page);
  await expect(main.getByText(singleTitle)).toHaveCount(0);
  await blocked.click();
  await searchTasks(page, 'QA-E2E-zzz-nimic');
  await expect(main.getByText(singleTitle)).toHaveCount(0);
});

test('calendar: weeks start on Monday, dates are day-first', async ({ page }, testInfo) => {
  await open(page, '/calendar');
  const main = content(page);
  await expect(main.getByText(/^Săptămâna \d+ · /)).toBeVisible();
  // Nothing picked = every layer shown (owner, 17.10.2026); none starts pressed.
  for (const layer of ['Comenzi', 'Producție', 'Expirări']) {
    await expect(main.getByRole('button', { name: layer, exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  }
  if (isMobile(testInfo)) {
    // Phones: day view with a Monday → Sunday strip.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /^(luni|marți|miercuri|joi|vineri|sâmbătă|duminică), \d{1,2} [a-zăâîșț]+$/,
    );
    const strip = main.getByRole('button', { name: /^(Lu|Ma|Mi|Jo|Vi|Sâ|Du) \d{1,2}/ });
    await expect(strip).toHaveCount(7);
    await expect(strip.first()).toHaveText(/^Lu/);
    await expect(strip.last()).toHaveText(/^Du/);
    await main.getByRole('button', { name: 'Ziua următoare' }).click();
    await main.getByRole('button', { name: 'Azi', exact: true }).click();
    await expect(
      main.getByRole('button', { name: /^(Lu|Ma|Mi|Jo|Vi|Sâ|Du) \d{1,2}/, pressed: true }),
    ).toContainText(String(new Date().getDate()));
  } else {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /^\d{1,2}( [a-zăâîșț]+)? – \d{1,2} [a-zăâîșț]+$/,
    );
    // Week columns read Lu 12 … Du 18 (Monday first, Sunday last).
    await expect(main).toContainText(
      /Ascunzi\s*Lu\s*\d{1,2}[\s\S]*Ma\s*\d{1,2}[\s\S]*Mi\s*\d{1,2}[\s\S]*Jo\s*\d{1,2}[\s\S]*Vi\s*\d{1,2}[\s\S]*Sâ\s*\d{1,2}[\s\S]*Du\s*\d{1,2}/i,
    );
    await pickChip(main, 'Perioadă', 'Lună');
    await expect(main).toContainText(
      /Luni\s*Lu\s*Marți\s*Ma\s*Miercuri\s*Mi\s*Joi\s*Jo\s*Vineri\s*Vi\s*Sâmbătă\s*Sâ\s*Duminică\s*Du/,
    );
    await pickChip(main, 'Perioadă', 'Zi');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /^(luni|marți|miercuri|joi|vineri|sâmbătă|duminică), \d{1,2} [a-zăâîșț]+$/,
    );
    await pickChip(main, 'Perioadă', 'Săptămână');
    await main.getByRole('button', { name: 'Săptămâna următoare' }).click();
    await main.getByRole('button', { name: 'Azi', exact: true }).click();
  }
  await expect(main).not.toContainText(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/);
  await expectNoSelect(page);
});
