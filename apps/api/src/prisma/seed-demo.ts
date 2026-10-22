import {
  LocationType,
  OrderStatus,
  PrismaClient,
  RecipeType,
  StorageType,
  TaskStatus,
  UnitType,
  UserRole,
} from '@prisma/client';
import * as argon2 from 'argon2';

import { ROLE_DEFINITIONS, SeedRole } from '../modules/roles/role-definitions';

/**
 * Demo organization seed — idempotent, non-destructive.
 *
 * Creates the public demo tenant (demo.horae.ca) that portfolio visitors log
 * into: org "Demo" (slug `demo`), the standard role set PLUS a read-mostly
 * "demo-vizitator" role (read everything + update Task so visitors can advance
 * a production task), a demo user, and a small but realistic Romanian
 * confectionery data set (materials with FIFO lots, recipes, production tasks
 * in every interesting status, one order).
 *
 * Credentials: demo@horae.ca / SEED_DEMO_PASSWORD (default "HoraeDemo2026!").
 *
 * Safe to re-run: every step checks for existing rows first and never deletes
 * or overwrites data (role permissions are re-synced like in seed.ts).
 */

const prisma = new PrismaClient();

const DEMO_ORG_NAME = 'Demo';
const DEMO_ORG_SLUG = 'demo';
const DEMO_USER_EMAIL = 'demo@horae.ca';
const DEMO_ROLE_SLUG = 'demo-vizitator';

// ============================================================================
// Organization
// ============================================================================

async function seedDemoOrganization(): Promise<string> {
  console.log('--- Demo organization ---');
  const existing = await prisma.organization.findUnique({ where: { slug: DEMO_ORG_SLUG } });
  if (existing) {
    console.log(`  Organization already exists: ${existing.name} (${existing.slug}). Skipping.`);
    return existing.id;
  }
  const org = await prisma.organization.create({
    data: { name: DEMO_ORG_NAME, slug: DEMO_ORG_SLUG },
  });
  console.log(`  Created organization: ${org.name} (slug: ${org.slug})`);
  return org.id;
}

// ============================================================================
// Roles — standard set + the visitor role
// ============================================================================

/** The visitor role: read on every subject the standard roles know + update Task. */
function buildVisitorRole(): SeedRole {
  const subjects = new Set<string>();
  for (const role of ROLE_DEFINITIONS) {
    for (const permission of role.permissions) {
      if (permission.subject !== 'all') subjects.add(permission.subject);
    }
  }
  return {
    name: 'Demo Vizitator',
    slug: DEMO_ROLE_SLUG,
    isSystem: false,
    description: 'Cont public de demonstratie — vede tot, poate doar avansa taskuri de productie',
    permissions: [
      ...[...subjects].sort().map((subject) => ({ action: 'read', subject })),
      { action: 'update', subject: 'Task' },
    ],
  };
}

async function seedDemoRoles(organizationId: string): Promise<Record<string, string>> {
  console.log('\n--- Roles ---');
  const roleIds: Record<string, string> = {}; // slug → id

  for (const r of [...ROLE_DEFINITIONS, buildVisitorRole()]) {
    // Re-create permissions on every run so they stay in sync with the definitions
    const existing = await prisma.role.findFirst({ where: { organizationId, slug: r.slug } });
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

// ============================================================================
// Demo user
// ============================================================================

async function seedDemoUser(
  organizationId: string,
  roleIds: Record<string, string>,
): Promise<string> {
  console.log('\n--- Demo user ---');

  const existing = await prisma.user.findUnique({ where: { email: DEMO_USER_EMAIL } });
  if (existing) {
    console.log(`  User already exists: ${existing.email}. Skipping.`);
    return existing.id;
  }

  const password = process.env.SEED_DEMO_PASSWORD ?? 'HoraeDemo2026!';
  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: {
      organizationId,
      email: DEMO_USER_EMAIL,
      passwordHash,
      firstName: 'Vizitator',
      lastName: 'Demo',
      role: UserRole.COFETAR, // legacy enum column (required); authz uses roleId
      roleId: roleIds[DEMO_ROLE_SLUG],
      isActive: true,
    },
  });
  console.log(`  Created demo user: ${user.email} (role: ${DEMO_ROLE_SLUG})`);
  return user.id;
}

