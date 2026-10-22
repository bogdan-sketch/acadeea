/**
 * Stock transfers: source deducted at creation, IN_ASTEPTARE → IN_TRANZIT →
 * FINALIZAT / ANULAT, assignee required for transit, idempotent status
 * claims, ad-hoc destinations, aviz fields + signature, approval layer,
 * recipe (finished goods) transfers, CASL.
 */
import * as path from 'path';

import { bootApp, TestApp } from './helpers/app';
import { Api } from './helpers/factory';
import { createOrg, TestOrg, uid } from './helpers/org';

jest.setTimeout(120000);

const SIGNATURE = path.join(__dirname, 'fixtures', 'signature.png');

describe('Stock transfers', () => {
  let t: TestApp;
  let org: TestOrg;
  let api: Api;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lab: any, shop: any;

  beforeAll(async () => {
    t = await bootApp();
    org = await createOrg(t, 'transfers');
    api = new Api(t, org);
    lab = await api.location({ name: `Laborator ${uid()}`, type: 'LABORATOR' });
    shop = await api.location({ name: `Magazin ${uid()}`, type: 'MAGAZIN' });
  });
  afterAll(async () => t?.close());

  async function qty(locationId: string, rawMaterialId: string) {
    const rows = (await api.get(`/api/v1/locations/${locationId}/stock`, 200)).body;
    return Number(
      rows.find((r: { rawMaterialId: string }) => r.rawMaterialId === rawMaterialId)?.quantity ?? 0,
    );
  }

  async function stocked(amount = 1000) {
    const m = await api.rawMaterial({ purchasePrice: 10 });
    await api.receive(m.id, amount, { locationId: lab.id });
    return m;
  }

  const create = (body: object, s = 201, role?: 'gestionar' | 'sofer' | 'cofetar') =>
    api.post('/api/v1/stock/transfers', body, s, role);

  it('creation deducts the source immediately; FINALIZAT credits the destination', async () => {
    const m = await stocked(1000);
    const tr = (
      await create({
        fromLocationId: lab.id,
        toLocationId: shop.id,
        assignedToId: org.users.sofer.id,
        delegateIdCard: 'CJ 123456',
        transportMeans: 'CJ-01-ABC',
        dispatchedAt: new Date().toISOString(),
        notes: 'pentru vitrină',
        items: [{ rawMaterialId: m.id, quantity: 300, unit: 'KILOGRAME' }],
      })
    ).body;
    expect(tr.status).toBe('IN_ASTEPTARE');
    // unit forced to the material's stock unit (client unit ignored)
    expect(tr.items[0].unit).toBe('GRAME');
    expect(tr.adhocDestination).toBe(false);
    expect(tr.toLocation.id).toBe(shop.id);
    expect(await qty(lab.id, m.id)).toBe(700);
    expect(await qty(shop.id, m.id)).toBe(0);

    const pending = (await api.get(`/api/v1/stock/item-availability?rawMaterialId=${m.id}`, 200))
      .body;
    expect(pending.pendingTransfers.map((p: { id: string }) => p.id)).toContain(tr.id);

    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'IN_TRANZIT' }, 200);
    const done = (await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'FINALIZAT' }, 200))
      .body;
    expect(done.status).toBe('FINALIZAT');
    expect(await qty(shop.id, m.id)).toBe(300);
    expect(await qty(lab.id, m.id)).toBe(700);
    expect((await api.rawMaterialById(m.id)).stockCount).toBe(1000);
  });

  it('a second FINALIZAT never double-credits the destination (idempotent claim)', async () => {
    const m = await stocked(100);
    const tr = (
      await create({
        fromLocationId: lab.id,
        toLocationId: shop.id,
        assignedToId: org.users.sofer.id,
        items: [{ rawMaterialId: m.id, quantity: 40 }],
      })
    ).body;
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'IN_TRANZIT' }, 200);
    const [a, b] = await Promise.all([
      t.http.patch(`/api/v1/stock/transfers/${tr.id}`).set(org.as()).send({ status: 'FINALIZAT' }),
      t.http.patch(`/api/v1/stock/transfers/${tr.id}`).set(org.as()).send({ status: 'FINALIZAT' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(await qty(shop.id, m.id)).toBe(40);
  });

  it('ANULAT returns the stock to the source (once)', async () => {
    const m = await stocked(100);
    const tr = (
      await create({
        fromLocationId: lab.id,
        toLocationId: shop.id,
        items: [{ rawMaterialId: m.id, quantity: 60 }],
      })
    ).body;
    expect(await qty(lab.id, m.id)).toBe(40);
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'ANULAT' }, 200);
    expect(await qty(lab.id, m.id)).toBe(100);
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'ANULAT' }, 400);
    expect(await qty(lab.id, m.id)).toBe(100);
  });

  it('transitions: no IN_ASTEPTARE → FINALIZAT shortcut, nothing out of FINALIZAT/ANULAT, IN_ASTEPTARE not settable', async () => {
    const m = await stocked(100);
    const tr = (
      await create({
        fromLocationId: lab.id,
        toLocationId: shop.id,
        items: [{ rawMaterialId: m.id, quantity: 10 }],
      })
    ).body;
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'FINALIZAT' }, 400);
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'IN_ASTEPTARE' }, 400);
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'NOPE' }, 400);
    await api.patch(
      `/api/v1/stock/transfers/${tr.id}`,
      { status: 'IN_TRANZIT', assignedToId: org.users.sofer.id },
      200,
    );
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'IN_TRANZIT' }, 400);
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'FINALIZAT' }, 200);
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'ANULAT' }, 400);
  });

  it('IN_TRANZIT requires an assignee (set at creation or with the status change)', async () => {
    const m = await stocked(100);
    const tr = (
      await create({
        fromLocationId: lab.id,
        toLocationId: shop.id,
        items: [{ rawMaterialId: m.id, quantity: 10 }],
      })
    ).body;
    const r = await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'IN_TRANZIT' }, 400);
    expect(r.body.message).toMatch(/asignat/);
    const ok = (
      await api.patch(
        `/api/v1/stock/transfers/${tr.id}`,
        { status: 'IN_TRANZIT', assignedToId: org.users.sofer.id },
        200,
      )
    ).body;
    expect(ok.assignedTo?.id ?? ok.assignedToId).toBe(org.users.sofer.id);
  });

  it('IN_TRANZIT → ANULAT also returns stock', async () => {
    const m = await stocked(50);
    const tr = (
      await create({
        fromLocationId: lab.id,
        toLocationId: shop.id,
        assignedToId: org.users.sofer.id,
        items: [{ rawMaterialId: m.id, quantity: 50 }],
      })
    ).body;
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'IN_TRANZIT' }, 200);
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'ANULAT' }, 200);
    expect(await qty(lab.id, m.id)).toBe(50);
  });

  it('validation: insufficient source stock, same source/destination, no items, XOR destination, quantity > 0', async () => {
    const m = await stocked(10);
    const r = await create(
      {
        fromLocationId: lab.id,
        toLocationId: shop.id,
        items: [{ rawMaterialId: m.id, quantity: 11 }],
      },
      400,
    );
    expect(r.body.message).toMatch(/Stoc insuficient/);
    expect(await qty(lab.id, m.id)).toBe(10);
    await create(
      {
        fromLocationId: lab.id,
        toLocationId: lab.id,
        items: [{ rawMaterialId: m.id, quantity: 1 }],
      },
      400,
    );
    await create({ fromLocationId: lab.id, toLocationId: shop.id, items: [] }, 400);
    await create({ fromLocationId: lab.id, items: [{ rawMaterialId: m.id, quantity: 1 }] }, 400);
    await create(
      {
        fromLocationId: lab.id,
        toLocationId: shop.id,
        destinationName: 'Nunta',
        items: [{ rawMaterialId: m.id, quantity: 1 }],
      },
      400,
    );
    await create(
      {
        fromLocationId: lab.id,
        toLocationId: shop.id,
        items: [{ rawMaterialId: m.id, quantity: 0 }],
      },
      400,
    );
    await create({ fromLocationId: lab.id, toLocationId: shop.id, items: [{ quantity: 1 }] }, 400);
    await create(
      {
        fromLocationId: lab.id,
        toLocationId: '00000000-0000-4000-8000-000000000000',
        items: [{ rawMaterialId: m.id, quantity: 1 }],
      },
      404,
    );
    await create(
      {
        fromLocationId: lab.id,
        toLocationId: shop.id,
        delegateIdCard: 'x'.repeat(101),
        items: [{ rawMaterialId: m.id, quantity: 1 }],
      },
      400,
    );
  });

  it('a pending transfer reserves the stock: a second transfer cannot claim it', async () => {
    const m = await stocked(100);
    await create({
      fromLocationId: lab.id,
      toLocationId: shop.id,
      items: [{ rawMaterialId: m.id, quantity: 80 }],
    });
    await create(
      {
        fromLocationId: lab.id,
        toLocationId: shop.id,
        items: [{ rawMaterialId: m.id, quantity: 30 }],
      },
      400,
    );
  });

  it('ad-hoc destination: goods leave the system on FINALIZAT; response synthesizes toLocation', async () => {
    const m = await stocked(100);
    const tr = (
      await create({
        fromLocationId: lab.id,
        destinationName: 'Eveniment Sala Mare',
        destinationAddress: 'Str. Evenimentului 3',
        assignedToId: org.users.sofer.id,
        items: [{ rawMaterialId: m.id, quantity: 25 }],
      })
    ).body;
    expect(tr.adhocDestination).toBe(true);
    expect(tr.toLocation).toMatchObject({ id: '', name: 'Eveniment Sala Mare' });
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'IN_TRANZIT' }, 200);
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'FINALIZAT' }, 200);
    const rm = await api.rawMaterialById(m.id);
    expect(rm.stockCount).toBe(75);
    const aviz = (await api.get(`/api/v1/stock/transfers/${tr.id}/aviz`, 200)).body;
    expect(JSON.stringify(aviz)).toContain('Eveniment Sala Mare');
  });

  it('aviz carries delegate / transport / dispatch fields, a stable serial and the receipt signature', async () => {
    const m = await stocked(100);
    const dispatchedAt = new Date('2026-10-17T08:30:00.000Z').toISOString();
    const tr = (
      await create({
        fromLocationId: lab.id,
        toLocationId: shop.id,
        assignedToId: org.users.sofer.id,
        delegateIdCard: 'CJ 654321',
        transportMeans: 'CJ-99-XYZ',
        dispatchedAt,
        items: [{ rawMaterialId: m.id, quantity: 10 }],
      })
    ).body;
    const a1 = (await api.get(`/api/v1/stock/transfers/${tr.id}/aviz`, 200)).body;
    const a2 = (await api.get(`/api/v1/stock/transfers/${tr.id}/aviz`, 200)).body;
    expect(a1.serial).toBeTruthy();
    expect(a2.serial).toBe(a1.serial);
    const s = JSON.stringify(a1);
    expect(s).toContain('CJ 654321');
    expect(s).toContain('CJ-99-XYZ');

    // signature only after FINALIZAT
    const early = await t.http
      .patch(`/api/v1/stock/transfers/${tr.id}/aviz/sign`)
      .set(org.as())
      .field('receiverName', 'Ion Primitorul')
      .attach('signature', SIGNATURE);
    expect(early.status).toBe(400);

    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'IN_TRANZIT' }, 200);
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'FINALIZAT' }, 200);
    const noFile = await t.http
      .patch(`/api/v1/stock/transfers/${tr.id}/aviz/sign`)
      .set(org.as())
      .field('receiverName', 'Ion');
    expect(noFile.status).toBe(400);
    const signed = await t.http
      .patch(`/api/v1/stock/transfers/${tr.id}/aviz/sign`)
      .set(org.as())
      .field('receiverName', 'Ion Primitorul')
      .attach('signature', SIGNATURE);
    expect(signed.status).toBe(200);
    const img = await t.http.get(`/api/v1/stock/transfers/${tr.id}/aviz/signature`).set(org.as());
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toMatch(/png/);
    const after = (await api.get(`/api/v1/stock/transfers/${tr.id}/aviz`, 200)).body;
    expect(JSON.stringify(after)).toContain('Ion Primitorul');
  });

  // Organization is NOT tenant-scoped, and getTransferAviz / getTransferConformity
  // read `organization.findFirst({orderBy: createdAt})` = the OLDEST tenant, so
  // every org prints the first org's name/CUI on its aviz. Same pattern in
  // dashboard.service.ts:96, certificate-pdf.service.ts:52, sales-deductions.service.ts:320.
  it('aviz supplier is the caller organization, not the oldest tenant [FINDING locations.service.ts:881 organization.findFirst]', async () => {
    // A tenant created after `org`, so it is never the oldest row.
    const late = await createOrg(t, 'transfers-late');
    const lapi = new Api(t, late);
    const from = await lapi.location({ type: 'LABORATOR' });
    const to = await lapi.location({ type: 'MAGAZIN' });
    const m = await lapi.rawMaterial();
    await lapi.receive(m.id, 10, { locationId: from.id });
    const tr = (
      await lapi.post(
        '/api/v1/stock/transfers',
        {
          fromLocationId: from.id,
          toLocationId: to.id,
          items: [{ rawMaterialId: m.id, quantity: 1 }],
        },
        201,
      )
    ).body;
    const aviz = (await lapi.get(`/api/v1/stock/transfers/${tr.id}/aviz`, 200)).body;
    expect(aviz.supplier.name).toBe(late.name);
  });

  it('approval is a review layer that does not change the transfer status', async () => {
    const m = await stocked(10);
    const tr = (
      await create({
        fromLocationId: lab.id,
        toLocationId: shop.id,
        items: [{ rawMaterialId: m.id, quantity: 1 }],
      })
    ).body;
    expect(tr.approval).toBeNull();
    const ap = (
      await api.patch(
        `/api/v1/stock/transfers/${tr.id}/approval`,
        { status: 'REJECTED', reason: 'cantitate greșită' },
        200,
      )
    ).body;
    const got = (await api.get(`/api/v1/stock/transfers/${tr.id}`, 200)).body;
    expect(got.status).toBe('IN_ASTEPTARE');
    expect(got.approval).toMatchObject({ status: 'REJECTED', reason: 'cantitate greșită' });
    expect(ap).toBeTruthy();
    await api.patch(`/api/v1/stock/transfers/${tr.id}/approval`, { status: 'MAYBE' }, 400);
  });

  it('finished-goods (recipe) transfers move RecipeStock', async () => {
    const r = await api.recipe([], { unit: 'BUCATI' });
    await api.post(
      '/api/v1/stock/recipe-movements',
      { recipeId: r.id, movementType: 'INTRARE', quantity: 20, unit: 'BUCATI', locationId: lab.id },
      201,
    );
    const tr = (
      await create({
        fromLocationId: lab.id,
        toLocationId: shop.id,
        assignedToId: org.users.sofer.id,
        items: [{ recipeId: r.id, quantity: 8 }],
      })
    ).body;
    expect(tr.items[0].unit).toBe('BUCATI');
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'IN_TRANZIT' }, 200);
    await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'FINALIZAT' }, 200);
    const shopStock = (await api.get(`/api/v1/locations/${shop.id}/recipe-stock`, 200)).body;
    expect(Number(shopStock.find((x: { recipeId: string }) => x.recipeId === r.id)?.quantity)).toBe(
      8,
    );
    const labStock = (await api.get(`/api/v1/locations/${lab.id}/recipe-stock`, 200)).body;
    expect(Number(labStock.find((x: { recipeId: string }) => x.recipeId === r.id)?.quantity)).toBe(
      12,
    );
  });

  it('lists and filters transfers; GET by id 404 for unknown', async () => {
    const m = await stocked(10);
    const tr = (
      await create({
        fromLocationId: lab.id,
        toLocationId: shop.id,
        items: [{ rawMaterialId: m.id, quantity: 1 }],
      })
    ).body;
    const list = (await api.get('/api/v1/stock/transfers?status=IN_ASTEPTARE&limit=100', 200)).body;
    expect(list.data.map((x: { id: string }) => x.id)).toContain(tr.id);
    expect(list.data.every((x: { status: string }) => x.status === 'IN_ASTEPTARE')).toBe(true);
    await api.get('/api/v1/stock/transfers/00000000-0000-4000-8000-000000000000', 404);
  });

  it('CASL: sofer and gestionar may create/move transfers; user role may not; bulk delete of an active transfer returns stock', async () => {
    const m = await stocked(30);
    const tr = (
      await create(
        {
          fromLocationId: lab.id,
          toLocationId: shop.id,
          items: [{ rawMaterialId: m.id, quantity: 10 }],
        },
        201,
        'sofer',
      )
    ).body;
    await api.patch(
      `/api/v1/stock/transfers/${tr.id}`,
      { status: 'IN_TRANZIT', assignedToId: org.users.sofer.id },
      200,
      'gestionar',
    );
    await api.req(
      'post',
      '/api/v1/stock/transfers',
      {
        fromLocationId: lab.id,
        toLocationId: shop.id,
        items: [{ rawMaterialId: m.id, quantity: 1 }],
      },
      403,
      'user',
    );
    const del = (
      await api.post('/api/v1/stock/transfers/bulk-delete', { ids: [tr.id], cascade: true }, 200)
    ).body;
    expect(del.deleted).toEqual([tr.id]);
    expect(await qty(lab.id, m.id)).toBe(30);
  });

  it('a location with an active transfer needs ?force=true to be deleted, which returns stock', async () => {
    const tmp = await api.location({ type: 'DEPOZIT' });
    const m = await api.rawMaterial();
    await api.receive(m.id, 20, { locationId: lab.id });
    const tr = (
      await create({
        fromLocationId: lab.id,
        toLocationId: tmp.id,
        items: [{ rawMaterialId: m.id, quantity: 5 }],
      })
    ).body;
    await api.del(`/api/v1/locations/${tmp.id}`, 400);
    const forced = await api.del(`/api/v1/locations/${tmp.id}?force=true`);
    expect([200, 204]).toContain(forced.status);
    expect(await qty(lab.id, m.id)).toBe(20);
    await api.get(`/api/v1/stock/transfers/${tr.id}`);
  });
});
