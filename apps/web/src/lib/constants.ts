import { TaskStatus, OrderStatus, TransferStatus, LocationType, ActivityType } from './types';
import {
  MaterialStatus,
  UserRole,
  StorageType,
  RecipeType,
  UnitType,
  PieceType,
  StockMovementType,
} from '@horae/shared-types';

// Romanian labels for all enums — matching iOS app
/** Who sees a task besides managers/admins (they always see everything). */
export const taskVisibilityLabels: Record<import('@horae/shared-types').TaskVisibility, string> = {
  ASSIGNED: 'Doar cine e asignat',
  EVERYONE: 'Toată lumea',
  SELECTED: 'Anumite persoane',
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  [TaskStatus.DE_FACUT]: 'De făcut',
  [TaskStatus.BLOCAT]: 'Blocat',
  [TaskStatus.IN_LUCRU]: 'În lucru',
  [TaskStatus.FINALIZAT]: 'Finalizat',
  [TaskStatus.ANULAT]: 'Anulat',
};

export const taskStatusColors: Record<TaskStatus, string> = {
  [TaskStatus.DE_FACUT]: 'st-blue',
  [TaskStatus.BLOCAT]: 'st-yellow',
  [TaskStatus.IN_LUCRU]: 'st-orange',
  [TaskStatus.FINALIZAT]: 'st-green',
  [TaskStatus.ANULAT]: 'st-red',
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  [OrderStatus.NOUA]: 'Nouă',
  [OrderStatus.IN_PREGATIRE]: 'În pregătire',
  [OrderStatus.PREGATITA]: 'Pregătită',
  [OrderStatus.IN_TRANZIT]: 'În tranzit',
  [OrderStatus.LIVRATA]: 'Livrată',
  [OrderStatus.ANULATA]: 'Anulată',
};

// WooCommerce order statuses (imported/external orders) — Romanian labels.
export const wooStatusLabels: Record<string, string> = {
  processing: 'În procesare',
  completed: 'Finalizată',
  pending: 'În așteptare',
  'on-hold': 'În așteptare',
  cancelled: 'Anulată',
  refunded: 'Rambursată',
  failed: 'Eșuată',
};

export const orderStatusColors: Record<OrderStatus, string> = {
  [OrderStatus.NOUA]: 'st-blue',
  [OrderStatus.IN_PREGATIRE]: 'st-orange',
  [OrderStatus.PREGATITA]: 'st-purple',
  [OrderStatus.IN_TRANZIT]: 'st-indigo',
  [OrderStatus.LIVRATA]: 'st-green',
  [OrderStatus.ANULATA]: 'st-red',
};

export const transferStatusLabels: Record<TransferStatus, string> = {
  [TransferStatus.IN_ASTEPTARE]: 'În așteptare',
  [TransferStatus.IN_TRANZIT]: 'În tranzit',
  [TransferStatus.FINALIZAT]: 'Finalizat',
  [TransferStatus.ANULAT]: 'Anulat',
};

export const transferStatusColors: Record<TransferStatus, string> = {
  [TransferStatus.IN_ASTEPTARE]: 'st-orange',
  [TransferStatus.IN_TRANZIT]: 'st-blue',
  [TransferStatus.FINALIZAT]: 'st-green',
  [TransferStatus.ANULAT]: 'st-red',
};

export const materialStatusLabels: Record<MaterialStatus, string> = {
  [MaterialStatus.ACTIVE]: 'Activ',
  [MaterialStatus.LOW_STOCK]: 'Stoc scăzut',
  [MaterialStatus.OUT_OF_STOCK]: 'Fără stoc',
  [MaterialStatus.DISCONTINUED]: 'Întrerupt',
};

export const materialStatusColors: Record<MaterialStatus, string> = {
  [MaterialStatus.ACTIVE]: 'st-green',
  [MaterialStatus.LOW_STOCK]: 'st-orange',
  [MaterialStatus.OUT_OF_STOCK]: 'st-red',
  [MaterialStatus.DISCONTINUED]: 'st-gray',
};

export const userRoleLabels: Record<UserRole, string> = {
  [UserRole.ADMINISTRATOR]: 'Administrator',
  [UserRole.SEF_LABORATOR]: 'Șef Laborator',
  [UserRole.SEF_EVENIMENTE]: 'Șef Evenimente',
  [UserRole.COFETAR]: 'Cofetar',
  [UserRole.PATISER]: 'Patiser',
  [UserRole.AJUTOR_COFETAR]: 'Ajutor Cofetar',
  [UserRole.MAGAZIONER]: 'Magazioner',
};

