import { test, expect, type Page } from '@playwright/test';
import { settle } from './helpers';
import { ROUTES } from './routes';

/** English UI words that must never reach a Romanian screen (whole words, case-sensitive). */
const ENGLISH = [
  'Loading',
  'Save',
  'Cancel',
  'Delete',
  'Edit',
  'Search',
  'Submit',
  'Close',
  'Next',
  'Previous',
  'Back',
  'Settings',
  'Logout',
  'Log out',
  'Sign in',
  'Password',
  'No results',
  'No data',
  'Today',
  'Yesterday',
  'Tomorrow',
  'Monday',
  'Sunday',
  'January',
  'October',
  'Select',
  'Add',
  'Toggle Sidebar',
  'Notifications',
  'Go to the',
  'Navigation bar',
  'Error',
  'Something went wrong',
];
const ENGLISH_RE = new RegExp(
  `(^|[^\\p{L}])(${ENGLISH.map((w) => w.replace(/ /g, '\\s+')).join('|')})(?=$|[^\\p{L}])`,
  'u',
);
// Same line only: avatar initials like "AM" (Ana Marin) under a number are not times.
const AMPM = /\b\d{1,2}(:\d{2})?[ \u00a0]?(AM|PM|am|pm)\b/;
const MMDD = /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{2}|\d{4})\b/;
const MONTH_FIRST = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}\b/;

async function texts(page: Page) {
  return page.evaluate(() => {
    const visibleText = document.body.innerText;
    const labels: string[] = [];
    document.querySelectorAll('[aria-label], [title], [placeholder]').forEach((el) => {
      for (const a of ['aria-label', 'title', 'placeholder']) {
        const v = el.getAttribute(a);
        if (v) labels.push(v);
      }
    });
    return { visibleText, labels };
  });
}

/** Strip user data that legitimately contains English (product names from Woo, emails). */
const scrub = (s: string) => s.replace(/\S+@\S+/g, ' ').replace(/WOO-\d+[^\n]*/g, ' ');

test.describe('i18n: Romanian only, day-first, 24-hour', () => {
  for (const route of ROUTES) {
    test(`${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
        timeout: 20_000,
      });
      await settle(page);
      const { visibleText } = await texts(page);
      const text = scrub(visibleText);
      expect(
        text.match(ENGLISH_RE)?.[0]?.trim() ?? null,
        `English word visible on ${route}`,
      ).toBeNull();
      expect(text.match(AMPM)?.[0] ?? null, `AM/PM time on ${route}`).toBeNull();
      expect(text.match(MMDD)?.[0] ?? null, `MM/DD date on ${route}`).toBeNull();
      expect(text.match(MONTH_FIRST)?.[0] ?? null, `month-first date on ${route}`).toBeNull();
    });
  }

  // The shell's sidebar button and the sonner region used to be English
  // ("Toggle Sidebar", "Notifications alt+T").
  test('accessible names (aria-label/title/placeholder) are Romanian', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const { labels } = await texts(page);
    expect(labels.filter((l) => ENGLISH_RE.test(l))).toEqual([]);
  });

  // The DatePicker calendar uses react-day-picker's Romanian labels
  // ("Mergi la luna următoare", "Astăzi, …"), not "Go to the Next Month".
  test('date picker labels are Romanian', async ({ page }) => {
    await page.goto('/tasks/new');
    await page.getByRole('button', { name: 'Data planificării' }).click();
    const cal = page.locator('[data-slot="calendar"]').last();
    await expect(cal).toBeVisible();
    const labels = await cal.evaluate((el) =>
      [...el.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label') ?? ''),
    );
    expect(labels.filter((l) => ENGLISH_RE.test(l))).toEqual([]);
  });

  test('date picker is Monday-first and Romanian in its visible text', async ({ page }) => {
    await page.goto('/tasks/new');
    await page.getByRole('button', { name: 'Data planificării' }).click();
    const cal = page.locator('[data-slot="calendar"]').last();
    await expect(cal).toBeVisible();
    const headers = await cal.locator('thead th, [role="columnheader"]').allInnerTexts();
    if (headers.length) expect(headers[0].toLowerCase()).toMatch(/^lu/);
    const firstDay = await cal.locator('button[data-day]').first().getAttribute('aria-label');
    expect(firstDay).toMatch(/^luni, /);
    await expect(cal).toContainText(
      /(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie) \d{4}/,
    );
  });
});
