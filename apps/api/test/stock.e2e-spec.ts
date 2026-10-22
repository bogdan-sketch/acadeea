/**
 * Stock: raw materials / consumables CRUD, reception (lots + prices),
 * movements, adjustments, FIFO lots, low stock, expiry, item availability,
 * requirements plan, recipe-stock movements, test consumption, CASL.
 */
import { runAsOrg } from '../src/prisma/tenant-context';
import { bootApp, TestApp } from './helpers/app';
import { Api } from './helpers/factory';
import { createOrg, TestOrg, uid } from './helpers/org';

jest.setTimeout(120000);

describe('Stock', () => {
  let t: TestApp;
  let org: TestOrg;
  let api: Api;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lab: any;

  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    t = await bootApp();
    org = await createOrg(t, 'stock');
    api = new Api(t, org);
    lab = await api.location({ name: `Laborator ${uid()}`, type: 'LABORATOR' });
  });
  afterAll(async () => t?.close());

  async function locQty(locationId: string, rawMaterialId: string): Promise<number> {
    const rows = (await api.get(`/api/v1/locations/${locationId}/stock`, 200)).body;
    const row = rows.find((r: { rawMaterialId: string }) => r.rawMaterialId === rawMaterialId);
    return row ? Number(row.quantity) : 0;
  }

  describe('raw materials CRUD', () => {
    it('creates with the DTO field names (title, unit, minimumStock, purchasePrice, storageType)', async () => {
      const m = await api.rawMaterial({
        title: `Unt ${uid()}`,
        unit: 'KILOGRAME',
        minimumStock: 2.5,
        purchasePrice: 42,
        storageType: 'COLD',
        producer: 'Napolact',
        allergens: ['LAPTE', 'GLUTEN'],
      });
      expect(m).toMatchObject({
        unit: 'KILOGRAME',
        minimumStock: 2.5,
        storageType: 'COLD',
        producer: 'Napolact',
      });
      expect(Number(m.purchasePrice)).toBe(42);
      const got = await api.rawMaterialById(m.id);
      expect(got.title).toBe(m.title);
    });

    it('validation: missing title, bad unit, negative price / min stock, loss > 100, unknown field', async () => {
      await api.post('/api/v1/raw-materials', { unit: 'GRAME' }, 400);
      await api.post('/api/v1/raw-materials', { title: 'X', unit: 'KG' }, 400);
      await api.post('/api/v1/raw-materials', { title: 'X', purchasePrice: -1 }, 400);
      await api.post('/api/v1/raw-materials', { title: 'X', minimumStock: -1 }, 400);
      await api.post('/api/v1/raw-materials', { title: 'X', estimatedLossPercent: 101 }, 400);
      await api.post('/api/v1/raw-materials', { title: 'X', targetUnit: 'GRAME' }, 400);
      await api.post('/api/v1/raw-materials', { title: 'X', allergens: ['PEANUT_BUTTER'] }, 400);
    });

    it('PATCH updates fields; list filters by search', async () => {
      const m = await api.rawMaterial({ title: `Cacao ${uid()}` });
      const upd = (
        await api.patch(
          `/api/v1/raw-materials/${m.id}`,
          { minimumStock: 100, category: 'Materii prime' },
          200,
        )
      ).body;
      expect(upd.minimumStock).toBe(100);
      const list = (
        await api.get(`/api/v1/raw-materials?search=${encodeURIComponent(m.title)}`, 200)
      ).body;
      expect(list.data.map((x: { id: string }) => x.id)).toEqual([m.id]);
    });

    it('creating with locationId opens a stock row at that location', async () => {
      const m = await api.rawMaterial({ locationId: lab.id });
      const rows = (await api.get(`/api/v1/locations/${lab.id}/stock`, 200)).body;
      expect(rows.find((r: { rawMaterialId: string }) => r.rawMaterialId === m.id)).toMatchObject({
        quantity: 0,
      });
    });

    it('DELETE soft-discontinues; ?hard=true only at stock 0', async () => {
      const m = await api.rawMaterial();
      await api.receive(m.id, 100, { locationId: lab.id });
      const info = (await api.get(`/api/v1/raw-materials/${m.id}/delete-info`, 200)).body;
      expect(info).toMatchObject({ currentStock: 100, canDelete: false });
      await api.del(`/api/v1/raw-materials/${m.id}?hard=true`, 400);
      const soft = (await api.del(`/api/v1/raw-materials/${m.id}`, 200)).body;
      expect(soft.status).toBe('DISCONTINUED');

      const z = await api.rawMaterial();
      expect((await api.get(`/api/v1/raw-materials/${z.id}/delete-info`, 200)).body.canDelete).toBe(
        true,
      );
      expect((await api.del(`/api/v1/raw-materials/${z.id}?hard=true`, 200)).body).toEqual({
        deleted: true,
      });
      await api.get(`/api/v1/raw-materials/${z.id}`, 404);
    });

    it('CASL: cofetar/gestionar create+update but cannot delete; sofer cannot read', async () => {
      const m = (await api.post('/api/v1/raw-materials', { title: `C ${uid()}` }, 201, 'cofetar'))
        .body;
      await api.patch(`/api/v1/raw-materials/${m.id}`, { minimumStock: 1 }, 200, 'gestionar');
      await api.del(`/api/v1/raw-materials/${m.id}`, 403, 'cofetar');
      await api.del(`/api/v1/raw-materials/${m.id}`, 403, 'gestionar');
      await api.del(`/api/v1/raw-materials/${m.id}`, 403, 'sef-cofetar');
      await api.get('/api/v1/raw-materials', 403, 'sofer');
      await api.del(`/api/v1/raw-materials/${m.id}`, 200, 'administrator');
    });
  });

  describe('consumables CRUD', () => {
    it('create / get / patch / list / delete', async () => {
      const c = await api.consumable({ title: `Cutie ${uid()}`, minimumStock: 10 });
      expect(c.minimumStock).toBe(10);
      expect((await api.get(`/api/v1/consumables/${c.id}`, 200)).body.title).toBe(c.title);
      await api.patch(`/api/v1/consumables/${c.id}`, { minimumStock: 20 }, 200);
      const list = (await api.get(`/api/v1/consumables?search=${encodeURIComponent(c.title)}`, 200))
        .body;
      expect(list.data[0].minimumStock).toBe(20);
      await api.del(`/api/v1/consumables/${c.id}`, 403, 'cofetar');
      await api.del(`/api/v1/consumables/${c.id}`, 200);
    });

    it('consumables have no unit field in the DTO (unknown field rejected)', async () => {
      await api.post('/api/v1/consumables', { title: 'X', unit: 'BUCATI' }, 400);
      await api.post('/api/v1/consumables', { title: 'X', minimumStock: -1 }, 400);
    });

    it('INTRARE adds, AJUSTARE sets absolute, both recorded as movements', async () => {
      const c = await api.consumable({ minimumStock: 5 });
      await api.post(
        '/api/v1/stock/movements',
        { consumableId: c.id, movementType: 'INTRARE', quantity: 30, unit: 'BUCATI' },
        201,
      );
      await api.post(
        '/api/v1/stock/movements',
        { consumableId: c.id, movementType: 'INTRARE', quantity: 20, unit: 'BUCATI' },
        201,
      );
      expect((await api.get(`/api/v1/consumables/${c.id}`, 200)).body.stockCount).toBe(50);
      await api.post(
        '/api/v1/stock/movements',
        { consumableId: c.id, movementType: 'AJUSTARE', quantity: 3, unit: 'BUCATI' },
        201,
      );
      const after = (await api.get(`/api/v1/consumables/${c.id}`, 200)).body;
      expect(after.stockCount).toBe(3);
      expect(after.status).toBe('LOW_STOCK');
      const low = (await api.get('/api/v1/stock/low-stock', 200)).body;
      expect(low.map((x: { id: string }) => x.id)).toContain(c.id);
    });
  });

  describe('reception (INTRARE) with lots and prices', () => {
    it('adds to the location, creates a lot with remainingQuantity = quantity, records price history', async () => {
      const m = await api.rawMaterial({ purchasePrice: 5 });
      const mv = await api.receive(m.id, 2500, {
        locationId: lab.id,
        lotNumber: 'L-001',
        expiryDate: inDays(90),
        purchasePrice: 6,
        supplier: 'Furnizor SRL',
        supplierInvoice: 'FAC-1',
      });
      expect(mv).toMatchObject({ movementType: 'INTRARE', quantity: 2500, unit: 'GRAME' });
      expect(mv.locationName).toBe(lab.name);
      expect(await locQty(lab.id, m.id)).toBe(2500);
      expect((await api.rawMaterialById(m.id)).stockCount).toBe(2500);

      const lots = (await api.get(`/api/v1/stock/lots?rawMaterialId=${m.id}`, 200)).body;
      expect(lots).toHaveLength(1);
      expect(lots[0]).toMatchObject({
        lotNumber: 'L-001',
        quantity: 2500,
        remainingQuantity: 2500,
        purchasePrice: 6,
        supplier: 'Furnizor SRL',
        supplierInvoice: 'FAC-1',
      });

      const hist = (await api.get(`/api/v1/raw-materials/${m.id}/price-history`, 200)).body;
      expect(JSON.stringify(hist)).toContain('6');
    });

    it('a second reception stacks a second lot and increments stock', async () => {
      const m = await api.rawMaterial();
      await api.receive(m.id, 100, { locationId: lab.id, lotNumber: 'A' });
      await api.receive(m.id, 50, { locationId: lab.id, lotNumber: 'B' });
      expect(await locQty(lab.id, m.id)).toBe(150);
      expect((await api.get(`/api/v1/stock/lots?rawMaterialId=${m.id}`, 200)).body).toHaveLength(2);
    });

    it('rejects a negative price, a zero/negative INTRARE and a non-manual type', async () => {
      const m = await api.rawMaterial();
      const base = { rawMaterialId: m.id, unit: 'GRAME', locationId: lab.id };
      await api.post(
        '/api/v1/stock/movements',
        { ...base, movementType: 'INTRARE', quantity: 10, purchasePrice: -1 },
        400,
      );
      await api.post(
        '/api/v1/stock/movements',
        { ...base, movementType: 'INTRARE', quantity: 0 },
        400,
      );
      await api.post(
        '/api/v1/stock/movements',
        { ...base, movementType: 'INTRARE', quantity: -5 },
        400,
      );
      await api.post(
        '/api/v1/stock/movements',
        { ...base, movementType: 'IESIRE_PRODUCTIE', quantity: 5 },
        400,
      );
      await api.post(
        '/api/v1/stock/movements',
        { ...base, movementType: 'INTRARE', quantity: 5, unit: 'KG' },
        400,
      );
    });

    it('a price of 0 is allowed (free sample)', async () => {
      const m = await api.rawMaterial();
      await api.receive(m.id, 10, { locationId: lab.id, purchasePrice: 0 });
    });

    it('XOR: neither or both of rawMaterialId / consumableId → 400', async () => {
      const m = await api.rawMaterial();
      const c = await api.consumable();
      await api.post(
        '/api/v1/stock/movements',
        { movementType: 'INTRARE', quantity: 1, unit: 'GRAME' },
        400,
      );
      await api.post(
        '/api/v1/stock/movements',
        {
          rawMaterialId: m.id,
          consumableId: c.id,
          movementType: 'INTRARE',
          quantity: 1,
          unit: 'GRAME',
        },
        400,
      );
    });

    it('priceIncludesVat=true is normalized to net for a VAT payer (21%)', async () => {
      const m = await api.rawMaterial();
      await api.receive(m.id, 1000, {
        locationId: lab.id,
        purchasePrice: 12.1,
        priceIncludesVat: true,
      });
      const lots = (await api.get(`/api/v1/stock/lots?rawMaterialId=${m.id}`, 200)).body;
      expect(lots[0].purchasePrice).toBeCloseTo(10, 2);
    });

    it('batch receive: several items in one call; empty list and price < 0 rejected', async () => {
      const a = await api.rawMaterial();
      const b = await api.rawMaterial();
      const res = (
        await api.post(
          '/api/v1/stock/movements/batch',
          {
            locationId: lab.id,
            items: [
              { rawMaterialId: a.id, quantity: 10, unit: 'GRAME', lotNumber: 'BA' },
              { rawMaterialId: b.id, quantity: 20, unit: 'GRAME', purchasePrice: 3 },
            ],
          },
          201,
        )
      ).body;
      expect(res).toHaveLength(2);
      expect(await locQty(lab.id, a.id)).toBe(10);
      expect(await locQty(lab.id, b.id)).toBe(20);
      await api.post('/api/v1/stock/movements/batch', { items: [] }, 400);
      await api.post(
        '/api/v1/stock/movements/batch',
        { items: [{ rawMaterialId: a.id, quantity: 1, unit: 'GRAME', purchasePrice: -2 }] },
        400,
      );
    });

    // The movement `unit` is stored but never converted: "2 KILOGRAME" of a
    // gram-stocked material adds 2 (grams). Either convert (2000 g) or refuse.
    it('a reception in a different (convertible) unit is converted or refused, never added raw [FINDING stock.service.ts createMovement ignores dto.unit]', async () => {
      const m = await api.rawMaterial({ unit: 'GRAME' });
      const res = await api.post('/api/v1/stock/movements', {
        rawMaterialId: m.id,
        movementType: 'INTRARE',
        quantity: 2,
        unit: 'KILOGRAME',
        locationId: lab.id,
      });
      if (res.status === 201) {
        expect(await locQty(lab.id, m.id)).toBe(2000);
      } else {
        expect(res.status).toBe(400);
      }
    });

    it('without locationId, the user primary location is used', async () => {
      const shop = await api.location({ type: 'MAGAZIN' });
      await api.post(
        `/api/v1/locations/${shop.id}/users`,
        { userId: org.users.gestionar.id, isPrimary: true },
        201,
      );
      const m = await api.rawMaterial();
      await api.post(
        '/api/v1/stock/movements',
        { rawMaterialId: m.id, movementType: 'INTRARE', quantity: 7, unit: 'GRAME' },
        201,
        'gestionar',
      );
      expect(await locQty(shop.id, m.id)).toBe(7);
    });
  });

  describe('adjustments (AJUSTARE)', () => {
    it('sets the location quantity absolutely; 0 zeroes; negative is refused (clamped at 0)', async () => {
      const m = await api.rawMaterial({ minimumStock: 50 });
      await api.receive(m.id, 200, { locationId: lab.id });
      await api.post(
        '/api/v1/stock/movements',
        {
          rawMaterialId: m.id,
          movementType: 'AJUSTARE',
          quantity: 40,
          unit: 'GRAME',
          locationId: lab.id,
        },
        201,
      );
      expect(await locQty(lab.id, m.id)).toBe(40);
      let rm = await api.rawMaterialById(m.id);
      expect(rm.stockCount).toBe(40);
      expect(rm.status).toBe('LOW_STOCK');

      await api.post(
        '/api/v1/stock/movements',
        {
          rawMaterialId: m.id,
          movementType: 'AJUSTARE',
          quantity: -10,
          unit: 'GRAME',
          locationId: lab.id,
        },
        400,
      );
      await api.post(
        '/api/v1/stock/movements',
        {
          rawMaterialId: m.id,
          movementType: 'AJUSTARE',
          quantity: 0,
          unit: 'GRAME',
          locationId: lab.id,
        },
        201,
      );
      rm = await api.rawMaterialById(m.id);
      expect(rm.stockCount).toBe(0);
      expect(rm.status).toBe('OUT_OF_STOCK');
    });

    it('the global stockCount is the sum over locations', async () => {
      const other = await api.location({ type: 'DEPOZIT' });
      const m = await api.rawMaterial();
      await api.receive(m.id, 100, { locationId: lab.id });
      await api.receive(m.id, 30, { locationId: other.id });
      await api.post(
        '/api/v1/stock/movements',
        {
          rawMaterialId: m.id,
          movementType: 'AJUSTARE',
          quantity: 10,
          unit: 'GRAME',
          locationId: other.id,
        },
        201,
      );
      expect((await api.rawMaterialById(m.id)).stockCount).toBe(110);
    });
  });

  describe('movements history', () => {
    it('lists movements filtered by material, newest first, with createdByName + locationName; GET by id', async () => {
      const m = await api.rawMaterial();
      const first = await api.receive(m.id, 10, { locationId: lab.id });
      await api.post(
        '/api/v1/stock/movements',
        {
          rawMaterialId: m.id,
          movementType: 'AJUSTARE',
          quantity: 4,
          unit: 'GRAME',
          locationId: lab.id,
        },
        201,
      );
      const list = (await api.get(`/api/v1/stock/movements?rawMaterialId=${m.id}`, 200)).body;
      expect(list.total).toBe(2);
      expect(list.data[0].movementType).toBe('AJUSTARE');
      expect(list.data[0].locationName).toBe(lab.name);
      expect(list.data[0].createdByName).toEqual(expect.any(String));
      const one = (await api.get(`/api/v1/stock/movements/${first.id}`, 200)).body;
      expect(one.id).toBe(first.id);
      await api.get('/api/v1/stock/movements/00000000-0000-4000-8000-000000000000', 404);
    });

    it('stats count derived statuses', async () => {
      const s = (await api.get('/api/v1/stock/stats', 200)).body;
      expect(s).toMatchObject({ statusCounts: expect.any(Object), totalItems: expect.any(Number) });
    });

    it('xlsx exports answer with a spreadsheet', async () => {
      const r = await t.http.get('/api/v1/stock/movements/export').set(org.as());
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/spreadsheet|octet/);
    });
  });

  describe('low stock and expiry', () => {
    it('low-stock lists items at or below minimum', async () => {
      const m = await api.rawMaterial({ minimumStock: 500 });
      await api.receive(m.id, 300, { locationId: lab.id });
      const ok = await api.rawMaterial({ minimumStock: 5 });
      await api.receive(ok.id, 300, { locationId: lab.id });
      const low = (await api.get('/api/v1/stock/low-stock', 200)).body;
      const ids = low.map((x: { id: string }) => x.id);
      expect(ids).toContain(m.id);
      expect(ids).not.toContain(ok.id);
      expect(low.find((x: { id: string }) => x.id === m.id)).toMatchObject({
        currentStock: 300,
        minimumStock: 500,
        type: 'raw_material',
      });
    });

    it('expiring lists lots inside the window, ordered by expiry, and not lots beyond it', async () => {
      const m = await api.rawMaterial();
      await api.receive(m.id, 10, { locationId: lab.id, lotNumber: 'SOON', expiryDate: inDays(5) });
      await api.receive(m.id, 10, {
        locationId: lab.id,
        lotNumber: 'LATER',
        expiryDate: inDays(200),
      });
      const exp = (await api.get('/api/v1/stock/expiring?days=30', 200)).body;
      const mine = exp.filter((e: { materialTitle: string }) => e.materialTitle === m.title);
      expect(mine).toHaveLength(1);
      expect(mine[0].daysUntilExpiry).toBeLessThanOrEqual(6);
      const wide = (await api.get('/api/v1/stock/expiring?days=365', 200)).body;
      expect(
        wide.filter((e: { materialTitle: string }) => e.materialTitle === m.title),
      ).toHaveLength(2);
    });

    // Regression: parseInt('abc') = NaN → Invalid Date → Prisma 500.
    it('expiring with a non-numeric ?days is a 4xx or the default window, never a 500', async () => {
      const r = await t.http.get('/api/v1/stock/expiring?days=abc').set(org.as());
      expect(r.status).toBeLessThan(500);
    });

    it('expiring is org-scoped', async () => {
      const other = await createOrg(t, 'stock-other');
      const m = await api.rawMaterial();
      await api.receive(m.id, 10, { locationId: lab.id, expiryDate: inDays(2) });
      const theirs = (await t.http.get('/api/v1/stock/expiring').set(other.as())).body;
      expect(JSON.stringify(theirs)).not.toContain(m.title);
    });

    it('a lot can be put on hold and released', async () => {
      const m = await api.rawMaterial();
      await api.receive(m.id, 10, { locationId: lab.id });
      const [lot] = (await api.get(`/api/v1/stock/lots?rawMaterialId=${m.id}`, 200)).body;
      expect(
        (await api.patch(`/api/v1/stock/lots/${lot.id}/hold`, { onHold: true }, 200)).body.onHold,
      ).toBe(true);
      expect(
        (await api.patch(`/api/v1/stock/lots/${lot.id}/hold`, { onHold: false }, 200)).body.onHold,
      ).toBe(false);
    });
  });

  describe('item availability', () => {
    it('needs exactly one id', async () => {
      await api.get('/api/v1/stock/item-availability', 400);
      const m = await api.rawMaterial();
      const c = await api.consumable();
      await api.get(
        `/api/v1/stock/item-availability?rawMaterialId=${m.id}&consumableId=${c.id}`,
        400,
      );
      await api.get(
        '/api/v1/stock/item-availability?rawMaterialId=00000000-0000-4000-8000-000000000000',
        404,
      );
    });

    it('per-location quantities and totals', async () => {
      const dep = await api.location({ type: 'DEPOZIT' });
      const m = await api.rawMaterial();
      await api.receive(m.id, 60, { locationId: lab.id });
      await api.receive(m.id, 40, { locationId: dep.id });
      const a = (await api.get(`/api/v1/stock/item-availability?rawMaterialId=${m.id}`, 200)).body;
      expect(a.totalQuantity).toBe(100);
      expect(a.locations).toHaveLength(2);
      expect(a.reservedForTasks).toBe(0);
      expect(a.pendingTransfers).toEqual([]);
    });
  });

  describe('requirements plan', () => {
    it('aggregates raw-material needs (semipreparate expanded) with deficit', async () => {
      const flour = await api.rawMaterial({ title: `Faina ${uid()}` });
      const eggs = await api.rawMaterial({ title: `Oua ${uid()}`, unit: 'BUCATI' });
      await api.receive(flour.id, 300, { locationId: lab.id });
      const semi = await api.recipe([{ rawMaterialId: flour.id, quantity: 100 }], {
        type: 'SEMIPREPARAT',
        unit: 'GRAME',
        yieldQuantity: 100,
      });
      const cake = await api.recipe(
        [
          { semipreparatRecipeId: semi.id, quantity: 200 },
          { rawMaterialId: eggs.id, quantity: 4, unit: 'BUCATI' },
        ],
        { yieldQuantity: 1, unit: 'BUCATI' },
      );
      const plan = (
        await api.post(
          '/api/v1/stock/requirements-plan',
          { items: [{ recipeId: cake.id, quantity: 2 }] },
          200,
        )
      ).body;
      const f = plan.requirements.find(
        (r: { rawMaterialId: string }) => r.rawMaterialId === flour.id,
      );
      const e = plan.requirements.find(
        (r: { rawMaterialId: string }) => r.rawMaterialId === eggs.id,
      );
      expect(f).toMatchObject({ needed: 400, currentStock: 300, deficit: 100 });
      expect(e).toMatchObject({ needed: 8, deficit: 8 });
      await api.post('/api/v1/stock/requirements-plan', { items: [] }, 400);
      await api.post(
        '/api/v1/stock/requirements-plan',
        { items: [{ recipeId: cake.id, quantity: 0 }] },
        400,
      );

      const x = await t.http
        .post('/api/v1/stock/requirements-plan/export')
        .set(org.as())
        .send({ items: [{ recipeId: cake.id, quantity: 1 }] });
      expect(x.status).toBe(200);
    });
  });

  describe('recipe-stock movements and test consumption', () => {
    it('INTRARE/AJUSTARE of a produced recipe at a location', async () => {
      const r = await api.recipe([], { unit: 'BUCATI' });
      await api.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: r.id,
          movementType: 'INTRARE',
          quantity: 12,
          unit: 'BUCATI',
          locationId: lab.id,
        },
        201,
      );
      await api.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: r.id,
          movementType: 'AJUSTARE',
          quantity: 5,
          unit: 'BUCATI',
          locationId: lab.id,
        },
        201,
      );
      const a = (await api.get(`/api/v1/stock/item-availability?recipeId=${r.id}`, 200)).body;
      expect(a.totalQuantity).toBe(5);
      await api.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: r.id,
          movementType: 'INTRARE',
          quantity: 0,
          unit: 'BUCATI',
          locationId: lab.id,
        },
        400,
      );
      await api.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: r.id,
          movementType: 'IESIRE_VANZARE',
          quantity: 1,
          unit: 'BUCATI',
          locationId: lab.id,
        },
        400,
      );
    });

    it('test consumption (IESIRE_TESTE) deducts from the location and clamps at 0 (never negative)', async () => {
      const m = await api.rawMaterial();
      await api.receive(m.id, 100, { locationId: lab.id });
      await api.post(
        '/api/v1/stock/test-consumption',
        {
          locationId: lab.id,
          items: [{ rawMaterialId: m.id, quantity: 30, unit: 'GRAME' }],
          notes: 'proba',
        },
        201,
      );
      expect(await locQty(lab.id, m.id)).toBe(70);
      const mv = (await api.get(`/api/v1/stock/movements?rawMaterialId=${m.id}`, 200)).body;
      expect(mv.data.map((x: { movementType: string }) => x.movementType)).toContain(
        'IESIRE_TESTE',
      );
      await api.post(
        '/api/v1/stock/test-consumption',
        { locationId: lab.id, items: [{ rawMaterialId: m.id, quantity: 1000, unit: 'GRAME' }] },
        201,
      );
      expect(await locQty(lab.id, m.id)).toBe(0);
      expect((await api.rawMaterialById(m.id)).stockCount).toBe(0);
      await api.post(
        '/api/v1/stock/test-consumption',
        { locationId: lab.id, items: [{ rawMaterialId: m.id, quantity: 0, unit: 'GRAME' }] },
        400,
      );
    });
  });

  describe('default location', () => {
    // UpdateOrganizationDto.defaultLocationId: "used by task creation AND goods
    // receipt when no user-specific default applies". Reception's
    // resolveLocationId ignores it (first LABORATOR wins).
    it('reception without locationId lands in Organization.defaultLocationId [FINDING stock.service.ts:926 resolveLocationId]', async () => {
      const fresh = await createOrg(t, 'stock-default');
      const fapi = new Api(t, fresh);
      await fapi.location({ type: 'LABORATOR' });
      const shop = await fapi.location({ type: 'MAGAZIN' });
      await fapi.patch('/api/v1/organization', { defaultLocationId: shop.id }, 200);
      const m = await fapi.rawMaterial();
      await fapi.post(
        '/api/v1/stock/movements',
        { rawMaterialId: m.id, movementType: 'INTRARE', quantity: 9, unit: 'GRAME' },
        201,
      );
      const avail = (await fapi.get(`/api/v1/stock/item-availability?rawMaterialId=${m.id}`, 200))
        .body;
      expect(avail.locations.map((l: { locationId: string }) => l.locationId)).toEqual([shop.id]);
    });

    it('reception with no location at all in the org → 400 with a reason', async () => {
      const empty = await createOrg(t, 'stock-noloc');
      const eapi = new Api(t, empty);
      const m = await eapi.rawMaterial();
      const r = await eapi.post(
        '/api/v1/stock/movements',
        { rawMaterialId: m.id, movementType: 'INTRARE', quantity: 1, unit: 'GRAME' },
        400,
      );
      expect(r.body.message).toMatch(/locație/);
    });
  });

  describe('CASL + tenancy', () => {
    it('sofer cannot create movements; another org cannot receive into this org material', async () => {
      const m = await api.rawMaterial();
      await api.post(
        '/api/v1/stock/movements',
        {
          rawMaterialId: m.id,
          movementType: 'INTRARE',
          quantity: 1,
          unit: 'GRAME',
          locationId: lab.id,
        },
        403,
        'sofer',
      );
      await api.receive(m.id, 1, { locationId: lab.id });
      const other = await createOrg(t, 'stock-iso');
      const mv = await t.http
        .post('/api/v1/stock/movements')
        .set(other.as())
        .send({ rawMaterialId: m.id, movementType: 'INTRARE', quantity: 1, unit: 'GRAME' });
      expect(mv.status).toBe(404);
      // sanity: the row really exists in its own org
      const count = await runAsOrg(org.id, async () =>
        t.prisma.stockLot.count({ where: { rawMaterialId: m.id } }),
      );
      expect(count).toBe(1);
    });

    // Regression: StockLot has no organizationId and findLots wasn't scoped
    // through the material → every tenant's lots (prices, suppliers,
    // invoices) were readable by any logged-in user.
    it('GET /stock/lots is org-scoped (no cross-tenant lot leak)', async () => {
      const m = await api.rawMaterial();
      await api.receive(m.id, 1, { locationId: lab.id, supplierInvoice: 'SECRET-INV' });
      const other = await createOrg(t, 'stock-leak');
      const byId = await t.http.get(`/api/v1/stock/lots?rawMaterialId=${m.id}`).set(other.as());
      expect(byId.body).toEqual([]);
      const all = await t.http.get('/api/v1/stock/lots').set(other.as());
      expect(JSON.stringify(all.body)).not.toContain('SECRET-INV');
    });
  });
});
