/**
 * Auth flows: login / refresh rotation / logout revoke / lockout / reset /
 * invite-only registration / tenant by organization / throttling.
 */
import { JwtService } from '@nestjs/jwt';

import { runWithoutTenant } from '../src/prisma/tenant-context';
import { bootApp, TestApp } from './helpers/app';
import { createOrg, PASSWORD, TestOrg, uid } from './helpers/org';
import { freshIp } from './helpers/net';

jest.setTimeout(120000);

describe('Auth', () => {
  let t: TestApp;
  let org: TestOrg;
  let other: TestOrg;

  const login = (email: string, password = PASSWORD) =>
    t.http.post('/api/v1/auth/login').set(freshIp()).send({ email, password });

  /** A throwaway user in `org` with the given role slug. */
  async function makeUser(role = 'cofetar') {
    const email = `u-${uid(8)}@e2e.horae.test`;
    const res = await t.http
      .post('/api/v1/users')
      .set(org.as())
      .send({
        email,
        password: PASSWORD,
        firstName: 'Tmp',
        lastName: 'User',
        roleId: org.roleIds[role as 'cofetar'],
      });
    expect(res.status).toBe(201);
    return { id: res.body.id as string, email };
  }

  beforeAll(async () => {
    t = await bootApp();
    org = await createOrg(t, 'auth');
    other = await createOrg(t, 'auth-other');
  });
  afterAll(async () => t?.close());

  describe('login', () => {
    it('returns tokens, user role + permissions, org branding and a handoff code', async () => {
      const res = await login(org.users.administrator.email);
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.handoffCode).toEqual(expect.any(String));
      expect(res.body.organization).toMatchObject({ id: org.id, slug: org.slug });
      expect(res.body.user.role.slug).toBe('administrator');
      expect(res.body.user.permissions).toEqual(
        expect.arrayContaining([{ action: 'manage', subject: 'all' }]),
      );
    });

    it('is case-insensitive on email', async () => {
      const res = await login(org.users.cofetar.email.toUpperCase());
      expect(res.status).toBe(200);
      expect(res.body.user.role.slug).toBe('cofetar');
    });

    it('rejects a wrong password with 401 and an unknown email with 401', async () => {
      expect((await login(org.users.gestionar.email, 'Wrong-pass-123')).status).toBe(401);
      expect((await login(`nobody-${uid()}@e2e.horae.test`)).status).toBe(401);
    });

    it('validates the body (email format, required password)', async () => {
      const res = await t.http
        .post('/api/v1/auth/login')
        .set(freshIp())
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('locks the account after 5 failed attempts and revokes its sessions', async () => {
      const u = await makeUser();
      const first = await login(u.email);
      expect(first.status).toBe(200);
      for (let i = 1; i <= 4; i++) {
        expect((await login(u.email, 'Wrong-pass-123')).status).toBe(401);
      }
      const fifth = await login(u.email, 'Wrong-pass-123');
      expect(fifth.status).toBe(403);
      expect(fifth.body.errorCode).toBe('ACCOUNT_LOCKED');
      // The correct password no longer works.
      const locked = await login(u.email);
      expect(locked.status).toBe(403);
      expect(locked.body.errorCode).toBe('ACCOUNT_LOCKED');
      // The session minted before the lock can no longer be refreshed.
      const refresh = await t.http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.body.refreshToken });
      expect(refresh.status).toBe(401);
    });

    it('a successful login resets the failed-attempt counter', async () => {
      const u = await makeUser();
      for (let i = 0; i < 4; i++) await login(u.email, 'Wrong-pass-123');
      expect((await login(u.email)).status).toBe(200);
      // 4 more failures must NOT lock (counter was reset).
      for (let i = 0; i < 4; i++) expect((await login(u.email, 'Wrong-pass-123')).status).toBe(401);
      expect((await login(u.email)).status).toBe(200);
    });

    it('a deactivated user gets 403', async () => {
      const u = await makeUser();
      const del = await t.http.delete(`/api/v1/users/${u.id}`).set(org.as());
      expect([200, 204]).toContain(del.status);
      expect((await login(u.email)).status).toBe(403);
    });

    it('a deactivated organization gets 403 ORGANIZATION_INACTIVE', async () => {
      const dead = await createOrg(t, 'auth-dead');
      await runWithoutTenant(async () =>
        t.prisma.organization.update({ where: { id: dead.id }, data: { isActive: false } }),
      );
      const res = await login(dead.users.administrator.email);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ORGANIZATION_INACTIVE');
      // its refresh token is refused too
      const refresh = await t.http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: dead.users.administrator.refreshToken });
      expect(refresh.status).toBe(403);
    });
  });

  describe('sessions', () => {
    it('refresh rotates: new pair works, the old refresh token is revoked', async () => {
      const l = await login(org.users['sef-cofetar'].email);
      const r1 = await t.http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: l.body.refreshToken });
      expect(r1.status).toBe(200);
      expect(r1.body.refreshToken).not.toBe(l.body.refreshToken);
      const me = await t.http
        .get('/api/v1/auth/me')
        .set({ Authorization: `Bearer ${r1.body.accessToken}` });
      expect(me.status).toBe(200);
      const reuse = await t.http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: l.body.refreshToken });
      expect(reuse.status).toBe(401);
      const r2 = await t.http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: r1.body.refreshToken });
      expect(r2.status).toBe(200);
    });

    it('refresh rejects garbage', async () => {
      const res = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: 'nope' });
      expect(res.status).toBe(401);
    });

    it('multi-device: a second login does not revoke the first session', async () => {
      const a = await login(org.users.gestionar.email);
      const b = await login(org.users.gestionar.email);
      expect(
        (await t.http.post('/api/v1/auth/refresh').send({ refreshToken: a.body.refreshToken }))
          .status,
      ).toBe(200);
      expect(
        (await t.http.post('/api/v1/auth/refresh').send({ refreshToken: b.body.refreshToken }))
          .status,
      ).toBe(200);
    });

    it('logout revokes the refresh token and is idempotent', async () => {
      const l = await login(org.users.sofer.email);
      const auth = { Authorization: `Bearer ${l.body.accessToken}` };
      const out = await t.http
        .post('/api/v1/auth/logout')
        .set(auth)
        .send({ refreshToken: l.body.refreshToken });
      expect(out.status).toBe(204);
      const again = await t.http
        .post('/api/v1/auth/logout')
        .set(auth)
        .send({ refreshToken: l.body.refreshToken });
      expect(again.status).toBe(204);
      const refresh = await t.http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: l.body.refreshToken });
      expect(refresh.status).toBe(401);
    });

    it('logout requires a bearer token', async () => {
      const res = await t.http.post('/api/v1/auth/logout').send({ refreshToken: 'x' });
      expect(res.status).toBe(401);
    });

    it('GET /auth/me returns the caller', async () => {
      const res = await t.http.get('/api/v1/auth/me').set(org.as('cofetar'));
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(org.users.cofetar.email);
    });

    it('rejects missing, malformed and pre-multi-tenancy tokens with 401', async () => {
      expect((await t.http.get('/api/v1/auth/me')).status).toBe(401);
      expect(
        (await t.http.get('/api/v1/auth/me').set({ Authorization: 'Bearer abc.def.ghi' })).status,
      ).toBe(401);
      const jwt = t.app.get(JwtService, { strict: false });
      const legacy = jwt.sign({
        sub: org.users.administrator.id,
        email: org.users.administrator.email,
        role: 'administrator',
      });
      expect(
        (await t.http.get('/api/v1/auth/me').set({ Authorization: `Bearer ${legacy}` })).status,
      ).toBe(401);
    });
  });

  describe('tenant by organization', () => {
    it('each user lands in their own org and cannot read the other one', async () => {
      const a = await login(org.users.administrator.email);
      const b = await login(other.users.administrator.email);
      expect(a.body.organization.slug).toBe(org.slug);
      expect(b.body.organization.slug).toBe(other.slug);

      const loc = await t.http
        .post('/api/v1/locations')
        .set(org.as())
        .send({ name: `Lab ${uid()}`, type: 'LABORATOR', address: 'Str. Test 1' });
      expect(loc.status).toBe(201);
      expect((await t.http.get(`/api/v1/locations/${loc.body.id}`).set(other.as())).status).toBe(
        404,
      );
      const list = await t.http.get('/api/v1/locations').set(other.as());
      expect(JSON.stringify(list.body)).not.toContain(loc.body.id);

      const orgRes = await t.http.get('/api/v1/organization').set(other.as());
      expect(orgRes.body.slug).toBe(other.slug);
    });

    it('users list is scoped to the caller org', async () => {
      const res = await t.http.get('/api/v1/users?limit=100').set(org.as());
      expect(res.status).toBe(200);
      const emails: string[] = (res.body.data ?? res.body).map((u: { email: string }) => u.email);
      expect(emails).toContain(org.users.cofetar.email);
      expect(emails).not.toContain(other.users.cofetar.email);
    });
  });

  describe('registration (invite-only)', () => {
    it('invite → status → accept logs the user into the inviting org with the invited role', async () => {
      const email = `invitee-${uid(8)}@e2e.horae.test`;
      const inv = await t.http
        .post('/api/v1/users/invite')
        .set(org.as())
        .send({ email, roleId: org.roleIds.gestionar });
      expect(inv.status).toBe(201);
      const token = t.mail.last('invitation', email)?.token as string;
      expect(token).toBeTruthy();

      const status = await t.http.get(`/api/v1/auth/invite-status/${token}`);
      expect(status.body).toEqual({ valid: true, email });

      const acc = await t.http
        .post('/api/v1/auth/accept-invite')
        .send({ token, password: 'New-Passw0rd!', firstName: 'Ana', lastName: 'Pop' });
      expect(acc.status).toBe(201);
      expect(acc.body.organization.slug).toBe(org.slug);
      expect(acc.body.user.role.slug).toBe('gestionar');

      const used = await t.http.get(`/api/v1/auth/invite-status/${token}`);
      expect(used.body).toMatchObject({ valid: false, reason: 'used' });
      const twice = await t.http
        .post('/api/v1/auth/accept-invite')
        .send({ token, password: 'New-Passw0rd!', firstName: 'Ana', lastName: 'Pop' });
      expect(twice.status).toBe(400);
    });

    it('invalid / expired tokens', async () => {
      expect((await t.http.get('/api/v1/auth/invite-status/nope')).body).toMatchObject({
        valid: false,
        reason: 'invalid',
      });
      const bad = await t.http
        .post('/api/v1/auth/accept-invite')
        .send({ token: 'nope', password: 'New-Passw0rd!', firstName: 'A', lastName: 'B' });
      expect(bad.status).toBe(404);

      const email = `expired-${uid(8)}@e2e.horae.test`;
      await t.http
        .post('/api/v1/users/invite')
        .set(org.as())
        .send({ email, roleId: org.roleIds.cofetar });
      const token = t.mail.last('invitation', email)!.token;
      await runWithoutTenant(async () =>
        t.prisma.userInvitation.update({
          where: { token },
          data: { expiresAt: new Date(Date.now() - 1000) },
        }),
      );
      expect((await t.http.get(`/api/v1/auth/invite-status/${token}`)).body).toMatchObject({
        valid: false,
        reason: 'expired',
      });
      const res = await t.http
        .post('/api/v1/auth/accept-invite')
        .send({ token, password: 'New-Passw0rd!', firstName: 'A', lastName: 'B' });
      expect(res.status).toBe(400);
    });

    it('rejects a short password on accept', async () => {
      const res = await t.http
        .post('/api/v1/auth/accept-invite')
        .send({ token: 'x', password: 'short', firstName: 'A', lastName: 'B' });
      expect(res.status).toBe(400);
    });

    it('inviting an existing active user is a 409; non-admins cannot invite', async () => {
      const dup = await t.http
        .post('/api/v1/users/invite')
        .set(org.as())
        .send({ email: org.users.cofetar.email, roleId: org.roleIds.cofetar });
      expect(dup.status).toBe(409);
      const forbidden = await t.http
        .post('/api/v1/users/invite')
        .set(org.as('cofetar'))
        .send({ email: `x-${uid()}@e2e.horae.test`, roleId: org.roleIds.cofetar });
      expect(forbidden.status).toBe(403);
    });

    it('cannot invite with a role from another organization', async () => {
      const res = await t.http
        .post('/api/v1/users/invite')
        .set(org.as())
        .send({ email: `x-${uid()}@e2e.horae.test`, roleId: other.roleIds.cofetar });
      expect(res.status).toBe(400);
    });
  });

  describe('password reset', () => {
    it('forgot → reset clears the lock, old password dies, recent password reuse is refused', async () => {
      const u = await makeUser();
      for (let i = 0; i < 5; i++) await login(u.email, 'Wrong-pass-123');
      expect((await login(u.email)).body.errorCode).toBe('ACCOUNT_LOCKED');

      const fp = await t.http
        .post('/api/v1/auth/forgot-password')
        .set(freshIp())
        .send({ email: u.email });
      expect(fp.status).toBe(204);
      const token = t.mail.last('reset', u.email)!.token;
      expect((await t.http.get(`/api/v1/auth/reset-status/${token}`)).body).toMatchObject({
        valid: true,
      });

      const reuse = await t.http
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: PASSWORD });
      expect(reuse.status).toBe(400);
      expect(reuse.body.errorCode).toBe('PASSWORD_REUSED');

      const ok = await t.http
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'Brand-New-1!' });
      expect(ok.status).toBe(204);
      expect((await login(u.email)).status).toBe(401);
      expect((await login(u.email, 'Brand-New-1!')).status).toBe(200);
      // single use
      const again = await t.http
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: 'Another-New-2!' });
      expect(again.status).toBeGreaterThanOrEqual(400);
    });

    it('forgot-password does not reveal whether the email exists', async () => {
      const res = await t.http
        .post('/api/v1/auth/forgot-password')
        .set(freshIp())
        .send({ email: `ghost-${uid()}@e2e.horae.test` });
      expect(res.status).toBe(204);
    });
  });

  describe('throttling', () => {
    it('login is limited to 10 requests / minute per client IP (11th → 429)', async () => {
      const ip = freshIp();
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const r = await t.http
          .post('/api/v1/auth/login')
          .set(ip)
          .send({ email: `ghost-${i}@e2e.horae.test`, password: 'Whatever-123' });
        statuses.push(r.status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
      // another IP is unaffected
      expect((await login(org.users.administrator.email)).status).toBe(200);
    });
  });
});
