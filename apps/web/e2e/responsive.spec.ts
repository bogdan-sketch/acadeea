import { test, expect } from '@playwright/test';
import { content, expectNoHorizontalScroll, expectNoSelect, settle } from './helpers';
import { ROUTES } from './routes';

test.describe('responsive: no horizontal page scroll', () => {
  for (const route of ROUTES) {
    test(`${route}`, async ({ page }, testInfo) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
        timeout: 20_000,
      });
      await settle(page);
      await expectNoHorizontalScroll(page);
      await expectNoSelect(page);
      if (testInfo.project.name === 'iphone') {
        // Nothing in the page content is wider than the 390 px viewport.
        const wide = await content(page).evaluate((root) => {
          const vw = document.documentElement.clientWidth;
          const out: string[] = [];
          root.querySelectorAll<HTMLElement>('h1, h2, button, a, input, p').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || getComputedStyle(el).visibility === 'hidden') return;
            // Inside a horizontal scroller (chips, tables) overflow is intended.
            let p: HTMLElement | null = el.parentElement;
            while (p && p !== root) {
              const ox = getComputedStyle(p).overflowX;
              if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return;
              p = p.parentElement;
            }
            if (r.right > vw + 1)
              out.push(
                `${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40)}" right=${Math.round(r.right)}`,
              );
          });
          return out.slice(0, 10);
        });
        expect(wide, `elements wider than the viewport on ${route}`).toEqual([]);
      }
    });
  }
});
