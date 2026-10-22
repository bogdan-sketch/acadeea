/**
 * Units of measure across every stock path.
 *
 * One rule: an item's stock, its lots and every movement-journal row are kept
 * in the ITEM's own unit. Inputs may arrive in another unit of the same family
 * (600 g for a material kept in kg), the API converts them once, and what the
 * journal reports must replay to exactly what the stock shows.
 *
 * Regression for the "Vanilie pastai" report (prod, 13–17 Oct 2026): a
 * material kept in KILOGRAME received 600 KILOGRAME, then its unit was edited
 * to GRAME — the edit only relabelled the numbers (599,96 kg became 599,96 g),
 * the lot kept 599,96 and the journal still said "+600 kg".
 */
import { bootApp, TestApp } from './helpers/app';
import { Api } from './helpers/factory';
import { createOrg, TestOrg, uid } from './helpers/org';

jest.setTimeout(120000);

type Unit = 'MILIGRAME' | 'GRAME' | 'KILOGRAME' | 'MILILITRI' | 'LITRI' | 'BUCATI';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

describe('Units of measure', () => {
  let t: TestApp;
  let org: TestOrg;
  let api: Api;
  let lab: Json;
  let shop: Json;

  beforeAll(async () => {
    t = await bootApp();
    org = await createOrg(t, 'units');
    api = new Api(t, org);
    lab = await api.location({ name: `Laborator ${uid()}`, type: 'LABORATOR' });
    shop = await api.location({ name: `Magazin ${uid()}`, type: 'MAGAZIN' });
  });
  afterAll(async () => t?.close());

  const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

  async function locQty(rawMaterialId: string, locationId = lab.id): Promise<number> {
    const rows = (await api.get(`/api/v1/locations/${locationId}/stock`, 200)).body;
    const row = rows.find((r: { rawMaterialId: string }) => r.rawMaterialId === rawMaterialId);
    return row ? Number(row.quantity) : 0;
  }

  const locIdByName = (name: string): string => {
    const loc = [lab, shop].find((l) => l.name === name);
    if (!loc) throw new Error(`movement without a known location: ${name}`);
    return loc.id;
  };

  async function lots(rawMaterialId: string): Promise<Json[]> {
    return (await api.get(`/api/v1/stock/lots?rawMaterialId=${rawMaterialId}`, 200)).body;
  }

  async function movements(rawMaterialId: string): Promise<Json[]> {
    const r = (
      await api.get(`/api/v1/stock/movements?rawMaterialId=${rawMaterialId}&limit=100`, 200)
    ).body;
    return [...r.data].sort(
      (a: Json, b: Json) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  /**
   * Replay the movement journal per location (INTRARE adds, IESIRE_* removes
   * clamped at 0, AJUSTARE sets the absolute value — transfers are journaled
   * as AJUSTARE legs) and compare it to the stock the API shows. Also: every
   * row is in the material's unit, the lots add up to the material's stock.
   */
  async function assertConsistent(m: { id: string }) {
    const mat = await api.rawMaterialById(m.id);
    const mv = await movements(m.id);
    for (const row of mv) expect(row.unit).toBe(mat.unit);

    const byLoc = new Map<string, number>();
    for (const row of mv) {
      const loc = locIdByName(row.locationName as string);
      const cur = byLoc.get(loc) ?? 0;
      const q = Number(row.quantity);
      if (row.movementType === 'INTRARE') byLoc.set(loc, cur + q);
      else if (row.movementType === 'AJUSTARE') byLoc.set(loc, q);
      else if (String(row.movementType).startsWith('IESIRE')) byLoc.set(loc, Math.max(0, cur - q));
    }
    let total = 0;
    for (const [loc, q] of byLoc) {
      close(await locQty(m.id, loc), q);
      total += q;
    }
    close(Number(mat.stockCount), total);

    const ls = await lots(m.id);
    if (ls.length > 0) {
      for (const l of ls) expect(l.unit).toBe(mat.unit);
      close(
        ls.reduce((s: number, l: Json) => s + Number(l.remainingQuantity), 0),
        Number(mat.stockCount),
      );
    }
    return { mat, mv, lots: ls };
  }

  const material = (unit: Unit, extra: Json = {}) =>
    api.rawMaterial({ title: `MP ${unit} ${uid()}`, unit, purchasePrice: 10, ...extra });

  const single = (rawMaterialId: string, quantity: number, unit: Unit, extra: Json = {}) =>
    api.post(
      '/api/v1/stock/movements',
      { rawMaterialId, movementType: 'INTRARE', quantity, unit, locationId: lab.id, ...extra },
      201,
    );

  const batch = (items: { rawMaterialId: string; quantity: number; unit: Unit }[]) =>
    api.post('/api/v1/stock/movements/batch', { locationId: lab.id, items }, 201);

  const adjust = (rawMaterialId: string, quantity: number, unit: Unit, locationId = lab.id) =>
    api.post(
      '/api/v1/stock/movements',
      { rawMaterialId, movementType: 'AJUSTARE', quantity, unit, locationId },
      201,
    );

  describe('reception (single movement and /movements/batch)', () => {
    it('GRAME material received as 2 KILOGRAME → 2000 g in stock, lot and journal', async () => {
      const m = await material('GRAME');
      const r = (await single(m.id, 2, 'KILOGRAME', { lotNumber: 'L1' })).body;
      expect(r).toMatchObject({ unit: 'GRAME' });
      close(Number(r.quantity), 2000);
      close(await locQty(m.id), 2000);
      const [lot] = await lots(m.id);
      close(Number(lot.quantity), 2000);
      close(Number(lot.remainingQuantity), 2000);
      await assertConsistent(m);
    });

    it('KILOGRAME material received in a batch as 600 GRAME → 0,6 kg (never 600 kg)', async () => {
      const m = await material('KILOGRAME');
      const other = await material('KILOGRAME');
      const res = (
        await batch([
          { rawMaterialId: m.id, quantity: 600, unit: 'GRAME' },
          { rawMaterialId: other.id, quantity: 4, unit: 'KILOGRAME' },
        ])
      ).body;
      expect(res[0]).toMatchObject({ unit: 'KILOGRAME' });
      close(Number(res[0].quantity), 0.6);
      close(await locQty(m.id), 0.6);
      close(await locQty(other.id), 4);
      const [lot] = await lots(m.id);
      close(Number(lot.remainingQuantity), 0.6);
      await assertConsistent(m);
      await assertConsistent(other);
    });

    it('MILIGRAME → GRAME and KILOGRAME → MILIGRAME scale exactly', async () => {
      const g = await material('GRAME');
      await single(g.id, 2500, 'MILIGRAME');
      close(await locQty(g.id), 2.5);
      const mg = await material('MILIGRAME');
      await single(mg.id, 0.002, 'KILOGRAME');
      close(await locQty(mg.id), 2000);
      await assertConsistent(g);
      await assertConsistent(mg);
    });

    it('LITRI material received as 500 MILILITRI → 0,5 l; MILILITRI material as 2 LITRI → 2000 ml', async () => {
      const l = await material('LITRI');
      await batch([{ rawMaterialId: l.id, quantity: 500, unit: 'MILILITRI' }]);
      close(await locQty(l.id), 0.5);
      const ml = await material('MILILITRI');
      await single(ml.id, 2, 'LITRI');
      close(await locQty(ml.id), 2000);
      await assertConsistent(l);
      await assertConsistent(ml);
    });

    it('BUCATI material: pieces stay pieces; mass for a piece item without a conversion is refused', async () => {
      const b = await material('BUCATI');
      await single(b.id, 12, 'BUCATI');
      close(await locQty(b.id), 12);
      const bad = await api.post(
        '/api/v1/stock/movements',
        {
          rawMaterialId: b.id,
          movementType: 'INTRARE',
          quantity: 500,
          unit: 'GRAME',
          locationId: lab.id,
        },
        400,
      );
      expect(bad.body.message).toMatch(/nu poate fi convertită/);
      // mass ↔ volume has no exact factor either
      const kg = await material('KILOGRAME');
      await api.post(
        '/api/v1/stock/movements',
        {
          rawMaterialId: kg.id,
          movementType: 'INTRARE',
          quantity: 1,
          unit: 'LITRI',
          locationId: lab.id,
        },
        400,
      );
      close(await locQty(b.id), 12);
      await assertConsistent(b);
    });
  });

  describe('adjustment (AJUSTARE)', () => {
    it('sets the absolute stock in the item unit and the lots follow (down: FIFO trim, up: newest lot)', async () => {
      const m = await material('KILOGRAME');
      await single(m.id, 1, 'KILOGRAME', { lotNumber: 'OLD' });
      await single(m.id, 1, 'KILOGRAME', { lotNumber: 'NEW' });
      // counted 596 g
      const a = (await adjust(m.id, 596, 'GRAME')).body;
      expect(a.unit).toBe('KILOGRAME');
      close(Number(a.quantity), 0.596);
      close(await locQty(m.id), 0.596);
      const rem = Object.fromEntries(
        (await lots(m.id)).map((l: Json) => [l.lotNumber, Number(l.remainingQuantity)]),
      );
      close(rem.OLD, 0);
      close(rem.NEW, 0.596);
      await assertConsistent(m);

      await adjust(m.id, 1.5, 'KILOGRAME');
      const after = Object.fromEntries(
        (await lots(m.id)).map((l: Json) => [l.lotNumber, Number(l.remainingQuantity)]),
      );
      close(after.NEW, 1.5);
      await assertConsistent(m);
    });
  });

  describe('consumption', () => {
    it('test consumption: 40 GRAME from a KILOGRAME material removes 0,04 kg (not 40 kg)', async () => {
      const m = await material('KILOGRAME');
      await single(m.id, 41.6, 'KILOGRAME');
      await api.post(
        '/api/v1/stock/test-consumption',
        { locationId: lab.id, items: [{ rawMaterialId: m.id, quantity: 40, unit: 'GRAME' }] },
        201,
      );
      close(await locQty(m.id), 41.56);
      const { mv } = await assertConsistent(m);
      const out = mv.find((x: Json) => x.movementType === 'IESIRE_TESTE');
      expect(out.unit).toBe('KILOGRAME');
      close(Number(out.quantity), 0.04);
    });

    it('task consumption: recipe in GRAME on a KILOGRAME material reserves and consumes in kg', async () => {
      const m = await material('KILOGRAME');
      await single(m.id, 2, 'KILOGRAME', { lotNumber: 'T1' });
      const r = await api.recipe([{ rawMaterialId: m.id, quantity: 50, unit: 'GRAME' }], {
        unit: 'BUCATI',
        yieldQuantity: 1,
      });
      const task = await api.task({
        recipeId: r.id,
        targetQuantity: 3,
        targetUnit: 'BUCATI',
        locationId: lab.id,
      });
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200);
      await api.transition(task.id, { status: 'FINALIZAT', actualYield: 3 }, 200);
      close(await locQty(m.id), 1.85);
      const { mv, lots: ls } = await assertConsistent(m);
      for (const type of ['REZERVARE', 'IESIRE_PRODUCTIE']) {
        const row = mv.find((x: Json) => x.movementType === type);
        expect(row).toBeDefined();
        expect(row.unit).toBe('KILOGRAME');
        close(Number(row.quantity), 0.15);
      }
      close(Number(ls[0].remainingQuantity), 1.85);
    });
  });

  describe('transfer', () => {
    it('moves the quantity in the item unit; both legs are journaled and agree with stock', async () => {
      const m = await material('KILOGRAME');
      await single(m.id, 5, 'KILOGRAME');
      const tr = (
        await api.post(
          '/api/v1/stock/transfers',
          {
            fromLocationId: lab.id,
            toLocationId: shop.id,
            assignedToId: org.users.sofer.id,
            items: [{ rawMaterialId: m.id, quantity: 1.25, unit: 'KILOGRAME' }],
          },
          201,
        )
      ).body;
      expect(tr.items[0].unit).toBe('KILOGRAME');
      await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'IN_TRANZIT' }, 200);
      await api.patch(`/api/v1/stock/transfers/${tr.id}`, { status: 'FINALIZAT' }, 200);
      close(await locQty(m.id, lab.id), 3.75);
      close(await locQty(m.id, shop.id), 1.25);
      await assertConsistent(m);
    });
  });

  describe('sales deduction (finished goods)', () => {
    it('IESIRE_VANZARE is recorded in the product unit and matches the product stock', async () => {
      const r = await api.recipe([], { name: `Tort ${uid()}`, unit: 'BUCATI' });
      await api.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: r.id,
          movementType: 'INTRARE',
          quantity: 10,
          unit: 'BUCATI',
          locationId: shop.id,
        },
        201,
      );
      const d = (await api.post('/api/v1/sales-deductions/manual', { locationId: shop.id }, 201))
        .body;
      await api.post(
        `/api/v1/sales-deductions/${d.id}/confirm`,
        { lines: [{ rawName: 'Tort', decision: 'ACCEPT', recipeId: r.id, quantity: 3 }] },
        200,
      );
      const rows = (await api.get(`/api/v1/locations/${shop.id}/recipe-stock`, 200)).body;
      close(Number(rows.find((x: Json) => x.recipeId === r.id).quantity), 7);
      const mv = (await api.get(`/api/v1/stock/movements?recipeId=${r.id}&limit=50`, 200)).body
        .data;
      const sale = mv.find((x: Json) => x.movementType === 'IESIRE_VANZARE');
      expect(sale).toMatchObject({ unit: 'BUCATI' });
      close(Number(sale.quantity), 3);
    });

    it('recipe stock kept in KILOGRAME receives 500 GRAME as 0,5 kg', async () => {
      const r = await api.recipe([], { name: `Crema ${uid()}`, unit: 'KILOGRAME' });
      const mv = (
        await api.post(
          '/api/v1/stock/recipe-movements',
          {
            recipeId: r.id,
            movementType: 'AJUSTARE',
            quantity: 500,
            unit: 'GRAME',
            locationId: lab.id,
          },
          201,
        )
      ).body;
      expect(mv.unit).toBe('KILOGRAME');
      close(Number(mv.quantity), 0.5);
      const rows = (await api.get(`/api/v1/locations/${lab.id}/recipe-stock`, 200)).body;
      close(Number(rows.find((x: Json) => x.recipeId === r.id).quantity), 0.5);
    });
  });

  describe('changing a material unit (the "Vanilie pastai" case)', () => {
    it('KILOGRAME → GRAME rescales stock, lots, reservations and the whole journal ×1000', async () => {
      const m = await material('KILOGRAME', {
        title: `Vanilie pastai ${uid()}`,
        minimumStock: 0.1,
      });
      await batch([{ rawMaterialId: m.id, quantity: 0.6, unit: 'KILOGRAME' }]);
      const r = await api.recipe([{ rawMaterialId: m.id, quantity: 1.368, unit: 'GRAME' }], {
        unit: 'BUCATI',
        yieldQuantity: 1,
      });
      const task = await api.task({
        recipeId: r.id,
        targetQuantity: 1,
        targetUnit: 'BUCATI',
        locationId: lab.id,
      });
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200);
      await api.transition(task.id, { status: 'FINALIZAT', actualYield: 1 }, 200);
      close(await locQty(m.id), 0.598632);

      // Same body the iOS edit form sends: the whole form, unit changed.
      await api.patch(
        `/api/v1/raw-materials/${m.id}`,
        { title: m.title, unit: 'GRAME', minimumStock: 0.1, storageType: 'WARM' },
        200,
      );
      const { mat, mv, lots: ls } = await assertConsistent(m);
      expect(mat.unit).toBe('GRAME');
      close(Number(mat.stockCount), 598.632);
      close(Number(mat.minimumStock), 100);
      close(await locQty(m.id), 598.632);
      close(Number(ls[0].quantity), 600);
      close(Number(ls[0].remainingQuantity), 598.632);
      const intake = mv.find((x: Json) => x.movementType === 'INTRARE');
      expect(intake.unit).toBe('GRAME');
      close(Number(intake.quantity), 600);
      const out = mv.find((x: Json) => x.movementType === 'IESIRE_PRODUCTIE');
      expect(out.unit).toBe('GRAME');
      close(Number(out.quantity), 1.368);

      // counted 596 g afterwards: stock, lot and journal agree
      await adjust(m.id, 596, 'GRAME');
      const after = await assertConsistent(m);
      close(Number(after.lots[0].remainingQuantity), 596);
    });

    it('LITRI → MILILITRI rescales; a minimumStock sent as a new value is kept as typed', async () => {
      const m = await material('LITRI', { minimumStock: 1 });
      await single(m.id, 1.5, 'LITRI');
      await api.patch(
        `/api/v1/raw-materials/${m.id}`,
        { unit: 'MILILITRI', minimumStock: 250 },
        200,
      );
      const { mat } = await assertConsistent(m);
      close(Number(mat.stockCount), 1500);
      close(Number(mat.minimumStock), 250);
    });

    it('a cross-family change (kg → buc) is refused while there is stock, allowed when empty', async () => {
      const m = await material('KILOGRAME');
      await single(m.id, 2, 'KILOGRAME');
      const res = await api.patch(`/api/v1/raw-materials/${m.id}`, { unit: 'BUCATI' }, 400);
      expect(res.body.message).toMatch(/nu poate fi schimbată/);
      expect((await api.rawMaterialById(m.id)).unit).toBe('KILOGRAME');
      await adjust(m.id, 0, 'KILOGRAME');
      await api.patch(`/api/v1/raw-materials/${m.id}`, { unit: 'BUCATI' }, 200);
      expect((await api.rawMaterialById(m.id)).unit).toBe('BUCATI');
    });

    it('editing other fields with the same unit changes no quantity', async () => {
      const m = await material('GRAME');
      await single(m.id, 750, 'GRAME');
      await api.patch(
        `/api/v1/raw-materials/${m.id}`,
        { unit: 'GRAME', category: 'Materii prime' },
        200,
      );
      const { mat } = await assertConsistent(m);
      close(Number(mat.stockCount), 750);
    });
  });
});
