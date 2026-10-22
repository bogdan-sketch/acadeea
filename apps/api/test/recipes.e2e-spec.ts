/**
 * Recipes: CRUD, components, semipreparate (nesting + cost roll-up),
 * byproducts, versions, pricing (cost / margin / selling price / manual cost),
 * archive / draft, categories, validation, CASL.
 */
import { bootApp, TestApp } from './helpers/app';
import { runWithoutTenant } from '../src/prisma/tenant-context';
import { Api } from './helpers/factory';
import { createOrg, TestOrg, uid } from './helpers/org';

jest.setTimeout(120000);

describe('Recipes', () => {
  let t: TestApp;
  let org: TestOrg;
  let api: Api;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let flour: any, sugar: any;

  beforeAll(async () => {
    t = await bootApp();
    org = await createOrg(t, 'recipes');
    api = new Api(t, org);
    // 6 RON/kg flour, 8 RON/kg sugar — stocked in grams.
    flour = await api.rawMaterial({ title: `Faina ${uid()}`, unit: 'GRAME', purchasePrice: 6 });
    sugar = await api.rawMaterial({ title: `Zahar ${uid()}`, unit: 'GRAME', purchasePrice: 8 });
  });
  afterAll(async () => t?.close());

  const base = (overrides: object = {}) => ({
    name: `Tort ${uid()}`,
    unit: 'BUCATI',
    yieldQuantity: 10,
    type: 'FINAL',
    components: [
      {
        name: 'Blat',
        sortOrder: 0,
        ingredients: [
          { name: 'Faina', rawMaterialId: flour.id, quantity: 500, unit: 'GRAME', sortOrder: 0 },
          { name: 'Zahar', rawMaterialId: sugar.id, quantity: 250, unit: 'GRAME', sortOrder: 1 },
        ],
      },
    ],
    ...overrides,
  });

  describe('CRUD + components', () => {
    it('creates a FINAL recipe with nested components and ingredients', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      expect(r.type).toBe('FINAL');
      expect(r.yieldQuantity).toBe(10);
      expect(r.components).toHaveLength(1);
      expect(r.components[0].ingredients.map((i: { name: string }) => i.name)).toEqual([
        'Faina',
        'Zahar',
      ]);
      expect(r.components[0].ingredients[0].rawMaterialId).toBe(flour.id);

      const got = (await api.get(`/api/v1/recipes/${r.id}`, 200)).body;
      expect(got.name).toBe(r.name);
    });

    it('defaults type to FINAL and lists/searches recipes', async () => {
      const name = `Cautare ${uid()}`;
      const { type: _type, ...noType } = base({ name });
      void _type;
      const r = (await api.post('/api/v1/recipes', noType, 201)).body;
      expect(r.type).toBe('FINAL');
      const list = (await api.get(`/api/v1/recipes?search=${encodeURIComponent(name)}`, 200)).body;
      expect(list.data.map((x: { id: string }) => x.id)).toContain(r.id);
      expect(list).toMatchObject({ total: expect.any(Number), page: 1 });
    });

    it('PATCH replaces components fully and merges scalars', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      const upd = (
        await api.patch(
          `/api/v1/recipes/${r.id}`,
          {
            yieldQuantity: 12,
            components: [
              {
                name: 'Crema',
                sortOrder: 0,
                ingredients: [
                  {
                    name: 'Zahar',
                    rawMaterialId: sugar.id,
                    quantity: 100,
                    unit: 'GRAME',
                    sortOrder: 0,
                  },
                ],
              },
            ],
          },
          200,
        )
      ).body;
      expect(upd.yieldQuantity).toBe(12);
      expect(upd.name).toBe(r.name);
      expect(upd.components).toHaveLength(1);
      expect(upd.components[0].name).toBe('Crema');
      expect(upd.components[0].ingredients).toHaveLength(1);
    });

    it('DELETE removes an unused recipe; 404 afterwards', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.del(`/api/v1/recipes/${r.id}`, 200);
      await api.get(`/api/v1/recipes/${r.id}`, 404);
    });

    it('DELETE refuses a recipe with production history (400, not 500)', async () => {
      const loc = await api.location();
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.task({
        recipeId: r.id,
        targetQuantity: 10,
        targetUnit: 'BUCATI',
        locationId: loc.id,
      });
      const res = await api.del(`/api/v1/recipes/${r.id}`, 400);
      expect(res.body.message).toMatch(/task/i);
    });

    it('404 for an unknown id and 400 for a non-uuid id', async () => {
      await api.get('/api/v1/recipes/00000000-0000-4000-8000-000000000000', 404);
      await api.get('/api/v1/recipes/not-a-uuid', 400);
    });
  });

  describe('validation', () => {
    it('rejects unknown fields (forbidNonWhitelisted)', async () => {
      await api.post('/api/v1/recipes', base({ hacker: true }), 400);
    });

    it('rejects a negative yield and a negative ingredient quantity', async () => {
      await api.post('/api/v1/recipes', base({ yieldQuantity: -1 }), 400);
      const bad = base();
      bad.components[0].ingredients[0].quantity = -5;
      await api.post('/api/v1/recipes', bad, 400);
    });

    // Documented rule (owner brief): yield > 0. DTO uses @Min(0) → 0 accepted,
    // and a 0 yield makes every task scale factor target/0 = Infinity.
    it('rejects yieldQuantity = 0 (yield must be > 0) [FINDING create-recipe.dto.ts @Min(0)]', async () => {
      await api.post('/api/v1/recipes', base({ yieldQuantity: 0 }), 400);
    });

    // Documented rule (owner brief): ingredient qty > 0. DTO uses @Min(0).
    it('rejects an ingredient quantity of 0 [FINDING create-recipe.dto.ts @Min(0)]', async () => {
      const bad = base();
      bad.components[0].ingredients[0].quantity = 0;
      await api.post('/api/v1/recipes', bad, 400);
    });

    it('ingredient XOR: neither or both references → 400', async () => {
      const neither = base();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (neither.components[0].ingredients[0] as any).rawMaterialId;
      await api.post('/api/v1/recipes', neither, 400);

      const semi = (
        await api.post(
          '/api/v1/recipes',
          base({ type: 'SEMIPREPARAT', unit: 'GRAME', yieldQuantity: 1000 }),
          201,
        )
      ).body;
      const both = base();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (both.components[0].ingredients[0] as any).semipreparatRecipeId = semi.id;
      await api.post('/api/v1/recipes', both, 400);
    });

    it('rejects an unknown unit and a missing name', async () => {
      await api.post('/api/v1/recipes', base({ unit: 'POUNDZ' }), 400);
      const { name: _n, ...noName } = base();
      void _n;
      await api.post('/api/v1/recipes', noName, 400);
    });

    it('a semipreparat used in a unit that cannot convert to its yield unit → 400', async () => {
      const semi = (
        await api.post(
          '/api/v1/recipes',
          base({ type: 'SEMIPREPARAT', unit: 'BUCATI', yieldQuantity: 4 }),
          201,
        )
      ).body;
      const res = await api.post(
        '/api/v1/recipes',
        base({
          components: [
            {
              name: 'X',
              sortOrder: 0,
              ingredients: [
                {
                  name: 'S',
                  semipreparatRecipeId: semi.id,
                  quantity: 2,
                  unit: 'GRAME',
                  sortOrder: 0,
                },
              ],
            },
          ],
        }),
        400,
      );
      expect(res.body.message).toMatch(/conversie/);
    });
  });

  describe('semipreparate', () => {
    it('nests a semipreparat and rolls its cost up recursively', async () => {
      // Crema: 1000 g sugar (8 RON/kg = 8 RON) yields 1000 g.
      const crema = (
        await api.post(
          '/api/v1/recipes',
          {
            name: `Crema ${uid()}`,
            unit: 'GRAME',
            yieldQuantity: 1000,
            type: 'SEMIPREPARAT',
            components: [
              {
                name: 'C',
                sortOrder: 0,
                ingredients: [
                  {
                    name: 'Zahar',
                    rawMaterialId: sugar.id,
                    quantity: 1000,
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
      // Tort: 500 g flour (3 RON) + 250 g crema (2 RON) = 5 RON.
      const tort = (
        await api.post(
          '/api/v1/recipes',
          {
            ...base(),
            components: [
              {
                name: 'T',
                sortOrder: 0,
                ingredients: [
                  {
                    name: 'Faina',
                    rawMaterialId: flour.id,
                    quantity: 500,
                    unit: 'GRAME',
                    sortOrder: 0,
                  },
                  {
                    name: 'Crema',
                    semipreparatRecipeId: crema.id,
                    quantity: 250,
                    unit: 'GRAME',
                    sortOrder: 1,
                  },
                ],
              },
            ],
          },
          201,
        )
      ).body;
      const cost = (await api.get(`/api/v1/recipes/${tort.id}/cost`, 200)).body;
      expect(cost.totalCost).toBeCloseTo(5, 4);
      const semiRow = cost.ingredients.find((i: { isSemipreparat: boolean }) => i.isSemipreparat);
      expect(semiRow.totalCost).toBeCloseTo(2, 4);

      // A kg ingredient of a gram-yield semipreparat converts (0.5 kg = 4 RON).
      const kg = (
        await api.post(
          '/api/v1/recipes',
          {
            ...base(),
            components: [
              {
                name: 'K',
                sortOrder: 0,
                ingredients: [
                  {
                    name: 'Crema',
                    semipreparatRecipeId: crema.id,
                    quantity: 0.5,
                    unit: 'KILOGRAME',
                    sortOrder: 0,
                  },
                ],
              },
            ],
          },
          201,
        )
      ).body;
      expect((await api.get(`/api/v1/recipes/${kg.id}/cost`, 200)).body.totalCost).toBeCloseTo(
        4,
        4,
      );

      const tree = await api.get(
        `/api/v1/recipes/${tort.id}/resolved-tree?quantity=20&unit=BUCATI`,
      );
      expect(tree.body).toBeTruthy();
      expect(tree.status).toBe(200);

      const semis = (await api.get('/api/v1/recipes?type=SEMIPREPARAT&limit=100', 200)).body;
      expect(semis.data.map((x: { id: string }) => x.id)).toContain(crema.id);
      expect(semis.data.map((x: { id: string }) => x.id)).not.toContain(tort.id);
    });

    // The cost walk shares ONE `seen` set across sibling branches, so the same
    // semipreparat used twice in a recipe is mistaken for a cycle and the
    // whole recipe cost becomes null ("—") although it is perfectly priceable.
    it.failing(
      'the same semipreparat used in two components is costed twice, not treated as a cycle [FINDING recipes.service.ts computeRecipeCost seen-set]',
      async () => {
        const glaze = (
          await api.post(
            '/api/v1/recipes',
            {
              name: `Glazura ${uid()}`,
              unit: 'GRAME',
              yieldQuantity: 1000,
              type: 'SEMIPREPARAT',
              components: [
                {
                  name: 'G',
                  sortOrder: 0,
                  ingredients: [
                    {
                      name: 'Zahar',
                      rawMaterialId: sugar.id,
                      quantity: 1000,
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
        const r = (
          await api.post(
            '/api/v1/recipes',
            {
              ...base(),
              components: [
                {
                  name: 'Sus',
                  sortOrder: 0,
                  ingredients: [
                    {
                      name: 'Glazura',
                      semipreparatRecipeId: glaze.id,
                      quantity: 100,
                      unit: 'GRAME',
                      sortOrder: 0,
                    },
                  ],
                },
                {
                  name: 'Jos',
                  sortOrder: 1,
                  ingredients: [
                    {
                      name: 'Glazura',
                      semipreparatRecipeId: glaze.id,
                      quantity: 100,
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
        const cost = (await api.get(`/api/v1/recipes/${r.id}/cost`, 200)).body;
        expect(cost.totalCost).toBeCloseTo(1.6, 4); // 200 g × 8 RON/kg
      },
    );

    // Documented: RECIPE_001 "Circular dependency detected". Nothing rejects
    // A→B→A on create/update today.
    it('rejects a circular semipreparat dependency (RECIPE_001) [FINDING no cycle check in recipes.service.ts update]', async () => {
      const a = (
        await api.post(
          '/api/v1/recipes',
          base({ type: 'SEMIPREPARAT', unit: 'GRAME', yieldQuantity: 100 }),
          201,
        )
      ).body;
      const b = (
        await api.post(
          '/api/v1/recipes',
          base({
            type: 'SEMIPREPARAT',
            unit: 'GRAME',
            yieldQuantity: 100,
            components: [
              {
                name: 'B',
                sortOrder: 0,
                ingredients: [
                  {
                    name: 'A',
                    semipreparatRecipeId: a.id,
                    quantity: 10,
                    unit: 'GRAME',
                    sortOrder: 0,
                  },
                ],
              },
            ],
          }),
          201,
        )
      ).body;
      const res = await api.patch(`/api/v1/recipes/${a.id}`, {
        components: [
          {
            name: 'A',
            sortOrder: 0,
            ingredients: [
              {
                name: 'B',
                semipreparatRecipeId: b.id,
                quantity: 10,
                unit: 'GRAME',
                sortOrder: 0,
              },
            ],
          },
        ],
      });
      expect(res.status).toBe(400);
    });

    it('a cycle never crashes the cost endpoint (guarded → null cost)', async () => {
      const a = (
        await api.post(
          '/api/v1/recipes',
          base({ type: 'SEMIPREPARAT', unit: 'GRAME', yieldQuantity: 100 }),
          201,
        )
      ).body;
      const b = (
        await api.post(
          '/api/v1/recipes',
          base({
            type: 'SEMIPREPARAT',
            unit: 'GRAME',
            yieldQuantity: 100,
            components: [
              {
                name: 'B',
                sortOrder: 0,
                ingredients: [
                  {
                    name: 'A',
                    semipreparatRecipeId: a.id,
                    quantity: 10,
                    unit: 'GRAME',
                    sortOrder: 0,
                  },
                ],
              },
            ],
          }),
          201,
        )
      ).body;
      // The API now refuses to save a loop (RECIPE_001), so close it directly
      // in the DB — legacy data may still contain one.
      await runWithoutTenant(() =>
        t.prisma.recipeComponent.create({
          data: {
            recipeId: a.id,
            name: 'A',
            sortOrder: 0,
            ingredients: {
              create: [
                {
                  name: 'B',
                  semipreparatRecipeId: b.id,
                  quantity: 10,
                  unit: 'GRAME',
                  sortOrder: 0,
                },
              ],
            },
          },
        }),
      );
      const cost = await api.get(`/api/v1/recipes/${a.id}/cost`);
      expect(cost.status).toBe(200);
      expect(cost.body.totalCost).toBeNull();
    });
  });

  describe('byproducts', () => {
    it('creates a byproduct linked to its source; forced SEMIPREPARAT; listed/filtered', async () => {
      const src = (await api.post('/api/v1/recipes', base(), 201)).body;
      const { type: _t, ...noType } = base({ unit: 'GRAME', yieldQuantity: 1 });
      void _t;
      const bp = (
        await api.post(
          '/api/v1/recipes',
          { ...noType, name: `Resturi ${uid()}`, isByproduct: true, sourceRecipeId: src.id },
          201,
        )
      ).body;
      expect(bp.type).toBe('SEMIPREPARAT');
      expect(bp.isByproduct).toBe(true);
      expect(bp.sourceRecipeId).toBe(src.id);

      const srcAgain = (await api.get(`/api/v1/recipes/${src.id}`, 200)).body;
      expect(srcAgain.byproducts).toEqual([{ id: bp.id, name: bp.name }]);

      const onlyBp = (await api.get('/api/v1/recipes?byproduct=true&limit=100', 200)).body;
      expect(onlyBp.data.every((r: { isByproduct: boolean }) => r.isByproduct)).toBe(true);
      expect(onlyBp.data.map((r: { id: string }) => r.id)).toContain(bp.id);
    });

    // Regression: the @Transform ran AFTER enableImplicitConversion had already
    // turned "false" into Boolean("false") === true, so false meant true.
    it('?byproduct=false / ?archived=false / ?draft=false mean false', async () => {
      const src = (await api.post('/api/v1/recipes', base(), 201)).body;
      const bp = (
        await api.post(
          '/api/v1/recipes',
          {
            ...base({ unit: 'GRAME', yieldQuantity: 1, type: 'SEMIPREPARAT' }),
            name: `Rest ${uid()}`,
            isByproduct: true,
            sourceRecipeId: src.id,
          },
          201,
        )
      ).body;
      const noBp = (await api.get('/api/v1/recipes?byproduct=false&limit=200', 200)).body;
      expect(noBp.data.map((r: { id: string }) => r.id)).not.toContain(bp.id);
      expect(noBp.data.map((r: { id: string }) => r.id)).toContain(src.id);
      const active = (await api.get('/api/v1/recipes?archived=false&draft=false&limit=200', 200))
        .body;
      expect(active.data.map((r: { id: string }) => r.id)).toContain(src.id);
    });

    it('a FINAL byproduct and a source without isByproduct are rejected; unknown source → 404', async () => {
      const src = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.post('/api/v1/recipes', base({ isByproduct: true, type: 'FINAL' }), 400);
      await api.post('/api/v1/recipes', base({ sourceRecipeId: src.id }), 400);
      await api.post(
        '/api/v1/recipes',
        base({
          type: 'SEMIPREPARAT',
          isByproduct: true,
          sourceRecipeId: '00000000-0000-4000-8000-000000000000',
        }),
        404,
      );
    });

    it('isByproduct cannot be changed through PATCH (create-only)', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.patch(`/api/v1/recipes/${r.id}`, { isByproduct: true }, 400);
    });
  });

  describe('versions', () => {
    it('GET /versions answers for a fresh recipe', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      const v = await api.get(`/api/v1/recipes/${r.id}/versions`, 200);
      expect(Array.isArray(v.body)).toBe(true);
    });

    // Documented: "Recipe versioning … RecipeVersion — immutable snapshot per
    // version". RecipesService.snapshotVersion exists but has NO caller, so an
    // edit never produces a version and Recipe.version stays 1.
    it('an edit snapshots a new version [FINDING recipes.service.ts:794 snapshotVersion never called]', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.patch(`/api/v1/recipes/${r.id}`, { yieldQuantity: 20 }, 200);
      const v = (await api.get(`/api/v1/recipes/${r.id}/versions`, 200)).body;
      expect(v.length).toBeGreaterThanOrEqual(1);
    });

    it('archive / draft toggles do not touch versioning', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.patch(`/api/v1/recipes/${r.id}/archive`, { archived: true }, 200);
      await api.patch(`/api/v1/recipes/${r.id}/archive`, { archived: false }, 200);
      const after = (await api.get(`/api/v1/recipes/${r.id}`, 200)).body;
      expect(after.version).toBe(r.version);
    });
  });

  describe('pricing', () => {
    it('cost is unit-aware: RON/kg prices on gram stock (500 g × 6 + 250 g × 8 = 5 RON)', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      const cost = (await api.get(`/api/v1/recipes/${r.id}/cost`, 200)).body;
      expect(cost.totalCost).toBeCloseTo(5, 4);
      expect(cost.ingredientsCost).toBeCloseTo(5, 4);
      expect(cost.manualCost).toBeNull();
      const flourRow = cost.ingredients.find((i: { name: string }) => i.name === 'Faina');
      expect(flourRow.totalCost).toBeCloseTo(3, 4);
      expect(flourRow.unitPrice).toBeCloseTo(0.006, 6);
    });

    it('the latest intake lot price wins over the material field', async () => {
      const m = await api.rawMaterial({ unit: 'GRAME', purchasePrice: 10 });
      await api.receive(m.id, 1000, { purchasePrice: 20 });
      const r = await api.recipe([{ rawMaterialId: m.id, quantity: 100 }]);
      expect((await api.get(`/api/v1/recipes/${r.id}/cost`, 200)).body.totalCost).toBeCloseTo(2, 4);
    });

    it('an unpriced ingredient makes totalCost null', async () => {
      const m = await api.rawMaterial({ unit: 'GRAME' });
      const r = await api.recipe([{ rawMaterialId: m.id, quantity: 100 }]);
      expect((await api.get(`/api/v1/recipes/${r.id}/cost`, 200)).body.totalCost).toBeNull();
    });

    it('manual cost overrides the computed cost and can be cleared with null', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.patch(`/api/v1/recipes/${r.id}/manual-cost`, { manualCost: 12.5 }, 200);
      let cost = (await api.get(`/api/v1/recipes/${r.id}/cost`, 200)).body;
      expect(cost.totalCost).toBeCloseTo(12.5, 4);
      expect(cost.ingredientsCost).toBeCloseTo(5, 4);
      await api.patch(`/api/v1/recipes/${r.id}/manual-cost`, { manualCost: -1 }, 400);
      await api.patch(`/api/v1/recipes/${r.id}/manual-cost`, { manualCost: null }, 200);
      cost = (await api.get(`/api/v1/recipes/${r.id}/cost`, 200)).body;
      expect(cost.totalCost).toBeCloseTo(5, 4);
    });

    it('selling price via PATCH /recipes/:id (update DTO) drives margin', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.patch(`/api/v1/recipes/${r.id}`, { sellingPrice: 20 }, 200);
      const cost = (await api.get(`/api/v1/recipes/${r.id}/cost`, 200)).body;
      expect(cost.sellingPrice).toBe(20);
      expect(cost.margin).toBeCloseTo(15, 4);
      expect(cost.marginPercent).toBeCloseTo(75, 4);
      const margin = await api.get(`/api/v1/recipes/${r.id}/margin`, 200);
      expect(margin.body).toBeTruthy();
    });

    // Regression: SetSellingPriceDto had no class-validator decorator, so the
    // global whitelist pipe rejected every request with 400.
    it('PATCH /recipes/:id/selling-price sets the selling price and records price history', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.patch(`/api/v1/recipes/${r.id}/selling-price`, { sellingPrice: 30 }, 200);
      await api.patch(`/api/v1/recipes/${r.id}/selling-price`, { sellingPrice: -1 }, 400);
      const cost = (await api.get(`/api/v1/recipes/${r.id}/cost`, 200)).body;
      expect(cost.sellingPrice).toBe(30);
      const hist = (await api.get(`/api/v1/pricing/history?recipeId=${r.id}`, 200)).body;
      expect(JSON.stringify(hist)).toContain('30');
    });

    it('cost is gated by read RecipeCost: cofetar 403, sef-cofetar 200', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.get(`/api/v1/recipes/${r.id}/cost`, 403, 'cofetar');
      await api.get(`/api/v1/recipes/${r.id}/cost`, 200, 'sef-cofetar');
    });
  });

  describe('archive / draft', () => {
    it('archived recipes leave the default list and appear under ?archived=true', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      const arch = (await api.patch(`/api/v1/recipes/${r.id}/archive`, { archived: true }, 200))
        .body;
      expect(arch.isArchived).toBe(true);
      const active = (await api.get('/api/v1/recipes?limit=200', 200)).body;
      expect(active.data.map((x: { id: string }) => x.id)).not.toContain(r.id);
      const archived = (await api.get('/api/v1/recipes?archived=true&limit=200', 200)).body;
      expect(archived.data.map((x: { id: string }) => x.id)).toContain(r.id);
      // still readable by id
      await api.get(`/api/v1/recipes/${r.id}`, 200);
      await api.patch(`/api/v1/recipes/${r.id}/archive`, { archived: false }, 200);
      const back = (await api.get('/api/v1/recipes?limit=200', 200)).body;
      expect(back.data.map((x: { id: string }) => x.id)).toContain(r.id);
    });

    it('archive body is validated', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.patch(`/api/v1/recipes/${r.id}/archive`, {}, 400);
      await api.patch(
        `/api/v1/recipes/00000000-0000-4000-8000-000000000000/archive`,
        { archived: true },
        404,
      );
    });

    it('draft recipes are hidden from the default list, visible with ?draft=true', async () => {
      const r = (await api.post('/api/v1/recipes', base({ isDraft: true }), 201)).body;
      const list = (await api.get('/api/v1/recipes?limit=200', 200)).body;
      expect(list.data.map((x: { id: string }) => x.id)).not.toContain(r.id);
      const drafts = (await api.get('/api/v1/recipes?draft=true&limit=200', 200)).body;
      expect(drafts.data.map((x: { id: string }) => x.id)).toContain(r.id);
      await api.patch(`/api/v1/recipes/${r.id}/draft`, { draft: false }, 200);
      const pub = (await api.get('/api/v1/recipes?limit=200', 200)).body;
      expect(pub.data.map((x: { id: string }) => x.id)).toContain(r.id);
    });

    it('a draft recipe cannot be produced (task create refused)', async () => {
      const loc = await api.location();
      const r = (await api.post('/api/v1/recipes', base({ isDraft: true }), 201)).body;
      const res = await api.post('/api/v1/tasks', {
        recipeId: r.id,
        targetQuantity: 10,
        targetUnit: 'BUCATI',
        locationId: loc.id,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('bulk actions', () => {
    it('bulk archive via bulk-action', async () => {
      const a = (await api.post('/api/v1/recipes', base(), 201)).body;
      const b = (await api.post('/api/v1/recipes', base(), 201)).body;
      const res = (
        await api.post(
          '/api/v1/recipes/bulk-action',
          { ids: [a.id, b.id], action: 'archive', params: { archived: true } },
          200,
        )
      ).body;
      expect(res.done.sort()).toEqual([a.id, b.id].sort());
      expect((await api.get(`/api/v1/recipes/${a.id}`, 200)).body.isArchived).toBe(true);
    });
  });

  describe('CASL', () => {
    it('cofetar cannot list, create or delete recipes; sef-cofetar can read but not create', async () => {
      const r = (await api.post('/api/v1/recipes', base(), 201)).body;
      await api.post('/api/v1/recipes', base(), 403, 'cofetar');
      await api.del(`/api/v1/recipes/${r.id}`, 403, 'cofetar');
      await api.get(`/api/v1/recipes/${r.id}`, 403, 'cofetar');
      await api.get('/api/v1/recipes', 200, 'sef-cofetar');
      await api.post('/api/v1/recipes', base(), 403, 'sef-cofetar');
      await api.del(`/api/v1/recipes/${r.id}`, 403, 'sef-cofetar');
      await api.get('/api/v1/recipes', 403, 'gestionar');
    });
  });
});
