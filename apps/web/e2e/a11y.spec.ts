import { test, expect } from '@playwright/test';
import { settle } from './helpers';
import { ROUTES } from './routes';

/** Known, filed failures: route → [projects, reason]. */
const KNOWN: Record<string, [string[], string]> = {};

test.describe('a11y smoke', () => {
  for (const route of ROUTES) {
    test(`${route}: icon-only controls are named, truncated cells have a Hint`, async ({
      page,
    }, testInfo) => {
      const known = KNOWN[route];
      test.fixme(!!known && known[0].includes(testInfo.project.name), known?.[1] ?? '');
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
        timeout: 20_000,
      });
      await settle(page);
      const report = await page.evaluate(() => {
        const visible = (el: Element) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          const cs = getComputedStyle(el as HTMLElement);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
        };
        const nameOf = (el: Element): string => {
          const aria = el.getAttribute('aria-label');
          if (aria?.trim()) return aria.trim();
          const by = el.getAttribute('aria-labelledby');
          if (by) {
            const t = by
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? '')
              .join(' ')
              .trim();
            if (t) return t;
          }
          const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (text) return text;
          const alt = el.querySelector('img[alt]')?.getAttribute('alt');
          if (alt?.trim()) return alt.trim();
          const svgTitle = el.querySelector('svg title')?.textContent;
          if (svgTitle?.trim()) return svgTitle.trim();
          return (el.getAttribute('title') ?? '').trim();
        };
        const describe = (el: Element) => {
          const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join('.');
          const parentText = (el.parentElement?.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40);
          return `<${el.tagName.toLowerCase()} .${cls}> near "${parentText}"`;
        };
        const unnamed: string[] = [];
        document
          .querySelectorAll(
            'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="checkbox"]',
          )
          .forEach((el) => {
            if (!visible(el) || el.closest('[aria-hidden="true"]')) return;
            if (!nameOf(el)) unnamed.push(describe(el));
          });
        const unhinted: string[] = [];
        const root = document.querySelector('main main') ?? document.body;
        root.querySelectorAll('.truncate').forEach((el) => {
          if (!visible(el)) return;
          if (!el.closest('td, [role="cell"], [role="row"], tr, li, a[href]')) return;
          const hinted =
            el.classList.contains('hint-trigger') ||
            !!el.closest('.hint-trigger') ||
            !!el.querySelector('.hint-trigger') ||
            !!el.closest('[title]');
          // Only text that is actually cut off needs the full value on hover.
          const cut = (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1;
          if (!hinted && cut) unhinted.push(`"${(el.textContent ?? '').trim().slice(0, 50)}"`);
        });
        return {
          unnamed: [...new Set(unnamed)].slice(0, 15),
          unhinted: [...new Set(unhinted)].slice(0, 15),
        };
      });
      expect.soft(report.unnamed, `controls without an accessible name on ${route}`).toEqual([]);
      expect.soft(report.unhinted, `truncated text without a Hint on ${route}`).toEqual([]);
    });
  }
});
