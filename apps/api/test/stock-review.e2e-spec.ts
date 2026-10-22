/**
 * Revizie stocuri: export the review workbook, edit a finished product's
 * quantity, import it back (dryRun preview, then apply).
 */
import * as ExcelJS from 'exceljs';

import { bootApp, TestApp } from './helpers/app';
import { Api } from './helpers/factory';
import { createOrg, TestOrg, uid } from './helpers/org';

jest.setTimeout(120000);

describe('Stock review', () => {
  let t: TestApp;
  let org: TestOrg;
  let api: Api;
  beforeAll(async () => {
    t = await bootApp();
    org = await createOrg(t, 'review');
    api = new Api(t, org);
  });
  afterAll(async () => t?.close());

  const exportBook = async () => {
    const r = await t.http
      .get('/api/v1/stock/review/export')
      .set(org.as())
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(r.status).toBe(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(r.body as Buffer);
    return book;
  };

  const upload = async (book: ExcelJS.Workbook, dryRun: boolean) => {
    const buf = Buffer.from(await book.xlsx.writeBuffer());
    return t.http
      .post(`/api/v1/stock/review/import?dryRun=${dryRun}`)
      .set(org.as())
      .attach('file', buf, 'revizie.xlsx');
  };

  it('applies a finished-product quantity change (45 → 0)', async () => {
    const shop = await api.location({ type: 'MAGAZIN' });
    const name = `Vanilie si pecan ${uid()}`;
    const cake = await api.recipe([], { name, unit: 'BUCATI' });
    await api.post(
      '/api/v1/stock/recipe-movements',
      {
        recipeId: cake.id,
        movementType: 'INTRARE',
        quantity: 45,
        unit: 'BUCATI',
        locationId: shop.id,
      },
      201,
    );

    const book = await exportBook();
    const sheet = book.getWorksheet('Produse finite');
    expect(sheet).toBeDefined();
    let edited = 0;
    sheet?.eachRow((row, n) => {
      if (n > 1 && String(row.getCell(3).value ?? '').includes(name)) {
        row.getCell(11).value = 0;
        edited++;
      }
    });
    expect(edited).toBeGreaterThan(0);

    const preview = await upload(book, true);
    expect(preview.status).toBeLessThan(300);
    expect(preview.body.applied).toBe(false);
    expect(preview.body.changes.length).toBeGreaterThan(0);

    const applied = await upload(book, false);
    expect(applied.status).toBeLessThan(300);
    expect(applied.body.applied).toBe(true);

    const avail = (await api.get(`/api/v1/stock/item-availability?recipeId=${cake.id}`, 200)).body;
    expect(avail.totalQuantity).toBe(0);
  });

  it('reads expiry dates however a spreadsheet app saved them', async () => {
    const shop = await api.location({ type: 'MAGAZIN' });
    const m = await api.rawMaterial({ minimumStock: 1 });
    await api.receive(m.id, 500, { locationId: shop.id });
    const variants: [unknown, string | null][] = [
      [46357, '2026-12-01'], // Excel serial day number
      ['46358', '2026-12-02'], // same, stored as text
      ['15.01.2027', '2027-01-15'],
      ['16.01.27', '2027-01-16'],
      [new Date(Date.UTC(2027, 1, 2)), '2027-02-02'],
      [44, null], // nonsense → ignored, never a database error
    ];
    for (const [cellValue, expected] of variants) {
      const book = await exportBook();
      book.getWorksheet('Materii prime')?.eachRow((row, n) => {
        if (n > 1 && String(row.getCell(1).value ?? '').length > 0)
          row.getCell(9).value = cellValue as ExcelJS.CellValue;
      });
      const res = await upload(book, false);
      expect(res.status).toBeLessThan(300);
      const expiry = res.body.changes.find((c: { field: string }) => c.field === 'expiryDate');
      if (expected === null) expect(expiry).toBeUndefined();
      else expect(String(expiry?.to ?? '')).toContain(expected);
    }
  });
});
