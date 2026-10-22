import { Prisma } from '@prisma/client';

/**
 * Registry of every model captured in an org snapshot (logical JSON dump of
 * one organization's data — see BackupsService).
 *
 * The array is in FK-safe INSERT ORDER: every model appears AFTER all models
 * it references. Restore deletes in the exact REVERSE order (children first)
 * and re-inserts in this order, so the snapshot's original row ids can be
 * kept verbatim.
 *
 * Models WITHOUT a direct `organizationId` column are scoped through their
 * org-scoped parent (e.g. OrderItem via Order, RecipeIngredient via
 * RecipeComponent→Recipe, StockLot via RawMaterial/Consumable, LotConsumption
 * via Task) — the `where` builder encodes that path explicitly so snapshots
 * never rely on the AsyncLocalStorage tenant context being present.
 *
 * Deliberately EXCLUDED (auth/session plumbing — never dumped or restored):
 * RefreshToken, PasswordResetToken, AuthHandoffCode, DeviceToken,
 * PasswordHistory, UserAuthProvider. Also excluded: Organization (the tenant
 * row itself is never touched), OrgSnapshot (the backups themselves) and
 * DesignComment (global, not org-scoped).
 *
 * UserInvitation IS included even though the original spec list omitted it:
 * it is org-scoped and its `createdById`/`roleId` FKs would otherwise block
 * deleting users/roles during restore.
 */
export interface SnapshotModelDef {
  /** Prisma model name — key in the snapshot's `tables` map. */
  name: string;
  /** Prisma client delegate property (camelCase). */
  delegate: string;
  /** Explicit org-scoping where clause (direct column or via parent). */
  where: (organizationId: string) => Record<string, unknown>;
  /**
   * Self-referential FK column (e.g. Task.parentTaskId). Rows are inserted
   * level-by-level (parents first) so createMany chunking can never emit a
   * child before its parent.
   */
  selfRef?: string;
}

const byOrg = (organizationId: string) => ({ organizationId });

