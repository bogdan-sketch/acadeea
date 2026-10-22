/**
 * Per-spec tenant fixture: a brand-new organization provisioned the same way
 * OrganizationsAdminService does it (ROLE_DEFINITIONS cloned, "Materii prime"
 * system category, standard unit conversions), plus one user per standard
 * role. Every run uses a random suffix, so specs never share data and the
 * database never needs a reset between runs.
 */
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { UserRole } from '@prisma/client';

import { ROLE_DEFINITIONS } from '../../src/modules/roles/role-definitions';
import { AuthService } from '../../src/modules/auth/auth.service';
import { UnitConversionsService } from '../../src/modules/unit-conversions/unit-conversions.service';
import { runAsOrg, runWithoutTenant } from '../../src/prisma/tenant-context';
import { TestApp } from './app';

export const PASSWORD = 'E2e-Passw0rd!';

export type RoleSlug = 'administrator' | 'user' | 'sef-cofetar' | 'cofetar' | 'gestionar' | 'sofer';
export const ROLE_SLUGS: RoleSlug[] = [
  'administrator',
  'user',
  'sef-cofetar',
  'cofetar',
  'gestionar',
  'sofer',
];

const LEGACY: Record<RoleSlug, UserRole> = {
  administrator: UserRole.ADMINISTRATOR,
  user: UserRole.AJUTOR_COFETAR,
  'sef-cofetar': UserRole.SEF_LABORATOR,
  cofetar: UserRole.COFETAR,
  gestionar: UserRole.MAGAZIONER,
  sofer: UserRole.AJUTOR_COFETAR,
};

export interface TestUser {
  id: string;
  email: string;
  role: RoleSlug;
  token: string;
  refreshToken: string;
}

export interface TestOrg {
  id: string;
  slug: string;
  name: string;
  roleIds: Record<RoleSlug, string>;
  users: Record<RoleSlug, TestUser>;
  /** Authorization header for a role (default administrator). */
  as: (role?: RoleSlug) => { Authorization: string };
}

export function uid(n = 6): string {
  return randomBytes(n).toString('hex').slice(0, n);
}

export async function createOrg(t: TestApp, label = 'e2e'): Promise<TestOrg> {
  const suffix = uid(8);
  const slug = `${label}-${suffix}`.toLowerCase();
  const name = `E2E ${label} ${suffix}`;
  const prisma = t.prisma;
  const conversions = t.app.get(UnitConversionsService);
  const hash = await argon2.hash(PASSWORD);

  const org = await runWithoutTenant(async () =>
    prisma.organization.create({ data: { name, slug } }),
  );
  const roleIds = {} as Record<RoleSlug, string>;
  const userRows = {} as Record<RoleSlug, { id: string; email: string }>;

  await runAsOrg(org.id, async () => {
    for (const r of ROLE_DEFINITIONS) {
      const role = await prisma.role.create({
        data: {
          organizationId: org.id,
          name: r.name,
          slug: r.slug,
          isSystem: r.isSystem,
          description: r.description,
          permissions: { create: r.permissions },
        },
      });
      roleIds[r.slug as RoleSlug] = role.id;
    }
    await prisma.recipeCategoryConfig.create({
      data: {
        organizationId: org.id,
        name: 'Materii prime',
        kind: 'MATERIE_PRIMA',
        isSystem: true,
        sortOrder: 0,
      },
    });
    for (const slugR of ROLE_SLUGS) {
      const email = `${slugR}-${suffix}@e2e.horae.test`;
      const u = await prisma.user.create({
        data: {
          organizationId: org.id,
          email,
          passwordHash: hash,
          firstName: slugR,
          lastName: 'E2E',
          role: LEGACY[slugR],
          roleId: roleIds[slugR],
          isActive: true,
        },
      });
      userRows[slugR] = { id: u.id, email };
    }
  });
  await conversions.seedStandardConversions(org.id);

  // Tokens minted through AuthService.login (the same code path as
  // POST /auth/login) — avoids burning the 10/min login throttle.
  const auth = t.app.get(AuthService);
  const users = {} as Record<RoleSlug, TestUser>;
  for (const slugR of ROLE_SLUGS) {
    const res = await auth.login(userRows[slugR].email, PASSWORD);
    users[slugR] = {
      ...userRows[slugR],
      role: slugR,
      token: res.accessToken,
      refreshToken: res.refreshToken,
    };
  }

  return {
    id: org.id,
    slug,
    name,
    roleIds,
    users,
    as: (role: RoleSlug = 'administrator') => ({ Authorization: `Bearer ${users[role].token}` }),
  };
}
