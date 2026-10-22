import { SNAPSHOT_MODELS, SnapshotModelDef } from '@/modules/backups/snapshot-models';

/**
 * "Resetare date" — selective, per-organization wipe of operational data.
 *
 * Each category lists the tables it empties, CHILDREN FIRST, with an explicit
 * org-scoping `where` (never relying on the tenant context alone — models
 * without an `organizationId` column would otherwise match every org).
 * Categories can `require` others: those are auto-included so FK RESTRICT
 * constraints never fire (e.g. recipes can't go while tasks reference them).
 *
 * Deliberately NOT resettable here: users, roles, locations, suppliers,
 * equipment, categories, integrations, snapshots, system log.
 */
export type ResetCategoryKey =
  | 'TASKS'
  | 'STOCK'
  | 'TRANSFERS'
  | 'ORDERS'
  | 'SALES'
  | 'NOTIFICATIONS'
  | 'RECIPES'
  | 'RAW_MATERIALS';

export const RESET_CATEGORY_KEYS: readonly ResetCategoryKey[] = [
  'TASKS',
  'STOCK',
  'TRANSFERS',
  'ORDERS',
  'SALES',
  'NOTIFICATIONS',
  'RECIPES',
  'RAW_MATERIALS',
];

/** Reset must be confirmed with this exact string. */
export const RESET_CONFIRMATION = 'RESETEAZA';

export interface ResetTable {
  /** Prisma model name — key in the `counts` / `deleted` maps. */
  model: string;
  /** Prisma client delegate property (camelCase). */
  delegate: string;
  /** Explicit org-scoped where clause (may narrow further than the model's). */
  where: (organizationId: string) => Record<string, unknown>;
}

export interface ResetCategoryDef {
  key: ResetCategoryKey;
  label: string;
  description: string;
  /** Categories auto-included when this one is selected (FK dependencies). */
  requires: readonly ResetCategoryKey[];
  /** Master data (recipes / raw materials) — shown apart, extra warning. */
  danger: boolean;
  /** Tables emptied, children first. */
  tables: readonly ResetTable[];
}

const byName = new Map<string, SnapshotModelDef>(SNAPSHOT_MODELS.map((m) => [m.name, m]));

/** Whole org-scoped table, reusing the snapshot registry's where builder. */
function table(model: string): ResetTable {
  const def = byName.get(model);
  if (!def) throw new Error(`Reset category references unknown snapshot model "${model}"`);
  return { model, delegate: def.delegate, where: def.where };
}

/** Org-scoped table narrowed by an extra condition (AND). */
function tableWhere(model: string, extra: Record<string, unknown>): ResetTable {
  const base = table(model);
  return { ...base, where: (orgId) => ({ AND: [base.where(orgId), extra] }) };
}