export const SNAPSHOT_MODELS: readonly SnapshotModelDef[] = [
  // ── Identity & access ────────────────────────────────────────────────
  { name: 'Role', delegate: 'role', where: byOrg },
  {
    name: 'RolePermission',
    delegate: 'rolePermission',
    where: (organizationId) => ({ role: { organizationId } }),
  },
  { name: 'User', delegate: 'user', where: byOrg }, // → Role
  { name: 'UserInvitation', delegate: 'userInvitation', where: byOrg }, // → Role, User
  { name: 'Location', delegate: 'location', where: byOrg },
  {
    name: 'UserLocation',
    delegate: 'userLocation',
    where: (organizationId) => ({ user: { organizationId } }),
  }, // → User, Location
  // ── Inventory foundations ────────────────────────────────────────────
  { name: 'Supplier', delegate: 'supplier', where: byOrg },
  { name: 'Consumable', delegate: 'consumable', where: byOrg },
  { name: 'RawMaterial', delegate: 'rawMaterial', where: byOrg }, // → Supplier
  { name: 'UnitConversion', delegate: 'unitConversion', where: byOrg }, // → RawMaterial
  { name: 'MaterialStock', delegate: 'materialStock', where: byOrg }, // → Location, RawMaterial
  {
    name: 'StockLot',
    delegate: 'stockLot',
    where: (organizationId) => ({
      OR: [{ rawMaterial: { organizationId } }, { consumable: { organizationId } }],
    }),
  }, // → RawMaterial | Consumable (XOR)
  // ── Categories ───────────────────────────────────────────────────────
  {
    name: 'RecipeCategoryConfig',
    delegate: 'recipeCategoryConfig',
    where: byOrg,
    selfRef: 'parentId',
  },
  { name: 'CategoryKindColor', delegate: 'categoryKindColor', where: byOrg },
  // ── Recipes ──────────────────────────────────────────────────────────
  { name: 'Recipe', delegate: 'recipe', where: byOrg, selfRef: 'sourceRecipeId' }, // → User
  {
    name: 'RecipeComponent',
    delegate: 'recipeComponent',
    where: (organizationId) => ({ recipe: { organizationId } }),
  }, // → Recipe
  {
    name: 'RecipeIngredient',
    delegate: 'recipeIngredient',
    where: (organizationId) => ({ component: { recipe: { organizationId } } }),
  }, // → RecipeComponent, RawMaterial, Recipe
  {
    name: 'RecipeVersion',
    delegate: 'recipeVersion',
    where: (organizationId) => ({ recipe: { organizationId } }),
  }, // → Recipe, User
  {
    name: 'RecipeStock',
    delegate: 'recipeStock',
    where: (organizationId) => ({ location: { organizationId } }),
  }, // → Location, Recipe
  { name: 'PriceHistory', delegate: 'priceHistory', where: byOrg }, // → RawMaterial, Consumable, Recipe, User
  // ── Production ───────────────────────────────────────────────────────
  { name: 'Task', delegate: 'task', where: byOrg, selfRef: 'parentTaskId' }, // → Recipe, Location, User
  {
    name: 'TaskStatusHistory',
    delegate: 'taskStatusHistory',
    where: (organizationId) => ({ task: { organizationId } }),
  }, // → Task, User
  { name: 'RecipeStockLot', delegate: 'recipeStockLot', where: byOrg }, // → Recipe, Location, Task
  {
    name: 'RecipeYieldHistory',
    delegate: 'recipeYieldHistory',
    where: (organizationId) => ({ recipe: { organizationId } }),
  }, // → Recipe, Task
  { name: 'StockMovement', delegate: 'stockMovement', where: byOrg }, // → RawMaterial, Consumable, Recipe, Task, Location, User
  { name: 'StockReservation', delegate: 'stockReservation', where: byOrg }, // → Task, RawMaterial, Consumable, Recipe, Location
  {
    name: 'LotConsumption',
    delegate: 'lotConsumption',
    where: (organizationId) => ({ task: { organizationId } }),
  }, // → Task, StockLot
  // ── Transfers ────────────────────────────────────────────────────────
  { name: 'StockTransfer', delegate: 'stockTransfer', where: byOrg }, // → Location, User
  {
    name: 'StockTransferItem',
    delegate: 'stockTransferItem',
    where: (organizationId) => ({ transfer: { organizationId } }),
  }, // → StockTransfer, RawMaterial, Recipe
  {
    name: 'TransferApproval',
    delegate: 'transferApproval',
    where: (organizationId) => ({ transfer: { organizationId } }),
  }, // → StockTransfer, User
  // ── Equipment ────────────────────────────────────────────────────────
  { name: 'Equipment', delegate: 'equipment', where: byOrg }, // → Location
  {
    name: 'EquipmentReservation',
    delegate: 'equipmentReservation',
    where: (organizationId) => ({ equipment: { organizationId } }),
  }, // → Equipment, Task
  {
    name: 'MaintenanceLog',
    delegate: 'maintenanceLog',
    where: (organizationId) => ({ equipment: { organizationId } }),
  }, // → Equipment, User
  // ── Orders & documents ───────────────────────────────────────────────
  { name: 'Order', delegate: 'order', where: byOrg }, // → User
  {
    name: 'OrderItem',
    delegate: 'orderItem',
    where: (organizationId) => ({ order: { organizationId } }),
  }, // → Order, Recipe
  {
    name: 'OrderStatusHistory',
    delegate: 'orderStatusHistory',
    where: (organizationId) => ({ order: { organizationId } }),
  }, // → Order, User
  { name: 'DeliveryNote', delegate: 'deliveryNote', where: byOrg }, // → Order
  { name: 'ConformityCertificate', delegate: 'conformityCertificate', where: byOrg }, // → DeliveryNote, User
  // ── Misc org data ────────────────────────────────────────────────────
  { name: 'Notification', delegate: 'notification', where: byOrg }, // → User
  // ── Integrations ─────────────────────────────────────────────────────
  { name: 'Integration', delegate: 'integration', where: byOrg },
  {
    name: 'ExternalOrderSource',
    delegate: 'externalOrderSource',
    where: (organizationId) => ({ integration: { organizationId } }),
  }, // → Integration, Order
  {
    name: 'ProductMapping',
    delegate: 'productMapping',
    where: (organizationId) => ({ integration: { organizationId } }),
  }, // → Integration, Recipe
  // ── Sales deductions (stock out from sales reports) ──────────────────
  { name: 'SalesDeduction', delegate: 'salesDeduction', where: byOrg }, // → Location, User
  {
    name: 'SalesDeductionLine',
    delegate: 'salesDeductionLine',
    where: (organizationId) => ({ salesDeduction: { organizationId } }),
  }, // → SalesDeduction, Recipe
  { name: 'SalesProductAlias', delegate: 'salesProductAlias', where: byOrg }, // → Recipe
  { name: 'DeliveryMethodAlias', delegate: 'deliveryMethodAlias', where: byOrg },
];

