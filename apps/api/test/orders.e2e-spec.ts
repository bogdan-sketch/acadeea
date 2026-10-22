/**
 * Orders: manual CRUD, items, status machine + history, pickup vs delivery,
 * totals (revenue), delivery note + signature, conformity certificate,
 * archive, stats, calendar, CASL; plus the WooCommerce "în procesare" auto
 * stock deduction (webhook → sales deduction at the default location).
 */
import * as path from 'path';
import { createHmac } from 'crypto';

import { bootApp, TestApp } from './helpers/app';
import { Api } from './helpers/factory';
import { createOrg, TestOrg, uid } from './helpers/org';

jest.setTimeout(120000);

const SIGNATURE = path.join(__dirname, 'fixtures', 'signature.png');

describe('Orders', () => {
  let t: TestApp;
  let org: TestOrg;
  let api: Api;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cake: any, tart: any, shop: any;

  beforeAll(async () => {
    t = await bootApp();
    org = await createOrg(t, 'orders');
    api = new Api(t, org);
    shop = await api.location({ name: `Magazin ${uid()}`, type: 'MAGAZIN' });
    cake = await api.recipe([], { name: `Tort ${uid()}`, unit: 'BUCATI' });
    tart = await api.recipe([], { name: `Tarta ${uid()}`, unit: 'BUCATI' });
    await api.patch(`/api/v1/recipes/${cake.id}`, { sellingPrice: 150 }, 200);
    await api.patch(`/api/v1/recipes/${tart.id}`, { sellingPrice: 40 }, 200);
  });
  afterAll(async () => t?.close());

  const order = (
    overrides: object = {},
    s = 201,
    role?: 'cofetar' | 'gestionar' | 'sofer' | 'sef-cofetar',
  ) =>
    api.post(
      '/api/v1/orders',
      {
        deliveryPoint: 'Cafenea Centrală',
        deliveryAddress: 'Str. Memorandumului 1, Cluj-Napoca',
        dueDate: '2026-10-20T09:00:00.000Z',
        items: [
          { recipeId: cake.id, quantity: 2, unit: 'BUCATI' },
          { recipeId: tart.id, quantity: 5, unit: 'BUCATI', notes: 'fără nuci' },
        ],
        ...overrides,
      },
      s,
      role,
    );

  describe('create + read', () => {
    it('creates NOUA with a per-org order number CMD-YYYYMMDD-NNN and items', async () => {
      const o = (await order()).body;
      expect(o.status).toBe('NOUA');
      expect(o.orderNumber).toMatch(/^CMD-\d{8}-\d{3,}$/);
      expect(o.items).toHaveLength(2);
      expect(o.fulfillmentType).toBe('DELIVERY');
      const got = (await api.get(`/api/v1/orders/${o.id}`, 200)).body;
      expect(got.items.find((i: { recipeId: string }) => i.recipeId === tart.id).notes).toBe(
        'fără nuci',
      );
      const o2 = (await order()).body;
      expect(o2.orderNumber).not.toBe(o.orderNumber);
    });

    it('pickup orders carry the pickup location', async () => {
      const o = (
        await order({
          fulfillmentType: 'PICKUP',
          pickupLocationId: shop.id,
          deliveryAddress: undefined,
        })
      ).body;
      expect(o).toMatchObject({ fulfillmentType: 'PICKUP', pickupLocationId: shop.id });
    });

    it('validation: missing deliveryPoint, quantity ≤ 0, bad unit, non-FINAL / archived / unknown recipe, bad date', async () => {
      await api.post(
        '/api/v1/orders',
        { items: [{ recipeId: cake.id, quantity: 1, unit: 'BUCATI' }] },
        400,
      );
      await order({ items: [{ recipeId: cake.id, quantity: 0, unit: 'BUCATI' }] }, 400);
      await order({ items: [{ recipeId: cake.id, quantity: 1, unit: 'BUC' }] }, 400);
      const semi = await api.recipe([], { type: 'SEMIPREPARAT', unit: 'GRAME' });
      await order({ items: [{ recipeId: semi.id, quantity: 1, unit: 'GRAME' }] }, 400);
      await order(
        {
          items: [
            { recipeId: '00000000-0000-4000-8000-000000000000', quantity: 1, unit: 'BUCATI' },
          ],
        },
        400,
      );
      const old = await api.recipe([]);
      await api.patch(`/api/v1/recipes/${old.id}/archive`, { archived: true }, 200);
      await order({ items: [{ recipeId: old.id, quantity: 1, unit: 'BUCATI' }] }, 400);
      await order({ dueDate: 'poimâine' }, 400);
      await order({ fulfillmentType: 'COURIER' }, 400);
    });

    // pickupLocationId / assignedToId are only @IsUUID — unknown ids hit the FK → 500.
    it('an unknown pickup location or assignee is a 4xx, never a 500 [FINDING orders.service.ts create FK]', async () => {
      const a = await t.http
        .post('/api/v1/orders')
        .set(org.as())
        .send({
          deliveryPoint: 'X',
          fulfillmentType: 'PICKUP',
          pickupLocationId: '00000000-0000-4000-8000-000000000000',
          items: [{ recipeId: cake.id, quantity: 1, unit: 'BUCATI' }],
        });
      expect(a.status).toBeLessThan(500);
      const b = await t.http
        .post('/api/v1/orders')
        .set(org.as())
        .send({
          deliveryPoint: 'X',
          assignedToId: '00000000-0000-4000-8000-000000000000',
          items: [{ recipeId: cake.id, quantity: 1, unit: 'BUCATI' }],
        });
      expect(b.status).toBeLessThan(500);
    });

    it('lists with search + status filter; 404 for unknown id', async () => {
      const o = (await order({ deliveryPoint: `Hotel ${uid()}` })).body;
      const bySearch = (
        await api.get(`/api/v1/orders?search=${encodeURIComponent(o.deliveryPoint)}`, 200)
      ).body;
      expect(bySearch.data.map((x: { id: string }) => x.id)).toEqual([o.id]);
      const byStatus = (await api.get('/api/v1/orders?status=NOUA&limit=100', 200)).body;
      expect(byStatus.data.every((x: { status: string }) => x.status === 'NOUA')).toBe(true);
      await api.get('/api/v1/orders/00000000-0000-4000-8000-000000000000', 404);
    });
  });

  describe('totals', () => {
    it('revenue = Σ sellingPrice × quantity (2 × 150 + 5 × 40 = 500)', async () => {
      const o = (await order()).body;
      const rev = (await api.get(`/api/v1/orders/${o.id}/revenue`, 200)).body;
      expect(rev.totalRevenue).toBe(500);
    });

    it('revenue is null when a product has no selling price', async () => {
      const noPrice = await api.recipe([]);
      const o = (await order({ items: [{ recipeId: noPrice.id, quantity: 1, unit: 'BUCATI' }] }))
        .body;
      expect((await api.get(`/api/v1/orders/${o.id}/revenue`, 200)).body.totalRevenue).toBeNull();
    });
  });

  describe('items', () => {
    it('add / update / remove while NOUA or IN_PREGATIRE; frozen afterwards', async () => {
      const o = (await order({ items: [{ recipeId: cake.id, quantity: 1, unit: 'BUCATI' }] })).body;
      const added = (
        await api.post(
          `/api/v1/orders/${o.id}/items`,
          { recipeId: tart.id, quantity: 3, unit: 'BUCATI' },
          201,
        )
      ).body;
      expect(added.items).toHaveLength(2);
      const tartItem = added.items.find((i: { recipeId: string }) => i.recipeId === tart.id);
      const upd = (
        await api.patch(
          `/api/v1/orders/${o.id}/items/${tartItem.id}`,
          { quantity: 4, status: 'GATA' },
          200,
        )
      ).body;
      expect(upd.items.find((i: { id: string }) => i.id === tartItem.id)).toMatchObject({
        quantity: 4,
        status: 'GATA',
      });
      await api.patch(`/api/v1/orders/${o.id}/items/${tartItem.id}`, { quantity: 0 }, 400);
      await api.del(`/api/v1/orders/${o.id}/items/${tartItem.id}`, 200);

      await api.patch(`/api/v1/orders/${o.id}`, { status: 'IN_PREGATIRE' }, 200);
      await api.patch(`/api/v1/orders/${o.id}`, { status: 'PREGATITA' }, 200);
      await api.post(
        `/api/v1/orders/${o.id}/items`,
        { recipeId: tart.id, quantity: 1, unit: 'BUCATI' },
        400,
      );
      const cakeItem = (await api.get(`/api/v1/orders/${o.id}`, 200)).body.items[0];
      await api.del(`/api/v1/orders/${o.id}/items/${cakeItem.id}`, 400);
    });
  });

  describe('status machine', () => {
    it('NOUA → IN_PREGATIRE → PREGATITA → IN_TRANZIT → LIVRATA with history and completedAt', async () => {
      const o = (await order()).body;
      for (const s of ['IN_PREGATIRE', 'PREGATITA', 'IN_TRANZIT', 'LIVRATA']) {
        const r = (await api.patch(`/api/v1/orders/${o.id}`, { status: s }, 200)).body;
        expect(r.status).toBe(s);
      }
      const done = (await api.get(`/api/v1/orders/${o.id}`, 200)).body;
      expect(done.completedAt).toBeTruthy();
      const hist = (await api.get(`/api/v1/orders/${o.id}/status-history`, 200)).body;
      // newest first
      expect(hist.map((h: { toStatus: string }) => h.toStatus)).toEqual([
        'LIVRATA',
        'IN_TRANZIT',
        'PREGATITA',
        'IN_PREGATIRE',
      ]);
    });

    it('refuses skips and anything out of LIVRATA / ANULATA; IN_TRANZIT cannot be cancelled', async () => {
      const o = (await order()).body;
      await api.patch(`/api/v1/orders/${o.id}`, { status: 'LIVRATA' }, 400);
      await api.patch(`/api/v1/orders/${o.id}`, { status: 'PREGATITA' }, 400);
      await api.patch(`/api/v1/orders/${o.id}`, { status: 'GATA' }, 400);
      await api.patch(`/api/v1/orders/${o.id}`, { status: 'ANULATA' }, 200);
      await api.patch(`/api/v1/orders/${o.id}`, { status: 'NOUA' }, 400);

      const o2 = (await order()).body;
      for (const s of ['IN_PREGATIRE', 'PREGATITA', 'IN_TRANZIT'])
        await api.patch(`/api/v1/orders/${o2.id}`, { status: s }, 200);
      await api.patch(`/api/v1/orders/${o2.id}`, { status: 'ANULATA' }, 400);
    });

    it('a manual order status change never touches stock', async () => {
      await api.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: cake.id,
          movementType: 'INTRARE',
          quantity: 10,
          unit: 'BUCATI',
          locationId: shop.id,
        },
        201,
      );
      const before = (await api.get(`/api/v1/stock/item-availability?recipeId=${cake.id}`, 200))
        .body.totalQuantity;
      const o = (await order()).body;
      for (const s of ['IN_PREGATIRE', 'PREGATITA', 'IN_TRANZIT', 'LIVRATA'])
        await api.patch(`/api/v1/orders/${o.id}`, { status: s }, 200);
      expect(
        (await api.get(`/api/v1/stock/item-availability?recipeId=${cake.id}`, 200)).body
          .totalQuantity,
      ).toBe(before);
    });
  });

  describe('delivery documents', () => {
    it('delivery note: create once, sign (assignee or admin), signature image, conformity certificate', async () => {
      const o = (await order({ assignedToId: org.users.sofer.id })).body;
      await api.get(`/api/v1/orders/${o.id}/delivery-note`, 404);
      await api.post(`/api/v1/orders/${o.id}/delivery-note`, {}, 201);
      await api.post(`/api/v1/orders/${o.id}/delivery-note`, {}, 400);
      const note = (await api.get(`/api/v1/orders/${o.id}/delivery-note`, 200)).body;
      expect(note.serialNumber).toBeTruthy();
      expect(note.hasSignature).toBe(false);

      // gestionar is neither admin nor the assignee
      const g = await t.http
        .patch(`/api/v1/orders/${o.id}/delivery-note/sign`)
        .set(org.as('gestionar'))
        .field('signedByName', 'X')
        .attach('signature', SIGNATURE);
      expect(g.status).toBe(403);
      const s = await t.http
        .patch(`/api/v1/orders/${o.id}/delivery-note/sign`)
        .set(org.as())
        .field('signedByName', 'Maria Client')
        .attach('signature', SIGNATURE);
      expect(s.status).toBe(200);
      const signed = (await api.get(`/api/v1/orders/${o.id}/delivery-note`, 200)).body;
      expect(signed).toMatchObject({ hasSignature: true, signedByName: 'Maria Client' });
      const img = await t.http.get(`/api/v1/orders/${o.id}/delivery-note/signature`).set(org.as());
      expect(img.status).toBe(200);

      const cert = await api.post(`/api/v1/orders/${o.id}/conformity-certificate`, {});
      expect([200, 201]).toContain(cert.status);
      const got = (await api.get(`/api/v1/orders/${o.id}/conformity-certificate`, 200)).body;
      expect(got.serialNumber ?? got.certificate?.serialNumber).toBeTruthy();
      const pdf = await t.http
        .get(`/api/v1/orders/${o.id}/conformity-certificate/pdf`)
        .set(org.as());
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toMatch(/pdf/);
    });
  });

  describe('archive / stats / calendar', () => {
    it('only closed orders can be archived; archived leave the default list', async () => {
      const o = (await order()).body;
      await api.patch(`/api/v1/orders/${o.id}/archive`, { archived: true }, 400);
      await api.patch(`/api/v1/orders/${o.id}`, { status: 'ANULATA' }, 200);
      await api.patch(`/api/v1/orders/${o.id}/archive`, { archived: true }, 200);
      const list = (await api.get('/api/v1/orders?limit=200', 200)).body;
      expect(list.data.map((x: { id: string }) => x.id)).not.toContain(o.id);
      const arch = (await api.get('/api/v1/orders?archived=true&limit=200', 200)).body;
      expect(arch.data.map((x: { id: string }) => x.id)).toContain(o.id);
    });

    // Regression: "false" used to be coerced to true (see QueryBoolean).
    it('?archived=false lists the active orders', async () => {
      const o = (await order()).body;
      const list = (await api.get('/api/v1/orders?archived=false&limit=200', 200)).body;
      expect(list.data.map((x: { id: string }) => x.id)).toContain(o.id);
    });

    it('stats count by status and delivery point', async () => {
      const fresh = await createOrg(t, 'orders-stats');
      const fapi = new Api(t, fresh);
      const r = await fapi.recipe([]);
      const mk = (point: string) =>
        fapi.post(
          '/api/v1/orders',
          { deliveryPoint: point, items: [{ recipeId: r.id, quantity: 1, unit: 'BUCATI' }] },
          201,
        );
      const a = (await mk('A')).body;
      await mk('A');
      await mk('B');
      for (const s of ['IN_PREGATIRE', 'PREGATITA', 'IN_TRANZIT', 'LIVRATA'])
        await fapi.patch(`/api/v1/orders/${a.id}`, { status: s }, 200);
      const st = (await fapi.get('/api/v1/orders/stats', 200)).body;
      expect(st).toMatchObject({ totalOrders: 3, completedOrders: 1 });
      expect(st.statusCounts).toMatchObject({ NOUA: 2, LIVRATA: 1, ANULATA: 0 });
      expect(st.deliveryPointCounts[0]).toEqual({ deliveryPoint: 'A', count: 2 });
    });

    it('calendar groups by due day inside the range and filters by status', async () => {
      const fresh = await createOrg(t, 'orders-cal');
      const fapi = new Api(t, fresh);
      const r = await fapi.recipe([]);
      const mk = (dueDate: string) =>
        fapi.post(
          '/api/v1/orders',
          { deliveryPoint: 'X', dueDate, items: [{ recipeId: r.id, quantity: 1, unit: 'BUCATI' }] },
          201,
        );
      await mk('2026-11-02T10:00:00.000Z');
      await mk('2026-11-02T12:00:00.000Z');
      const c = (await mk('2026-11-05T10:00:00.000Z')).body;
      await mk('2026-12-01T10:00:00.000Z');
      await fapi.patch(`/api/v1/orders/${c.id}`, { status: 'ANULATA' }, 200);
      const cal = (await fapi.get('/api/v1/orders/calendar?from=2026-11-01&to=2026-11-30', 200))
        .body;
      expect(Object.keys(cal).sort()).toEqual(['2026-11-02', '2026-11-05']);
      expect(cal['2026-11-02']).toHaveLength(2);
      const onlyNew = (
        await fapi.get('/api/v1/orders/calendar?from=2026-11-01&to=2026-11-30&status=NOUA', 200)
      ).body;
      expect(Object.keys(onlyNew)).toEqual(['2026-11-02']);
    });

    // getCalendar keys days with toISOString() (UTC). An order due at 00:30
    // Romanian time (UTC+3) lands on the previous day.
    it('calendar days are local (Europe/Bucharest), not UTC [FINDING orders.service.ts getCalendar toISOString]', async () => {
      const fresh = await createOrg(t, 'orders-tz');
      const fapi = new Api(t, fresh);
      const r = await fapi.recipe([]);
      await fapi.post(
        '/api/v1/orders',
        {
          deliveryPoint: 'X',
          dueDate: '2026-11-10T00:30:00+02:00',
          items: [{ recipeId: r.id, quantity: 1, unit: 'BUCATI' }],
        },
        201,
      );
      const cal = (await fapi.get('/api/v1/orders/calendar?from=2026-11-01&to=2026-11-30', 200))
        .body;
      expect(Object.keys(cal)).toEqual(['2026-11-10']);
    });

    it('calendar with a bad status or date is a 4xx, never a 500 [FINDING orders.controller.ts getCalendar unvalidated query]', async () => {
      const a = await t.http.get('/api/v1/orders/calendar?status=GATA').set(org.as());
      expect(a.status).toBeLessThan(500);
      const b = await t.http.get('/api/v1/orders/calendar?from=ieri').set(org.as());
      expect(b.status).toBeLessThan(500);
    });
  });

  describe('CASL', () => {
    it('cofetar / sef-cofetar create + update; gestionar and sofer cannot read orders', async () => {
      const o = (await order({}, 201, 'cofetar')).body;
      await api.patch(`/api/v1/orders/${o.id}`, { status: 'IN_PREGATIRE' }, 200, 'sef-cofetar');
      await api.get('/api/v1/orders', 403, 'gestionar');
      await api.get('/api/v1/orders', 403, 'sofer');
      const del = await t.http
        .post('/api/v1/orders/bulk-delete')
        .set(org.as('cofetar'))
        .send({ ids: [o.id] });
      expect(del.status).toBe(403);
      const ok = (await api.post('/api/v1/orders/bulk-delete', { ids: [o.id], cascade: true }, 200))
        .body;
      expect(ok.deleted).toEqual([o.id]);
    });
  });

  describe('WooCommerce "în procesare" auto stock deduction', () => {
    const WOO_SECRET = 'woo-e2e-secret';
    /** POST a WooCommerce webhook signed like WooCommerce does (X-WC-Webhook-Signature). */
    const signedHook = (integrationId: string, body: object, secret = WOO_SECRET) => {
      const raw = JSON.stringify(body);
      return t.http
        .post(`/api/v1/integrations/${integrationId}/webhook/woocommerce`)
        .set('Content-Type', 'application/json')
        .set('X-WC-Webhook-Signature', createHmac('sha256', secret).update(raw).digest('base64'))
        .send(raw);
    };
    async function wooSetup(o: TestOrg) {
      const a = new Api(t, o);
      const product = await a.recipe([], { name: `Ecler ${uid()}`, unit: 'BUCATI' });
      const integ = (
        await a.post(
          '/api/v1/integrations',
          { provider: 'WOOCOMMERCE', config: { webhookSecret: WOO_SECRET } },
          201,
        )
      ).body;
      await a.post(
        `/api/v1/integrations/${integ.id}/mappings`,
        { externalProductId: '501', externalProductName: 'Ecler', recipeId: product.id },
        201,
      );
      return { a, product, integ };
    }
    const wooOrder = (id: number, status: string, qty = 3) => ({
      id,
      number: String(id),
      status,
      date_created_gmt: '2026-10-17T08:00:00',
      billing: { first_name: 'Ana', last_name: 'Pop' },
      line_items: [{ id: 9001, product_id: 501, variation_id: 0, name: 'Ecler', quantity: qty }],
    });

    it('processing → deducted once at the shop; retries do not double-deduct; pending is ignored', async () => {
      const fresh = await createOrg(t, 'woo');
      const { a, product, integ } = await wooSetup(fresh);
      const store = await a.location({ type: 'MAGAZIN' });
      await a.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: product.id,
          movementType: 'INTRARE',
          quantity: 10,
          unit: 'BUCATI',
          locationId: store.id,
        },
        201,
      );
      const hook = (body: object) => signedHook(integ.id, body);

      expect((await hook(wooOrder(7001, 'pending'))).status).toBe(200);
      expect(
        (await a.get(`/api/v1/stock/item-availability?recipeId=${product.id}`, 200)).body
          .totalQuantity,
      ).toBe(10);

      expect((await hook(wooOrder(7001, 'processing'))).status).toBe(200);
      expect(
        (await a.get(`/api/v1/stock/item-availability?recipeId=${product.id}`, 200)).body
          .totalQuantity,
      ).toBe(7);
      expect((await hook(wooOrder(7001, 'processing'))).status).toBe(200);
      expect((await hook(wooOrder(7001, 'completed'))).status).toBe(200);
      expect(
        (await a.get(`/api/v1/stock/item-availability?recipeId=${product.id}`, 200)).body
          .totalQuantity,
      ).toBe(7);

      const log = (await a.get('/api/v1/sales-deductions', 200)).body;
      const rows = log.data ?? log;
      expect(rows.filter((d: { source: string }) => d.source === 'WOOCOMMERCE')).toHaveLength(1);

      // the order itself is queued for import
      const ext = (await a.get(`/api/v1/integrations/${integ.id}/orders`, 200)).body;
      expect(JSON.stringify(ext)).toContain('7001');
    });

    it('selling more than on hand clamps the stock at 0 (sale logged in full)', async () => {
      const fresh = await createOrg(t, 'woo-clamp');
      const { a, product, integ } = await wooSetup(fresh);
      const store = await a.location({ type: 'MAGAZIN' });
      await a.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: product.id,
          movementType: 'INTRARE',
          quantity: 2,
          unit: 'BUCATI',
          locationId: store.id,
        },
        201,
      );
      await signedHook(integ.id, wooOrder(7100, 'processing', 5)).expect(200);
      expect(
        (await a.get(`/api/v1/stock/item-availability?recipeId=${product.id}`, 200)).body
          .totalQuantity,
      ).toBe(0);
    });

    it('unsigned or wrongly signed → 401; secret-less → ignored; nothing is stored', async () => {
      const { a, integ } = await wooSetup(org);
      const order = wooOrder(7300, 'processing');
      const unsigned = await t.http
        .post(`/api/v1/integrations/${integ.id}/webhook/woocommerce`)
        .send(order);
      expect(unsigned.status).toBe(401);
      expect((await signedHook(integ.id, order, 'not-the-secret')).status).toBe(401);
      const noSecret = (
        await a.post('/api/v1/integrations', { provider: 'WOOCOMMERCE', config: {} }, 201)
      ).body;
      expect((await signedHook(noSecret.id, order)).status).toBeLessThan(300);
      const stored = (await a.get(`/api/v1/integrations/${integ.id}/orders`)).body;
      expect(Array.isArray(stored) ? stored.length : 0).toBe(0);
    });

    it('unknown integration id → 404', async () => {
      const r = await t.http
        .post('/api/v1/integrations/00000000-0000-4000-8000-000000000000/webhook/woocommerce')
        .send(wooOrder(1, 'processing'));
      expect(r.status).toBe(404);
    });

    // autoDeductWooOrder reads `organization.findFirst()` — Organization is not
    // tenant-scoped, so it gets the OLDEST org's defaultLocationId, fails the
    // scoped location lookup and silently falls back to the first MAGAZIN.
    it('deducts at each org default location when set (two orgs) [FINDING sales-deductions.service.ts:320 organization.findFirst]', async () => {
      // findFirst() returns ONE org for every caller, so with two orgs at least
      // one of them gets the wrong default location — deterministic failure.
      const results: number[] = [];
      for (const label of ['woo-def-a', 'woo-def-b']) {
        const fresh = await createOrg(t, label);
        const { a, product, integ } = await wooSetup(fresh);
        await a.location({ type: 'MAGAZIN' });
        const depo = await a.location({ type: 'DEPOZIT' });
        await a.patch('/api/v1/organization', { defaultLocationId: depo.id }, 200);
        await a.post(
          '/api/v1/stock/recipe-movements',
          {
            recipeId: product.id,
            movementType: 'INTRARE',
            quantity: 10,
            unit: 'BUCATI',
            locationId: depo.id,
          },
          201,
        );
        await signedHook(integ.id, wooOrder(7200, 'processing', 4)).expect(200);
        const avail = (await a.get(`/api/v1/stock/item-availability?recipeId=${product.id}`, 200))
          .body;
        results.push(
          avail.locations.find((l: { locationId: string }) => l.locationId === depo.id).quantity,
        );
      }
      expect(results).toEqual([6, 6]);
    });
  });
});