export const RESET_CATEGORIES: readonly ResetCategoryDef[] = [
  {
    key: 'TASKS',
    label: 'Producție (taskuri)',
    description:
      'Toate taskurile de producție, cu istoricul de stare, randamentele, rezervările de stoc și rezervările de echipamente.',
    requires: [],
    danger: false,
    tables: [
      table('LotConsumption'),
      table('EquipmentReservation'),
      table('RecipeYieldHistory'),
      table('StockReservation'),
      table('TaskStatusHistory'),
      table('Task'),
    ],
  },
  {
    key: 'STOCK',
    label: 'Stocuri',
    description:
      'Mișcările de stoc, loturile (materii prime, consumabile, produse finite), cantitățile pe locații și rezervările. Materiile prime, consumabilele și rețetele rămân, cu stocul pe 0.',
    requires: [],
    danger: false,
    tables: [
      table('StockReservation'),
      table('LotConsumption'),
      table('StockMovement'),
      table('StockLot'),
      table('RecipeStockLot'),
      table('MaterialStock'),
      table('RecipeStock'),
    ],
  },
  {
    key: 'TRANSFERS',
    label: 'Transferuri',
    description: 'Transferurile între locații, cu articolele și aprobările lor.',
    requires: [],
    danger: false,
    tables: [table('TransferApproval'), table('StockTransferItem'), table('StockTransfer')],
  },
  {
    key: 'ORDERS',
    label: 'Comenzi și livrări',
    description:
      'Comenzile (inclusiv cele venite din site), articolele, istoricul, avizele de livrare și certificatele de conformitate.',
    requires: [],
    danger: false,
    tables: [
      table('ConformityCertificate'),
      table('DeliveryNote'),
      table('OrderStatusHistory'),
      table('OrderItem'),
      table('ExternalOrderSource'),
      table('Order'),
    ],
  },
  {
    key: 'SALES',
    label: 'Vânzări → stoc',
    description:
      'Jurnalul scăderilor din vânzări (eBriza, manual, site). Mișcările de stoc generate rămân la „Stocuri”.',
    requires: [],
    danger: false,
    tables: [table('SalesDeductionLine'), table('SalesDeduction')],
  },
  {
    key: 'NOTIFICATIONS',
    label: 'Notificări',
    description: 'Toate notificările tuturor utilizatorilor.',
    requires: [],
    danger: false,
    tables: [table('Notification')],
  },
  {
    key: 'RECIPES',
    label: 'Rețete',
    description:
      'Toate rețetele (produse finite și semipreparate), cu componente, ingrediente, versiuni, istoric de preț, mapările din integrări și aliasurile de vânzări. Include automat producția, stocurile, transferurile, comenzile și vânzările.',
    requires: ['TASKS', 'STOCK', 'TRANSFERS', 'ORDERS', 'SALES'],
    danger: true,
    tables: [
      table('ProductMapping'),
      table('SalesProductAlias'),
      table('RecipeVersion'),
      table('RecipeIngredient'),
      table('RecipeComponent'),
      tableWhere('PriceHistory', { recipeId: { not: null } }),
      table('Recipe'),
    ],
  },
  {
    key: 'RAW_MATERIALS',
    label: 'Materii prime și consumabile',
    description:
      'Toate materiile prime și consumabilele, cu conversiile de unități și istoricul de preț. Rețetele rămân, dar pierd ingredientele din materii prime. Include automat stocurile și transferurile.',
    requires: ['STOCK', 'TRANSFERS'],
    danger: true,
    tables: [
      tableWhere('RecipeIngredient', { rawMaterialId: { not: null } }),
      tableWhere('UnitConversion', { rawMaterialId: { not: null } }),
      tableWhere('PriceHistory', {
        OR: [{ rawMaterialId: { not: null } }, { consumableId: { not: null } }],
      }),
      table('RawMaterial'),
      table('Consumable'),
    ],
  },
];

/** Execution order — categories run in this order so FK parents go last. */
export const RESET_EXECUTION_ORDER: readonly ResetCategoryKey[] = [
  'TASKS',
  'SALES',
  'ORDERS',
  'TRANSFERS',
  'STOCK',
  'RECIPES',
  'RAW_MATERIALS',
  'NOTIFICATIONS',
];

export function categoryByKey(key: ResetCategoryKey): ResetCategoryDef {
  const found = RESET_CATEGORIES.find((c) => c.key === key);
  if (!found) throw new Error(`Unknown reset category ${key}`);
  return found;
}

/** Selected keys + every transitive dependency, in execution order. */
export function resolveCategories(selected: readonly ResetCategoryKey[]): ResetCategoryKey[] {
  const set = new Set<ResetCategoryKey>();
  const visit = (key: ResetCategoryKey) => {
    if (set.has(key)) return;
    set.add(key);
    for (const dep of categoryByKey(key).requires) visit(dep);
  };
  selected.forEach(visit);
  return RESET_EXECUTION_ORDER.filter((k) => set.has(k));
}
