import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  /** The current request's organization — injected into every scoped query. */
  organizationId?: string;
  /**
   * Explicit system bypass — set by runWithoutTenant for cross-tenant work
   * (seed-like startup jobs, backup/restore, auth lookups before a token
   * exists). Scoped queries run unfiltered inside it.
   */
  bypass?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Get the current tenant's organizationId from AsyncLocalStorage.
 * Returns undefined when running outside a tenant context (e.g. seed, login).
 */
export function getCurrentTenantId(): string | undefined {
  return tenantStorage.getStore()?.organizationId;
}

/** Whether the current async context explicitly bypasses tenant scoping. */
export function isTenantBypassed(): boolean {
  return tenantStorage.getStore()?.bypass === true;
}

/**
 * Run `fn` scoped to one organization — every scoped Prisma query inside is
 * filtered/stamped with this organizationId. Used by the TenantInterceptor
 * (per request) and by system flows acting on behalf of a known org
 * (webhooks, org provisioning).
 */
export function runWithTenant<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  // The async wrapper + await are load-bearing: PrismaPromise is LAZY (the
  // query dispatches on .then), so the promise must be awaited INSIDE the
  // AsyncLocalStorage scope or the extension never sees the context.
  return tenantStorage.run({ organizationId }, async () => await fn());
}

/** Alias that reads better at call sites acting on behalf of an org. */
export const runAsOrg = runWithTenant;

/**
 * Run `fn` with tenant scoping explicitly OFF. Reserve for genuinely
 * cross-tenant system work: startup backfills iterating orgs, backup/restore,
 * and auth flows that must find a user before any token exists.
 */
export function runWithoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  // async + await for the same lazy-PrismaPromise reason as runWithTenant.
  return tenantStorage.run({ bypass: true }, async () => await fn());
}

/**
 * `{ organizationId }` of the current tenant, or `{}` outside a tenant scope.
 *
 * For models WITHOUT an organizationId column (TaskStatusHistory, StockLot,
 * RecipeStock, OrderItem, RecipeYieldHistory, …) the tenant extension does
 * not filter anything — scope them through their tenant-scoped parent:
 *   where: { task: tenantOrgFilter() }
 *   where: { order: { createdAt, ...tenantOrgFilter() } }
 * Outside a tenant scope (seed, bypass, single-org warn mode) this is a no-op,
 * matching the extension's own behaviour.
 */
export function tenantOrgFilter(): { organizationId?: string } {
  const organizationId = getCurrentTenantId();
  return organizationId ? { organizationId } : {};
}

/**
 * Where-clause for the CURRENT organization row (`Organization` itself is not
 * tenant-scoped). Use instead of a bare `organization.findFirst()`, which
 * returns the oldest org in the database regardless of the caller. Outside a
 * tenant scope it falls back to `{}` (legacy single-org behaviour).
 */
export function currentOrgWhere(): { id?: string } {
  const id = getCurrentTenantId();
  return id ? { id } : {};
}
