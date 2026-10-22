import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

import { ROLE_DEFINITIONS, slugifyOrgName } from '../modules/roles/role-definitions';

/**
 * Production bootstrap seed — idempotent, non-destructive.
 *
 * Multi-tenant: everything is seeded PER ORGANIZATION. The default org comes
 * first (SEED_ORG_NAME, default "Acadeea" → slug "acadeea"), then its role
 * set, admin user and system categories are attached to it.
 *
 * Seeds only what the app cannot run without:
 *   1. Default organization row — ONLY if missing (SEED_ORG_NAME / SEED_ORG_SLUG)
 *   2. System roles + permissions for that org (dynamic RBAC)
 *   3. Initial admin user — ONLY if the org has no administrator, from env:
 *        SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 *        (optional: SEED_ADMIN_FIRST_NAME, SEED_ADMIN_LAST_NAME)
 *
 * It never deletes data and never overwrites existing users, recipes,
 * categories, locations, orders or stock.
 */

const prisma = new PrismaClient();

// ============================================================================
// Main
// ============================================================================

/** Creates the default organization row if missing. Returns its id. */
async function seedOrganization(): Promise<string> {
  console.log('--- Organization ---');
  // Concurrent double-seed once produced two rows (6ms apart) and every
  // findFirst read a random one — dedupe defensively: keep the oldest.
  const all = await prisma.organization.findMany({ orderBy: { createdAt: 'asc' } });
  if (all.length > 1) {
    const extras = all.slice(1).map((o) => o.id);
    // RESTRICT FKs make this fail if a duplicate ever acquired data — fine.
    try {
      await prisma.organization.deleteMany({ where: { id: { in: extras } } });
      console.log(`  Removed ${extras.length} duplicate organization row(s)`);
    } catch {
      console.warn('  Duplicate organization rows exist but carry data — left untouched.');
    }
  }
  const existing = all[0] ?? null;
  if (existing) {
    console.log(`  Organization already exists: ${existing.name} (${existing.slug}). Skipping.`);
    return existing.id;
  }
  const name = process.env.SEED_ORG_NAME ?? 'Acadeea';
  const slug = process.env.SEED_ORG_SLUG ?? slugifyOrgName(name);
  const org = await prisma.organization.create({ data: { name, slug } });
  console.log(`  Created organization: ${org.name} (slug: ${org.slug})`);
  return org.id;
}

async function seedRoles(organizationId: string): Promise<Record<string, string>> {
  console.log('\n--- Roles ---');
  const roleIds: Record<string, string> = {}; // slug → id

  for (const r of ROLE_DEFINITIONS) {
    // Re-create permissions on every run so they stay in sync with the definitions
    const existing = await prisma.role.findFirst({
      where: { organizationId, slug: r.slug },
    });
    if (existing) {
      await prisma.rolePermission.deleteMany({ where: { roleId: existing.id } });
    }

    const role = await prisma.role.upsert({
      where: { organizationId_slug: { organizationId, slug: r.slug } },
      update: {
        name: r.name,
        isSystem: r.isSystem,
        description: r.description,
        permissions: { create: r.permissions },
      },
      create: {
        organizationId,
        name: r.name,
        slug: r.slug,
        isSystem: r.isSystem,
        description: r.description,
        permissions: { create: r.permissions },
      },
    });
    roleIds[r.slug] = role.id;
    console.log(`  Upserted role: ${r.name} (${r.slug}) — ${r.permissions.length} permissions`);
  }

  return roleIds;
}

/** One-time migration: users/invitations still on the legacy enum get a roleId. */
async function migrateLegacyRoles(organizationId: string, roleIds: Record<string, string>) {
  console.log('\n--- Migrating legacy enum roles ---');
  for (const r of ROLE_DEFINITIONS) {
    if (!r.legacyEnum) continue;

    const users = await prisma.user.updateMany({
      where: { organizationId, role: r.legacyEnum, roleId: null },
      data: { roleId: roleIds[r.slug] },
    });
    if (users.count > 0) console.log(`  Migrated ${users.count} ${r.legacyEnum} users → ${r.slug}`);

    const invitations = await prisma.userInvitation.updateMany({
      where: { organizationId, role: r.legacyEnum, roleId: null },
      data: { roleId: roleIds[r.slug] },
    });
    if (invitations.count > 0) {
      console.log(`  Migrated ${invitations.count} ${r.legacyEnum} invitations → ${r.slug}`);
    }
  }
}

/** Creates the initial admin from env vars — only when the org has no administrator. */
async function seedAdminUser(organizationId: string, roleIds: Record<string, string>) {
  console.log('\n--- Admin user ---');

  const adminExists = await prisma.user.findFirst({
    where: {
      organizationId,
      OR: [{ roleId: roleIds['administrator'] }, { role: UserRole.ADMINISTRATOR }],
    },
  });
  if (adminExists) {
    console.log('  Administrator already exists. Skipping.');
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn(
      '  WARNING: no administrator in database and SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set.\n' +
        '  Set both env vars and re-run the seed to create the initial admin.',
    );
    return;
  }

  const passwordHash = await argon2.hash(password);
  const admin = await prisma.user.create({
    data: {
      organizationId,
      email,
      passwordHash,
      firstName: process.env.SEED_ADMIN_FIRST_NAME ?? 'Admin',
      lastName: process.env.SEED_ADMIN_LAST_NAME ?? 'Horae',
      role: UserRole.ADMINISTRATOR,
      roleId: roleIds['administrator'],
      isActive: true,
    },
  });
  console.log(`  Created initial admin: ${admin.email}`);
}

async function seedSystemCategories(organizationId: string) {
  console.log('\n--- System categories ---');
  await prisma.recipeCategoryConfig.upsert({
    where: {
      organizationId_name_kind: { organizationId, name: 'Materii prime', kind: 'MATERIE_PRIMA' },
    },
    update: { isSystem: true },
    create: {
      organizationId,
      name: 'Materii prime',
      kind: 'MATERIE_PRIMA',
      isSystem: true,
      sortOrder: 0,
    },
  });
  console.log('  Ensured system product category: Materii prime');
}

async function main() {
  console.log('Bootstrap seed (idempotent, non-destructive)...\n');

  const organizationId = await seedOrganization();
  const roleIds = await seedRoles(organizationId);
  await migrateLegacyRoles(organizationId, roleIds);
  await seedAdminUser(organizationId, roleIds);
  await seedSystemCategories(organizationId);

  console.log('\nSeeding complete!');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