export const locationTypeLabels: Record<LocationType, string> = {
  [LocationType.DEPOZIT]: 'Depozit',
  [LocationType.FRIGIDER]: 'Frigider',
  [LocationType.CONGELATOR]: 'Congelator',
  [LocationType.LABORATOR]: 'Laborator',
  [LocationType.MAGAZIN]: 'Magazin',
  [LocationType.PUNCT_LUCRU]: 'Punct de lucru',
};

export const storageTypeLabels: Record<StorageType, string> = {
  [StorageType.COLD]: 'Rece',
  [StorageType.WARM]: 'Cald',
  [StorageType.FROZEN]: 'Congelat',
};

export const recipeTypeLabels: Record<RecipeType, string> = {
  [RecipeType.FINAL]: 'Produs final',
  [RecipeType.SEMIPREPARAT]: 'Semipreparat',
};

export const unitTypeLabels: Record<UnitType, string> = {
  [UnitType.MILIGRAME]: 'mg',
  [UnitType.GRAME]: 'g',
  [UnitType.KILOGRAME]: 'kg',
  [UnitType.MILILITRI]: 'ml',
  [UnitType.LITRI]: 'L',
  [UnitType.BUCATI]: 'buc',
  [UnitType.LINGURITE]: 'linguriță',
  [UnitType.LINGURI]: 'lingură',
  [UnitType.CANI]: 'cană',
  [UnitType.OUNCES]: 'oz',
  [UnitType.POUNDS]: 'lbs',
};

// Purchase prices are per COMMERCIAL unit — RON/kg for mass, RON/L for
// volume, RON/<unit> otherwise — regardless of how fine the stock unit is
// (a material stocked in grams is still priced per kg). Mirrors the API's
// unit-conversions/price-unit.ts.
export function priceUnitLabel(unit: UnitType): string {
  switch (unit) {
    case UnitType.MILIGRAME:
    case UnitType.GRAME:
    case UnitType.KILOGRAME:
      return 'kg';
    case UnitType.MILILITRI:
    case UnitType.LITRI:
      return 'L';
    default:
      return unitTypeLabels[unit];
  }
}

// Measurement family — used to keep unit dropdowns within the same kind so a
// material stocked in kg can be used in g, but not in litres.
export type UnitMeasure = 'solid' | 'liquid' | 'count';

export const unitMeasure: Record<UnitType, UnitMeasure> = {
  [UnitType.MILIGRAME]: 'solid',
  [UnitType.GRAME]: 'solid',
  [UnitType.KILOGRAME]: 'solid',
  [UnitType.POUNDS]: 'solid',
  [UnitType.MILILITRI]: 'liquid',
  [UnitType.LITRI]: 'liquid',
  [UnitType.OUNCES]: 'liquid',
  [UnitType.BUCATI]: 'count',
  [UnitType.LINGURI]: 'count',
  [UnitType.LINGURITE]: 'count',
  [UnitType.CANI]: 'count',
};

/**
 * Units a person may PICK (QA M11). Imperial `oz`/`lbs` and `cană` exist in the
 * enum only for legacy rows — `unitTypeLabels` still renders them, but no
 * picker offers them. Pages must iterate this list, not Object.values(UnitType).
 */
export const LEGACY_UNITS: ReadonlySet<UnitType> = new Set([
  UnitType.OUNCES,
  UnitType.POUNDS,
  UnitType.CANI,
]);

export const selectableUnits: UnitType[] = (Object.values(UnitType) as UnitType[]).filter(
  (u) => !LEGACY_UNITS.has(u),
);

/**
 * Units offered for a free unit choice (recipe yield, piece equivalent,
 * byproduct): every selectable unit, plus `current` when it is a stored legacy
 * unit — an old recipe in `cană`/`oz` must still show (and keep) its unit on edit.
 */
export function unitChoices(current: UnitType): UnitType[] {
  return LEGACY_UNITS.has(current) ? [...selectableUnits, current] : selectableUnits;
}

/** Selectable units in the same measurement family as the given unit (the unit itself is kept even if legacy). */
export function unitsForMeasure(unit: UnitType): UnitType[] {
  const m = unitMeasure[unit];
  return (Object.values(UnitType) as UnitType[]).filter(
    (u) => unitMeasure[u] === m && (u === unit || !LEGACY_UNITS.has(u)),
  );
}

export const pieceTypeLabels: Record<PieceType, string> = {
  [PieceType.SAC]: 'Sac',
  [PieceType.CUTIE]: 'Cutie',
  [PieceType.BIDON]: 'Bidon',
  [PieceType.PUNGA]: 'Pungă',
  [PieceType.RECIPIENT]: 'Recipient',
  [PieceType.BUCATA]: 'Bucată',
};

