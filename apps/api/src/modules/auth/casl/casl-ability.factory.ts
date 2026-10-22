import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';

import { PrismaService } from '@/prisma/prisma.service';

// Re-declare subject types as string literals to avoid coupling to Prisma
// model classes. Guards and decorators reference these same literals.
type Subjects =
  | 'User'
  | 'RawMaterial'
  | 'Consumable'
  | 'Recipe'
  | 'RecipeCost'
  | 'Task'
  | 'StockMovement'
  | 'StockReservation'
  | 'UserInvitation'
  | 'Order'
  | 'OrderItem'
  | 'DeliveryNote'
  | 'Location'
  | 'StockTransfer'
  | 'Organization'
  | 'Role'
  | 'all';

type Actions = 'manage' | 'create' | 'read' | 'update' | 'delete';

export type AppAbility = MongoAbility<[Actions, Subjects]>;

export interface CaslUser {
  id: string;
  role: string; // role slug (was UserRole enum)
  /// Tenant the user belongs to — role slugs are only unique per organization.
  organizationId?: string;
}

/** Cache entry for a role's CASL ability. */
interface CacheEntry {
  ability: AppAbility;
  expiresAt: number;
}

/** Cache TTL in milliseconds (60 seconds). */
const CACHE_TTL_MS = 60_000;

@Injectable()
export class CaslAbilityFactory {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a CASL Ability instance for the given user.
   *
   * Fetches permissions from the database with a 60-second in-memory cache.
   * Administrator role short-circuits to `can('manage', 'all')`.
   */
  async createForUser(user: CaslUser): Promise<AppAbility> {
    const slug = user.role;

    // Admin short-circuit — no DB query needed
    if (slug === 'administrator') {
      const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
      can('manage', 'all');
      return build();
    }

    // Role slugs are per-organization — cache and lookup must be org-scoped.
    // Guards run BEFORE the TenantInterceptor establishes the tenant context,
    // so the organizationId filter here is explicit, not injected.
    const cacheKey = `${user.organizationId ?? 'global'}:${slug}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ability;
    }

    // Fetch from DB
    const role = await this.prisma.role.findFirst({
      where: { slug, ...(user.organizationId ? { organizationId: user.organizationId } : {}) },
      include: { permissions: { select: { action: true, subject: true } } },
    });

    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    if (role) {
      for (const perm of role.permissions) {
        can(perm.action as Actions, perm.subject as Subjects);
      }
    }
    // Unknown role → no permissions

    const ability = build();

    // Store in cache
    this.cache.set(cacheKey, { ability, expiresAt: Date.now() + CACHE_TTL_MS });

    return ability;
  }

  /**
   * Clear cached abilities for a specific role slug (across all orgs), or all
   * if none specified. Called by RolesService when permissions change.
   */
  clearCache(slug?: string): void {
    if (slug) {
      for (const key of this.cache.keys()) {
        if (key.endsWith(`:${slug}`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}
