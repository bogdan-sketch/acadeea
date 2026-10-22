/**
 * Endpoint smoke suite — the CI gate against 500s.
 *
 * Boots the real AppModule against the CI database, seeds a minimal admin,
 * then:
 *  1. sweeps every GET route in the OpenAPI document with random UUIDs —
 *     any 5xx fails the build (unhandled exceptions, FK crashes, etc.);
 *  2. drives the full client lifecycle (reception → recipe → task lifecycle →
 *     traceability → requirements plan → transfers → orders → recursive
 *     deletes) asserting the exact statuses the clients rely on.
 *
 * Mirrors scripts/smoke-live.mjs (which runs the same checks against a live
 * environment) — keep the two in sync when endpoints change.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(180000);

describe('Endpoint smoke (no 5xx)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let http: any;
  let token = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let openapi: any;

  const ADMIN_EMAIL = 'smoke-admin@acadeea.ro';
  const ADMIN_PASSWORD = 'Smoke123!';

  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** Request helper: fails the test on any 5xx; optionally asserts a status. */
  async function call(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    body?: object,
    expect?: number,
  ) {
    const res = await http[method](path).set(auth()).send(body);
    if (res.status >= 500) {
      throw new Error(
        `5xx: ${method.toUpperCase()} ${path} -> ${res.status}\n${JSON.stringify(res.body).slice(0, 300)}`,
      );
    }
    if (expect !== undefined && res.status !== expect) {
      throw new Error(
        `Expected ${expect}, got ${res.status}: ${method.toUpperCase()} ${path}\n${JSON.stringify(res.body).slice(0, 300)}`,
      );
    }
    return res;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Mirror main.ts validation so DTO behavior matches production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    openapi = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('smoke').setVersion('1').addBearerAuth().build(),
    );
    await app.init();

    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());

    // Minimal seed: organization + administrator role + admin user (idempotent).
    // Multi-tenant: roles are per-org and users carry organizationId.
    const org =
      (await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } })) ??
      (await prisma.organization.create({ data: { name: 'Smoke Org', slug: 'smoke-org' } }));
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
      where: { email: ADMIN_EMAIL },
      update: {
        passwordHash: await argon2.hash(ADMIN_PASSWORD),
        lockedAt: null,
        failedLoginAttempts: 0,
      },
      create: {
        organizationId: org.id,
        email: ADMIN_EMAIL,
        passwordHash: await argon2.hash(ADMIN_PASSWORD),
        firstName: 'Smoke',
        lastName: 'Admin',
        role: 'ADMINISTRATOR',
        roleId: role.id,
        isActive: true,
      },
    });

    const login = await http
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    if (login.status !== 200) {
      throw new Error(`Seed admin login failed: ${login.status} ${JSON.stringify(login.body)}`);
    }
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET sweep: every documented GET route answers below 500', async () => {
    const paths = Object.entries(openapi.paths ?? {}) as [string, Record<string, unknown>][];
    const getRoutes = paths.filter(([, ops]) => 'get' in ops).map(([p]) => p);
    expect(getRoutes.length).toBeGreaterThan(30);

    const failures: string[] = [];
    for (const p of getRoutes) {
      const concrete = p.replace(/\{[^}]+\}/g, randomUUID());
      const res = await http.get(concrete).set(auth());
      if (res.status >= 500) {
        failures.push(`GET ${concrete} -> ${res.status}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('full client lifecycle completes without 5xx', async () => {
    const stamp = Date.now();

    const loc = await call(
      'post',
      '/api/v1/locations',
      { name: `Lab ${stamp}`, type: 'LABORATOR', address: 'Str. Smoke 1' },
      201,
    );
    const loc2 = await call(
      'post',
      '/api/v1/locations',
      { name: `Depozit ${stamp}`, type: 'DEPOZIT', address: 'Str. Smoke 2' },
      201,
    );
    const locId = loc.body.id;
    const loc2Id = loc2.body.id;

    const supplier = await call('post', '/api/v1/suppliers', { name: `Furnizor ${stamp}` }, 201);

    const mat = await call(
      'post',
      '/api/v1/raw-materials',
      {
        title: `Faina ${stamp}`,
        unit: 'KILOGRAME',
        storageType: 'WARM',
        supplierId: supplier.body.id,
        locationId: locId,
      },
      201,
    );
    const matId = mat.body.id;

    // Reception with lot + invoice (feeds FIFO traceability)
    await call(
      'post',
      '/api/v1/stock/movements',
      {
        rawMaterialId: matId,
        movementType: 'INTRARE',
        quantity: 50,
        unit: 'KILOGRAME',
        locationId: locId,
        lotNumber: `L-${stamp}`,
        supplierInvoice: `FAC-${stamp}`,
        purchasePrice: 4.5,
      },
      201,
    );

    // Nutrition
    await call('patch', '/api/v1/organization', { nutritionEnabled: true }, 200);
    await call(
      'patch',
      `/api/v1/raw-materials/${matId}`,
      { nutrition: { calories: 364, protein: 10, carbs: 76, fat: 1 } },
      200,
    );

    const recipe = await call(
      'post',
      '/api/v1/recipes',
      {
        name: `Tort ${stamp}`,
        unit: 'BUCATI',
        yieldQuantity: 2,
        type: 'FINAL',
        components: [
          {
            name: 'Blat',
            sortOrder: 0,
            ingredients: [
              { rawMaterialId: matId, name: 'Faina', quantity: 1, unit: 'KILOGRAME', sortOrder: 0 },
            ],
          },
        ],
      },
      201,
    );
    const recipeId = recipe.body.id;

    await call('get', `/api/v1/recipes/${recipeId}/nutrition`, undefined, 200);
    await call(
      'get',
      `/api/v1/tasks/preview-requirements?recipeId=${recipeId}&targetQuantity=2&targetUnit=BUCATI`,
      undefined,
      200,
    );
    await call(
      'post',
      '/api/v1/stock/requirements-plan',
      { items: [{ recipeId, quantity: 4 }] },
      200,
    );
    await call('post', '/api/v1/stock/requirements-plan/export', {
      items: [{ recipeId, quantity: 4 }],
    });

    // Task lifecycle with cross-location finalize (auto foaie de drum)
    const task = await call(
      'post',
      '/api/v1/tasks',
      { recipeId, targetQuantity: 2, targetUnit: 'BUCATI', locationId: locId },
      201,
    );
    const taskId = task.body.id;
    await call('post', `/api/v1/tasks/${taskId}/transition`, { status: 'IN_LUCRU' }, 200);
    await call(
      'post',
      `/api/v1/tasks/${taskId}/transition`,
      { status: 'FINALIZAT', actualYield: 2, outputLocationId: loc2Id },
      200,
    );
    await call('get', `/api/v1/tasks/${taskId}/traceability`, undefined, 200);
    await call('get', `/api/v1/tasks/${taskId}/material-requirements`, undefined, 200);

    // Transfer + cancel (stock returns)
    const tr = await call(
      'post',
      '/api/v1/stock/transfers',
      {
        fromLocationId: locId,
        toLocationId: loc2Id,
        items: [{ rawMaterialId: matId, quantity: 1, unit: 'KILOGRAME' }],
      },
      201,
    );
    await call('patch', `/api/v1/stock/transfers/${tr.body.id}`, { status: 'ANULAT' }, 200);

    // Order lifecycle
    const order = await call(
      'post',
      '/api/v1/orders',
      {
        deliveryPoint: `Punct ${stamp}`,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        items: [{ recipeId, quantity: 1, unit: 'BUCATI' }],
      },
      201,
    );

    // Public design feedback (stakeholder pins on /design-system)
    const dc = await call(
      'post',
      '/api/v1/design-feedback',
      { page: 'web', x: 42.5, y: 33.3, author: 'Smoke', text: 'pin test' },
      201,
    );
    await call('get', '/api/v1/design-feedback?page=web', undefined, 200);
    await call('patch', `/api/v1/design-feedback/${dc.body.id}/resolve`, { resolved: true }, 200);

    // Reads that clients poll
    await call('get', '/api/v1/tasks/shopping-list', undefined, 200);
    await call('get', '/api/v1/dashboard/stats', undefined, 200);
    await call('get', '/api/v1/stock/low-stock', undefined, 200);
    await call('get', '/api/v1/stock/expiring', undefined, 200);

    // Recipe delete while tasks/orders reference it = explicit 400, never 500
    await call('delete', `/api/v1/recipes/${recipeId}`, undefined, 400);

    // Recursive deletes — the FK crash class
    await call('delete', `/api/v1/tasks/${taskId}`, undefined, 200);
    const orderItemId = order.body.items?.[0]?.id;
    if (orderItemId) {
      await call('delete', `/api/v1/orders/${order.body.id}/items/${orderItemId}`);
    }
    await call('delete', `/api/v1/recipes/${recipeId}`, undefined, 200);
    await call('delete', `/api/v1/locations/${loc2Id}?force=true`, undefined, 204);
    await call('delete', `/api/v1/locations/${locId}?force=true`, undefined, 204);
    await call('delete', `/api/v1/raw-materials/${matId}`);
    await call('delete', `/api/v1/suppliers/${supplier.body.id}`);
  });
});
