/**
 * Sales deductions (scădere stoc din vânzări): the real eBriza export
 * (fixtures/ebriza/vanzari-2026-10-16.csv — UTF-16LE, `;`, decimal comma),
 * name matching, confirm (ACCEPT / DECLINE / CREATE_NEW, SALES_001 shortfall,
 * SALES_002 double confirm), discard, revert, manual drafts, CASL.
 */
import * as fs from 'fs';
import * as path from 'path';

import { bootApp, TestApp } from './helpers/app';
import { Api } from './helpers/factory';
import { createOrg, TestOrg, uid } from './helpers/org';

jest.setTimeout(120000);

const EBRIZA = path.join(__dirname, 'fixtures', 'ebriza', 'vanzari-2026-10-16.csv');
/** The same export transcoded to UTF-8 — lets the flow run past the encoding bug. */
const ebrizaUtf8 = () => Buffer.from(fs.readFileSync(EBRIZA).toString('utf16le'), 'utf8');

describe('Sales deductions', () => {
  let t: TestApp;
  let org: TestOrg;
  let api: Api;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let shop: any;
  const products: Record<string, { id: string }> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upload = (
    buf: Buffer,
    name = 'vanzari.csv',
    role: 'administrator' | 'sofer' = 'administrator',
  ): Promise<any> =>
    t.http
      .post('/api/v1/sales-deductions/excel')
      .set(org.as(role))
      .field('locationId', shop.id)
      .attach('file', buf, name);

  async function stockAt(recipeId: string) {
    const rows = (await api.get(`/api/v1/locations/${shop.id}/recipe-stock`, 200)).body;
    return Number(rows.find((r: { recipeId: string }) => r.recipeId === recipeId)?.quantity ?? 0);
  }

  beforeAll(async () => {
    t = await bootApp();
    org = await createOrg(t, 'sales');
    api = new Api(t, org);
    shop = await api.location({ name: `Cafenea ${uid()}`, type: 'MAGAZIN' });
    // A few of the products in the real export, with stock at the shop.
    for (const [name, stock] of [
      ['Carrot cake', 30],
      ['Dobos', 25],
      ['Fistic', 10],
      ['Choux cu prune coapte', 24],
      ['Cookie caramel', 50],
    ] as const) {
      const r = await api.recipe([], { name, unit: 'BUCATI' });
      products[name] = r;
      await api.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: r.id,
          movementType: 'INTRARE',
          quantity: stock,
          unit: 'BUCATI',
          locationId: shop.id,
        },
        201,
      );
    }
  });
  afterAll(async () => t?.close());

  it('the feature flag endpoint reports enabled', async () => {
    const f = (await api.get('/api/v1/sales-deductions/feature', 200)).body;
    expect(JSON.stringify(f)).toMatch(/true/);
  });

  // The real eBriza export is UTF-16LE (no BOM). parseSalesReport decodes every
  // non-xlsx buffer with buffer.toString('utf8'), so each cell is "N\0u\0m\0e…",
  // numbers fail parseLocaleNumber and the upload is refused with
  // "Nu am găsit în fișier un tabel cu coloanele …". The headers themselves
  // ("Nume produs" / "Cantitate vanduta") ARE in the parser's dictionaries.
  it('accepts the real eBriza CSV export as uploaded (UTF-16LE) [FINDING sales-report.parser.ts parseSalesReport utf8 decode]', async () => {
    const res = await upload(
      fs.readFileSync(EBRIZA),
      'Vanzari produse 16.10.2026 - 16.10.2026.csv',
    );
    expect(res.status).toBe(201);
    expect(res.body.lines).toHaveLength(29);
  });

  it('the same export in UTF-8 parses: 29 lines, decimal-comma quantities, money columns ignored', async () => {
    const res = await upload(ebrizaUtf8());
    expect(res.status).toBe(201);
    const d = res.body;
    expect(d).toMatchObject({ status: 'DRAFT', source: 'EXCEL', locationId: shop.id });
    expect(d.lines).toHaveLength(29);
    const byName = Object.fromEntries(d.lines.map((l: { rawName: string }) => [l.rawName, l]));
    expect(byName['1 Macarons'].quantityReported).toBe(28);
    expect(byName['Balanta'].quantityReported).toBe(35);
    expect(byName['Cookie crème brûlée'].quantityReported).toBe(8);
    // matching: exact names are pre-accepted against the right product
    expect(byName['Carrot cake']).toMatchObject({
      recipeId: products['Carrot cake'].id,
      decision: 'ACCEPT',
    });
    expect(byName['Dobos'].recipeId).toBe(products['Dobos'].id);
    expect(byName['Fistic'].recipeId).toBe(products['Fistic'].id);
    // unknown products are not silently matched to a wrong product
    expect(byName['Americano'].recipeId === null || byName['Americano'].decision !== 'ACCEPT').toBe(
      true,
    );
    await api.post(`/api/v1/sales-deductions/${d.id}/discard`, {}, 204);
  });

  it('confirm: ACCEPT deducts, DECLINE ignores, CREATE_NEW makes a product; shortfall → SALES_001 unless acknowledged', async () => {
    const d = (await upload(ebrizaUtf8())).body;
    const line = (n: string) => d.lines.find((l: { rawName: string }) => l.rawName === n);

    const base = [
      {
        id: line('Carrot cake').id,
        rawName: 'Carrot cake',
        decision: 'ACCEPT',
        recipeId: products['Carrot cake'].id,
        quantity: 10,
      },
      {
        id: line('Dobos').id,
        rawName: 'Dobos',
        decision: 'ACCEPT',
        recipeId: products['Dobos'].id,
        quantity: 20,
      },
      // Fistic: sold 14, only 10 on hand
      {
        id: line('Fistic').id,
        rawName: 'Fistic',
        decision: 'ACCEPT',
        recipeId: products['Fistic'].id,
        quantity: 14,
      },
      { id: line('Americano').id, rawName: 'Americano', decision: 'DECLINE' },
      {
        id: line('Vanilie si pecan').id,
        rawName: 'Vanilie si pecan',
        decision: 'CREATE_NEW',
        newProduct: { name: `Vanilie si pecan ${uid()}`, unit: 'BUCATI', initialStock: 20 },
        quantity: 7,
      },
    ];
    const short = await api.post(`/api/v1/sales-deductions/${d.id}/confirm`, { lines: base }, 409);
    expect(short.body.errorCode).toBe('SALES_001');
    expect(short.body.message).toContain('Fistic');
    expect(await stockAt(products['Carrot cake'].id)).toBe(30); // nothing written

    base[2] = { ...base[2], acceptShortfall: true } as (typeof base)[number];
    const ok = (await api.post(`/api/v1/sales-deductions/${d.id}/confirm`, { lines: base }, 200))
      .body;
    expect(ok.status).toBe('CONFIRMED');
    expect(await stockAt(products['Carrot cake'].id)).toBe(20);
    expect(await stockAt(products['Dobos'].id)).toBe(5);
    expect(await stockAt(products['Fistic'].id)).toBe(0); // clamped
    const fl = ok.lines.find((l: { rawName: string }) => l.rawName === 'Fistic');
    expect(fl).toMatchObject({ quantity: 14, stockBefore: 10, stockAfter: 0 });
    expect(fl.shortfall).toBe(4);

    const mv = (await api.get(`/api/v1/stock/movements?recipeId=${products['Dobos'].id}`, 200))
      .body;
    expect(JSON.stringify(mv)).toContain('IESIRE_VANZARE');

    // re-uploading the same file is flagged as a duplicate of the confirmed one
    const again = (await upload(ebrizaUtf8())).body;
    expect(again.duplicateOf).toContain(d.id);
    await api.post(`/api/v1/sales-deductions/${again.id}/discard`, {}, 204);

    // double confirm is refused
    const twice = await api.post(`/api/v1/sales-deductions/${d.id}/confirm`, { lines: base }, 409);
    expect(twice.body.errorCode).toBe('SALES_002');

    // revert puts the net deltas back (Fistic returns what was really taken: 10)
    const rev = (await api.post(`/api/v1/sales-deductions/${d.id}/revert`, {}, 200)).body;
    expect(rev.status).toBe('ANULAT');
    expect(await stockAt(products['Carrot cake'].id)).toBe(30);
    expect(await stockAt(products['Dobos'].id)).toBe(25);
    expect(await stockAt(products['Fistic'].id)).toBe(10);
    await api.post(`/api/v1/sales-deductions/${d.id}/revert`, {}, 409);
  });

  it('learned aliases: a confirmed manual match is reused on the next upload', async () => {
    const d = (await upload(ebrizaUtf8())).body;
    const l = d.lines.find((x: { rawName: string }) => x.rawName === 'Cookie caramel');
    // force a manual link from the eBriza name "Punga" to Cookie caramel (silly, but proves learning)
    const punga = d.lines.find((x: { rawName: string }) => x.rawName === 'Punga');
    await api.post(
      `/api/v1/sales-deductions/${d.id}/confirm`,
      {
        lines: [
          {
            id: l.id,
            rawName: l.rawName,
            decision: 'ACCEPT',
            recipeId: products['Cookie caramel'].id,
            quantity: 1,
          },
          {
            id: punga.id,
            rawName: 'Punga',
            decision: 'ACCEPT',
            recipeId: products['Cookie caramel'].id,
            quantity: 1,
          },
        ],
      },
      200,
    );
    const next = (await upload(ebrizaUtf8())).body;
    const p2 = next.lines.find((x: { rawName: string }) => x.rawName === 'Punga');
    expect(p2.recipeId).toBe(products['Cookie caramel'].id);
    await api.post(`/api/v1/sales-deductions/${next.id}/discard`, {}, 204);
  });

  it('stockOverride sets the absolute stock; negative quantity adds back', async () => {
    const d = (await api.post('/api/v1/sales-deductions/manual', { locationId: shop.id }, 201))
      .body;
    expect(d.status).toBe('DRAFT');
    const before = await stockAt(products['Choux cu prune coapte'].id);
    await api.post(
      `/api/v1/sales-deductions/${d.id}/confirm`,
      {
        lines: [
          {
            rawName: 'Choux',
            decision: 'ACCEPT',
            recipeId: products['Choux cu prune coapte'].id,
            quantity: -2,
          },
          {
            rawName: 'Cookie',
            decision: 'ACCEPT',
            recipeId: products['Cookie caramel'].id,
            quantity: 5,
            stockOverride: 3,
          },
        ],
      },
      200,
    );
    expect(await stockAt(products['Choux cu prune coapte'].id)).toBe(before + 2);
    expect(await stockAt(products['Cookie caramel'].id)).toBe(3);
  });

  it('line validation: ACCEPT without product / quantity, CREATE_NEW without data, unknown line id', async () => {
    const d = (await api.post('/api/v1/sales-deductions/manual', { locationId: shop.id }, 201))
      .body;
    await api.post(
      `/api/v1/sales-deductions/${d.id}/confirm`,
      { lines: [{ rawName: 'X', decision: 'ACCEPT', quantity: 1 }] },
      400,
    );
    await api.post(
      `/api/v1/sales-deductions/${d.id}/confirm`,
      { lines: [{ rawName: 'X', decision: 'ACCEPT', recipeId: products['Dobos'].id }] },
      400,
    );
    await api.post(
      `/api/v1/sales-deductions/${d.id}/confirm`,
      { lines: [{ rawName: 'X', decision: 'CREATE_NEW' }] },
      400,
    );
    await api.post(
      `/api/v1/sales-deductions/${d.id}/confirm`,
      {
        lines: [{ id: '00000000-0000-4000-8000-000000000000', rawName: 'X', decision: 'DECLINE' }],
      },
      400,
    );
    await api.post(
      `/api/v1/sales-deductions/${d.id}/confirm`,
      { lines: [{ rawName: 'X', decision: 'MAYBE' }] },
      400,
    );
    await api.post(
      `/api/v1/sales-deductions/${d.id}/confirm`,
      {
        lines: [
          {
            rawName: 'X',
            decision: 'ACCEPT',
            recipeId: products['Dobos'].id,
            quantity: 1,
            stockOverride: -1,
          },
        ],
      },
      400,
    );
  });

  it('discard: a DRAFT becomes ANULAT and can no longer be confirmed', async () => {
    const d = (await upload(ebrizaUtf8())).body;
    await api.post(`/api/v1/sales-deductions/${d.id}/discard`, {}, 204);
    await api.post(`/api/v1/sales-deductions/${d.id}/discard`, {}, 409);
    const c = await api.post(`/api/v1/sales-deductions/${d.id}/confirm`, { lines: [] }, 409);
    expect(c.body.errorCode).toBe('SALES_002');
  });

  it('upload validation: no file, bad location, legacy .xls, garbage', async () => {
    const noFile = await t.http
      .post('/api/v1/sales-deductions/excel')
      .set(org.as())
      .field('locationId', shop.id);
    expect(noFile.status).toBe(400);
    const noLoc = await t.http
      .post('/api/v1/sales-deductions/excel')
      .set(org.as())
      .attach('file', ebrizaUtf8(), 'v.csv');
    expect(noLoc.status).toBe(400);
    const xls = await upload(
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]),
      'v.xls',
    );
    expect(xls.status).toBe(400);
    expect(xls.body.message).toMatch(/xls/);
    const junk = await upload(Buffer.from('hello;world\n1;2\n'), 'v.csv');
    expect(junk.status).toBe(400);
  });

  it('template CSV lists the sellable products; products endpoint carries stock', async () => {
    const tpl = await t.http
      .get(`/api/v1/sales-deductions/template?locationId=${shop.id}`)
      .set(org.as());
    expect(tpl.status).toBe(200);
    expect(tpl.text).toContain('Carrot cake');
    const prods = (await api.get(`/api/v1/sales-deductions/products?locationId=${shop.id}`, 200))
      .body;
    expect(
      prods.map((p: { name?: string; recipeName?: string }) => p.name ?? p.recipeName),
    ).toContain('Dobos');
  });

  it('the log lists confirmed/reverted sessions; GET by id; 404 unknown', async () => {
    const log = (await api.get('/api/v1/sales-deductions', 200)).body;
    expect(log.total).toBeGreaterThan(0);
    await api.get(`/api/v1/sales-deductions/${log.data[0].id}`, 200);
    await api.get('/api/v1/sales-deductions/00000000-0000-4000-8000-000000000000', 404);
  });

  it('CASL: sofer (no StockMovement) cannot upload or read; another org cannot read this org drafts', async () => {
    expect((await upload(ebrizaUtf8(), 'v.csv', 'sofer')).status).toBe(403);
    await api.get('/api/v1/sales-deductions', 403, 'sofer');
    const d = (await api.post('/api/v1/sales-deductions/manual', { locationId: shop.id }, 201))
      .body;
    const other = await createOrg(t, 'sales-other');
    const r = await t.http.get(`/api/v1/sales-deductions/${d.id}`).set(other.as());
    expect(r.status).toBe(404);
  });
});
