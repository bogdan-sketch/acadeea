import {
  currentOrgWhere,
  runWithTenant,
  runWithoutTenant,
  tenantOrgFilter,
} from './tenant-context';

describe('tenant-context relation helpers', () => {
  it('tenantOrgFilter returns the current org inside a tenant scope', async () => {
    await runWithTenant('org-1', async () => {
      expect(tenantOrgFilter()).toEqual({ organizationId: 'org-1' });
      expect(currentOrgWhere()).toEqual({ id: 'org-1' });
    });
  });

  it('is a no-op outside a tenant scope or under bypass', async () => {
    expect(tenantOrgFilter()).toEqual({});
    expect(currentOrgWhere()).toEqual({});
    await runWithoutTenant(async () => {
      expect(tenantOrgFilter()).toEqual({});
      expect(currentOrgWhere()).toEqual({});
    });
  });
});