/**
 * Restore DELETE order — exact reverse of the insert order (children before
 * parents), minus User and Role which are synced (upsert + delete-missing)
 * instead of wiped, so that their auth side-tables (UserAuthProvider,
 * PasswordHistory, DeviceToken, …) survive for users that still exist.
 */
export const RESTORE_DELETE_ORDER: readonly SnapshotModelDef[] = [...SNAPSHOT_MODELS]
  .reverse()
  .filter((m) => m.name !== 'User' && m.name !== 'Role');

/** Insert phase for everything not handled by the Role/User sync. */
export const RESTORE_INSERT_ORDER: readonly SnapshotModelDef[] = SNAPSHOT_MODELS.filter(
  (m) => m.name !== 'User' && m.name !== 'Role' && m.name !== 'RolePermission',
);

// ---------------------------------------------------------------------------
// JSON (de)serialization — driven by the Prisma DMMF so Decimal/DateTime/
// Bytes/BigInt columns round-trip losslessly through the gzipped JSON dump.
// ---------------------------------------------------------------------------

interface FieldMeta {
  type: string;
  isList: boolean;
}

const FIELD_META: ReadonlyMap<string, ReadonlyMap<string, FieldMeta>> = new Map(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name,
    new Map(
      m.fields
        .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
        .map((f) => [f.name, { type: f.type, isList: f.isList }]),
    ),
  ]),
);

/** Prisma row → JSON-safe object (Decimal→string, Date→ISO, Bytes→base64). */
export function serializeRow(model: string, row: Record<string, unknown>): Record<string, unknown> {
  const meta = FIELD_META.get(model);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!meta?.has(key)) continue; // relations / unknown keys never serialized
    if (value === null || value === undefined) {
      out[key] = null;
      continue;
    }
    const { type } = meta.get(key) as FieldMeta;
    switch (type) {
      case 'DateTime':
        out[key] = (value as Date).toISOString();
        break;
      case 'Decimal':
        out[key] = String(value);
        break;
      case 'Bytes':
        out[key] = Buffer.from(value as Uint8Array).toString('base64');
        break;
      case 'BigInt':
        out[key] = String(value);
        break;
      default:
        out[key] = value; // strings, numbers, booleans, enums, Json, scalar lists
    }
  }
  return out;
}

/**
 * Snapshot JSON object → Prisma createMany input. Unknown columns (schema
 * drift since the snapshot was taken) are dropped; null Json becomes
 * Prisma.DbNull (plain null is rejected for Json columns).
 */
export function deserializeRow(
  model: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const meta = FIELD_META.get(model);
  const out: Record<string, unknown> = {};
  if (!meta) return out;
  for (const [key, { type }] of meta) {
    if (!(key in row)) continue;
    const value = row[key];
    if (value === null) {
      out[key] = type === 'Json' ? Prisma.DbNull : null;
      continue;
    }
    switch (type) {
      case 'DateTime':
        out[key] = new Date(value as string);
        break;
      case 'Bytes':
        out[key] = Buffer.from(value as string, 'base64');
        break;
      case 'BigInt':
        out[key] = BigInt(value as string);
        break;
      default:
        out[key] = value; // Decimal stays a string (accepted by Prisma inputs)
    }
  }
  return out;
}