// ============================================================================
// System categories (same as the bootstrap seed)
// ============================================================================

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

// ============================================================================
// Location
// ============================================================================

async function seedDemoLocation(organizationId: string): Promise<string> {
  console.log('\n--- Location ---');
  const location = await prisma.location.upsert({
    where: { organizationId_name: { organizationId, name: 'Laborator Central' } },
    update: {},
    create: {
      organizationId,
      name: 'Laborator Central',
      type: LocationType.LABORATOR,
      address: 'Str. Cofetarilor 12, Cluj-Napoca',
      isActive: true,
    },
  });
  console.log(`  Ensured location: ${location.name}`);
  return location.id;
}

// ============================================================================
// Raw materials + FIFO stock lots
// ============================================================================

interface DemoMaterial {
  title: string;
  unit: UnitType;
  storageType: StorageType;
  stockCount: number; // total, in stock units — split across the two lots
  minimumStock: number;
  purchasePrice: number; // RON per commercial unit (RON/kg for mass)
  lotPrefix: string;
}

const DEMO_MATERIALS: DemoMaterial[] = [
  {
    title: 'Făină albă 000',
    unit: UnitType.GRAME,
    storageType: StorageType.WARM,
    stockCount: 25000,
    minimumStock: 5000,
    purchasePrice: 3.5,
    lotPrefix: 'FA',
  },
  {
    title: 'Unt 82% grăsime',
    unit: UnitType.GRAME,
    storageType: StorageType.COLD,
    stockCount: 8000,
    minimumStock: 2000,
    purchasePrice: 32,
    lotPrefix: 'UNT',
  },
  {
    title: 'Ciocolată neagră 54%',
    unit: UnitType.GRAME,
    storageType: StorageType.WARM,
    stockCount: 12000,
    minimumStock: 3000,
    purchasePrice: 45,
    lotPrefix: 'CIO',
  },
];

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function seedDemoMaterials(
  organizationId: string,
  locationId: string,
): Promise<Record<string, string>> {
  console.log('\n--- Raw materials + FIFO lots ---');
  const materialIds: Record<string, string> = {}; // title → id

  for (const m of DEMO_MATERIALS) {
    const existing = await prisma.rawMaterial.findFirst({
      where: { organizationId, title: m.title },
    });
    if (existing) {
      console.log(`  Raw material already exists: ${m.title}. Skipping.`);
      materialIds[m.title] = existing.id;
      continue;
    }

    // Two intake lots per material (FIFO): an older one expiring sooner and a
    // fresher one expiring later, together covering the full stock count.
    const olderQty = Math.round(m.stockCount * 0.4);
    const newerQty = m.stockCount - olderQty;

    const material = await prisma.rawMaterial.create({
      data: {
        organizationId,
        title: m.title,
        unit: m.unit,
        storageType: m.storageType,
        stockCount: m.stockCount,
        minimumStock: m.minimumStock,
        purchasePrice: m.purchasePrice,
        lots: {
          create: [
            {
              lotNumber: `LOT-${m.lotPrefix}-001`,
              quantity: olderQty,
              remainingQuantity: olderQty,
              expiryDate: daysFromNow(45),
              purchasePrice: m.purchasePrice,
              supplier: 'Distribuitor Demo SRL',
              supplierInvoice: `FD-2026-${m.lotPrefix}-1`,
              receivedAt: daysFromNow(-30),
            },
            {
              lotNumber: `LOT-${m.lotPrefix}-002`,
              quantity: newerQty,
              remainingQuantity: newerQty,
              expiryDate: daysFromNow(180),
              purchasePrice: m.purchasePrice,
              supplier: 'Distribuitor Demo SRL',
              supplierInvoice: `FD-2026-${m.lotPrefix}-2`,
              receivedAt: daysFromNow(-7),
            },
          ],
        },
        materialStocks: {
          create: [{ organizationId, locationId, quantity: m.stockCount }],
        },
      },
    });
    materialIds[m.title] = material.id;
    console.log(`  Created raw material: ${m.title} (${m.stockCount} ${m.unit}, 2 lots)`);
  }

  return materialIds;
}

