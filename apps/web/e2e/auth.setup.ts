import { test as setup, expect } from '@playwright/test';
import { STORAGE_STATE } from './constants';
import { CREDENTIALS } from './constants';

/** Logs in once and stores the session for every other spec. */
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill(CREDENTIALS.email);
  await page.locator('#password').fill(CREDENTIALS.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('refreshToken'))).toBeTruthy();
  await page.context().storageState({ path: STORAGE_STATE });
});