export const movementTypeLabels: Record<StockMovementType, string> = {
  [StockMovementType.INTRARE]: 'Intrare',
  [StockMovementType.INTRARE_PRODUCTIE]: 'Intrare din producție',
  [StockMovementType.IESIRE_PRODUCTIE]: 'Ieșire producție',
  [StockMovementType.IESIRE_TESTE]: 'Consum teste',
  [StockMovementType.IESIRE_VANZARE]: 'Vânzare',
  [StockMovementType.AJUSTARE]: 'Ajustare',
  [StockMovementType.REZERVARE]: 'Rezervare',
  [StockMovementType.ELIBERARE]: 'Eliberare',
};

export const activityTypeLabels: Record<ActivityType, string> = {
  [ActivityType.TASK_TRANSITION]: 'Tranziție task',
  [ActivityType.STOCK_MOVEMENT]: 'Mișcare stoc',
  [ActivityType.ORDER_CREATED]: 'Comandă creată',
  [ActivityType.ORDER_STATUS]: 'Status comandă',
  [ActivityType.LOW_STOCK]: 'Stoc scăzut',
  [ActivityType.STOCK_AVAILABLE]: 'Stoc disponibil',
};

// Task status transitions (matching iOS TaskStatus.allowedTransitions)
export const allowedTaskTransitions: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.DE_FACUT]: [TaskStatus.IN_LUCRU, TaskStatus.BLOCAT, TaskStatus.ANULAT],
  [TaskStatus.BLOCAT]: [TaskStatus.DE_FACUT, TaskStatus.ANULAT],
  [TaskStatus.IN_LUCRU]: [TaskStatus.FINALIZAT, TaskStatus.BLOCAT, TaskStatus.ANULAT],
  [TaskStatus.FINALIZAT]: [],
  [TaskStatus.ANULAT]: [],
};

// ---------- Stock Adjustment Reasons ----------
export const adjustmentReasons = [
  { value: 'CADOU', label: 'Cadou' },
  { value: 'TEST', label: 'Test' },
  { value: 'PIERDERE', label: 'Pierdere' },
  { value: 'ALTELE', label: 'Altele' },
];

// ---------- Chart colours ----------
// Charts read design tokens, never raw Tailwind hexes (M-5): the five series
// colours follow the tenant accent (--chart-1..3 are derived from --primary)
// and status breakdowns reuse the status tokens so legend == badge colour.
export const chartSeriesColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

export const orderStatusChartColors: Record<OrderStatus, string> = {
  [OrderStatus.NOUA]: 'var(--st-blue)',
  [OrderStatus.IN_PREGATIRE]: 'var(--st-orange)',
  [OrderStatus.PREGATITA]: 'var(--st-purple)',
  [OrderStatus.IN_TRANZIT]: 'var(--st-indigo)',
  [OrderStatus.LIVRATA]: 'var(--st-green)',
  [OrderStatus.ANULATA]: 'var(--st-red)',
};

export const taskStatusChartColors: Record<TaskStatus, string> = {
  [TaskStatus.DE_FACUT]: 'var(--st-blue)',
  [TaskStatus.BLOCAT]: 'var(--st-yellow)',
  [TaskStatus.IN_LUCRU]: 'var(--st-orange)',
  [TaskStatus.FINALIZAT]: 'var(--st-green)',
  [TaskStatus.ANULAT]: 'var(--st-red)',
};

// ---------- Preset Accent Colors ----------
// Settings › Branding swatches. Branding runs lib/contrast.ts `accentReport`
// before saving, so a pastel pick (e.g. the yellow) is flagged, not blocked.
export const presetColors = [
  '#D4527B', // Pink (default)
  '#E53935', // Red
  '#F4511E', // Deep Orange
  '#FB8C00', // Orange
  '#FDD835', // Yellow
  '#43A047', // Green
  '#00897B', // Teal
  '#039BE5', // Light Blue
  '#1E88E5', // Blue
  '#5E35B1', // Deep Purple
  '#8E24AA', // Purple
  '#6D4C41', // Brown
];

// ---------- Sync Status ----------
export const syncStatusLabels: Record<string, string> = {
  PENDING: 'In asteptare',
  SYNCED: 'Sincronizat',
  FAILED: 'Esuat',
  SKIPPED: 'Ignorat',
};

export const syncStatusColors: Record<string, string> = {
  PENDING: 'st-yellow',
  SYNCED: 'st-green',
  FAILED: 'st-red',
  SKIPPED: 'st-gray',
};
