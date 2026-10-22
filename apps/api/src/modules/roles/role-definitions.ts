import { UserRole } from '@prisma/client';

/**
 * The standard role set every organization starts with. Single source of
 * truth — consumed by the bootstrap seed (src/prisma/seed.ts) and by the
 * organizations admin service when a new organization is created (the set is
 * cloned into that org's own Role rows; roles are per-organization).
 */

export interface SeedRole {
  name: string;
  slug: string;
  isSystem: boolean;
  description?: string;
  legacyEnum?: UserRole;
  permissions: { action: string; subject: string }[];
}

/**
 * 5-level role hierarchy:
 * Admin (5) → Sef Cofetar (4) → Cofetar (3) → Gestionar (2) → Sofer (1)
 */
export const ROLE_DEFINITIONS: SeedRole[] = [
  {
    name: 'Administrator',
    slug: 'administrator',
    isSystem: true,
    description: 'Acces total — rol de sistem (nivel 5)',
    legacyEnum: UserRole.ADMINISTRATOR,
    permissions: [{ action: 'manage', subject: 'all' }],
  },
  {
    name: 'User',
    slug: 'user',
    isSystem: true,
    description: 'Rol implicit — acces minim',
    permissions: [{ action: 'read', subject: 'Task' }],
  },
  {
    name: 'Sef Cofetar',
    slug: 'sef-cofetar',
    isSystem: false,
    description: 'Sef cofetar — retete, taskuri, comenzi, stocuri, transferuri (nivel 4)',
    legacyEnum: UserRole.SEF_LABORATOR,
    permissions: [
      // Recipes: view (only Admin edits)
      { action: 'read', subject: 'Recipe' },
      // Recipe production cost visibility (admin-managed per role)
      { action: 'read', subject: 'RecipeCost' },
      // Tasks: full management (create, assign — incl. to self, quantities, execute)
      { action: 'manage', subject: 'Task' },
      // Orders: view + edit
      { action: 'read', subject: 'Order' },
      { action: 'create', subject: 'Order' },
      { action: 'update', subject: 'Order' },
      { action: 'read', subject: 'OrderItem' },
      // Stocks: CRUD
      { action: 'read', subject: 'RawMaterial' },
      { action: 'create', subject: 'RawMaterial' },
      { action: 'update', subject: 'RawMaterial' },
      { action: 'read', subject: 'Consumable' },
      { action: 'create', subject: 'Consumable' },
      { action: 'update', subject: 'Consumable' },
      { action: 'read', subject: 'StockMovement' },
      { action: 'create', subject: 'StockMovement' },
      { action: 'read', subject: 'StockReservation' },
      { action: 'read', subject: 'Location' },
      // Transfers + delivery docs
      { action: 'read', subject: 'StockTransfer' },
      { action: 'create', subject: 'StockTransfer' },
      { action: 'update', subject: 'StockTransfer' },
      { action: 'read', subject: 'DeliveryNote' },
      { action: 'create', subject: 'DeliveryNote' },
    ],
  },
  {
    name: 'Cofetar',
    slug: 'cofetar',
    isSystem: false,
    description:
      'Cofetar — execute taskuri, stocuri, transferuri (nivel 3). Reteta vizibila doar din task activ.',
    legacyEnum: UserRole.COFETAR,
    permissions: [
      // NO read Recipe — recipe visible only from active task (enforced in service)
      // Tasks: read + update (execute a task; no create/delete = does not
      // originate/assign new tasks)
      { action: 'read', subject: 'Task' },
      { action: 'update', subject: 'Task' },
      // Orders: view + edit (same as sef-cofetar, minus task assignment/recipes)
      { action: 'read', subject: 'Order' },
      { action: 'create', subject: 'Order' },
      { action: 'update', subject: 'Order' },
      { action: 'read', subject: 'OrderItem' },
      // Stocks: CRUD
      { action: 'read', subject: 'RawMaterial' },
      { action: 'create', subject: 'RawMaterial' },
      { action: 'update', subject: 'RawMaterial' },
      { action: 'read', subject: 'Consumable' },
      { action: 'create', subject: 'Consumable' },
      { action: 'update', subject: 'Consumable' },
      { action: 'read', subject: 'StockMovement' },
      { action: 'create', subject: 'StockMovement' },
      { action: 'read', subject: 'Location' },
      // Transfers + delivery docs
      { action: 'read', subject: 'StockTransfer' },
      { action: 'create', subject: 'StockTransfer' },
      { action: 'update', subject: 'StockTransfer' },
      { action: 'read', subject: 'DeliveryNote' },
      { action: 'create', subject: 'DeliveryNote' },
    ],
  },
  {
    name: 'Gestionar',
    slug: 'gestionar',
    isSystem: false,
    description: 'Gestionar — stocuri, transferuri, livrari (nivel 2)',
    legacyEnum: UserRole.MAGAZIONER,
    permissions: [
      // Stocks: CRUD
      { action: 'read', subject: 'RawMaterial' },
      { action: 'create', subject: 'RawMaterial' },
      { action: 'update', subject: 'RawMaterial' },
      { action: 'read', subject: 'Consumable' },
      { action: 'create', subject: 'Consumable' },
      { action: 'update', subject: 'Consumable' },
      { action: 'read', subject: 'StockMovement' },
      { action: 'create', subject: 'StockMovement' },
      { action: 'read', subject: 'Location' },
      // Transfers + delivery docs
      { action: 'read', subject: 'StockTransfer' },
      { action: 'create', subject: 'StockTransfer' },
      { action: 'update', subject: 'StockTransfer' },
      { action: 'read', subject: 'DeliveryNote' },
      { action: 'create', subject: 'DeliveryNote' },
    ],
  },
  {
    name: 'Sofer',
    slug: 'sofer',
    isSystem: false,
    description: 'Sofer — transferuri, foaie drum, certificat conformitate (nivel 1)',
    permissions: [
      // Transfers + delivery docs only
      { action: 'read', subject: 'StockTransfer' },
      { action: 'create', subject: 'StockTransfer' },
      { action: 'update', subject: 'StockTransfer' },
      { action: 'read', subject: 'DeliveryNote' },
      { action: 'create', subject: 'DeliveryNote' },
      { action: 'read', subject: 'Location' },
    ],
  },
];

/** Subdomain labels that can never be used as organization slugs. */
export const RESERVED_ORG_SLUGS = ['www', 'api', 'app', 'test', 'admin', 'mail', 'status'];

/** Slugify an organization name the same way everywhere. */
export function slugifyOrgName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
