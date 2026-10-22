/**
 * Tenant-isolation suite — the multi-tenancy gate.
 *
 * Boots the real AppModule with TENANT_ENFORCEMENT=strict, provisions two
 * organizations (A and B) each with an administrator, then asserts:
 *   - login returns the org's branding + a handoff code
 *   - the handoff code is single-use
 *   - the public by-slug branding endpoint works (and 404s on unknown slugs)
 *   - data created in org A (suppliers, locations, raw materials) is invisible
 *     and untouchable from org B (lists filtered, direct GET/PATCH → 404)
 *   - GET /organization returns the caller's own org
 *   - roles are per-org (each org sees only its own role rows)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runAsOrg, runWithoutTenant } from '../src/prisma/tenant-context';

jest.setTimeout(180000);

// Unique per run so the suite can be re-run against the same local database
// (Location.name is unique per org).
const RUN = Date.now().toString(36);
const DEPOZIT_A = `Depozit A ${RUN}`;

process.env.TENANT_ENFORCEMENT = 'strict';

interface OrgHandle {
  id: string;
  slug: string;
  token: string;
}

describe('Tenant isolation (two organizations)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let http: any;

  const PASSWORD = 'Tenant123!';
  const A_EMAIL = 'admin-a@horae.test';
  const B_EMAIL = 'admin-b@horae.test';

  let orgA: OrgHandle;
  let orgB: OrgHandle;
  let handoffCodeA = '';

  async function provisionOrg(name: string, slug: string, email: string): Promise<OrgHandle> {
    return runWithoutTenant(() => provisionOrgInner(name, slug, email));
  }

  async function provisionOrgInner(name: string, slug: string, email: string): Promise<OrgHandle> {
    const org = await prisma.organization.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
    });
    const role = await prisma.role.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: 'administrator' } },
      update: {},
      create: {
        organizationId: org.id,
        slug: 'administrator',
        name: 'Administrator',
        isSystem: true,
      },
    });
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash: await argon2.hash(PASSWORD), lockedAt: null },
      create: {
        organizationId: org.id,
        email,
        passwordHash: await argon2.hash(PASSWORD),
        firstName: 'Admin',
        lastName: name,
        role: 'ADMINISTRATOR',
        roleId: role.id,
        isActive: true,
      },
    });
    return { id: org.id, slug, token: '' };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
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

    orgA = await provisionOrg('Tenant A', 'tenant-a', A_EMAIL);
    orgB = await provisionOrg('Tenant B', 'tenant-b', B_EMAIL);

    const loginA = await http
      .post('/api/v1/auth/login')
      .send({ email: A_EMAIL, password: PASSWORD });
    expect(loginA.status).toBe(200);
    orgA.token = loginA.body.accessToken;
    handoffCodeA = loginA.body.handoffCode;
    expect(loginA.body.organization?.slug).toBe('tenant-a');

    const loginB = await http
      .post('/api/v1/auth/login')
      .send({ email: B_EMAIL, password: PASSWORD });
    expect(loginB.status).toBe(200);
    orgB.token = loginB.body.accessToken;
    expect(loginB.body.organization?.slug).toBe('tenant-b');
  });

  afterAll(async () => {
    await app?.close();
  });

  const asA = () => ({ Authorization: `Bearer ${orgA.token}` });
  const asB = () => ({ Authorization: `Bearer ${orgB.token}` });

  it('handoff code redeems exactly once', async () => {
    expect(handoffCodeA).toBeTruthy();
    const first = await http.post('/api/v1/auth/handoff/redeem').send({ code: handoffCodeA });
    expect(first.status).toBe(200);
    expect(first.body.organization?.slug).toBe('tenant-a');
    expect(first.body.accessToken).toBeTruthy();

    const second = await http.post('/api/v1/auth/handoff/redeem').send({ code: handoffCodeA });
    expect(second.status).toBe(401);
  });

  it('public by-slug branding works and 404s on unknown slugs', async () => {
    const ok = await http.get('/api/v1/organization/by-slug/tenant-a');
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Tenant A');
    expect(ok.body).not.toHaveProperty('cui');

    const missing = await http.get('/api/v1/organization/by-slug/no-such-org');
    expect(missing.status).toBe(404);
  });

  it('GET /organization returns the caller own org', async () => {
    const a = await http.get('/api/v1/organization').set(asA());
    expect(a.status).toBe(200);
    expect(a.body.slug).toBe('tenant-a');

    const b = await http.get('/api/v1/organization').set(asB());
    expect(b.status).toBe(200);
    expect(b.body.slug).toBe('tenant-b');
  });

  it('roles are per-organization', async () => {
    const rolesA = await http.get('/api/v1/roles').set(asA());
    expect(rolesA.status).toBe(200);
    const listA = Array.isArray(rolesA.body) ? rolesA.body : rolesA.body.data;
    // Every role visible to A must belong to A (compare against B's role ids).
    const rolesB = await http.get('/api/v1/roles').set(asB());
    const listB = Array.isArray(rolesB.body) ? rolesB.body : rolesB.body.data;
    const idsB = new Set(listB.map((r: { id: string }) => r.id));
    for (const role of listA) {
      expect(idsB.has(role.id)).toBe(false);
    }
  });

  it('org A data is invisible and untouchable from org B', async () => {
    // Create in A: supplier, location, raw material.
    const supplier = await http.post('/api/v1/suppliers').set(asA()).send({ name: 'Furnizor A' });
    expect(supplier.status).toBe(201);

    const location = await http
      .post('/api/v1/locations')
      .set(asA())
      .send({ name: DEPOZIT_A, type: 'DEPOZIT', address: 'Str. A 1' });
    expect(location.status).toBe(201);

    const material = await http.post('/api/v1/raw-materials').set(asA()).send({
      title: 'Faina A',
      unit: 'KILOGRAME',
      storageType: 'WARM',
    });
    expect(material.status).toBe(201);
    const materialId = material.body.id;

    // B's lists never contain A's rows.
    const materialsB = await http.get('/api/v1/raw-materials?limit=100').set(asB());
    expect(materialsB.status).toBe(200);
    const titlesB = (materialsB.body.data ?? []).map((m: { title: string }) => m.title);
    expect(titlesB).not.toContain('Faina A');

    const locationsB = await http.get('/api/v1/locations').set(asB());
    const locNamesB = (
      Array.isArray(locationsB.body) ? locationsB.body : (locationsB.body.data ?? [])
    ).map((l: { name: string }) => l.name);
    expect(locNamesB).not.toContain(DEPOZIT_A);

    // Direct access by id from B → 404 (scoped findUnique misses).
    const directGet = await http.get(`/api/v1/raw-materials/${materialId}`).set(asB());
    expect([403, 404]).toContain(directGet.status);

    const directPatch = await http
      .patch(`/api/v1/raw-materials/${materialId}`)
      .set(asB())
      .send({ title: 'Hijacked' });
    expect([403, 404]).toContain(directPatch.status);

    // Still intact for A.
    const stillA = await http.get(`/api/v1/raw-materials/${materialId}`).set(asA());
    expect(stillA.status).toBe(200);
    expect(stillA.body.title).toBe('Faina A');
  });

  it('same location name can exist in both orgs (per-tenant unique)', async () => {
    const inB = await http
      .post('/api/v1/locations')
      .set(asB())
      .send({ name: DEPOZIT_A, type: 'DEPOZIT', address: 'Str. B 2' });
    expect(inB.status).toBe(201);
  });
  it('child tables without organizationId never leak into another org', async () => {
    // Seed org A data in models that carry NO organizationId (TaskStatusHistory,
    // RecipeYieldHistory, OrderItem, RecipeStock, StockLot) — these are not
    // covered by the tenant extension and must be scoped through their parent.
    const tag = `Leak${Date.now()}`;
    const ITEM_QTY = Math.floor(Date.now() / 1000);
    const ids = await runAsOrg(orgA.id, async () => {
      const admin = await prisma.user.findFirstOrThrow({ where: { email: A_EMAIL } });
      const location = await prisma.location.create({
        data: { name: `Loc ${tag}`, type: 'LABORATOR', address: 'Str. A 1' },
      });
      const material = await prisma.rawMaterial.create({
        data: { title: `Mat ${tag}`, unit: 'GRAME', storageType: 'WARM' } as never,
      });
      const lot = await prisma.stockLot.create({
        data: {
          rawMaterialId: material.id,
          quantity: 10,
          remainingQuantity: 10,
          expiryDate: new Date(Date.now() + 2 * 86400000),
        } as never,
      });
      const recipe = await prisma.recipe.create({
        data: { name: `Tort ${tag}`, unit: 'BUCATI', yieldQuantity: 1, createdById: admin.id },
      });
      await prisma.recipeStock.create({
        data: {
          locationId: location.id,
          recipeId: recipe.id,
          quantity: 3,
          expiryDate: new Date(Date.now() + 2 * 86400000),
        },
      });
      const task = await prisma.task.create({
        data: {
          recipeId: recipe.id,
          targetQuantity: 1,
          targetUnit: 'BUCATI',
          createdById: admin.id,
        } as never,
      });
      await prisma.taskStatusHistory.create({
        data: { taskId: task.id, toStatus: 'IN_LUCRU', changedById: admin.id } as never,
      });
      await prisma.recipeYieldHistory.create({
        data: {
          recipeId: recipe.id,
          taskId: task.id,
          targetQuantity: 1,
          actualYield: 0.5,
          varianceAbsolute: -0.5,
          variancePercent: -50,
          scaleFactor: 1,
        },
      });
      const order = await prisma.order.create({
        data: {
          orderNumber: `CMD-${tag}`,
          deliveryPoint: 'Punct A',
          createdById: admin.id,
          dueDate: new Date(),
          // popularProducts is a top-10: on a persistent DB earlier runs' cakes
          // pile up, so each run's quantity grows with time (newest on top).
          items: { create: [{ recipeId: recipe.id, quantity: ITEM_QTY, unit: 'BUCATI' }] },
        } as never,
      });
      return { material: material.id, lot: lot.id, task: task.id, order: order.id };
    });

    // GET /activity — task history of A must not appear for B.
    const actB = await http.get('/api/v1/activity?limit=100').set(asB());
    expect(actB.status).toBe(200);
    const actTaskIds = actB.body.data.map(
      (e: { metadata: { taskId?: string } }) => e.metadata.taskId,
    );
    expect(actTaskIds).not.toContain(ids.task);
    const actA = await http.get('/api/v1/activity?limit=100').set(asA());
    expect(
      actA.body.data.map((e: { metadata: { taskId?: string } }) => e.metadata.taskId),
    ).toContain(ids.task);

    // GET /stock/lots — neither the unfiltered list nor A's material id.
    const lotsB = await http.get('/api/v1/stock/lots').set(asB());
    expect(lotsB.status).toBe(200);
    expect(lotsB.body.map((l: { id: string }) => l.id)).not.toContain(ids.lot);
    const lotsByIdB = await http.get(`/api/v1/stock/lots?materialId=${ids.material}`).set(asB());
    expect(lotsByIdB.body).toHaveLength(0);
    const lotsA = await http.get('/api/v1/stock/lots').set(asA());
    expect(lotsA.body.map((l: { id: string }) => l.id)).toContain(ids.lot);

    // GET /stock/expiring — A's finished goods must not appear for B.
    const expB = await http.get('/api/v1/stock/expiring?days=30').set(asB());
    expect(expB.status).toBe(200);
    expect(expB.body.map((e: { materialTitle: string }) => e.materialTitle)).not.toContain(
      `Tort ${tag}`,
    );
    const expA = await http.get('/api/v1/stock/expiring?days=30').set(asA());
    expect(expA.body.map((e: { materialTitle: string }) => e.materialTitle)).toContain(
      `Tort ${tag}`,
    );

    // Analytics — popular products and yield variance only from own org.
    const ordersB = await http.get('/api/v1/analytics/orders').set(asB());
    expect(ordersB.status).toBe(200);
    expect(ordersB.body.popularProducts.map((p: { name: string }) => p.name)).not.toContain(
      `Tort ${tag}`,
    );
    const ordersA = await http.get('/api/v1/analytics/orders').set(asA());
    expect(ordersA.body.popularProducts.map((p: { name: string }) => p.name)).toContain(
      `Tort ${tag}`,
    );
    const prodB = await http.get('/api/v1/analytics/production').set(asB());
    expect(prodB.status).toBe(200);
    // B has no yield records at all → no average.
    expect(prodB.body.yieldVarianceAvg).toBeNull();

    // PATCH an order item of A through B → 404, item untouched.
    const itemId = await runAsOrg(
      orgA.id,
      async () => (await prisma.orderItem.findFirstOrThrow({ where: { orderId: ids.order } })).id,
    );
    const patchItem = await http
      .patch(`/api/v1/orders/${ids.order}/items/${itemId}`)
      .set(asB())
      .send({ quantity: 99 });
    expect([403, 404]).toContain(patchItem.status);
    const item = await runWithoutTenant(() =>
      prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } }),
    );
    expect(Number(item.quantity)).toBe(ITEM_QTY);
  });
});
