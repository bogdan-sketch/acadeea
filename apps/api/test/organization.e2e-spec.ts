/**
 * Organization: settings + default location, branding validation, locations
 * CRUD and user assignment, the three category lists, org snapshots
 * (backups) create/list/download gate, system logs (Jurnal sistem).
 */
import { bootApp, TestApp } from './helpers/app';
import { Api } from './helpers/factory';
import { createOrg, TestOrg, uid } from './helpers/org';

jest.setTimeout(120000);

describe('Organization', () => {
  let t: TestApp;
  let org: TestOrg;
  let api: Api;

  beforeAll(async () => {
    t = await bootApp();
    org = await createOrg(t, 'org');
    api = new Api(t, org);
  });
  afterAll(async () => t?.close());

  describe('settings', () => {
    it('GET returns the caller org; PATCH (admin) updates legal + VAT + default location; others 403', async () => {
      const lab = await api.location({ type: 'LABORATOR' });
      const got = (await api.get('/api/v1/organization', 200)).body;
      expect(got).toMatchObject({ id: org.id, slug: org.slug, nutritionEnabled: true });
      const upd = (
        await api.patch(
          '/api/v1/organization',
          {
            cui: 'RO123456',
            legalAddress: 'Str. Fabricii 1, Cluj',
            vatPayer: true,
            vatRatePercent: 21,
            defaultLocationId: lab.id,
          },
          200,
        )
      ).body;
      expect(upd).toMatchObject({ cui: 'RO123456', defaultLocationId: lab.id });
      await api.patch('/api/v1/organization', { defaultLocationId: null }, 200);
      await api.patch('/api/v1/organization', { cui: 'X' }, 403, 'sef-cofetar');
      await api.patch('/api/v1/organization', { cui: 'X' }, 403, 'cofetar');
    });

    it('branding: hex colours, whitelisted tokens and font keys are validated', async () => {
      await api.patch(
        '/api/v1/organization',
        { accentColor: '#D4527B', secondaryColor: '#2E9E4F' },
        200,
      );
      await api.patch('/api/v1/organization', { accentColor: 'pink' }, 400);
      await api.patch('/api/v1/organization', { fontFamily: 'comic-sans' }, 400);
      await api.patch('/api/v1/organization', { secondaryColor: '#2E9E4F80' }, 400); // trio is 6-digit only
      await api.patch(
        '/api/v1/organization',
        {
          brandingTokens: {
            web: { accent: '#ABCDEF', background: '#00000080', radiusCard: '12px' },
          },
        },
        200,
      );
      await api.patch('/api/v1/organization', { brandingTokens: { web: { hacker: 'x' } } }, 400);
      const pub = (await t.http.get(`/api/v1/organization/by-slug/${org.slug}`)).body;
      expect(pub.accentColor).toBe('#D4527B');
      expect(pub).not.toHaveProperty('cui');
    });

    it('GET /organization requires auth; by-slug is public and 404s on unknown', async () => {
      expect((await t.http.get('/api/v1/organization')).status).toBe(401);
      expect((await t.http.get('/api/v1/organization/by-slug/definitely-not-an-org')).status).toBe(
        404,
      );
    });

    it('nutrition can be switched off per org', async () => {
      await api.patch('/api/v1/organization', { nutritionEnabled: false }, 200);
      expect((await api.get('/api/v1/organization', 200)).body.nutritionEnabled).toBe(false);
      await api.patch('/api/v1/organization', { nutritionEnabled: true }, 200);
    });
  });

  describe('locations', () => {
    it('CRUD with validation; names unique per org; deactivation', async () => {
      const name = `Depozit ${uid()}`;
      const loc = await api.location({ name, type: 'DEPOZIT', phone: '0264 000 000' });
      expect(loc).toMatchObject({ name, type: 'DEPOZIT', isActive: true });
      // the same name is fine in another org
      const other = await createOrg(t, 'org-other');
      const o = await t.http
        .post('/api/v1/locations')
        .set(other.as())
        .send({ name, type: 'DEPOZIT', address: 'Str. X 1' });
      expect(o.status).toBe(201);

      await api.post('/api/v1/locations', { name: 'X', type: 'DEPOZIT', address: 'Str. X 1' }, 400);
      await api.post(
        '/api/v1/locations',
        { name: 'Ok name', type: 'BUCATARIE', address: 'Str. X 1' },
        400,
      );
      await api.post('/api/v1/locations', { name: 'Ok name', type: 'DEPOZIT', address: 'ab' }, 400);

      const upd = (await api.patch(`/api/v1/locations/${loc.id}`, { isActive: false }, 200)).body;
      expect(upd.isActive).toBe(false);
      await api.get(`/api/v1/locations/${loc.id}`, 200);
      await api.del(`/api/v1/locations/${loc.id}`);
    });

    // Location.name is unique per org but createLocation doesn't catch P2002 → 500.
    it('a duplicate location name in the same org is a 4xx, never a 500 [FINDING locations.service.ts:45 createLocation P2002]', async () => {
      const name = `Dublura ${uid()}`;
      await api.location({ name });
      const dup = await t.http
        .post('/api/v1/locations')
        .set(org.as())
        .send({ name, type: 'DEPOZIT', address: 'Str. X 1' });
      expect(dup.status).toBeGreaterThanOrEqual(400);
      expect(dup.status).toBeLessThan(500);
    });

    it('user assignment: primary location drives my-locations; remove works', async () => {
      const a = await api.location({ type: 'MAGAZIN' });
      const b = await api.location({ type: 'LABORATOR' });
      await api.post(
        `/api/v1/locations/${a.id}/users`,
        { userId: org.users.gestionar.id, isPrimary: true },
        201,
      );
      await api.post(`/api/v1/locations/${b.id}/users`, { userId: org.users.gestionar.id }, 201);
      const users = (await api.get(`/api/v1/locations/${a.id}/users`, 200)).body;
      expect(users.map((u: { userId: string; id: string }) => u.userId ?? u.id)).toContain(
        org.users.gestionar.id,
      );
      const mine = (await api.get('/api/v1/locations/my-locations', 200, 'gestionar')).body;
      expect(mine.map((l: { id: string }) => l.id).sort()).toEqual([a.id, b.id].sort());
      await api.del(`/api/v1/locations/${b.id}/users/${org.users.gestionar.id}`);
      const after = (await api.get('/api/v1/locations/my-locations', 200, 'gestionar')).body;
      expect(after.map((l: { id: string }) => l.id)).toEqual([a.id]);
    });

    it('dashboard per location answers', async () => {
      const a = await api.location({ type: 'MAGAZIN' });
      await api.get(`/api/v1/locations/${a.id}/dashboard`, 200);
    });

    it('CASL: only admins create/delete locations; gestionar reads', async () => {
      await api.post(
        '/api/v1/locations',
        { name: `L ${uid()}`, type: 'DEPOZIT', address: 'Str. X 1' },
        403,
        'gestionar',
      );
      await api.get('/api/v1/locations', 200, 'gestionar');
      const a = await api.location();
      await api.del(`/api/v1/locations/${a.id}`, 403, 'sef-cofetar');
    });
  });

  describe('categories (three separate lists)', () => {
    it('add / list / rename / reorder / delete per kind; the system category is protected', async () => {
      const mp = `Lactate ${uid()}`;
      const fin = `Torturi ${uid()}`;
      await api.post('/api/v1/recipes/categories', { name: mp, kind: 'MATERIE_PRIMA' });
      await api.post('/api/v1/recipes/categories', { name: fin, kind: 'PRODUS_FINIT' });
      const mps = (await api.get('/api/v1/recipes/categories?kind=MATERIE_PRIMA', 200)).body;
      expect(mps).toEqual(expect.arrayContaining(['Materii prime', mp]));
      expect(mps).not.toContain(fin);
      expect((await api.get('/api/v1/recipes/categories?kind=PRODUS_FINIT', 200)).body).toContain(
        fin,
      );

      // re-tag: a raw material in the renamed category follows it
      const m = await api.rawMaterial({ category: mp });
      const renamed = `${mp} bio`;
      await api.patch(
        `/api/v1/recipes/categories/${encodeURIComponent(mp)}`,
        { name: renamed, kind: 'MATERIE_PRIMA' },
        200,
      );
      expect((await api.rawMaterialById(m.id)).category).toBe(renamed);

      await api.patch(
        '/api/v1/recipes/categories/reorder',
        { kind: 'MATERIE_PRIMA', names: [renamed, 'Materii prime'] },
        200,
      );
      const ordered = (await api.get('/api/v1/recipes/categories?kind=MATERIE_PRIMA', 200)).body;
      expect(ordered.indexOf(renamed)).toBeLessThan(ordered.indexOf('Materii prime'));

      await api.patch(
        `/api/v1/recipes/categories/${encodeURIComponent('Materii prime')}`,
        { name: 'Altceva', kind: 'MATERIE_PRIMA' },
        400,
      );
      await api.del(
        `/api/v1/recipes/categories/${encodeURIComponent('Materii prime')}?kind=MATERIE_PRIMA`,
        400,
      );
      await api.del(
        `/api/v1/recipes/categories/${encodeURIComponent(renamed)}?kind=MATERIE_PRIMA`,
        200,
      );
      expect((await api.rawMaterialById(m.id)).category).toBeNull(); // → "Misc"
    });

    it('empty names are refused; only admins manage categories', async () => {
      await api.post('/api/v1/recipes/categories', { name: '  ', kind: 'MATERIE_PRIMA' }, 400);
      await api.post(
        '/api/v1/recipes/categories',
        { name: 'X', kind: 'MATERIE_PRIMA' },
        403,
        'sef-cofetar',
      );
    });

    it('categories are per org', async () => {
      const name = `Secret ${uid()}`;
      await api.post('/api/v1/recipes/categories', { name, kind: 'PRODUS_FINIT' });
      const other = await createOrg(t, 'org-cat');
      const r = await t.http.get('/api/v1/recipes/categories?kind=PRODUS_FINIT').set(other.as());
      expect(r.body).not.toContain(name);
    });
  });

  describe('backups (org snapshots)', () => {
    it('create → list → download gate → delete; admin only', async () => {
      await api.rawMaterial();
      const snap = (
        await api.post('/api/v1/backups/snapshots', { label: 'Înainte de inventar' }, 201)
      ).body;
      expect(snap).toMatchObject({ label: 'Înainte de inventar' });
      const list = (await api.get('/api/v1/backups/snapshots', 200)).body;
      const rows = list.data ?? list;
      expect(rows.map((s: { id: string }) => s.id)).toContain(snap.id);

      // download is limited to BACKUP_ADMIN_EMAILS (test admins are not on it)
      await api.get(`/api/v1/backups/snapshots/${snap.id}/download`, 403);
      await api.post(`/api/v1/backups/snapshots/${snap.id}/restore`, { confirm: 'nu' }, 400);

      await api.get('/api/v1/backups/snapshots', 403, 'sef-cofetar');
      await api.post('/api/v1/backups/snapshots', {}, 403, 'gestionar');

      const other = await createOrg(t, 'org-bak');
      const theirs = (await t.http.get('/api/v1/backups/snapshots').set(other.as())).body;
      expect(JSON.stringify(theirs)).not.toContain(snap.id);

      await api.del(`/api/v1/backups/snapshots/${snap.id}`, 200);
    });

    it('label is limited to 200 chars', async () => {
      await api.post('/api/v1/backups/snapshots', { label: 'x'.repeat(201) }, 400);
    });
  });

  describe('system logs', () => {
    it('mutations are logged per org; admin only; allOrgs needs a platform admin', async () => {
      await api.location({ name: `Logged ${uid()}` });
      // the request middleware writes asynchronously
      let found = false;
      for (let i = 0; i < 20 && !found; i++) {
        const logs = (await api.get('/api/v1/system-logs?category=HTTP&limit=50', 200)).body;
        found = logs.data.some(
          (l: { method: string; path: string }) =>
            l.method === 'POST' && l.path.includes('/locations'),
        );
        if (!found) await new Promise((r) => setTimeout(r, 100));
      }
      expect(found).toBe(true);
      await api.get('/api/v1/system-logs', 403, 'sef-cofetar');
      expect((await api.get('/api/v1/system-logs/access', 200)).body).toEqual({
        platformAdmin: false,
      });
      await api.get('/api/v1/system-logs?allOrgs=true', 403);
      const other = await createOrg(t, 'org-logs');
      const theirs = (await t.http.get('/api/v1/system-logs?limit=200').set(other.as())).body;
      expect(
        theirs.data.every((l: { organizationId: string | null }) => l.organizationId === other.id),
      ).toBe(true);
    });
  });
});
