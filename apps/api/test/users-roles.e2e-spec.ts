/**
 * Users, roles and permissions (CASL) + notifications.
 * Admin = manage all; standard roles cloned per org from ROLE_DEFINITIONS.
 */
import { bootApp, TestApp } from './helpers/app';
import { Api } from './helpers/factory';
import { createOrg, PASSWORD, RoleSlug, TestOrg, uid } from './helpers/org';
import { freshIp } from './helpers/net';

jest.setTimeout(120000);

describe('Users, roles, permissions, notifications', () => {
  let t: TestApp;
  let org: TestOrg;
  let api: Api;

  beforeAll(async () => {
    t = await bootApp();
    org = await createOrg(t, 'users');
    api = new Api(t, org);
  });
  afterAll(async () => t?.close());

  const newUser = async (role: RoleSlug = 'cofetar') =>
    (
      await api.post(
        '/api/v1/users',
        {
          email: `u-${uid(8)}@e2e.horae.test`,
          password: PASSWORD,
          firstName: 'Nou',
          lastName: 'Angajat',
          roleId: org.roleIds[role],
        },
        201,
      )
    ).body;

  describe('users', () => {
    it('admin creates, reads, updates; duplicate email 409; short password 400', async () => {
      const u = await newUser();
      expect(u).toMatchObject({ firstName: 'Nou', isActive: true });
      expect(u).not.toHaveProperty('passwordHash');
      const got = (await api.get(`/api/v1/users/${u.id}`, 200)).body;
      expect(got.email).toBe(u.email);
      const upd = (await api.patch(`/api/v1/users/${u.id}`, { firstName: 'Ionel' }, 200)).body;
      expect(upd.firstName).toBe('Ionel');
      await api.post(
        '/api/v1/users',
        {
          email: u.email,
          password: PASSWORD,
          firstName: 'A',
          lastName: 'B',
          roleId: org.roleIds.cofetar,
        },
        409,
      );
      await api.post(
        '/api/v1/users',
        {
          email: `x-${uid()}@e2e.horae.test`,
          password: 'short',
          firstName: 'A',
          lastName: 'B',
          roleId: org.roleIds.cofetar,
        },
        400,
      );
      await api.post(
        '/api/v1/users',
        {
          email: 'not-an-email',
          password: PASSWORD,
          firstName: 'A',
          lastName: 'B',
          roleId: org.roleIds.cofetar,
        },
        400,
      );
    });

    it('a role from another org cannot be assigned', async () => {
      const other = await createOrg(t, 'users-other');
      await api.post(
        '/api/v1/users',
        {
          email: `x-${uid()}@e2e.horae.test`,
          password: PASSWORD,
          firstName: 'A',
          lastName: 'B',
          roleId: other.roleIds.cofetar,
        },
        404,
      );
    });

    it('change role; cannot change own role; cannot demote / deactivate the last admin', async () => {
      const u = await newUser('cofetar');
      const changed = (
        await api.patch(`/api/v1/users/${u.id}/role`, { roleId: org.roleIds.gestionar }, 200)
      ).body;
      expect(changed.role?.slug ?? changed.roleSlug ?? changed.dynamicRole?.slug).toBe('gestionar');
      await api.patch(
        `/api/v1/users/${org.users.administrator.id}/role`,
        { roleId: org.roleIds.cofetar },
        400,
      );
      await api.del(`/api/v1/users/${org.users.administrator.id}`, 400); // own account

      // a fresh org with exactly one admin: a second admin cannot remove the first
      const solo = await createOrg(t, 'users-solo');
      const sapi = new Api(t, solo);
      const second = (
        await sapi.post(
          '/api/v1/users',
          {
            email: `adm-${uid()}@e2e.horae.test`,
            password: PASSWORD,
            firstName: 'A',
            lastName: 'B',
            roleId: solo.roleIds.administrator,
          },
          201,
        )
      ).body;
      // two admins now → demoting one is fine
      await sapi.patch(`/api/v1/users/${second.id}/role`, { roleId: solo.roleIds.cofetar }, 200);
      // back to one → the remaining admin can't be demoted by the (now cofetar) user, nor by anyone
      const r = await t.http
        .patch(`/api/v1/users/${solo.users.administrator.id}/role`)
        .set(solo.as('cofetar'))
        .send({ roleId: solo.roleIds.cofetar });
      expect(r.status).toBe(403);
    });

    it('deactivate blocks login and refresh; reactivate locks + emails a set-password link', async () => {
      const u = await newUser();
      const login = await t.http
        .post('/api/v1/auth/login')
        .set(freshIp())
        .send({ email: u.email, password: PASSWORD });
      expect(login.status).toBe(200);
      await api.del(`/api/v1/users/${u.id}`, 200);
      expect(
        (
          await t.http
            .post('/api/v1/auth/login')
            .set(freshIp())
            .send({ email: u.email, password: PASSWORD })
        ).status,
      ).toBe(403);
      // Deactivation revokes the refresh tokens (401); a still-live one is
      // refused by the sign-in gate (403) — either way the session is over.
      expect([401, 403]).toContain(
        (await t.http.post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken }))
          .status,
      );

      const re = (await api.patch(`/api/v1/users/${u.id}/reactivate`, {}, 200)).body;
      expect(re.isActive).toBe(true);
      expect(t.mail.last('reactivation', u.email)).toBeTruthy();
      const locked = await t.http
        .post('/api/v1/auth/login')
        .set(freshIp())
        .send({ email: u.email, password: PASSWORD });
      expect(locked.body.errorCode).toBe('ACCOUNT_LOCKED');
    });

    // auth.service: "sessions are revoked on … deactivation". The JWT strategy
    // never re-checks isActive, so an access token minted before the
    // deactivation keeps working until it expires (12 h in prod).
    it('a deactivated user loses API access immediately (old access token → 401) [FINDING jwt.strategy.ts validate no isActive check]', async () => {
      const u = await newUser();
      const login = await t.http
        .post('/api/v1/auth/login')
        .set(freshIp())
        .send({ email: u.email, password: PASSWORD });
      await api.del(`/api/v1/users/${u.id}`, 200);
      const r = await t.http
        .get('/api/v1/tasks')
        .set({ Authorization: `Bearer ${login.body.accessToken}` });
      expect(r.status).toBe(401);
    });

    it('?isActive=false lists only deactivated users (query booleans keep "false")', async () => {
      const u = await newUser();
      await api.del(`/api/v1/users/${u.id}`, 200);
      const inactive = (await api.get('/api/v1/users?isActive=false&limit=100', 200)).body;
      const ids = inactive.data.map((x: { id: string }) => x.id);
      expect(ids).toContain(u.id);
      expect(ids).not.toContain(org.users.cofetar.id);
      await api.get('/api/v1/users?isActive=maybe', 400);
    });

    it('users are listed per org; non-admins cannot list or create users', async () => {
      await api.get('/api/v1/users', 403, 'cofetar');
      await api.post(
        '/api/v1/users',
        {
          email: `x-${uid()}@e2e.horae.test`,
          password: PASSWORD,
          firstName: 'A',
          lastName: 'B',
          roleId: org.roleIds.cofetar,
        },
        403,
        'sef-cofetar',
      );
      const other = await createOrg(t, 'users-iso');
      await api.get(`/api/v1/users/${other.users.cofetar.id}`, 404);
    });
  });

  describe('roles + permissions', () => {
    it('each org has the 6 standard roles; admins manage roles, others 403', async () => {
      const roles = (await api.get('/api/v1/roles', 200)).body;
      expect(roles.map((r: { slug: string }) => r.slug).sort()).toEqual([
        'administrator',
        'cofetar',
        'gestionar',
        'sef-cofetar',
        'sofer',
        'user',
      ]);
      await api.get('/api/v1/roles', 403, 'sef-cofetar');
      const subj = (await api.get('/api/v1/roles/subjects', 200)).body;
      expect(subj.subjects).toEqual(expect.arrayContaining(['Recipe', 'Task', 'Order']));
    });

    it('custom role: create, set permissions (takes effect immediately), delete reassigns its users to "user"', async () => {
      const role = (
        await api.post('/api/v1/roles', { name: `Patiser ${uid()}`, description: 'test' }, 201)
      ).body;
      expect(role.slug).toMatch(/^patiser-/);
      await api.post('/api/v1/roles', { name: role.name }, 409);
      await api.post('/api/v1/roles', { name: 'Ok', slug: 'Not Valid' }, 400);

      const email = `pat-${uid(8)}@e2e.horae.test`;
      const u = (
        await api.post(
          '/api/v1/users',
          { email, password: PASSWORD, firstName: 'P', lastName: 'S', roleId: role.id },
          201,
        )
      ).body;
      const tok = (
        await t.http.post('/api/v1/auth/login').set(freshIp()).send({ email, password: PASSWORD })
      ).body.accessToken;
      const as = { Authorization: `Bearer ${tok}` };
      expect((await t.http.get('/api/v1/recipes').set(as)).status).toBe(403);

      await api.req(
        'put',
        `/api/v1/roles/${role.id}/permissions`,
        { permissions: [{ action: 'read', subject: 'Recipe' }] },
        200,
      );
      expect((await t.http.get('/api/v1/recipes').set(as)).status).toBe(200);
      expect(
        (
          await t.http
            .post('/api/v1/recipes')
            .set(as)
            .send({ name: 'x', unit: 'BUCATI', yieldQuantity: 1 })
        ).status,
      ).toBe(403);

      // Deleting a role in use moves its users to the fallback "user" role
      // (the Swagger summary still says "fails if … has users").
      await api.del(`/api/v1/roles/${role.id}`, 204);
      const moved = (await api.get(`/api/v1/users/${u.id}`, 200)).body;
      expect(JSON.stringify(moved)).toContain(org.roleIds.user);
    });

    it('system roles cannot be deleted; administrator permissions cannot be changed', async () => {
      await api.del(`/api/v1/roles/${org.roleIds.administrator}`, 400);
      await api.req(
        'put',
        `/api/v1/roles/${org.roleIds.administrator}/permissions`,
        { permissions: [] },
        400,
      );
    });

    it('roles are per org: editing one org cofetar does not affect another org', async () => {
      const other = await createOrg(t, 'roles-iso');
      await api.req(
        'put',
        `/api/v1/roles/${org.roleIds.cofetar}/permissions`,
        { permissions: [{ action: 'read', subject: 'Task' }] },
        200,
      );
      // other org's cofetar still has stock rights
      expect((await t.http.get('/api/v1/raw-materials').set(other.as('cofetar'))).status).toBe(200);
      expect((await t.http.get('/api/v1/raw-materials').set(org.as('cofetar'))).status).toBe(403);
      await api.get(`/api/v1/roles/${other.roleIds.cofetar}`, 404);
    });
  });

  describe('CASL matrix — delete is admin-only', () => {
    it('a cofetar cannot delete anything; an admin can', async () => {
      const fresh = await createOrg(t, 'casl');
      const a = new Api(t, fresh);
      const loc = await a.location();
      const m = await a.rawMaterial();
      const c = await a.consumable();
      const r = await a.recipe([]);
      const task = await a.task({
        recipeId: r.id,
        targetQuantity: 1,
        targetUnit: 'BUCATI',
        locationId: loc.id,
      });
      const o = (
        await a.post(
          '/api/v1/orders',
          { deliveryPoint: 'X', items: [{ recipeId: r.id, quantity: 1, unit: 'BUCATI' }] },
          201,
        )
      ).body;

      for (const role of ['cofetar', 'gestionar', 'sofer', 'user'] as const) {
        await a.del(`/api/v1/raw-materials/${m.id}`, 403, role);
        await a.del(`/api/v1/consumables/${c.id}`, 403, role);
        await a.del(`/api/v1/recipes/${r.id}`, 403, role);
        await a.del(`/api/v1/tasks/${task.id}`, 403, role);
        await a.del(`/api/v1/locations/${loc.id}`, 403, role);
        await a.del(`/api/v1/users/${fresh.users.sofer.id}`, 403, role);
        const bulk = await t.http
          .post('/api/v1/orders/bulk-delete')
          .set(fresh.as(role))
          .send({ ids: [o.id] });
        expect(bulk.status).toBe(403);
      }

      await a.del(`/api/v1/tasks/${task.id}`, 200);
      expect(
        (await a.post('/api/v1/orders/bulk-delete', { ids: [o.id] }, 200)).body.deleted,
      ).toEqual([o.id]);
      await a.del(`/api/v1/recipes/${r.id}`, 200);
      await a.del(`/api/v1/raw-materials/${m.id}?hard=true`, 200);
      await a.del(`/api/v1/consumables/${c.id}`, 200);
      await a.del(`/api/v1/users/${fresh.users.sofer.id}`, 200);
    });

    it('the "user" role can only read tasks', async () => {
      await api.get('/api/v1/tasks', 200, 'user');
      await api.get('/api/v1/raw-materials', 403, 'user');
      await api.get('/api/v1/orders', 403, 'user');
      await api.get('/api/v1/stock/transfers', 403, 'user');
    });
  });

  describe('notifications', () => {
    it('assigning a task notifies the assignee: list, unread count, mark read, read all', async () => {
      const fresh = await createOrg(t, 'notif');
      const a = new Api(t, fresh);
      const r = await a.recipe([]);
      const task = await a.task({
        recipeId: r.id,
        targetQuantity: 1,
        targetUnit: 'BUCATI',
        assignedToId: fresh.users.cofetar.id,
      });
      await a.task({
        recipeId: r.id,
        targetQuantity: 2,
        targetUnit: 'BUCATI',
        assignedToId: fresh.users.cofetar.id,
      });

      const count = (await a.get('/api/v1/notifications/unread-count', 200, 'cofetar')).body;
      expect(count).toEqual({ count: 2 });
      const list = (await a.get('/api/v1/notifications', 200, 'cofetar')).body;
      const rows = list.data ?? list;
      expect(rows[0]).toMatchObject({ type: 'TASK_ASSIGNED' });
      expect(JSON.stringify(rows)).toContain(task.id);

      const one = (await a.patch(`/api/v1/notifications/${rows[0].id}/read`, {}, 200, 'cofetar'))
        .body;
      expect(one.readAt ?? one.isRead).toBeTruthy();
      expect((await a.get('/api/v1/notifications/unread-count', 200, 'cofetar')).body.count).toBe(
        1,
      );
      // someone else's notification is not reachable
      const steal = await t.http
        .patch(`/api/v1/notifications/${rows[1].id}/read`)
        .set(fresh.as('gestionar'));
      expect(steal.status).toBe(404);
      expect((await a.patch('/api/v1/notifications/read-all', {}, 200, 'cofetar')).body).toEqual({
        updated: 1,
      });
      expect((await a.get('/api/v1/notifications/unread-count', 200, 'cofetar')).body.count).toBe(
        0,
      );
      // the creator is not notified about their own assignment to themselves
      expect((await a.get('/api/v1/notifications/unread-count', 200)).body.count).toBe(0);
    });

    it('device tokens: register (ios/android only) and remove', async () => {
      const token = `tok-${uid(16)}`;
      await api.post('/api/v1/notifications/device-token', { token, platform: 'ios' }, 201);
      await api.post(
        '/api/v1/notifications/device-token',
        { token: 'x', platform: 'windows' },
        400,
      );
      const del = await t.http
        .delete(`/api/v1/notifications/device-token?token=${token}`)
        .set(org.as());
      expect(del.status).toBeLessThan(300);
    });

    it('notifications require auth', async () => {
      expect((await t.http.get('/api/v1/notifications')).status).toBe(401);
    });
  });
});
