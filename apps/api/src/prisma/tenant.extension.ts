import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { getCurrentTenantId, isTenantBypassed } from './tenant-context';

/**
 * Tenant-isolation Prisma extension.
 *
 * Every model carrying an `organizationId` field is automatically scoped to
 * the organization in the current AsyncLocalStorage context
 * (src/prisma/tenant-context.ts, established per-request by the global
 * TenantInterceptor):
 *   - reads  → `where.organizationId` is injected
 *   - writes → `data.organizationId` is stamped on create/upsert
 *
 * Escape hatches:
 *   - `runWithoutTenant(fn)` — explicit cross-tenant system work
 *   - an EXPLICIT `organizationId` already present in `where`/`data` is
 *     respected (auth & CASL guards run before the interceptor and filter
 *     explicitly)
 *
 * NOT covered (audited, documented):
 *   - `$queryRaw` / `$executeRaw` — raw SQL bypasses the extension entirely.
 *     Audited call sites (stock-reservation FOR UPDATE locks, stock-lot
 *     backfill, backup restore) filter by ids that were resolved through
 *     scoped queries, so they are transitively org-safe.
 *   - nested `connect` on relations is not tenant-checked; connectable ids
 *     come from scoped reads.
 *
 * Enforcement mode — env `TENANT_ENFORCEMENT`:
 *   - 'warn'   (default): queries on scoped models with no tenant context are
 *     logged and run UNFILTERED (single-org behaviour — safe rollout).
 *   - 'strict': such queries throw TenantContextMissingError (fail closed).
 *   - 'off':    extension does nothing (emergency hatch).
 */

export class TenantContextMissingError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant context missing for ${model}.${operation} — wrap the call in ` +
        `runWithTenant()/runWithoutTenant() or authenticate the request.`,
    );
    this.name = 'TenantContextMissingError';
  }
}

const logger = new Logger('TenantExtension');

/** Models that carry an organizationId column (derived from the DMMF). */
export const SCOPED_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'organizationId'))
    .map((m) => m.name),
);

type EnforcementMode = 'off' | 'warn' | 'strict';

function enforcementMode(): EnforcementMode {
  const raw = (process.env.TENANT_ENFORCEMENT ?? 'warn').toLowerCase();
  return raw === 'strict' || raw === 'off' ? raw : 'warn';
}

const READ_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);
const WHERE_WRITE_OPS = new Set([
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);
const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

/** One warn per (model, op) per process — enough signal without log floods. */
const warned = new Set<string>();

interface QueryArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
  [key: string]: unknown;
}

function hasExplicitOrg(args: QueryArgs): boolean {
  // Top-level where.organizationId, or a composite-unique key of THIS model
  // that embeds it (all our org composites start with organizationId_, e.g.
  // where.organizationId_slug.organizationId). Deliberately NOT any nested
  // object with an organizationId key — a relation filter like
  // where.user.organizationId must not disable scoping of the outer model.
  const whereOrg =
    args.where &&
    (args.where['organizationId'] !== undefined ||
      Object.entries(args.where).some(
        ([k, v]) =>
          k.startsWith('organizationId_') &&
          v !== null &&
          typeof v === 'object' &&
          (v as Record<string, unknown>)['organizationId'] !== undefined,
      ));
  const dataOrg =
    args.data !== undefined &&
    !Array.isArray(args.data) &&
    (args.data as Record<string, unknown>)['organizationId'] !== undefined;
  const createOrg = args.create && args.create['organizationId'] !== undefined;
  return Boolean(whereOrg || dataOrg || createOrg);
}

function stampCreateData(args: QueryArgs, organizationId: string): void {
  if (args.data !== undefined) {
    if (Array.isArray(args.data)) {
      for (const row of args.data) {
        if (row['organizationId'] === undefined) row['organizationId'] = organizationId;
      }
    } else if ((args.data as Record<string, unknown>)['organizationId'] === undefined) {
      (args.data as Record<string, unknown>)['organizationId'] = organizationId;
    }
  }
  // upsert's create side
  if (args.create && args.create['organizationId'] === undefined) {
    args.create['organizationId'] = organizationId;
  }
}

export const tenantExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const mode = enforcementMode();
          if (mode === 'off' || !model || !SCOPED_MODELS.has(model)) {
            return query(args);
          }
          if (isTenantBypassed()) {
            return query(args);
          }

          const tenantId = getCurrentTenantId();
          const typedArgs = (args ?? {}) as QueryArgs;

          if (!tenantId) {
            // Explicitly org-filtered queries are fine without ALS context
            // (auth/CASL run before the interceptor).
            if (hasExplicitOrg(typedArgs)) {
              return query(args);
            }
            if (mode === 'strict') {
              throw new TenantContextMissingError(model, operation);
            }
            const key = `${model}.${operation}`;
            if (!warned.has(key)) {
              warned.add(key);
              logger.warn(
                `No tenant context for ${key} — running unfiltered (TENANT_ENFORCEMENT=warn)`,
              );
            }
            return query(args);
          }

          // Reads + where-based writes: scope the where clause. Prisma's
          // extended where-unique accepts extra non-unique fields, so this is
          // valid for findUnique/update/delete/upsert too.
          if (READ_OPS.has(operation) || WHERE_WRITE_OPS.has(operation)) {
            typedArgs.where = typedArgs.where ?? {};
            if (typedArgs.where['organizationId'] === undefined) {
              typedArgs.where['organizationId'] = tenantId;
            }
          }

          // Creates: stamp the tenant on the new row(s).
          if (CREATE_OPS.has(operation)) {
            stampCreateData(typedArgs, tenantId);
          }

          return query(typedArgs as typeof args);
        },
      },
    },
  }),
);
