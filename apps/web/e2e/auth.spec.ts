import { test, expect, type Page } from '@playwright/test';
import { CREDENTIALS } from './constants';
import { isMobile } from './helpers';

async function openSidebarIfMobile(page: Page, mobile: boolean) {
  if (mobile)
    await page
      .getByRole('button', { name: /bara laterală|Meniu/ })
      .first()
      .click();
}

test.describe('auth — fresh session', () => {
  // Own session: logging out must not revoke the shared storage state.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login page renders in Romanian with the expected fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Arată parola' })).toBeVisible();
    await page.getByRole('button', { name: 'Arată parola' }).click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Ascunde parola' })).toBeVisible();
    await expect(page.getByText('Ai uitat parola?')).toBeVisible();
    await expect(page.locator('select')).toHaveCount(0);
  });

  test('protected routes redirect to /login without a session', async ({ page }) => {
    await page.goto('/stock');
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await expect(page.locator('#email')).toBeVisible();
  });

  test('wrong password shows a Romanian error, then login and logout work', async ({
    page,
  }, testInfo) => {
    await page.goto('/login');
    // Only one project hits the real account with a bad password (lockout is 5);
    // the correct login right after resets the failed-attempt counter.
    const email = isMobile(testInfo) ? 'qa-e2e-nobody@horae.ca' : CREDENTIALS.email;
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('definitely-wrong-QA-E2E');
    await page.locator('button[type=submit]').click();
    await expect(page.getByText('Email sau parolă incorectă')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await page.locator('#email').fill(CREDENTIALS.email);
    await page.locator('#password').fill(CREDENTIALS.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bună');
    expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeTruthy();

    await openSidebarIfMobile(page, isMobile(testInfo));
    // Deconectare lives in the Profil header (not the sidebar footer).
    await page.goto('/profil');
    await page.getByRole('button', { name: 'Deconectare' }).click();
    await page.waitForURL(/\/login|\/landing|\/$/, { timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('refreshToken'))).toBeNull();
    await page.goto('/tasks');
    await page.waitForURL(/\/login/, { timeout: 20_000 });
  });
});

test.describe('auth — signed in', () => {
  test('unknown route shows the Romanian 404 page', async ({ page }) => {
    const res = await page.goto('/qa-e2e-nu-exista');
    expect(res?.status()).toBe(404);
    await expect(page.getByText('Eroare 404')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pagina nu există' })).toBeVisible();
    await expect(page.getByText(/Linkul e greșit/)).toBeVisible();
    await page.getByRole('link', { name: 'Înapoi la panou' }).click();
    await page.waitForURL((u) => u.pathname === '/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bună');
  });

  test('/settings redirects to /profil?tab=setari', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForURL(/\/profil\?tab=setari/);
    await expect(page.getByRole('tab', { name: 'Setări' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('/login with a session goes to the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.waitForURL((u) => u.pathname === '/', { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bună');
  });
});
