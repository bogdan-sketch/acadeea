export enum UserRole {
  ADMINISTRATOR = 'ADMINISTRATOR',
  SEF_LABORATOR = 'SEF_LABORATOR',
  SEF_EVENIMENTE = 'SEF_EVENIMENTE',
  COFETAR = 'COFETAR',
  PATISER = 'PATISER',
  AJUTOR_COFETAR = 'AJUTOR_COFETAR',
  MAGAZIONER = 'MAGAZIONER',
}

export enum UnitType {
  MILIGRAME = 'MILIGRAME',
  GRAME = 'GRAME',
  KILOGRAME = 'KILOGRAME',
  MILILITRI = 'MILILITRI',
  LITRI = 'LITRI',
  BUCATI = 'BUCATI',
  LINGURITE = 'LINGURITE',
  LINGURI = 'LINGURI',
  CANI = 'CANI',
  OUNCES = 'OUNCES',
  POUNDS = 'POUNDS',
}

export enum StorageType {
  COLD = 'COLD',
  WARM = 'WARM',
  FROZEN = 'FROZEN',
}

export enum MaterialStatus {
  ACTIVE = 'ACTIVE',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  DISCONTINUED = 'DISCONTINUED',
}

export enum RecipeType {
  FINAL = 'FINAL',
  SEMIPREPARAT = 'SEMIPREPARAT',
}

export enum TaskStatus {
  DE_FACUT = 'DE_FACUT',
  IN_LUCRU = 'IN_LUCRU',
  FINALIZAT = 'FINALIZAT',
  ANULAT = 'ANULAT',
}

/** Who sees a task besides managers/admins (they always see everything). */
export enum TaskVisibility {
  /** Only the assignee (and subtask assignees). Default. */
  ASSIGNED = 'ASSIGNED',
  /** Everyone who can read tasks. */
  EVERYONE = 'EVERYONE',
  /** The assignee plus the users listed in visibleToIds. */
  SELECTED = 'SELECTED',
}

export enum StockMovementType {
  INTRARE = 'INTRARE',
  INTRARE_PRODUCTIE = 'INTRARE_PRODUCTIE',
  IESIRE_PRODUCTIE = 'IESIRE_PRODUCTIE',
  AJUSTARE = 'AJUSTARE',
  REZERVARE = 'REZERVARE',
  ELIBERARE = 'ELIBERARE',
  IESIRE_TESTE = 'IESIRE_TESTE',
  /** Finished goods sold — written by a confirmed sales deduction (eBriza / manual / Woo). */
  IESIRE_VANZARE = 'IESIRE_VANZARE',
}

export enum PieceType {
  SAC = 'SAC',
  CUTIE = 'CUTIE',
  BIDON = 'BIDON',
  PUNGA = 'PUNGA',
  RECIPIENT = 'RECIPIENT',
  BUCATA = 'BUCATA',
}

/**
 * The 14 EU-mandated allergens (Reg. UE 1169/2011), stored as keys on
 * RawMaterial.allergens and propagated up the recipe tree (a product
 * "contains" every allergen any of its raw materials declares).
 */
export enum Allergen {
  GLUTEN = 'GLUTEN',
  CRUSTACEE = 'CRUSTACEE',
  OUA = 'OUA',
  PESTE = 'PESTE',
  ARAHIDE = 'ARAHIDE',
  SOIA = 'SOIA',
  LAPTE = 'LAPTE',
  NUCI = 'NUCI',
  TELINA = 'TELINA',
  MUSTAR = 'MUSTAR',
  SUSAN = 'SUSAN',
  SULFITI = 'SULFITI',
  LUPIN = 'LUPIN',
  MOLUSTE = 'MOLUSTE',
}

/** Romanian display labels for the EU-14 allergens. */
export const ALLERGEN_LABELS: Record<Allergen, string> = {
  [Allergen.GLUTEN]: 'Gluten',
  [Allergen.CRUSTACEE]: 'Crustacee',
  [Allergen.OUA]: 'Ouă',
  [Allergen.PESTE]: 'Pește',
  [Allergen.ARAHIDE]: 'Arahide',
  [Allergen.SOIA]: 'Soia',
  [Allergen.LAPTE]: 'Lapte (lactoză)',
  [Allergen.NUCI]: 'Fructe cu coajă (nuci)',
  [Allergen.TELINA]: 'Țelină',
  [Allergen.MUSTAR]: 'Muștar',
  [Allergen.SUSAN]: 'Susan',
  [Allergen.SULFITI]: 'Dioxid de sulf / sulfiți',
  [Allergen.LUPIN]: 'Lupin',
  [Allergen.MOLUSTE]: 'Moluște',
};

/**
 * In-app notification (inbox) kinds. Stored as `Notification.type` (a String
 * column) on the API and mirrored by every client for icon/label mapping.
 */
export enum NotificationType {
  /** A task was assigned/reassigned to the recipient. data: { taskId } */
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  /** A stock lot is at/near its expiry date. data: { lotId, rawMaterialId } */
  STOCK_EXPIRING = 'STOCK_EXPIRING',
}

/** Social sign-in providers (Sign in with Apple / Google). Mirrors the Prisma
 *  `AuthProviderKind` enum; used lowercase in URLs (`/auth/apple`, `/auth/google`). */
export enum AuthProvider {
  APPLE = 'apple',
  GOOGLE = 'google',
}
