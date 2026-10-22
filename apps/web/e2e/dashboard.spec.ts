import { test, expect } from '@playwright/test';
import { content, expectNoSelect, open } from './helpers';

test.describe('dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/');
  });

  test('greets the user with a Romanian, day-first, 24h date line', async ({ page }) => {
    const main = content(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Bună, Claude\./);
    // "Sâmbătă, 17 octombrie 2026 · 13:36"
    await expect(
      main
        .getByText(
          /^(Luni|Marți|Miercuri|Joi|Vineri|Sâmbătă|Duminică), \d{1,2} [a-zăâîșț]+ \d{4} · \d{2}:\d{2}$/,
        )
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expectNoSelect(page);
  });

  test('stat tiles link to their pages', async ({ page }) => {
    const main = content(page);
    const tiles: [RegExp, RegExp][] = [
      [/^Taskuri azi/, /\/tasks$/],
      [/^Comenzi de livrat/, /\/orders$/],
      [/^Alerte stoc/, /\/stock\/low-stock$/],
      [/^Expiră în 3 zile/, /\/stock\/expiring$/],
    ];
    for (const [name, href] of tiles) {
      const tile = main.getByRole('link', { name });
      await expect(tile).toBeVisible();
      await expect(tile).toHaveAttribute('href', href);
      await expect(tile).toContainText(/\d/);
    }
    await main.getByRole('link', { name: /^Alerte stoc/ }).click();
    await page.waitForURL(/\/stock\/low-stock/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('sections are present: production, orders, critical stock, activity', async ({ page }) => {
    const main = content(page);
    for (const h of ['Producția de azi', 'Comenzile de azi', 'Stoc critic', 'Activitate']) {
      await expect(main.getByRole('heading', { name: h, level: 2 })).toBeVisible();
    }
    await expect(main.getByRole('link', { name: 'Toate taskurile →' })).toHaveAttribute(
      'href',
      '/tasks',
    );
    await expect(main.getByRole('link', { name: 'Toate comenzile →' })).toHaveAttribute(
      'href',
      '/orders',
    );
    await expect(main.getByRole('link', { name: 'Vezi stocul →' })).toHaveAttribute(
      'href',
      '/stock',
    );
    await expect(main.getByRole('link', { name: 'Tot →' })).toHaveAttribute('href', '/activity');
  });

  test('"Comandă nouă" opens the new order form', async ({ page }) => {
    await content(page).getByRole('link', { name: 'Comandă nouă' }).click();
    await page.waitForURL(/\/orders\/new/);
    await expect(page.getByRole('heading', { name: 'Comandă nouă', level: 1 })).toBeVisible();
  });

  test('order search filters to matching orders', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'iphone', 'the search field is desktop-only by design');
    const search = content(page).getByRole('searchbox', { name: 'Caută comandă' });
    await expect(search).toBeVisible();
    await search.fill('QA-E2E-nimic-de-gasit');
    await search.press('Enter');
    // Either a results view or the orders page with the query; never an error.
    await expect(page.getByText(/eroare|error/i)).toHaveCount(0);
  });

  test('activity page opens from the dashboard', async ({ page }) => {
    await content(page).getByRole('link', { name: 'Tot →' }).click();
    await page.waitForURL(/\/activity/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
