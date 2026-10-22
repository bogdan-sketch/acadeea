/**
 * Shop delivery feature (Organization.wooDeliveryEnabled): Pickupia delivery
 * date + method import, location external id → PICKUP, "unitate principală"
 * stock deduction, delivery-method filter + short names, Intrări/Livrări views
 * and the calendar view switch. With the switch off the import keeps the
 * legacy rules.
 */
import { createHmac } from 'crypto';

import { bootApp, TestApp } from './helpers/app';
import { Api } from './helpers/factory';
import { createOrg, uid } from './helpers/org';

jest.setTimeout(120000);

const SECRET = 'woo-delivery-secret';

describe('Woo shop delivery', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(async () => t?.close());

  const hook = (integrationId: string, body: object) => {
    const raw = JSON.stringify(body);
    return t.http
      .post(`/api/v1/integrations/${integrationId}/webhook/woocommerce`)
      .set('Content-Type', 'application/json')
      .set('X-WC-Webhook-Signature', createHmac('sha256', SECRET).update(raw).digest('base64'))
      .send(raw);
  };

  const wooOrder = (
    id: number,
    groups: { method: string; external_id: string; date: string }[] | null,
    legacyText?: string,
  ) => ({
    id,
    number: String(id),
    status: 'processing',
    date_created_gmt: '2026-10-17T08:00:00',
    date_created: '2026-10-17T11:00:00',
    billing: { first_name: 'Ana', last_name: 'Pop', address_1: 'Str. A 1', city: 'Cluj' },
    meta_data: groups ? [{ key: '_pickupia_delivery_groups', value: groups }] : [],
    line_items: [
      {
        id: 1,
        product_id: 601,
        variation_id: 0,
        name: 'Ecler',
        quantity: 2,
        meta_data: legacyText
          ? [{ key: 'Comanda se ridică de la cofetărie', value: legacyText }]
          : [],
      },
    ],
  });

  async function setup(enabled: boolean) {
    const org = await createOrg(t, enabled ? 'wood-on' : 'wood-off');
    const a = new Api(t, org);
    const product = await a.recipe([], { name: `Ecler ${uid()}`, unit: 'BUCATI' });
    const integ = (
      await a.post(
        '/api/v1/integrations',
        { provider: 'WOOCOMMERCE', config: { webhookSecret: SECRET } },
        201,
      )
    ).body;
    await a.post(
      `/api/v1/integrations/${integ.id}/mappings`,
      { externalProductId: '601', externalProductName: 'Ecler', recipeId: product.id },
      201,
    );
    await a.patch('/api/v1/organization', { wooDeliveryEnabled: enabled }, 200);
    const lab = await a.location({ type: 'LABORATOR', isMainUnit: true });
    const napoca = await a.location({ type: 'MAGAZIN', isMainUnit: true, externalId: 'napoca' });
    for (const loc of [lab, napoca]) {
      await a.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: product.id,
          movementType: 'INTRARE',
          quantity: 10,
          unit: 'BUCATI',
          locationId: loc.id,
        },
        201,
      );
    }
    const stockAt = async (locId: string) =>
      (
        await a.get(`/api/v1/stock/item-availability?recipeId=${product.id}`, 200)
      ).body.locations.find((l: { locationId: string }) => l.locationId === locId)?.quantity;
    return { a, integ, lab, napoca, stockAt };
  }

  it('location external id is unique per org; the feature switch rides the organization', async () => {
    const { a } = await setup(true);
    expect((await a.get('/api/v1/organization', 200)).body.wooDeliveryEnabled).toBe(true);
    const r = await a.post(
      '/api/v1/locations',
      { name: `X ${uid()}`, type: 'MAGAZIN', address: 'Str. 1', externalId: 'napoca' },
      409,
    );
    expect(r.body.message).toContain('napoca');
  });

  it('imports date + method, matches pickups, deducts at the main unit, filters and sorts', async () => {
    const { a, integ, lab, napoca, stockAt } = await setup(true);

    await hook(
      integ.id,
      wooOrder(8001, [{ method: 'Ridicare Napoca', external_id: 'napoca', date: '2099-01-05' }]),
    ).expect(200);
    await hook(
      integ.id,
      wooOrder(8002, [{ method: 'Livrare în Cluj-Napoca', external_id: '', date: '2099-01-03' }]),
    ).expect(200);
    await hook(
      integ.id,
      wooOrder(8003, [{ method: 'Livrare în Cluj', external_id: '', date: '' }]),
    ).expect(200);

    // Pickup at a main unit → deducted there; others → first main unit (lab).
    expect(await stockAt(napoca.id)).toBe(8);
    expect(await stockAt(lab.id)).toBe(6);

    await a.post(`/api/v1/integrations/${integ.id}/sync`, {}, 201);
    const list = (await a.get('/api/v1/orders?limit=50', 200)).body.data;
    const byNum = (n: string) => list.find((o: { orderNumber: string }) => o.orderNumber === n);
    expect(byNum('WOO-8001')).toMatchObject({
      fulfillmentType: 'PICKUP',
      pickupLocationId: napoca.id,
      deliveryMethod: 'Ridicare Napoca',
    });
    expect(byNum('WOO-8001').dueDate).toBe('2099-01-05T00:00:00.000Z');
    expect(byNum('WOO-8002')).toMatchObject({
      fulfillmentType: 'DELIVERY',
      deliveryMethod: 'Livrare în Cluj-Napoca',
      deliveryAddress: 'Str. A 1, Cluj',
    });

    // Livrări: furthest delivery first, undated (= today) after the future ones.
    const livrari = (await a.get('/api/v1/orders?view=livrari&limit=50', 200)).body;
    expect(livrari.data.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([
      'WOO-8001',
      'WOO-8002',
      'WOO-8003',
    ]);
    expect(livrari.total).toBe(3);
    // Pagination still applies on the delivery order.
    const page2 = (await a.get('/api/v1/orders?view=livrari&limit=1&page=2', 200)).body;
    expect(page2.data.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['WOO-8002']);

    // Several statuses at once (?statuses=a,b); a bad value is a 400.
    expect(
      (await a.get('/api/v1/orders?statuses=NOUA,IN_PREGATIRE&limit=50', 200)).body.total,
    ).toBe(3);
    expect((await a.get('/api/v1/orders?statuses=LIVRATA&limit=50', 200)).body.total).toBe(0);
    await a.get('/api/v1/orders?statuses=NOUA,BOGUS', 400);

    // Whole-part filter: "Livrare în Cluj" must not match "Livrare în Cluj-Napoca".
    const cluj = (
      await a.get(`/api/v1/orders?deliveryMethod=${encodeURIComponent('Livrare în Cluj')}`, 200)
    ).body;
    expect(cluj.data.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['WOO-8003']);

    // Methods + short names.
    let methods = (await a.get('/api/v1/orders/delivery-methods', 200)).body;
    expect(methods.map((m: { name: string }) => m.name).sort()).toEqual(
      ['Livrare în Cluj', 'Livrare în Cluj-Napoca', 'Ridicare Napoca'].sort(),
    );
    methods = (
      await a.put(
        '/api/v1/orders/delivery-methods/alias',
        { name: 'Livrare în Cluj-Napoca', shortName: 'Cluj' },
        200,
      )
    ).body;
    expect(
      methods.find((m: { name: string }) => m.name === 'Livrare în Cluj-Napoca'),
    ).toMatchObject({
      shortName: 'Cluj',
      label: 'Cluj',
      count: 1,
    });
    methods = (
      await a.put(
        '/api/v1/orders/delivery-methods/alias',
        { name: 'Livrare în Cluj-Napoca', shortName: '' },
        200,
      )
    ).body;
    expect(
      methods.find((m: { name: string }) => m.name === 'Livrare în Cluj-Napoca').shortName,
    ).toBeNull();
    await a.put(
      '/api/v1/orders/delivery-methods/alias',
      { name: 'X', shortName: 'Y' },
      403,
      'cofetar',
    );

    // Ridicare / Livrare: auto-detected (8001 matched a pickup location), admin-overridable.
    methods = (await a.get('/api/v1/orders/delivery-methods', 200)).body;
    const byName = (n: string) => methods.find((m: { name: string }) => m.name === n);
    expect(byName('Ridicare Napoca')).toMatchObject({ kind: 'PICKUP', kindSet: false });
    expect(byName('Livrare în Cluj')).toMatchObject({ kind: 'DELIVERY', kindSet: false });
    const nums = async (q: string) =>
      (await a.get(`/api/v1/orders?limit=50&${q}`, 200)).body.data
        .map((o: { orderNumber: string }) => o.orderNumber)
        .sort();
    expect(await nums('deliveryKind=DELIVERY')).toEqual(['WOO-8002', 'WOO-8003']);
    expect(await nums('deliveryKind=PICKUP')).toEqual(['WOO-8001']);
    methods = (
      await a.put(
        '/api/v1/orders/delivery-methods/alias',
        { name: 'Livrare în Cluj', kind: 'PICKUP' },
        200,
      )
    ).body;
    expect(byName('Livrare în Cluj')).toMatchObject({
      kind: 'PICKUP',
      kindSet: true,
      shortName: null,
    });
    expect(await nums('deliveryKind=PICKUP')).toEqual(['WOO-8001', 'WOO-8003']);
    // A short name alone keeps the kind; kind null goes back to auto.
    await a.put(
      '/api/v1/orders/delivery-methods/alias',
      { name: 'Livrare în Cluj', shortName: 'Cluj' },
      200,
    );
    methods = (
      await a.put(
        '/api/v1/orders/delivery-methods/alias',
        { name: 'Livrare în Cluj', kind: null },
        200,
      )
    ).body;
    expect(byName('Livrare în Cluj')).toMatchObject({
      kind: 'DELIVERY',
      kindSet: false,
      shortName: 'Cluj',
      label: 'Cluj',
    });
    const calKind = (
      await a.get('/api/v1/orders/calendar?from=2099-01-01&to=2099-01-31&deliveryKind=PICKUP', 200)
    ).body;
    expect(Object.keys(calKind)).toEqual(['2099-01-05']);

    // Calendar: livrari puts undated orders on today; intrari groups by placed day.
    const cal = (await a.get('/api/v1/orders/calendar?from=2099-01-01&to=2099-01-31', 200)).body;
    expect(Object.keys(cal).sort()).toEqual(['2099-01-03', '2099-01-05']);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(
      new Date(),
    );
    const calToday = (await a.get(`/api/v1/orders/calendar?from=${today}&to=${today}`, 200)).body;
    expect(calToday[today].map((o: { orderNumber: string }) => o.orderNumber)).toContain(
      'WOO-8003',
    );
    const intrari = (
      await a.get('/api/v1/orders/calendar?view=intrari&from=2026-10-17&to=2026-10-17', 200)
    ).body;
    expect(intrari['2026-10-17']).toHaveLength(3);
    await a.get('/api/v1/orders/calendar?view=bogus', 400);
  });

  it('with the switch off: legacy date text only, no pickup matching, legacy deduction location', async () => {
    const { a, integ, lab, napoca, stockAt } = await setup(false);
    const shop = await a.location({ type: 'MAGAZIN' });
    await a.patch('/api/v1/organization', { defaultLocationId: shop.id }, 200);
    await hook(
      integ.id,
      wooOrder(
        8101,
        [{ method: 'Ridicare Napoca', external_id: 'napoca', date: '2099-01-05' }],
        '20.10.2026',
      ),
    ).expect(200);
    expect(await stockAt(napoca.id)).toBe(10);
    expect(await stockAt(lab.id)).toBe(10);

    await a.post(`/api/v1/integrations/${integ.id}/sync`, {}, 201);
    const o = (await a.get('/api/v1/orders?limit=10', 200)).body.data.find(
      (x: { orderNumber: string }) => x.orderNumber === 'WOO-8101',
    );
    expect(o).toMatchObject({
      fulfillmentType: 'DELIVERY',
      pickupLocationId: null,
      deliveryMethod: null,
    });
    expect(o.dueDate).toBe('2026-10-20T00:00:00.000Z');
  });
});