// ============================================================================
// Recipes
// ============================================================================

interface DemoRecipe {
  name: string;
  unit: UnitType;
  yieldQuantity: number;
  sellingPrice: number;
  ingredients: { material: string; quantity: number }[]; // quantities in GRAME
}

const DEMO_RECIPES: DemoRecipe[] = [
  {
    name: 'Tort de ciocolată',
    unit: UnitType.BUCATI,
    yieldQuantity: 1,
    sellingPrice: 180,
    ingredients: [
      { material: 'Făină albă 000', quantity: 300 },
      { material: 'Unt 82% grăsime', quantity: 200 },
      { material: 'Ciocolată neagră 54%', quantity: 250 },
    ],
  },
  {
    name: 'Ecler cu ciocolată',
    unit: UnitType.BUCATI,
    yieldQuantity: 20,
    sellingPrice: 12,
    ingredients: [
      { material: 'Făină albă 000', quantity: 250 },
      { material: 'Unt 82% grăsime', quantity: 150 },
      { material: 'Ciocolată neagră 54%', quantity: 100 },
    ],
  },
  {
    name: 'Cozonac de casă',
    unit: UnitType.BUCATI,
    yieldQuantity: 2,
    sellingPrice: 55,
    ingredients: [
      { material: 'Făină albă 000', quantity: 1000 },
      { material: 'Unt 82% grăsime', quantity: 250 },
    ],
  },
];

async function seedDemoRecipes(
  organizationId: string,
  createdById: string,
  materialIds: Record<string, string>,
): Promise<Record<string, string>> {
  console.log('\n--- Recipes ---');
  const recipeIds: Record<string, string> = {}; // name → id

  for (const r of DEMO_RECIPES) {
    const existing = await prisma.recipe.findFirst({ where: { organizationId, name: r.name } });
    if (existing) {
      console.log(`  Recipe already exists: ${r.name}. Skipping.`);
      recipeIds[r.name] = existing.id;
      continue;
    }

    const recipe = await prisma.recipe.create({
      data: {
        organizationId,
        name: r.name,
        type: RecipeType.FINAL,
        unit: r.unit,
        yieldQuantity: r.yieldQuantity,
        sellingPrice: r.sellingPrice,
        createdById,
        components: {
          create: [
            {
              name: 'Compoziție',
              sortOrder: 0,
              ingredients: {
                create: r.ingredients.map((ing, index) => ({
                  rawMaterialId: materialIds[ing.material],
                  name: ing.material,
                  quantity: ing.quantity,
                  unit: UnitType.GRAME,
                  sortOrder: index,
                })),
              },
            },
          ],
        },
      },
    });
    recipeIds[r.name] = recipe.id;
    console.log(`  Created recipe: ${r.name} (${r.ingredients.length} ingredients)`);
  }

  return recipeIds;
}

// ============================================================================
// Production tasks (one per interesting status)
// ============================================================================

