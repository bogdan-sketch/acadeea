import { test, expect } from '@playwright/test';
import { content, expectNoSelect, open } from './helpers';

const SCHEMES: [string, string, boolean][] = [
  ['Atelier', 'atelier', false],
  ['Lapte', 'lapte', false],
  ['Miere', 'miere', false],
  ['Cacao', 'cacao', true],
  ['Ardezie', 'ardezie', true],
  ['Piper', 'piper', true],
];

test.describe('profil & setări', () => {
  test('Date tab: identity, security, photo, preferences, danger zone', async ({ page }) => {
    await open(page, '/profil');
    const main = content(page);
    const tabs = main.getByRole('tablist', { name: 'Profil & setări' });
    await expect(tabs.getByRole('tab', { name: 'Date' })).toHaveAttribute('aria-selected', 'true');
    for (const h of ['Datele mele', 'Securitate', 'Poză de profil', 'Preferințe', 'Zonă de risc']) {
      await expect(main.getByRole('heading', { name: h, level: 2 })).toBeVisible();
    }
    await expect(main.getByRole('textbox', { name: 'Prenume' })).toHaveValue('Claude');
    await expect(main.getByRole('textbox', { name: 'Nume', exact: true })).toHaveValue('Verify');
    // Save is disabled until something changes.
    const save = main.getByRole('button', { name: 'Salvează datele mele' });
    await expect(save).toBeDisabled();
    await main.getByRole('textbox', { name: 'Prenume' }).fill('Claude2');
    await expect(save).toBeEnabled();
    await main.getByRole('textbox', { name: 'Prenume' }).fill('Claude');
    await expect(save).toBeDisabled();
    await expect(main.getByRole('button', { name: 'Schimbă parola' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Șterge contul' })).toBeVisible();
    await expect(main.getByRole('switch', { name: 'Tutorial' })).toBeVisible();
    await expectNoSelect(page);
  });

  test('scheme tiles switch data-scheme and light/dark; choice survives reload', async ({
    page,
  }) => {
    await open(page, '/profil');
    const group = content(page).getByRole('group', { name: 'Schema de culori' });
    const html = page.locator('html');
    const original = (await html.getAttribute('data-scheme')) ?? 'atelier';
    try {
      for (const [label, value, dark] of SCHEMES) {
        const tile = group.getByRole('button', { name: new RegExp(`^${label}`) });
        await tile.click();
        await expect(tile).toHaveAttribute('aria-pressed', 'true');
        await expect(html).toHaveAttribute('data-scheme', value);
        if (dark) await expect(html).toHaveClass(/\bdark\b/);
        else await expect(html).not.toHaveClass(/\bdark\b/);
        await expect(group.getByRole('button', { pressed: true })).toHaveCount(1);
      }
      await page.reload();
      await expect(html).toHaveAttribute('data-scheme', 'piper');
    } finally {
      await page.evaluate((s) => localStorage.setItem('horae-scheme', s), original).catch(() => {});
      const tile = group.getByRole('button', {
        name: new RegExp(`^${SCHEMES.find((x) => x[1] === original)?.[0] ?? 'Atelier'}`),
      });
      await tile.click().catch(() => {});
    }
  });

  test('Setări tab: every section is present with its actions', async ({ page }, testInfo) => {
    await open(page, '/profil?tab=setari');
    const main = content(page);
    await expect(main.getByRole('tab', { name: 'Setări' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const nav = main.getByRole('navigation', { name: 'Secțiuni' });
    for (const s of [
      'Companie',
      'Locații',
      'Categorii',
      'Identitate',
      'Echipă & roluri',
      'Comenzi din site',
      'Backup & restaurare',
      'Jurnal sistem',
      'Noutăți',
      'Zonă periculoasă',
    ]) {
      // Phones have no section index; the sections themselves stay.
      if (testInfo.project.name !== 'iphone')
        await expect(nav.getByRole('link', { name: s })).toBeVisible();
      await expect(
        main.getByRole('region', { name: new RegExp(`^${s.replace(/[&]/g, '\\$&')}`) }),
      ).toBeAttached();
    }
    await expect(main.getByRole('link', { name: 'Editează datele firmei' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Locație nouă' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Gestionează categoriile' })).toBeVisible();
    await expect(main.getByRole('button', { name: /^Încarcă logo/ }).first()).toBeVisible();
    await expect(main.getByRole('link', { name: 'Configurează conexiunea' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Vezi salvările' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Deschide jurnalul' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Toate noutățile' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Resetează date' })).toBeVisible();
    // Default location is a pressed chip, never a <select>.
    await expect(
      main
        .getByRole('region', { name: 'Locații' })
        .getByRole('button', { name: 'Implicită', pressed: true }),
    ).toHaveCount(1);
    await expectNoSelect(page);
  });

  test('tabs switch via the URL', async ({ page }) => {
    await open(page, '/profil');
    await content(page).getByRole('tab', { name: 'Setări' }).click();
    await expect(page).toHaveURL(/tab=setari/);
    await content(page).getByRole('tab', { name: 'Date' }).click();
    await expect(page).not.toHaveURL(/tab=setari/);
    await expect(content(page).getByRole('heading', { name: 'Datele mele' })).toBeVisible();
  });

  test('settings subpages open', async ({ page }) => {
    for (const p of [
      '/settings/company',
      '/settings/categories',
      '/settings/branding',
      '/settings/backups',
      '/settings/logs',
      '/stock/locations',
      '/integrations',
      '/changelog',
    ]) {
      await page.goto(p);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
        timeout: 20_000,
      });
      await expectNoSelect(page);
    }
  });
});
