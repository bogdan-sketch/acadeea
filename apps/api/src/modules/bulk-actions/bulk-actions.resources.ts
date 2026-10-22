/**
 * Resources that support "Selectează și șterge" (multi-select + bulk delete)
 * from their list screens. One entry per `POST <route>/bulk-delete` family.
 */
export const BULK_DELETE_RESOURCES = [
  'tasks',
  'orders',
  'transfers',
  'raw-materials',
  'consumables',
  'recipes',
  'sales-deductions',
] as const;

export type BulkDeleteResource = (typeof BULK_DELETE_RESOURCES)[number];

/**
 * Every "something else goes with it" a bulk delete can touch. Surfaced by
 * the preview so the user confirms with eyes open; refused (per row) when
 * `cascade` is false.
 */
export type BulkDependentKey =
  | 'subtasks'
  | 'activeTransfers'
  | 'recipesUsing'
  | 'transferLines'
  | 'activeReservations'
  | 'nonZeroStock'
  | 'tasks'
  | 'orderLines'
  | 'semipreparatIn'
  | 'salesLines'
  | 'confirmedDeductions';

export const BULK_DEPENDENT_LABELS: Record<BulkDependentKey, string> = {
  subtasks: 'Subtaskuri (se șterg împreună)',
  activeTransfers: 'Transferuri active (stocul revine la sursă)',
  recipesUsing: 'Rețete care o folosesc (ingredientul se scoate din rețetă)',
  transferLines: 'Transferuri / avize emise (linia se scoate)',
  activeReservations: 'Taskuri în lucru cu stoc rezervat (rezervarea se eliberează)',
  nonZeroStock: 'Cu stoc diferit de 0 (stocul și mișcările se șterg)',
  tasks: 'Taskuri de producție (se șterg, cu istoricul lor)',
  orderLines: 'Linii de comandă (rămân doar cu numele produsului)',
  semipreparatIn: 'Rețete care o folosesc ca semipreparat (ingredientul se scoate)',
  salesLines: 'Linii din scăderi de vânzări (rămân fără produs)',
  confirmedDeductions: 'Scăderi confirmate (stocul revine înainte de ștergere)',
};

export interface BulkDependent {
  key: BulkDependentKey;
  label: string;
  count: number;
}

/** Collapse a list of (key, count) pairs into labelled dependents, dropping zeros. */
export function toDependents(counts: Partial<Record<BulkDependentKey, number>>): BulkDependent[] {
  return (Object.keys(BULK_DEPENDENT_LABELS) as BulkDependentKey[])
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => ({ key: k, label: BULK_DEPENDENT_LABELS[k], count: counts[k] as number }));
}

export function mergeCounts(
  into: Partial<Record<BulkDependentKey, number>>,
  add: Partial<Record<BulkDependentKey, number>>,
): void {
  for (const [k, v] of Object.entries(add) as [BulkDependentKey, number][]) {
    if (v) into[k] = (into[k] ?? 0) + v;
  }
}

export function describeDependents(deps: BulkDependent[]): string {
  return deps.map((d) => `${d.label}: ${d.count}`).join('; ');
}

/**
 * Non-delete bulk actions per resource (`POST <route>/bulk-action`). Each maps onto
 * the resource's existing single-row service call — see `bulk-action.service.ts`
 * for the exact params of every key.
 */
export const BULK_ACTIONS: Record<BulkDeleteResource, readonly string[]> = {
  tasks: ['status', 'assign', 'plannedDate', 'dueDate', 'priority', 'location'],
  orders: ['status', 'assign', 'dueDate', 'archive'],
  transfers: ['status'],
  'raw-materials': ['category', 'status', 'supplier', 'minimumStock'],
  consumables: ['category', 'status', 'minimumStock'],
  recipes: ['archive', 'draft', 'category'],
  'sales-deductions': ['discard', 'revert'],
};