async function seedDemoTasks(
  organizationId: string,
  userId: string,
  locationId: string,
  recipeIds: Record<string, string>,
) {
  console.log('\n--- Production tasks ---');

  const tasks: {
    recipe: string;
    status: TaskStatus;
    targetQuantity: number;
    startedAt?: Date;
    completedAt?: Date;
    actualYield?: number;
    notes: string;
  }[] = [
    {
      recipe: 'Tort de ciocolată',
      status: TaskStatus.DE_FACUT,
      targetQuantity: 2,
      notes: 'Comandă pentru eveniment — de început mâine dimineață.',
    },
    {
      recipe: 'Ecler cu ciocolată',
      status: TaskStatus.IN_LUCRU,
      targetQuantity: 40,
      startedAt: daysFromNow(-0.1),
      notes: 'Lot dublu pentru vitrină.',
    },
    {
      recipe: 'Cozonac de casă',
      status: TaskStatus.FINALIZAT,
      targetQuantity: 2,
      startedAt: daysFromNow(-1),
      completedAt: daysFromNow(-0.9),
      actualYield: 2,
      notes: 'Producție finalizată ieri.',
    },
  ];

  for (const t of tasks) {
    const recipeId = recipeIds[t.recipe];
    if (!recipeId) {
      console.log(`  Recipe missing for task: ${t.recipe}. Skipping.`);
      continue;
    }
    const existing = await prisma.task.findFirst({ where: { organizationId, recipeId } });
    if (existing) {
      console.log(`  Task already exists for recipe: ${t.recipe}. Skipping.`);
      continue;
    }

    // Status history mirrors the path to the task's current status.
    const statusPath: TaskStatus[] = {
      [TaskStatus.DE_FACUT]: [TaskStatus.DE_FACUT],
      [TaskStatus.IN_LUCRU]: [TaskStatus.DE_FACUT, TaskStatus.IN_LUCRU],
      [TaskStatus.FINALIZAT]: [TaskStatus.DE_FACUT, TaskStatus.IN_LUCRU, TaskStatus.FINALIZAT],
      [TaskStatus.BLOCAT]: [TaskStatus.DE_FACUT, TaskStatus.BLOCAT],
      [TaskStatus.ANULAT]: [TaskStatus.DE_FACUT, TaskStatus.ANULAT],
    }[t.status];

    await prisma.task.create({
      data: {
        organizationId,
        recipeId,
        locationId,
        status: t.status,
        targetQuantity: t.targetQuantity,
        targetUnit: UnitType.BUCATI,
        plannedDate: t.status === TaskStatus.DE_FACUT ? daysFromNow(1) : undefined,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
        actualYield: t.actualYield,
        notes: t.notes,
        createdById: userId,
        assignedToId: userId,
        statusHistory: {
          create: statusPath.map((toStatus, index) => ({
            fromStatus: index === 0 ? null : statusPath[index - 1],
            toStatus,
            changedById: userId,
          })),
        },
      },
    });
    console.log(`  Created task: ${t.recipe} × ${t.targetQuantity} (${t.status})`);
  }
}

// ============================================================================
// Order
// ============================================================================

async function seedDemoOrder(
  organizationId: string,
  userId: string,
  recipeIds: Record<string, string>,
) {
  console.log('\n--- Order ---');

  const orderNumber = 'DEMO-0001';
  const existing = await prisma.order.findUnique({
    where: { organizationId_orderNumber: { organizationId, orderNumber } },
  });
  if (existing) {
    console.log(`  Order already exists: ${orderNumber}. Skipping.`);
    return;
  }

  const tortId = recipeIds['Tort de ciocolată'];
  const eclerId = recipeIds['Ecler cu ciocolată'];
  if (!tortId || !eclerId) {
    console.log('  Order recipes missing. Skipping order.');
    return;
  }

  await prisma.order.create({
    data: {
      organizationId,
      orderNumber,
      status: OrderStatus.NOUA,
      deliveryPoint: 'Cofetăria Demo — Centru',
      deliveryAddress: 'Piața Unirii 1, Cluj-Napoca',
      notes: 'Comandă demo pentru vizitatori.',
      createdById: userId,
      dueDate: daysFromNow(3),
      items: {
        create: [
          {
            recipeId: tortId,
            quantity: 1,
            unit: UnitType.BUCATI,
          },
          {
            recipeId: eclerId,
            quantity: 20,
            unit: UnitType.BUCATI,
          },
        ],
      },
    },
  });
  console.log(`  Created order: ${orderNumber} (2 items)`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('Demo organization seed (idempotent, non-destructive)...\n');

  const organizationId = await seedDemoOrganization();
  const roleIds = await seedDemoRoles(organizationId);
  const userId = await seedDemoUser(organizationId, roleIds);
  await seedSystemCategories(organizationId);
  const locationId = await seedDemoLocation(organizationId);
  const materialIds = await seedDemoMaterials(organizationId, locationId);
  const recipeIds = await seedDemoRecipes(organizationId, userId, materialIds);
  await seedDemoTasks(organizationId, userId, locationId, recipeIds);
  await seedDemoOrder(organizationId, userId, recipeIds);

  console.log('\nDemo seeding complete!');
  console.log(`  Login: ${DEMO_USER_EMAIL} @ ${DEMO_ORG_SLUG} (password from SEED_DEMO_PASSWORD)`);
}

main()
  .catch((error) => {
    console.error('Demo seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
