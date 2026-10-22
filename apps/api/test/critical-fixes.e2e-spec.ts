/**
 * Critical API fixes (branch fix/api-critical) — one focused scenario per fix.
 *
 * Boots the real AppModule (rawBody on, like main.ts) against the e2e
 * database with one organization + administrator, then drives each fixed
 * flow through HTTP and asserts the persisted result.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createHmac } from 'crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SocialAuthService } from '../src/modules/auth/social-auth.service';
import { runAsOrg, runWithoutTenant } from '../src/prisma/tenant-context';

jest.setTimeout(180000);

process.env.TENANT_ENFORCEMENT = 'strict';

describe('Critical API fixes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let http: any;

  const PASSWORD = 'Critical123!';
  const EMAIL = `admin-fix-${Date.now()}@horae.test`;
  let orgId = '';
  let adminId = '';
  let roleId = '';
  let token = '';

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const asOrg = <T>(fn: () => Promise<T>) => runAsOrg(orgId, fn);

  beforeAll(async () => {
    // Apple/Google identity tokens can't be minted in tests: the fake verifier
    // treats the identity token itself as the provider subject.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SocialAuthService)
      .useValue({
        verify: async (_p: string, token: string) => ({ sub: token, emailVerified: true }),
      })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());

    await runWithoutTenant(async () => {
      const org = await prisma.organization.create({
        data: { name: 'Fix Org', slug: `fix-org-${Date.now()}` },
      });
      orgId = org.id;
      const role = await prisma.role.create({
        data: {
          organizationId: org.id,
          slug: 'administrator',
          name: 'Administrator',
          isSystem: true,
        },
      });
      const admin = await prisma.user.create({
        data: {
          organizationId: org.id,
          email: EMAIL,
          passwordHash: await argon2.hash(PASSWORD),
          firstName: 'Admin',
          lastName: 'Fix',
          role: 'ADMINISTRATOR',
          roleId: role.id,
          isActive: true,
        },
      });
      adminId = admin.id;
      roleId = role.id;
    });

    const login = await http.post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(login.status).toBe(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  // ---------------------------------------------------------------------------
  // WooCommerce webhook signature
  // ---------------------------------------------------------------------------
  describe('WooCommerce webhook signature', () => {
    const order = { id: 9001, status: 'on-hold', line_items: [] as unknown[] };
    const body = JSON.stringify(order);
    const sign = (secret: string) => createHmac('sha256', secret).update(body).digest('base64');
    const post = (integrationId: string, signature?: string) => {
      const req = http
        .post(`/api/v1/integrations/${integrationId}/webhook/woocommerce`)
        .set('Content-Type', 'application/json');
      if (signature) req.set('X-WC-Webhook-Signature', signature);
      return req.send(body);
    };
    const storedRows = (integrationId: string) =>
      runWithoutTenant(() =>
        prisma.externalOrderSource.count({ where: { integrationId, externalId: '9001' } }),
      );

    it('ignores every webhook (2xx, nothing stored) when no secret is stored', async () => {
      const integration = await asOrg(() =>
        prisma.integration.create({ data: { provider: 'WOOCOMMERCE', config: {} } }),
      );
      const res = await post(integration.id, sign('anything'));
      expect(res.status).toBeLessThan(300);
      expect(await storedRows(integration.id)).toBe(0);
    });

    it('rejects a missing or wrong signature and accepts the right one', async () => {
      const integration = await asOrg(() =>
        prisma.integration.create({
          data: { provider: 'WOOCOMMERCE', config: { webhookSecret: 'wh-secret' } },
        }),
      );
      expect((await post(integration.id)).status).toBe(401);
      expect((await post(integration.id, sign('wrong'))).status).toBe(401);
      expect(await storedRows(integration.id)).toBe(0);

      const ok = await post(integration.id, sign('wh-secret'));
      expect(ok.status).toBe(200);
      expect(await storedRows(integration.id)).toBe(1);
    });
  });
  // ---------------------------------------------------------------------------
  // Stock movements convert to the material's unit
  // ---------------------------------------------------------------------------
  describe('stock movement units', () => {
    let locationId = '';
    let materialId = '';

    beforeAll(async () => {
      const ids = await asOrg(async () => {
        const location = await prisma.location.create({
          data: { name: 'Laborator unități', type: 'LABORATOR', address: 'Str. 1' },
        });
        const material = await prisma.rawMaterial.create({
          data: { title: 'Zahăr', unit: 'GRAME', storageType: 'WARM' } as never,
        });
        return { location: location.id, material: material.id };
      });
      locationId = ids.location;
      materialId = ids.material;
    });

    const stockOf = () =>
      asOrg(async () => ({
        location: Number(
          (
            await prisma.materialStock.findUnique({
              where: { locationId_rawMaterialId: { locationId, rawMaterialId: materialId } },
            })
          )?.quantity ?? 0,
        ),
        global: Number(
          (await prisma.rawMaterial.findUniqueOrThrow({ where: { id: materialId } })).stockCount,
        ),
      }));

    it('receiving 2 KILOGRAME of a material stocked in GRAME adds 2000 g', async () => {
      const res = await http.post('/api/v1/stock/movements').set(auth()).send({
        rawMaterialId: materialId,
        movementType: 'INTRARE',
        quantity: 2,
        unit: 'KILOGRAME',
        locationId,
      });
      expect(res.status).toBe(201);
      expect(res.body.quantity).toBe(2000);
      expect(res.body.unit).toBe('GRAME');
      expect(await stockOf()).toEqual({ location: 2000, global: 2000 });
      const lot = await runWithoutTenant(() =>
        prisma.stockLot.findFirstOrThrow({ where: { rawMaterialId: materialId } }),
      );
      expect(Number(lot.remainingQuantity)).toBe(2000);
    });

    it('batch receive and test consumption convert too', async () => {
      const batch = await http
        .post('/api/v1/stock/movements/batch')
        .set(auth())
        .send({
          locationId,
          items: [{ rawMaterialId: materialId, quantity: 0.5, unit: 'KILOGRAME' }],
        });
      expect(batch.status).toBe(201);
      expect(await stockOf()).toEqual({ location: 2500, global: 2500 });

      const consume = await http
        .post('/api/v1/stock/test-consumption')
        .set(auth())
        .send({
          locationId,
          items: [{ rawMaterialId: materialId, quantity: 1, unit: 'KILOGRAME' }],
        });
      expect(consume.status).toBe(201);
      expect(await stockOf()).toEqual({ location: 1500, global: 1500 });
    });

    it('recipe stock movements convert to the recipe yield unit', async () => {
      const recipe = await asOrg(() =>
        prisma.recipe.create({
          data: { name: 'Cremă unități', unit: 'GRAME', yieldQuantity: 1000, createdById: adminId },
        }),
      );
      const res = await http.post('/api/v1/stock/recipe-movements').set(auth()).send({
        recipeId: recipe.id,
        movementType: 'INTRARE',
        quantity: 1.5,
        unit: 'KILOGRAME',
        locationId,
      });
      expect(res.status).toBe(201);
      const row = await asOrg(() =>
        prisma.recipeStock.findUniqueOrThrow({
          where: { locationId_recipeId: { locationId, recipeId: recipe.id } },
        }),
      );
      expect(Number(row.quantity)).toBe(1500);
    });

    it('rejects a unit with no conversion path with a Romanian 400', async () => {
      const res = await http.post('/api/v1/stock/movements').set(auth()).send({
        rawMaterialId: materialId,
        movementType: 'INTRARE',
        quantity: 3,
        unit: 'BUCATI',
        locationId,
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('nu poate fi convertită');
      expect(await stockOf()).toEqual({ location: 1500, global: 1500 });
    });
  });
  // ---------------------------------------------------------------------------
  // Subtask finish credits the semipreparat and unblocks the parent
  // ---------------------------------------------------------------------------
  describe('subtask production', () => {
    it('finishing a subtask stocks its semipreparat and lets the parent start', async () => {
      const seed = await asOrg(async () => {
        const location = await prisma.location.create({
          data: { name: 'Laborator subtask', type: 'LABORATOR', address: 'Str. 2' },
        });
        const flour = await prisma.rawMaterial.create({
          data: { title: 'Făină subtask', unit: 'GRAME', storageType: 'WARM' } as never,
        });
        await prisma.materialStock.create({
          data: { locationId: location.id, rawMaterialId: flour.id, quantity: 1000 },
        });
        await prisma.rawMaterial.update({ where: { id: flour.id }, data: { stockCount: 1000 } });
        const semi = await prisma.recipe.create({
          data: {
            name: 'Blat subtask',
            type: 'SEMIPREPARAT',
            unit: 'GRAME',
            yieldQuantity: 500,
            createdById: adminId,
            components: {
              create: [
                {
                  name: 'Blat',
                  sortOrder: 0,
                  ingredients: {
                    create: [
                      {
                        rawMaterialId: flour.id,
                        name: 'Făină',
                        quantity: 250,
                        unit: 'GRAME',
                        sortOrder: 0,
                      },
                    ],
                  },
                },
              ],
            },
          },
        });
        const cake = await prisma.recipe.create({
          data: {
            name: 'Tort subtask',
            type: 'FINAL',
            unit: 'BUCATI',
            yieldQuantity: 1,
            createdById: adminId,
            components: {
              create: [
                {
                  name: 'Asamblare',
                  sortOrder: 0,
                  ingredients: {
                    create: [
                      {
                        semipreparatRecipeId: semi.id,
                        name: 'Blat',
                        quantity: 500,
                        unit: 'GRAME',
                        sortOrder: 0,
                      },
                    ],
                  },
                },
              ],
            },
          },
        });
        return { location: location.id, flour: flour.id, semi: semi.id, cake: cake.id };
      });

      const created = await http.post('/api/v1/tasks').set(auth()).send({
        recipeId: seed.cake,
        targetQuantity: 1,
        targetUnit: 'BUCATI',
        locationId: seed.location,
      });
      expect(created.status).toBe(201);
      const parentId = created.body.id;
      const subtask = await asOrg(() =>
        prisma.task.findFirstOrThrow({ where: { parentTaskId: parentId } }),
      );
      expect(subtask.recipeId).toBe(seed.semi);

      // Parent can't start: no blat in stock yet.
      const blocked = await http
        .post(`/api/v1/tasks/${parentId}/transition`)
        .set(auth())
        .send({ status: 'IN_LUCRU' });
      expect(blocked.status).toBe(409);

      // Produce the blat as the subtask.
      const start = await http
        .post(`/api/v1/tasks/${subtask.id}/transition`)
        .set(auth())
        .send({ status: 'IN_LUCRU' });
      expect(start.status).toBe(200);
      const finish = await http
        .post(`/api/v1/tasks/${subtask.id}/transition`)
        .set(auth())
        .send({ status: 'FINALIZAT', actualYield: 500 });
      expect(finish.status).toBe(200);

      const after = await asOrg(async () => ({
        semi: await prisma.recipeStock.findUnique({
          where: { locationId_recipeId: { locationId: seed.location, recipeId: seed.semi } },
        }),
        flour: await prisma.materialStock.findUniqueOrThrow({
          where: {
            locationId_rawMaterialId: { locationId: seed.location, rawMaterialId: seed.flour },
          },
        }),
        parent: await prisma.task.findUniqueOrThrow({ where: { id: parentId } }),
      }));
      expect(Number(after.semi?.quantity ?? 0)).toBe(500); // output credited
      expect(Number(after.flour.quantity)).toBe(750); // own ingredients consumed
      expect(after.parent.status).toBe('DE_FACUT'); // block re-evaluated
      expect(after.parent.shortages).toBeNull();

      // …and the parent now starts, reserving the produced blat.
      const parentStart = await http
        .post(`/api/v1/tasks/${parentId}/transition`)
        .set(auth())
        .send({ status: 'IN_LUCRU' });
      expect(parentStart.status).toBe(200);
      expect(parentStart.body.status).toBe('IN_LUCRU');
    });
  });
  // ---------------------------------------------------------------------------
  // Circular recipes are rejected (RECIPE_001)
  // ---------------------------------------------------------------------------
  describe('circular recipe dependencies', () => {
    const semiIngredient = (semipreparatRecipeId: string) => ({
      components: [
        {
          name: 'Bază',
          sortOrder: 0,
          ingredients: [
            { semipreparatRecipeId, name: 'Semi', quantity: 100, unit: 'GRAME', sortOrder: 0 },
          ],
        },
      ],
    });

    it('rejects a recipe used as its own ingredient, directly or through a chain', async () => {
      const ids = await asOrg(async () => {
        const a = await prisma.recipe.create({
          data: {
            name: 'Cremă A',
            type: 'SEMIPREPARAT',
            unit: 'GRAME',
            yieldQuantity: 1000,
            createdById: adminId,
          },
        });
        const b = await prisma.recipe.create({
          data: {
            name: 'Cremă B',
            type: 'SEMIPREPARAT',
            unit: 'GRAME',
            yieldQuantity: 1000,
            createdById: adminId,
            components: {
              create: [
                {
                  name: 'Bază',
                  sortOrder: 0,
                  ingredients: {
                    create: [
                      {
                        semipreparatRecipeId: a.id,
                        name: 'A',
                        quantity: 100,
                        unit: 'GRAME',
                        sortOrder: 0,
                      },
                    ],
                  },
                },
              ],
            },
          },
        });
        return { a: a.id, b: b.id };
      });

      const self = await http
        .patch(`/api/v1/recipes/${ids.a}`)
        .set(auth())
        .send(semiIngredient(ids.a));
      expect(self.status).toBe(400);
      expect(
        self.body.errorCode ?? self.body.error?.errorCode ?? JSON.stringify(self.body),
      ).toContain('RECIPE_001');

      const loop = await http
        .patch(`/api/v1/recipes/${ids.a}`)
        .set(auth())
        .send(semiIngredient(ids.b));
      expect(loop.status).toBe(400);
      expect(JSON.stringify(loop.body)).toContain('RECIPE_001');
      expect(JSON.stringify(loop.body)).toContain('Cremă A → Cremă B → Cremă A');

      // Nothing was saved: A still has no components.
      const a = await asOrg(() =>
        prisma.recipe.findUniqueOrThrow({ where: { id: ids.a }, include: { components: true } }),
      );
      expect(a.components).toHaveLength(0);

      // A legitimate (acyclic) edit still works.
      const ok = await http
        .patch(`/api/v1/recipes/${ids.b}`)
        .set(auth())
        .send(semiIngredient(ids.a));
      expect(ok.status).toBe(200);
    });
  });
  // ---------------------------------------------------------------------------
  // Sessions: refresh + Apple/Google login gates
  // ---------------------------------------------------------------------------
  describe('session gates', () => {
    let n = 0;
    const makeUser = async (
      opts: { organizationId?: string; roleId?: string; appleSub?: string } = {},
    ) => {
      n += 1;
      const email = `session-${n}-${Date.now()}@horae.test`;
      const user = await runWithoutTenant(async () =>
        prisma.user.create({
          data: {
            organizationId: opts.organizationId ?? orgId,
            email,
            passwordHash: await argon2.hash(PASSWORD),
            firstName: 'Sesiune',
            lastName: String(n),
            role: 'COFETAR',
            roleId: opts.roleId ?? roleId,
            isActive: true,
            ...(opts.appleSub
              ? {
                  authProviders: { create: [{ provider: 'APPLE', providerUserId: opts.appleSub }] },
                }
              : {}),
          },
        }),
      );
      return { id: user.id, email };
    };
    const loginRefresh = async (email: string) => {
      const res = await http.post('/api/v1/auth/login').send({ email, password: PASSWORD });
      expect(res.status).toBe(200);
      return res.body.refreshToken as string;
    };
    const refresh = (refreshToken: string) =>
      http.post('/api/v1/auth/refresh').send({ refreshToken });

    it('refresh fails once the user is deactivated (and the session is revoked)', async () => {
      const u = await makeUser();
      const rt = await loginRefresh(u.email);
      const del = await http.delete(`/api/v1/users/${u.id}`).set(auth());
      expect(del.status).toBe(200);
      // Revoked at deactivation → 401; were it still live, the gate → 403.
      expect([401, 403]).toContain((await refresh(rt)).status);
      const live = await runWithoutTenant(() =>
        prisma.refreshToken.count({ where: { userId: u.id, revokedAt: null } }),
      );
      expect(live).toBe(0);
    });

    it('refresh fails for a locked user and for an inactive organisation', async () => {
      const locked = await makeUser();
      const rtLocked = await loginRefresh(locked.email);
      await runWithoutTenant(() =>
        prisma.user.update({ where: { id: locked.id }, data: { lockedAt: new Date() } }),
      );
      const lockedRes = await refresh(rtLocked);
      expect(lockedRes.status).toBe(403);
      expect(JSON.stringify(lockedRes.body)).toContain('ACCOUNT_LOCKED');

      const other = await runWithoutTenant(async () => {
        const org = await prisma.organization.create({
          data: { name: 'Org inactiv', slug: `org-inactiv-${Date.now()}` },
        });
        const role = await prisma.role.create({
          data: {
            organizationId: org.id,
            slug: 'administrator',
            name: 'Administrator',
            isSystem: true,
          },
        });
        return { org: org.id, role: role.id };
      });
      const member = await makeUser({ organizationId: other.org, roleId: other.role });
      const rtMember = await loginRefresh(member.email);
      await runWithoutTenant(() =>
        prisma.organization.update({ where: { id: other.org }, data: { isActive: false } }),
      );
      const orgRes = await refresh(rtMember);
      expect(orgRes.status).toBe(403);
      expect(JSON.stringify(orgRes.body)).toContain('ORGANIZATION_INACTIVE');
    });

    it('Apple login applies the same locked / inactive checks as password login', async () => {
      const sub = `apple-${Date.now()}`;
      const u = await makeUser({ appleSub: sub });
      const apple = () => http.post('/api/v1/auth/apple').send({ identityToken: sub });

      expect((await apple()).status).toBe(200);

      await runWithoutTenant(() =>
        prisma.user.update({ where: { id: u.id }, data: { lockedAt: new Date() } }),
      );
      const locked = await apple();
      expect(locked.status).toBe(403);
      expect(JSON.stringify(locked.body)).toContain('ACCOUNT_LOCKED');

      await runWithoutTenant(() =>
        prisma.user.update({ where: { id: u.id }, data: { lockedAt: null, isActive: false } }),
      );
      expect((await apple()).status).toBe(403);
    });
  });
  // ---------------------------------------------------------------------------
  // Woo auto-deduction: own org's default location + dynamic admin; cursor
  // ---------------------------------------------------------------------------
  describe('woo auto-deduction and sync cursor', () => {
    it("deducts at the integration org's default location with a dynamic-role admin", async () => {
      const z = await runWithoutTenant(async () => {
        const org = await prisma.organization.create({
          data: { name: 'Org Woo', slug: `org-woo-${Date.now()}` },
        });
        const role = await prisma.role.create({
          data: {
            organizationId: org.id,
            slug: 'administrator',
            name: 'Administrator',
            isSystem: true,
          },
        });
        // Invited administrator: legacy enum says COFETAR, dynamic role says admin.
        const admin = await prisma.user.create({
          data: {
            organizationId: org.id,
            email: `woo-admin-${Date.now()}@horae.test`,
            passwordHash: await argon2.hash(PASSWORD),
            firstName: 'Woo',
            lastName: 'Admin',
            role: 'COFETAR',
            roleId: role.id,
            isActive: true,
          },
        });
        return { org: org.id, admin: admin.id };
      });
      const seeded = await runAsOrg(z.org, async () => {
        // Older MAGAZIN (the fallback) vs the org's chosen default location.
        const shop = await prisma.location.create({
          data: { name: 'Magazin vechi', type: 'MAGAZIN', address: 'Str. 3' },
        });
        const depot = await prisma.location.create({
          data: { name: 'Depozit implicit', type: 'DEPOZIT', address: 'Str. 4' },
        });
        await prisma.organization.update({
          where: { id: z.org },
          data: { defaultLocationId: depot.id },
        });
        const cake = await prisma.recipe.create({
          data: { name: 'Tort Woo', unit: 'BUCATI', yieldQuantity: 1, createdById: z.admin },
        });
        await prisma.recipeStock.create({
          data: { locationId: depot.id, recipeId: cake.id, quantity: 5 },
        });
        const integration = await prisma.integration.create({
          data: { provider: 'WOOCOMMERCE', status: 'ACTIVE', config: { webhookSecret: 'woo-z' } },
        });
        await prisma.productMapping.create({
          data: {
            integrationId: integration.id,
            externalProductId: '501',
            externalProductName: 'Tort Woo',
            recipeId: cake.id,
          },
        });
        return { shop: shop.id, depot: depot.id, integration: integration.id };
      });

      const body = JSON.stringify({
        id: 7001,
        number: '7001',
        status: 'processing',
        date_created_gmt: new Date().toISOString().slice(0, 19),
        line_items: [{ product_id: 501, variation_id: 0, name: 'Tort Woo', quantity: 2 }],
      });
      const res = await http
        .post(`/api/v1/integrations/${seeded.integration}/webhook/woocommerce`)
        .set('Content-Type', 'application/json')
        .set('X-WC-Webhook-Signature', createHmac('sha256', 'woo-z').update(body).digest('base64'))
        .send(body);
      expect(res.status).toBe(200);

      const deduction = await runWithoutTenant(() =>
        prisma.salesDeduction.findFirst({
          where: { fileHash: `woo:${seeded.integration}:7001` },
        }),
      );
      expect(deduction).not.toBeNull();
      expect(deduction?.locationId).toBe(seeded.depot);
      expect(deduction?.createdById).toBe(z.admin);
    });

    it('manual sync does not move the poll cursor', async () => {
      const cursor = new Date(Date.now() - 3 * 3600_000);
      const integration = await asOrg(() =>
        prisma.integration.create({
          data: {
            provider: 'WOOCOMMERCE',
            status: 'ACTIVE',
            config: {},
            lastSyncAt: cursor,
            // One stored row so the sync runs to the end (no early return).
            externalOrders: {
              create: [
                {
                  externalId: '8001',
                  rawPayload: { id: 8001, status: 'pending', line_items: [] },
                  syncStatus: 'PENDING',
                },
              ],
            },
          },
        }),
      );
      const res = await http.post(`/api/v1/integrations/${integration.id}/sync`).set(auth());
      expect([200, 201]).toContain(res.status);
      const after = await asOrg(() =>
        prisma.integration.findUniqueOrThrow({ where: { id: integration.id } }),
      );
      expect(after.lastSyncAt?.toISOString()).toBe(cursor.toISOString());
    });
  });
  // ---------------------------------------------------------------------------
  // Bulk delete of raw materials uses the single-delete guard
  // ---------------------------------------------------------------------------
  describe('raw-material bulk delete guard', () => {
    it('cascade bulk delete refuses materials with stock or on a transfer, deletes the rest', async () => {
      const ids = await asOrg(async () => {
        const a = await prisma.location.create({
          data: { name: 'Bulk A', type: 'LABORATOR', address: 'Str. 5' },
        });
        const b = await prisma.location.create({
          data: { name: 'Bulk B', type: 'MAGAZIN', address: 'Str. 6' },
        });
        const mk = (title: string) =>
          prisma.rawMaterial.create({
            data: { title, unit: 'GRAME', storageType: 'WARM' } as never,
          });
        const withStock = await mk('Bulk cu stoc');
        await prisma.materialStock.create({
          data: { locationId: a.id, rawMaterialId: withStock.id, quantity: 10 },
        });
        await prisma.rawMaterial.update({ where: { id: withStock.id }, data: { stockCount: 10 } });
        const onAviz = await mk('Bulk pe aviz');
        await prisma.stockTransfer.create({
          data: {
            fromLocationId: a.id,
            toLocationId: b.id,
            status: 'FINALIZAT',
            createdById: adminId,
            items: { create: [{ rawMaterialId: onAviz.id, quantity: 5, unit: 'GRAME' }] },
          },
        });
        const mistake = await mk('Bulk greșeală');
        return { withStock: withStock.id, onAviz: onAviz.id, mistake: mistake.id };
      });

      const res = await http
        .post('/api/v1/raw-materials/bulk-delete')
        .set(auth())
        .send({ ids: [ids.withStock, ids.onAviz, ids.mistake], cascade: true });
      expect(res.status).toBe(200);
      expect(res.body.deleted).toEqual([ids.mistake]);
      expect(res.body.failed.map((f: { id: string }) => f.id).sort()).toEqual(
        [ids.withStock, ids.onAviz].sort(),
      );
      const left = await asOrg(() =>
        prisma.rawMaterial.count({ where: { id: { in: [ids.withStock, ids.onAviz] } } }),
      );
      expect(left).toBe(2);
      const avizLines = await runWithoutTenant(() =>
        prisma.stockTransferItem.count({ where: { rawMaterialId: ids.onAviz } }),
      );
      expect(avizLines).toBe(1);
    });
  });
  // ---------------------------------------------------------------------------
  // Transfers respect reservations and leave a movement trail
  // ---------------------------------------------------------------------------
  describe('transfers', () => {
    it('cannot ship reserved stock; create/finish/cancel write movements at both locations', async () => {
      const ids = await asOrg(async () => {
        const from = await prisma.location.create({
          data: { name: `Transfer sursă ${Date.now()}`, type: 'LABORATOR', address: 'Str. 7' },
        });
        const to = await prisma.location.create({
          data: { name: `Transfer dest ${Date.now()}`, type: 'MAGAZIN', address: 'Str. 8' },
        });
        const m = await prisma.rawMaterial.create({
          data: { title: 'Unt transfer', unit: 'GRAME', storageType: 'COLD' } as never,
        });
        // 100 g on hand, 80 g reserved by a running task.
        await prisma.materialStock.create({
          data: { locationId: from.id, rawMaterialId: m.id, quantity: 100, reservedCount: 80 },
        });
        await prisma.rawMaterial.update({
          where: { id: m.id },
          data: { stockCount: 100, reservedCount: 80 },
        });
        return { from: from.id, to: to.id, material: m.id };
      });
      const create = (quantity: number) =>
        http
          .post('/api/v1/stock/transfers')
          .set(auth())
          .send({
            fromLocationId: ids.from,
            toLocationId: ids.to,
            items: [{ rawMaterialId: ids.material, quantity }],
          });
      const movements = () =>
        asOrg(() =>
          prisma.stockMovement.findMany({
            where: { rawMaterialId: ids.material },
            orderBy: { createdAt: 'asc' },
          }),
        );

      const tooMuch = await create(30);
      expect(tooMuch.status).toBe(400);
      expect(JSON.stringify(tooMuch.body)).toContain('rezervat');
      expect(await movements()).toHaveLength(0);

      const ok = await create(20);
      expect(ok.status).toBe(201);
      let mv = await movements();
      expect(mv).toHaveLength(1);
      expect(mv[0].locationId).toBe(ids.from);
      expect(Number(mv[0].quantity)).toBe(80); // source level after −20

      const transit = await http
        .patch(`/api/v1/stock/transfers/${ok.body.id}`)
        .set(auth())
        .send({ status: 'IN_TRANZIT', assignedToId: adminId });
      expect(transit.status).toBe(200);
      const done = await http
        .patch(`/api/v1/stock/transfers/${ok.body.id}`)
        .set(auth())
        .send({ status: 'FINALIZAT' });
      expect(done.status).toBe(200);
      mv = await movements();
      expect(mv).toHaveLength(2);
      expect(mv[1].locationId).toBe(ids.to);
      expect(Number(mv[1].quantity)).toBe(20); // destination level after +20

      // Free stock is now 0 (80 on hand, 80 reserved): nothing more can leave.
      expect((await create(1)).status).toBe(400);

      // A cancelled transfer returns the goods and records it at the source.
      await asOrg(() =>
        prisma.materialStock.update({
          where: {
            locationId_rawMaterialId: { locationId: ids.from, rawMaterialId: ids.material },
          },
          data: { reservedCount: 0 },
        }),
      );
      const second = await create(10);
      expect(second.status).toBe(201);
      const cancel = await http
        .patch(`/api/v1/stock/transfers/${second.body.id}`)
        .set(auth())
        .send({ status: 'ANULAT' });
      expect(cancel.status).toBe(200);
      mv = await movements();
      expect(mv).toHaveLength(4);
      expect(mv[3].locationId).toBe(ids.from);
      expect(Number(mv[3].quantity)).toBe(80);
      expect(mv[3].referenceNote).toContain('anulat');
    });
  });
});
