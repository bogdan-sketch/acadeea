import { test, expect } from '@playwright/test';
import { content, expectNoSelect, open } from './helpers';

test.describe('users & roles', () => {
  test('people list: members with role, status and row actions', async ({ page }) => {
    await open(page, '/users');
    const main = content(page);
    await expect(page.getByRole('heading', { name: 'Echipă & roluri', level: 1 })).toBeVisible();
    await expect(
      main.getByText(/\d+ persoane · \d+ roluri · \d+ invitații în așteptare/),
    ).toBeVisible();
    await expect(
      main.getByRole('group', { name: 'Secțiune' }).getByRole('button', { name: 'Persoane' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(main).toContainText('claude-verify@horae.ca');
    await expect(main).toContainText('Administrator');
    await expect(main.getByRole('button', { name: 'Resetează parola' }).first()).toBeVisible();
    await expect(main.getByRole('link', { name: 'Deschide persoana' }).first()).toBeVisible();
    // Your own row has no "deactivate" (you can't lock yourself out).
    const count = await main.getByRole('link', { name: 'Deschide persoana' }).count();
    await expect(main.getByRole('button', { name: 'Dezactivează contul' })).toHaveCount(count - 1);
    // "Din" column is day-first: "9 iun 2026".
    await expect(main).toContainText(
      /\d{1,2} (ian|feb|mar|apr|mai|iun|iul|aug|sep|oct|nov|dec) \d{4}/,
    );
    await expectNoSelect(page);
  });

  test('invite dialog: needs a valid email and a role, fits the screen; nothing is sent', async ({
    page,
  }) => {
    await open(page, '/users');
    await content(page).getByRole('button', { name: 'Invită o persoană' }).click();
    const d = page.getByRole('dialog').last();
    await expect(d.getByRole('heading', { name: 'Invită membru nou' })).toBeVisible();
    const send = d.getByRole('button', { name: 'Trimite invitația' });
    const email = d.getByRole('textbox', { name: /Email/ });
    await expect(send).toBeDisabled();
    // The dialog and its content fit the viewport (390 px on iPhone).
    const vw = page.viewportSize()!.width;
    const box = (await d.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    for (const role of ['Administrator', 'Cofetar', 'Gestionar', 'Sofer']) {
      const chip = d.getByRole('button', { name: role, exact: true });
      await expect(chip).toBeInViewport({ ratio: 1 });
      const c = (await chip.boundingBox())!;
      expect(c.x + c.width).toBeLessThanOrEqual(box.x + box.width);
    }
    await d.getByRole('button', { name: 'Sofer', exact: true }).click();
    await expect(send).toBeDisabled(); // still no email
    await email.fill('qa-e2e-not-an-email');
    await expect(d.getByText('Adresa de email nu e validă')).toBeVisible();
    await expect(send).toBeDisabled();
    await email.fill('qa-e2e@example.com');
    await expect(d.getByText('Adresa de email nu e validă')).toHaveCount(0);
    await expect(send).toBeEnabled();
    await email.fill('');
    await expect(send).toBeDisabled();
    await d.getByRole('button', { name: 'Anulează' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('invite email field is labelled and validated before sending', async ({ page }) => {
    await open(page, '/users');
    await content(page).getByRole('button', { name: 'Invită o persoană' }).click();
    const d = page.getByRole('dialog').last();
    await expect(d.getByRole('textbox', { name: /Email/ })).toBeVisible();
    await d.getByRole('textbox', { name: /Email/ }).fill('abc');
    await d.getByRole('button', { name: 'Sofer', exact: true }).click();
    await expect(d.getByRole('button', { name: 'Trimite invitația' })).toBeDisabled();
    await expect(d.getByRole('alert')).toHaveText(/Adresa de email nu e validă/);
  });

  test('roles matrix: every role × permission cell is a named toggle; admin is locked', async ({
    page,
  }) => {
    await open(page, '/roles');
    await page.waitForURL(/\/users\?tab=roles/);
    const main = content(page);
    await expect(
      main
        .getByRole('group', { name: 'Secțiune' })
        .getByRole('button', { name: 'Roluri & drepturi' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(main.getByRole('heading', { name: 'Ce poate face fiecare rol' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Rol nou' })).toBeVisible();
    for (const role of ['Administrator', 'Sef Cofetar', 'Cofetar', 'Gestionar', 'Sofer']) {
      await expect(main.getByRole('button', { name: `Editează rolul ${role}` })).toBeVisible();
    }
    // Admin cells are pressed and disabled.
    const admin = main.getByRole('button', {
      name: /^Administrator: (Vede|Adaugă|Modifică|Șterge) .+ — permis$/,
    });
    expect(await admin.count()).toBeGreaterThan(8);
    await expect(admin.first()).toBeDisabled();
    await expect(admin.first()).toHaveAttribute('aria-pressed', 'true');
    // Cells read "<Rol>: <Acțiune> <Resursă> — permis|nepermis" and match aria-pressed.
    const cells = main.getByRole('button', {
      name: /^[^:]+: (Vede|Adaugă|Modifică|Șterge) .+ — (permis|nepermis)$/,
    });
    const n = await cells.count();
    expect(n).toBeGreaterThan(40);
    for (let i = 0; i < Math.min(n, 30); i++) {
      const c = cells.nth(i * Math.floor(n / 30) || i);
      const label = (await c.getAttribute('aria-label')) ?? (await c.innerText());
      await expect(c).toHaveAttribute(
        'aria-pressed',
        label.endsWith('— permis') ? 'true' : 'false',
      );
    }
    // Roles in use cannot be deleted.
    await expect(main.getByRole('button', { name: 'Șterge rolul Cofetar' })).toBeDisabled();
    // Read-only: nothing is clicked here (roles are shared test data).
  });

  test('person page opens from the list', async ({ page }) => {
    await open(page, '/users');
    await content(page).getByRole('link', { name: 'Deschide persoana' }).first().click();
    await page.waitForURL(/\/users\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
