/**
 * Production tasks: create (single + multi, incl. the multi 500 regression),
 * state machine (VALID_TRANSITIONS), reservations + TASK_BLOCKED_INSUFFICIENT_STOCK,
 * FIFO consumption on finalize, yield capture + byproducts, cancel releases
 * reservations, semipreparate subtasks, visibility, CASL.
 */
import { bootApp, TestApp } from './helpers/app';
import { runWithoutTenant } from '../src/prisma/tenant-context';
import { Api } from './helpers/factory';
import { createOrg, TestOrg, uid } from './helpers/org';

jest.setTimeout(120000);

describe('Tasks', () => {
  let t: TestApp;
  let org: TestOrg;
  let api: Api;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lab: any;

  beforeAll(async () => {
    t = await bootApp();
    org = await createOrg(t, 'tasks');
    api = new Api(t, org);
    lab = await api.location({ name: `Laborator ${uid()}`, type: 'LABORATOR' });
  });
  afterAll(async () => t?.close());

  async function locQty(rawMaterialId: string, locationId = lab.id) {
    const rows = (await api.get(`/api/v1/locations/${locationId}/stock`, 200)).body;
    return Number(
      rows.find((r: { rawMaterialId: string }) => r.rawMaterialId === rawMaterialId)?.quantity ?? 0,
    );
  }
  async function recipeQty(recipeId: string, locationId = lab.id) {
    const rows = (await api.get(`/api/v1/locations/${locationId}/recipe-stock`, 200)).body;
    return Number(rows.find((r: { recipeId: string }) => r.recipeId === recipeId)?.quantity ?? 0);
  }

  /** Material with `stock` g at the lab + a FINAL recipe using `per` g per piece (yield 1 BUCATI). */
  async function setup(stock: number, per = 100) {
    const m = await api.rawMaterial({ purchasePrice: 10 });
    if (stock > 0) await api.receive(m.id, stock, { locationId: lab.id });
    const r = await api.recipe([{ rawMaterialId: m.id, quantity: per }], {
      yieldQuantity: 1,
      unit: 'BUCATI',
    });
    return { m, r };
  }

  const newTask = (recipeId: string, targetQuantity: number, extra: object = {}) =>
    api.task({ recipeId, targetQuantity, targetUnit: 'BUCATI', locationId: lab.id, ...extra });

  describe('create', () => {
    it('creates DE_FACUT with scaleFactor = target / yield, history row, display name', async () => {
      const { r } = await setup(0);
      const task = await newTask(r.id, 5, { priority: 2, notes: 'n', dueDate: '2026-10-20' });
      expect(task).toMatchObject({
        status: 'DE_FACUT',
        scaleFactor: 5,
        targetQuantity: 5,
        targetUnit: 'BUCATI',
        priority: 2,
        locationId: lab.id,
      });
      expect(task.displayName).toBe(r.name);
      expect(task.statusHistory).toHaveLength(1);
      expect(task.statusHistory[0]).toMatchObject({ fromStatus: null, toStatus: 'DE_FACUT' });
    });

    it('custom title overrides the display name; blank title falls back', async () => {
      const { r } = await setup(0);
      expect((await newTask(r.id, 1, { title: 'Comanda Popescu' })).displayName).toBe(
        'Comanda Popescu',
      );
      expect((await newTask(r.id, 1, { title: '   ' })).displayName).toBe(r.name);
      await api.post(
        '/api/v1/tasks',
        { recipeId: r.id, targetQuantity: 1, targetUnit: 'BUCATI', title: 'x'.repeat(121) },
        400,
      );
    });

    it('validation: 0 / negative target, unknown recipe, archived recipe, bad unit field name', async () => {
      const { r } = await setup(0);
      await api.post(
        '/api/v1/tasks',
        { recipeId: r.id, targetQuantity: 0, targetUnit: 'BUCATI' },
        400,
      );
      await api.post(
        '/api/v1/tasks',
        { recipeId: r.id, targetQuantity: -1, targetUnit: 'BUCATI' },
        400,
      );
      await api.post(
        '/api/v1/tasks',
        {
          recipeId: '00000000-0000-4000-8000-000000000000',
          targetQuantity: 1,
          targetUnit: 'BUCATI',
        },
        404,
      );
      await api.post('/api/v1/tasks', { recipeId: r.id, targetQuantity: 1, unit: 'BUCATI' }, 400);
      await api.patch(`/api/v1/recipes/${r.id}/archive`, { archived: true }, 200);
      await api.post(
        '/api/v1/tasks',
        { recipeId: r.id, targetQuantity: 1, targetUnit: 'BUCATI' },
        400,
      );
    });

    it('a zero-yield recipe is refused with 400 (not a 500)', async () => {
      const m = await api.rawMaterial();
      // The API now refuses a 0 yield at save; legacy rows may still have one.
      const r = await api.recipe([{ rawMaterialId: m.id, quantity: 1 }]);
      await runWithoutTenant(() =>
        t.prisma.recipe.update({ where: { id: r.id }, data: { yieldQuantity: 0 } }),
      );
      const res = await api.post(
        '/api/v1/tasks',
        { recipeId: r.id, targetQuantity: 1, targetUnit: 'BUCATI' },
        400,
      );
      expect(res.body.message).toMatch(/randament/);
    });

    // CreateTaskDto.dueDate/plannedDate are @IsString (not @IsDateString);
    // `new Date('mâine')` reaches Prisma as an Invalid Date → 500.
    it('invalid dates are a 400, never a 500 [FINDING create-task.dto.ts dueDate @IsString]', async () => {
      const { r } = await setup(0);
      const res = await t.http
        .post('/api/v1/tasks')
        .set(org.as())
        .send({ recipeId: r.id, targetQuantity: 1, targetUnit: 'BUCATI', dueDate: 'mâine' });
      expect(res.status).toBe(400);
    });

    // assignedToId is only @IsUUID; an unknown user hits the FK → 500.
    it('an unknown assignee is a 4xx, never a 500 [FINDING tasks.service.ts create assignedToId FK]', async () => {
      const { r } = await setup(0);
      const res = await t.http.post('/api/v1/tasks').set(org.as()).send({
        recipeId: r.id,
        targetQuantity: 1,
        targetUnit: 'BUCATI',
        assignedToId: '00000000-0000-4000-8000-000000000000',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('defaults the location to the assignee primary location, else the org default', async () => {
      const { r } = await setup(0);
      const shop = await api.location({ type: 'MAGAZIN' });
      await api.post(
        `/api/v1/locations/${shop.id}/users`,
        { userId: org.users.cofetar.id, isPrimary: true },
        201,
      );
      expect(
        (
          await api.task({
            recipeId: r.id,
            targetQuantity: 1,
            targetUnit: 'BUCATI',
            assignedToId: org.users.cofetar.id,
          })
        ).locationId,
      ).toBe(shop.id);

      const dep = await api.location({ type: 'DEPOZIT' });
      await api.patch('/api/v1/organization', { defaultLocationId: dep.id }, 200);
      expect(
        (await api.task({ recipeId: r.id, targetQuantity: 1, targetUnit: 'BUCATI' })).locationId,
      ).toBe(dep.id);
      await api.patch('/api/v1/organization', { defaultLocationId: null }, 200);
    });

    // scaleFactor = targetQuantity / (yield × qpp) ignores targetUnit: a 1000 g
    // recipe asked for "2 KILOGRAME" scales by 0.002 instead of 2.
    it('targetUnit is honoured in the scale factor (2 KILOGRAME of a 1000 GRAME recipe = ×2) [FINDING tasks.service.ts create scaleFactor]', async () => {
      const m = await api.rawMaterial();
      const r = await api.recipe([{ rawMaterialId: m.id, quantity: 500 }], {
        unit: 'GRAME',
        yieldQuantity: 1000,
      });
      const task = await api.task({
        recipeId: r.id,
        targetQuantity: 2,
        targetUnit: 'KILOGRAME',
        locationId: lab.id,
      });
      expect(task.scaleFactor).toBeCloseTo(2, 6);
    });
  });

  describe('multi create', () => {
    it('one task per item, all in one group, with the shared label', async () => {
      const a = await setup(0);
      const b = await setup(0);
      const res = (
        await api.post(
          '/api/v1/tasks/multi',
          {
            groupLabel: 'Comanda nunta',
            locationId: lab.id,
            items: [
              { recipeId: a.r.id, targetQuantity: 3, targetUnit: 'BUCATI' },
              { recipeId: b.r.id, targetQuantity: 4, targetUnit: 'BUCATI' },
            ],
          },
          201,
        )
      ).body;
      expect(res.groupId).toEqual(expect.any(String));
      expect(res.tasks).toHaveLength(2);
      expect(
        res.tasks.every(
          (x: { groupId: string; groupLabel: string }) =>
            x.groupId === res.groupId && x.groupLabel === 'Comanda nunta',
        ),
      ).toBe(true);
    });

    it('includeSemipreparate adds one subtask per semipreparat at the full scaled quantity', async () => {
      const flour = await api.rawMaterial();
      const semi = await api.recipe([{ rawMaterialId: flour.id, quantity: 100 }], {
        type: 'SEMIPREPARAT',
        unit: 'GRAME',
        yieldQuantity: 100,
      });
      const cake = await api.recipe([{ semipreparatRecipeId: semi.id, quantity: 250 }], {
        yieldQuantity: 1,
      });
      const res = (
        await api.post(
          '/api/v1/tasks/multi',
          {
            includeSemipreparate: true,
            locationId: lab.id,
            items: [{ recipeId: cake.id, targetQuantity: 2, targetUnit: 'BUCATI' }],
          },
          201,
        )
      ).body;
      expect(res.tasks[0].subtasks).toHaveLength(1);
      expect(res.tasks[0].subtasks[0]).toMatchObject({ recipeId: semi.id, targetQuantity: 500 });
    });

    // Regression: POST /tasks/multi used to 500 (zero-yield / bad quantity → Infinity → Prisma).
    it('multi regression: a zero-yield recipe or a zero quantity is a 400, never a 500', async () => {
      const m = await api.rawMaterial();
      // The API now refuses a 0 yield at save; legacy rows may still have one.
      const zero = await api.recipe([{ rawMaterialId: m.id, quantity: 1 }]);
      await runWithoutTenant(() =>
        t.prisma.recipe.update({ where: { id: zero.id }, data: { yieldQuantity: 0 } }),
      );
      const ok = await setup(0);
      const r1 = await t.http
        .post('/api/v1/tasks/multi')
        .set(org.as())
        .send({ items: [{ recipeId: zero.id, targetQuantity: 1, targetUnit: 'BUCATI' }] });
      expect(r1.status).toBe(400);
      const r2 = await t.http
        .post('/api/v1/tasks/multi')
        .set(org.as())
        .send({ items: [{ recipeId: ok.r.id, targetQuantity: 0, targetUnit: 'BUCATI' }] });
      expect(r2.status).toBe(400);
      const r3 = await t.http.post('/api/v1/tasks/multi').set(org.as()).send({ items: [] });
      expect(r3.status).toBe(400);
    });

    it('multi regression: an unparseable dueDate is a 400, never a 500 [FINDING create-multi-task.dto.ts dueDate @IsString]', async () => {
      const ok = await setup(0);
      const r4 = await t.http
        .post('/api/v1/tasks/multi')
        .set(org.as())
        .send({
          items: [{ recipeId: ok.r.id, targetQuantity: 1, targetUnit: 'BUCATI' }],
          dueDate: 'not-a-date',
        });
      expect(r4.status).toBeLessThan(500);
    });

    // The loop creates items one by one without a transaction: when item 2 is
    // refused, item 1 is already persisted (a half-created family).
    it('multi is all-or-nothing: a bad second item leaves no first task behind [FINDING tasks.service.ts createMulti no transaction]', async () => {
      const ok = await setup(0);
      const m = await api.rawMaterial();
      // The API now refuses a 0 yield at save; legacy rows may still have one.
      const zero = await api.recipe([{ rawMaterialId: m.id, quantity: 1 }]);
      await runWithoutTenant(() =>
        t.prisma.recipe.update({ where: { id: zero.id }, data: { yieldQuantity: 0 } }),
      );
      await api.post(
        '/api/v1/tasks/multi',
        {
          items: [
            { recipeId: ok.r.id, targetQuantity: 1, targetUnit: 'BUCATI' },
            { recipeId: zero.id, targetQuantity: 1, targetUnit: 'BUCATI' },
          ],
        },
        400,
      );
      const list = (await api.get(`/api/v1/tasks?recipeId=${ok.r.id}`, 200)).body;
      expect(list.total).toBe(0);
    });

    it('cofetar cannot create (single or multi)', async () => {
      const { r } = await setup(0);
      await api.post(
        '/api/v1/tasks',
        { recipeId: r.id, targetQuantity: 1, targetUnit: 'BUCATI' },
        403,
        'cofetar',
      );
      await api.post(
        '/api/v1/tasks/multi',
        { items: [{ recipeId: r.id, targetQuantity: 1, targetUnit: 'BUCATI' }] },
        403,
        'cofetar',
      );
      await api.post(
        '/api/v1/tasks',
        { recipeId: r.id, targetQuantity: 1, targetUnit: 'BUCATI' },
        201,
        'sef-cofetar',
      );
    });
  });

  describe('state machine', () => {
    it('allowed: DE_FACUT→IN_LUCRU→FINALIZAT; refused: DE_FACUT→FINALIZAT, out of FINALIZAT/ANULAT', async () => {
      const { r } = await setup(1000);
      const task = await newTask(r.id, 1);
      await api.transition(task.id, { status: 'FINALIZAT', actualYield: 1 }, 400);
      await api.transition(task.id, { status: 'BLOCAT' }, 400);
      await api.transition(task.id, { status: 'DE_FACUT' }, 400);
      const started = (await api.transition(task.id, { status: 'IN_LUCRU' }, 200)).body;
      expect(started.status).toBe('IN_LUCRU');
      expect(started.startedAt).toBeTruthy();
      await api.transition(task.id, { status: 'DE_FACUT' }, 400);
      await api.transition(task.id, { status: 'FINALIZAT' }, 400); // actualYield required
      const done = (await api.transition(task.id, { status: 'FINALIZAT', actualYield: 1 }, 200))
        .body;
      expect(done.status).toBe('FINALIZAT');
      expect(done.completedAt).toBeTruthy();
      for (const s of ['DE_FACUT', 'IN_LUCRU', 'ANULAT', 'BLOCAT'])
        await api.transition(task.id, { status: s }, 400);
      expect(done.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual([
        'DE_FACUT',
        'IN_LUCRU',
        'FINALIZAT',
      ]);
    });

    it('ANULAT is terminal and records the reason', async () => {
      const { r } = await setup(0);
      const task = await newTask(r.id, 1);
      const c = (
        await api.transition(task.id, { status: 'ANULAT', reason: 'client a renunțat' }, 200)
      ).body;
      expect(c).toMatchObject({ status: 'ANULAT', cancelReason: 'client a renunțat' });
      await api.transition(task.id, { status: 'IN_LUCRU' }, 400);
    });

    it('an invalid status value or unknown task', async () => {
      const { r } = await setup(0);
      const task = await newTask(r.id, 1);
      await api.transition(task.id, { status: 'GATA' }, 400);
      await api.transition('00000000-0000-4000-8000-000000000000', { status: 'IN_LUCRU' }, 404);
    });
  });

  describe('reservations', () => {
    it('start reserves stock; material-requirements shows the scaled need; availability shows the reservation', async () => {
      const { m, r } = await setup(1000, 100);
      const task = await newTask(r.id, 3);
      const req = (await api.get(`/api/v1/tasks/${task.id}/material-requirements`, 200)).body;
      const row = req.find((x: { rawMaterialId: string }) => x.rawMaterialId === m.id);
      expect(row).toMatchObject({ needed: 300, currentStock: 1000, stockAfter: 700 });

      await api.transition(task.id, { status: 'IN_LUCRU' }, 200);
      const a = (await api.get(`/api/v1/stock/item-availability?rawMaterialId=${m.id}`, 200)).body;
      expect(a.reservedForTasks).toBe(300);
      expect(a.activeTaskCount).toBe(1);
      expect(a.locations[0]).toMatchObject({ quantity: 1000, reservedCount: 300 });
      expect(await locQty(m.id)).toBe(1000); // reserved, not yet consumed
    });

    it('preview-requirements before a task exists', async () => {
      const { m, r } = await setup(1000, 100);
      const p = (
        await api.get(
          `/api/v1/tasks/preview-requirements?recipeId=${r.id}&targetQuantity=4&targetUnit=BUCATI&locationId=${lab.id}`,
          200,
        )
      ).body;
      expect(p.find((x: { rawMaterialId: string }) => x.rawMaterialId === m.id)).toMatchObject({
        needed: 400,
      });
    });

    it('insufficient stock → 409 TASK_BLOCKED_INSUFFICIENT_STOCK, task moves to BLOCAT with shortages; nothing reserved', async () => {
      const { m, r } = await setup(150, 100);
      const task = await newTask(r.id, 2);
      const res = await api.transition(task.id, { status: 'IN_LUCRU' }, 409);
      expect(res.body.errorCode).toBe('TASK_BLOCKED_INSUFFICIENT_STOCK');
      const got = (await api.get(`/api/v1/tasks/${task.id}`, 200)).body;
      expect(got.status).toBe('BLOCAT');
      expect(got.shortages[0]).toMatchObject({ rawMaterialId: m.id, needed: 200, available: 150 });
      expect(
        (await api.get(`/api/v1/stock/item-availability?rawMaterialId=${m.id}`, 200)).body
          .reservedForTasks,
      ).toBe(0);

      const shop = (await api.get('/api/v1/tasks/shopping-list', 200)).body;
      expect(JSON.stringify(shop)).toContain(m.id);

      // receive the missing stock, then BLOCAT → IN_LUCRU works and clears shortages
      await api.receive(m.id, 100, { locationId: lab.id });
      const started = (await api.transition(task.id, { status: 'IN_LUCRU' }, 200)).body;
      expect(started.shortages).toBeNull();
      // BLOCAT → DE_FACUT is also a valid edge (checked on a fresh blocked task)
      const t2 = await newTask(r.id, 50);
      await api.transition(t2.id, { status: 'IN_LUCRU' }, 409);
      await api.transition(t2.id, { status: 'DE_FACUT' }, 200);
    });

    it('a reservation blocks a second task from over-claiming the same stock', async () => {
      const { r } = await setup(300, 100);
      const a = await newTask(r.id, 2);
      const b = await newTask(r.id, 2);
      await api.transition(a.id, { status: 'IN_LUCRU' }, 200);
      await api.transition(b.id, { status: 'IN_LUCRU' }, 409);
    });

    it('cancel from IN_LUCRU releases the reservation', async () => {
      const { m, r } = await setup(500, 100);
      const task = await newTask(r.id, 4);
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200);
      expect(
        (await api.get(`/api/v1/stock/item-availability?rawMaterialId=${m.id}`, 200)).body
          .reservedForTasks,
      ).toBe(400);
      await api.transition(task.id, { status: 'ANULAT', reason: 'test' }, 200);
      const a = (await api.get(`/api/v1/stock/item-availability?rawMaterialId=${m.id}`, 200)).body;
      expect(a.reservedForTasks).toBe(0);
      expect(a.locations[0]).toMatchObject({ quantity: 500, reservedCount: 0 });
      // stock is free again for another task
      const other = await newTask(r.id, 5);
      await api.transition(other.id, { status: 'IN_LUCRU' }, 200);
    });

    it('deleting a running task releases its reservation', async () => {
      const { m, r } = await setup(500, 100);
      const task = await newTask(r.id, 2);
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200);
      await api.del(`/api/v1/tasks/${task.id}`, 200);
      expect(
        (await api.get(`/api/v1/stock/item-availability?rawMaterialId=${m.id}`, 200)).body
          .locations[0].reservedCount,
      ).toBe(0);
      await api.get(`/api/v1/tasks/${task.id}`, 404);
    });

    // Stocked semipreparate are not merged (only raw materials are), so two
    // ingredients of the same semi are each checked against the SAME available
    // quantity and together reserve more than is on hand.
    it.failing(
      'the same semipreparat used twice cannot reserve more than its stock [FINDING stock-reservation.service.ts reserveForTask per-row check]',
      async () => {
        const flour = await api.rawMaterial();
        const semi = await api.recipe([{ rawMaterialId: flour.id, quantity: 1 }], {
          type: 'SEMIPREPARAT',
          unit: 'GRAME',
          yieldQuantity: 1,
        });
        await api.post(
          '/api/v1/stock/recipe-movements',
          {
            recipeId: semi.id,
            movementType: 'INTRARE',
            quantity: 100,
            unit: 'GRAME',
            locationId: lab.id,
          },
          201,
        );
        const cake = (
          await api.post(
            '/api/v1/recipes',
            {
              name: `Dublu ${uid()}`,
              unit: 'BUCATI',
              yieldQuantity: 1,
              components: [
                {
                  name: 'A',
                  sortOrder: 0,
                  ingredients: [
                    {
                      name: 'S',
                      semipreparatRecipeId: semi.id,
                      quantity: 60,
                      unit: 'GRAME',
                      sortOrder: 0,
                    },
                  ],
                },
                {
                  name: 'B',
                  sortOrder: 1,
                  ingredients: [
                    {
                      name: 'S',
                      semipreparatRecipeId: semi.id,
                      quantity: 60,
                      unit: 'GRAME',
                      sortOrder: 0,
                    },
                  ],
                },
              ],
            },
            201,
          )
        ).body;
        const task = await newTask(cake.id, 1);
        await api.transition(task.id, { status: 'IN_LUCRU' }, 409);
      },
    );
  });

  describe('finalize: FIFO consumption, output, yield, byproducts', () => {
    it('consumes reserved stock FIFO across lots, credits actualYield, records variance + traceability', async () => {
      const m = await api.rawMaterial({ purchasePrice: 10 });
      await api.receive(m.id, 100, {
        locationId: lab.id,
        lotNumber: 'OLD',
        supplierInvoice: 'F-1',
      });
      await api.receive(m.id, 500, {
        locationId: lab.id,
        lotNumber: 'NEW',
        supplierInvoice: 'F-2',
      });
      const r = await api.recipe([{ rawMaterialId: m.id, quantity: 50 }], { yieldQuantity: 1 });
      const task = await newTask(r.id, 3); // needs 150 g: 100 from OLD + 50 from NEW
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200);
      const done = (await api.transition(task.id, { status: 'FINALIZAT', actualYield: 2.5 }, 200))
        .body;
      expect(done).toMatchObject({ actualYield: 2.5, varianceAbsolute: -0.5 });
      expect(done.variancePercent).toBeCloseTo(-16.667, 2);

      expect(await locQty(m.id)).toBe(450);
      expect((await api.rawMaterialById(m.id)).stockCount).toBe(450);
      const lots = (await api.get(`/api/v1/stock/lots?rawMaterialId=${m.id}`, 200)).body;
      const byLot = Object.fromEntries(
        lots.map((l: { lotNumber: string; remainingQuantity: number }) => [
          l.lotNumber,
          l.remainingQuantity,
        ]),
      );
      expect(byLot).toEqual({ OLD: 0, NEW: 450 });

      expect(await recipeQty(r.id)).toBe(2.5);

      const mv = (await api.get(`/api/v1/stock/movements?rawMaterialId=${m.id}`, 200)).body;
      expect(mv.data.map((x: { movementType: string }) => x.movementType)).toEqual(
        expect.arrayContaining(['REZERVARE', 'IESIRE_PRODUCTIE']),
      );

      const trace = (await api.get(`/api/v1/tasks/${task.id}/traceability`, 200)).body;
      const ing =
        trace.ingredients.find((i: { rawMaterialId: string }) => i.rawMaterialId === m.id) ??
        trace.ingredients[0];
      expect(ing.lots.map((l: { lotNumber: string }) => l.lotNumber).sort()).toEqual([
        'NEW',
        'OLD',
      ]);

      const yh = (await api.get(`/api/v1/recipes/${r.id}/yield-history`, 200)).body;
      expect(yh.data[0]).toMatchObject({ actualYield: 2.5, targetQuantity: 3 });
    });

    it('a held lot is consumed last', async () => {
      const m = await api.rawMaterial();
      await api.receive(m.id, 100, { locationId: lab.id, lotNumber: 'HELD' });
      await api.receive(m.id, 100, { locationId: lab.id, lotNumber: 'FREE' });
      const lots = (await api.get(`/api/v1/stock/lots?rawMaterialId=${m.id}`, 200)).body;
      const held = lots.find((l: { lotNumber: string }) => l.lotNumber === 'HELD');
      await api.patch(`/api/v1/stock/lots/${held.id}/hold`, { onHold: true }, 200);
      const r = await api.recipe([{ rawMaterialId: m.id, quantity: 80 }]);
      const task = await newTask(r.id, 1);
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200);
      await api.transition(task.id, { status: 'FINALIZAT', actualYield: 1 }, 200);
      const after = (await api.get(`/api/v1/stock/lots?rawMaterialId=${m.id}`, 200)).body;
      const rem = Object.fromEntries(
        after.map((l: { lotNumber: string; remainingQuantity: number }) => [
          l.lotNumber,
          l.remainingQuantity,
        ]),
      );
      expect(rem).toEqual({ HELD: 100, FREE: 20 });
    });

    it('actualYield must be ≥ 0', async () => {
      const { r } = await setup(1000);
      const task = await newTask(r.id, 1);
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200);
      await api.transition(task.id, { status: 'FINALIZAT', actualYield: -1 }, 400);
    });

    it('byproducts: reported quantities are credited; unknown byproduct → STOCK_004 and the task stays IN_LUCRU', async () => {
      const { r } = await setup(1000);
      const bp = (
        await api.post(
          '/api/v1/recipes',
          {
            name: `Resturi ${uid()}`,
            unit: 'GRAME',
            yieldQuantity: 1,
            isByproduct: true,
            sourceRecipeId: r.id,
          },
          201,
        )
      ).body;
      const stranger = await api.recipe([], { type: 'SEMIPREPARAT', unit: 'GRAME' });

      const task = await newTask(r.id, 1);
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200);
      const bad = await api.transition(
        task.id,
        {
          status: 'FINALIZAT',
          actualYield: 1,
          byproducts: [{ recipeId: stranger.id, quantity: 5 }],
        },
        400,
      );
      expect(bad.body.errorCode).toBe('STOCK_004');
      expect((await api.get(`/api/v1/tasks/${task.id}`, 200)).body.status).toBe('IN_LUCRU');

      await api.transition(
        task.id,
        { status: 'FINALIZAT', actualYield: 1, byproducts: [{ recipeId: bp.id, quantity: 37 }] },
        200,
      );
      expect(await recipeQty(bp.id)).toBe(37);
    });

    it('byproducts omitted: legacy fallback credits yieldQuantity × scaleFactor', async () => {
      const { r } = await setup(1000);
      const bp = (
        await api.post(
          '/api/v1/recipes',
          {
            name: `Rest ${uid()}`,
            unit: 'GRAME',
            yieldQuantity: 4,
            isByproduct: true,
            sourceRecipeId: r.id,
          },
          201,
        )
      ).body;
      const task = await newTask(r.id, 3);
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200);
      await api.transition(task.id, { status: 'FINALIZAT', actualYield: 3 }, 200);
      expect(await recipeQty(bp.id)).toBe(12);
    });

    it('finalizing to another location moves the goods and auto-creates a FINALIZAT transfer', async () => {
      const { r } = await setup(1000);
      const shop = await api.location({ type: 'MAGAZIN' });
      const task = await newTask(r.id, 2);
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200);
      await api.transition(
        task.id,
        { status: 'FINALIZAT', actualYield: 2, outputLocationId: shop.id },
        200,
      );
      expect(await recipeQty(r.id, shop.id)).toBe(2);
      expect(await recipeQty(r.id, lab.id)).toBe(0);
      const trs = (await api.get('/api/v1/stock/transfers?status=FINALIZAT&limit=100', 200)).body;
      expect(
        trs.data.some((x: { items: { recipeId: string }[] }) =>
          x.items.some((i) => i.recipeId === r.id),
        ),
      ).toBe(true);
    });
  });

  describe('semipreparate subtasks', () => {
    it('a semipreparat without stock becomes a subtask; the parent cannot finalize before it', async () => {
      const flour = await api.rawMaterial();
      await api.receive(flour.id, 10_000, { locationId: lab.id });
      const semi = await api.recipe([{ rawMaterialId: flour.id, quantity: 100 }], {
        type: 'SEMIPREPARAT',
        unit: 'GRAME',
        yieldQuantity: 100,
      });
      const cake = await api.recipe([{ semipreparatRecipeId: semi.id, quantity: 200 }], {
        yieldQuantity: 1,
      });
      const parent = await newTask(cake.id, 2);
      expect(parent.subtasks).toHaveLength(1);
      expect(parent.subtasks[0]).toMatchObject({
        recipeId: semi.id,
        targetQuantity: 400,
        status: 'DE_FACUT',
      });
      // subtasks are nested, not listed top-level
      const list = (await api.get(`/api/v1/tasks?recipeId=${semi.id}`, 200)).body;
      expect(list.total).toBe(0);
    });

    // Subtasks skip ALL stock operations ("parent handles stock"), but the
    // parent reserves the semipreparat from RecipeStock — which the finalized
    // subtask never credited. The documented flow (semipreparate become
    // subtasks) therefore dead-ends: the parent is BLOCAT after its subtask is done.
    it('after its semipreparat subtask is finalized the parent can start and finish [FINDING tasks.service.ts transition isSubtask skips fulfill]', async () => {
      const flour = await api.rawMaterial();
      await api.receive(flour.id, 10_000, { locationId: lab.id });
      const semi = await api.recipe([{ rawMaterialId: flour.id, quantity: 100 }], {
        type: 'SEMIPREPARAT',
        unit: 'GRAME',
        yieldQuantity: 100,
      });
      const cake = await api.recipe([{ semipreparatRecipeId: semi.id, quantity: 200 }], {
        yieldQuantity: 1,
      });
      const parent = await newTask(cake.id, 2);
      const sub = parent.subtasks[0];
      await api.transition(sub.id, { status: 'IN_LUCRU' }, 200);
      await api.transition(sub.id, { status: 'FINALIZAT', actualYield: 400 }, 200);
      await api.transition(parent.id, { status: 'IN_LUCRU' }, 200);
      await api.transition(parent.id, { status: 'FINALIZAT', actualYield: 2 }, 200);
      expect(await locQty(flour.id)).toBe(10_000 - 400);
    });

    it('a parent with an open subtask cannot be finalized', async () => {
      const flour = await api.rawMaterial();
      const semi = await api.recipe([{ rawMaterialId: flour.id, quantity: 100 }], {
        type: 'SEMIPREPARAT',
        unit: 'GRAME',
        yieldQuantity: 100,
      });
      await api.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: semi.id,
          movementType: 'INTRARE',
          quantity: 100,
          unit: 'GRAME',
          locationId: lab.id,
        },
        201,
      );
      const cake = await api.recipe([{ semipreparatRecipeId: semi.id, quantity: 200 }], {
        yieldQuantity: 1,
      });
      const parent = await newTask(cake.id, 1); // needs 200, 100 on hand → subtask for the 100 deficit
      expect(parent.subtasks[0].targetQuantity).toBe(100);
      await api.post(
        '/api/v1/stock/recipe-movements',
        {
          recipeId: semi.id,
          movementType: 'INTRARE',
          quantity: 100,
          unit: 'GRAME',
          locationId: lab.id,
        },
        201,
      );
      await api.transition(parent.id, { status: 'IN_LUCRU' }, 200);
      const r = await api.transition(parent.id, { status: 'FINALIZAT', actualYield: 1 }, 400);
      expect(r.body.message).toMatch(/subtask/);
    });
  });

  describe('visibility + permissions', () => {
    it('cofetar sees tasks assigned to them, EVERYONE and SELECTED-with-them; admins see all', async () => {
      const { r } = await setup(0);
      const mine = await newTask(r.id, 1, { assignedToId: org.users.cofetar.id });
      const everyone = await newTask(r.id, 1, { visibility: 'EVERYONE' });
      const selected = await newTask(r.id, 1, {
        visibility: 'SELECTED',
        visibleToIds: [org.users.cofetar.id],
      });
      const hidden = await newTask(r.id, 1, {
        visibility: 'SELECTED',
        visibleToIds: [org.users.gestionar.id],
      });
      const privateOther = await newTask(r.id, 1, { assignedToId: org.users['sef-cofetar'].id });

      const list = (await api.get(`/api/v1/tasks?recipeId=${r.id}&limit=50`, 200, 'cofetar')).body;
      const ids = list.data.map((x: { id: string }) => x.id);
      expect(ids).toEqual(expect.arrayContaining([mine.id, everyone.id, selected.id]));
      expect(ids).not.toContain(hidden.id);
      expect(ids).not.toContain(privateOther.id);

      const all = (await api.get(`/api/v1/tasks?recipeId=${r.id}&limit=50`, 200)).body;
      expect(all.total).toBe(5);
    });

    // Visibility is only applied to the list; GET /tasks/:id has no check, so a
    // cofetar can open any task (and its recipe) by id.
    it('GET /tasks/:id respects visibility (hidden task → 403/404 for a cofetar) [FINDING tasks.service.ts findById no visibility scope]', async () => {
      const { r } = await setup(0);
      const hidden = await newTask(r.id, 1, { assignedToId: org.users['sef-cofetar'].id });
      const res = await t.http.get(`/api/v1/tasks/${hidden.id}`).set(org.as('cofetar'));
      expect([403, 404]).toContain(res.status);
    });

    it('only the assignee (or manage Task) can start/finish; the creator can cancel; a cofetar cannot delete', async () => {
      const { r } = await setup(1000);
      const task = await newTask(r.id, 1, { assignedToId: org.users.cofetar.id });
      const notMine = await newTask(r.id, 1, {
        assignedToId: org.users.gestionar.id,
        visibility: 'EVERYONE',
      });
      await api.transition(notMine.id, { status: 'IN_LUCRU' }, 403, 'cofetar');
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200, 'cofetar');
      await api.transition(task.id, { status: 'ANULAT' }, 403, 'cofetar'); // not the creator
      await api.transition(task.id, { status: 'FINALIZAT', actualYield: 1 }, 200, 'cofetar');
      await api.del(`/api/v1/tasks/${task.id}`, 403, 'cofetar');
      await api.del(`/api/v1/tasks/${notMine.id}`, 200, 'sef-cofetar');
    });

    it('reassign is manage-only; assigned tasks show up in the assignee list', async () => {
      const { r } = await setup(0);
      const task = await newTask(r.id, 1);
      const res = await t.http
        .patch(`/api/v1/tasks/${task.id}/assign`)
        .set(org.as('cofetar'))
        .send({ assignedToId: org.users.cofetar.id });
      expect(res.status).toBe(403);
      const ok = (
        await api.patch(
          `/api/v1/tasks/${task.id}/assign`,
          { assignedToId: org.users.cofetar.id },
          200,
        )
      ).body;
      expect(ok.assignedToId).toBe(org.users.cofetar.id);
      const list = (await api.get(`/api/v1/tasks?recipeId=${r.id}`, 200, 'cofetar')).body;
      expect(list.data.map((x: { id: string }) => x.id)).toContain(task.id);
    });

    it('a cofetar reads the recipe only through an active task', async () => {
      const { r } = await setup(1000);
      await api.get(`/api/v1/recipes/${r.id}`, 403, 'cofetar');
      const task = await newTask(r.id, 1, { assignedToId: org.users.cofetar.id });
      await api.transition(task.id, { status: 'IN_LUCRU' }, 200, 'cofetar');
      await api.get(`/api/v1/recipes/${r.id}`, 200, 'cofetar');
    });

    it('?myDay=false does not switch the "Ziua mea" filter on', async () => {
      const { r } = await setup(0);
      const other = await newTask(r.id, 1, { assignedToId: org.users.gestionar.id });
      const all = (await api.get(`/api/v1/tasks?recipeId=${r.id}&myDay=false`, 200)).body;
      expect(all.data.map((x: { id: string }) => x.id)).toContain(other.id);
      const mine = (await api.get(`/api/v1/tasks?recipeId=${r.id}&myDay=true`, 200)).body;
      expect(mine.data.map((x: { id: string }) => x.id)).not.toContain(other.id);
    });

    it('PATCH updates scalars; calendar and stats answer', async () => {
      const { r } = await setup(0);
      const task = await newTask(r.id, 1);
      const upd = (
        await api.patch(
          `/api/v1/tasks/${task.id}`,
          { priority: 9, plannedDate: '2026-10-18', visibility: 'EVERYONE' },
          200,
        )
      ).body;
      expect(upd).toMatchObject({ priority: 9, visibility: 'EVERYONE' });
      await api.get('/api/v1/tasks/calendar?from=2026-10-12&to=2026-10-18', 200);
      const stats = (await api.get('/api/v1/tasks/stats', 200)).body;
      expect(stats.totalTasks).toBeGreaterThan(0);
    });
  });
});
