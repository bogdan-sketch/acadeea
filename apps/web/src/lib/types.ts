// ============================================
// Types matching iOS app models + backend DTOs
// ============================================

// Re-export shared enums
export {
  UserRole,
  UnitType,
  StorageType,
  MaterialStatus,
  RecipeType,
  StockMovementType,
  PieceType,
} from '@horae/shared-types';

// Enums missing from shared-types (present in iOS + backend)
export enum TaskStatus {
  DE_FACUT = 'DE_FACUT',
  BLOCAT = 'BLOCAT',
  IN_LUCRU = 'IN_LUCRU',
  FINALIZAT = 'FINALIZAT',
  ANULAT = 'ANULAT',
}

export enum OrderStatus {
  NOUA = 'NOUA',
  IN_PREGATIRE = 'IN_PREGATIRE',
  PREGATITA = 'PREGATITA',
  IN_TRANZIT = 'IN_TRANZIT',
  LIVRATA = 'LIVRATA',
  ANULATA = 'ANULATA',
}

export enum OrderItemStatus {
  IN_PREGATIRE = 'IN_PREGATIRE',
  GATA = 'GATA',
  IN_TRANZIT = 'IN_TRANZIT',
  LIVRAT = 'LIVRAT',
}

export enum LocationType {
  DEPOZIT = 'DEPOZIT',
  FRIGIDER = 'FRIGIDER',
  CONGELATOR = 'CONGELATOR',
  LABORATOR = 'LABORATOR',
  MAGAZIN = 'MAGAZIN',
  PUNCT_LUCRU = 'PUNCT_LUCRU',
}

export enum TransferStatus {
  IN_ASTEPTARE = 'IN_ASTEPTARE',
  IN_TRANZIT = 'IN_TRANZIT',
  FINALIZAT = 'FINALIZAT',
  ANULAT = 'ANULAT',
}

export enum ActivityType {
  TASK_TRANSITION = 'TASK_TRANSITION',
  STOCK_MOVEMENT = 'STOCK_MOVEMENT',
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_STATUS = 'ORDER_STATUS',
  LOW_STOCK = 'LOW_STOCK',
  STOCK_AVAILABLE = 'STOCK_AVAILABLE',
}

// ---------- Pagination ----------
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ---------- Auth ----------
export interface LoginRequest {
  email: string;
  password: string;
}

/** Public branding subset of an organization (login/landing theming). */
export interface OrgBranding {
  id?: string;
  name: string;
  slug: string;
  accentColor?: string;
  /** Secondary brand color (null = default palette). */
  secondaryColor?: string | null;
  /** Tertiary brand color (null = default palette). */
  tertiaryColor?: string | null;
  /** Extended per-platform theme overrides ({ web|ios|android: { light?, dark?, radiusCard?, radiusSheet? } }; legacy data may carry flat color keys = both schemes). */
  brandingTokens?: Record<string, Record<string, string | Record<string, string>>> | null;
  /** Predefined UI font key (inter | manrope | lora | poppins | system). */
  fontFamily?: string | null;
  logoUrl?: string | null;
  logoLightUrl?: string | null;
  logoDarkUrl?: string | null;
  appLogoLightUrl?: string | null;
  appLogoDarkUrl?: string | null;
  appIconName?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  /** Single-use 60s code for the apex → org-subdomain session handoff. */
  handoffCode?: string;
  organization: OrgBranding;
}

export interface AcceptInviteRequest {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
}

// ---------- Provider sign-in (Sign in with Apple / Google) ----------
/** External identity providers a user can sign in / link with. */
export type AuthProvider = 'apple' | 'google';

/**
 * Body for `POST /auth/apple` | `POST /auth/google` (public). `identityToken` is
 * the provider id_token (JWT). `invitationToken` is required to CREATE an account
 * (invite-only sign-up); without it an unknown identity → 401 PROVIDER_NO_ACCOUNT.
 * Apple returns the name only on first consent → pass `firstName`/`lastName` through.
 */
export interface ProviderAuthRequest {
  identityToken: string;
  nonce?: string;
  invitationToken?: string;
  firstName?: string;
  lastName?: string;
}

/** Body for `POST /auth/link/:provider` (authed) — link a provider to the current user. */
export interface LinkProviderRequest {
  identityToken: string;
  nonce?: string;
}

/** Response of the link/unlink endpoints — the user's providers after the change. */
export interface LinkedProvidersResponse {
  linkedProviders: AuthProvider[];
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: import('@horae/shared-types').UserRole;
  organizationId: string;
  iat: number;
  exp: number;
}

// ---------- User ----------
export interface UserRoleInfo {
  id: string;
  slug: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRoleInfo | null;
  isActive: boolean;
  createdAt: string;
  /** External login providers linked to this account (from `GET /auth/me`); [] if none. */
  linkedProviders?: AuthProvider[];
  /** Relative image path (`/api/v1/images/<id>`) — render via `resolveApiUrl`. */
  avatarUrl?: string | null;
}

export interface InviteUserRequest {
  email: string;
  roleId: string;
}

export interface RoleInfo {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  description?: string;
  userCount: number;
}

export type CategoryKind = 'MATERIE_PRIMA' | 'SEMIPREPARAT' | 'PRODUS_FINIT';

export interface SupplierMaterial {
  id: string;
  title: string;
  unit: string;
  stockCount: number;
  minimumStock: number;
  status: string;
  isLow: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  materialCount: number;
  lowStockCount: number;
  materials: SupplierMaterial[];
  createdAt: string;
}

export interface CreateSupplierRequest {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface TraceabilityIngredient {
  title: string;
  quantity: number;
  unit: string;
  kind: string;
  lotNumber: string | null;
  expiryDate: string | null;
  supplier: string | null;
  invoiceNumber: string | null;
  /** Exact lots consumed (FIFO), possibly several per ingredient. Empty for pre-FIFO tasks. */
  lots: TraceabilityLot[];
}

export interface TraceabilityLot {
  lotNumber: string | null;
  invoiceNumber: string | null;
  supplier: string | null;
  quantity: number;
  expiryDate: string | null;
}

export interface TraceabilityHistory {
  fromStatus: string | null;
  toStatus: string;
  byName: string;
  reason: string | null;
  at: string;
}

export interface TraceabilitySubtask {
  taskId: string;
  recipeName: string;
  quantity: number;
  unit: string;
  completedAt: string | null;
  ingredients: TraceabilityIngredient[];
}

export interface TaskTraceability {
  taskId: string;
  recipeName: string;
  recipeType: string;
  status: string;
  targetQuantity: number;
  targetUnit: string;
  actualYield: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdByName: string;
  assignedToName: string | null;
  notes: string | null;
  ingredients: TraceabilityIngredient[];
  subtasks: TraceabilitySubtask[];
  history: TraceabilityHistory[];
}

export interface PermissionRule {
  action: string;
  subject: string;
}

export interface RoleDetail extends RoleInfo {
  permissions: PermissionRule[];
  createdAt: string;
}

export interface RoleSubjectsMeta {
  subjects: string[];
  actions: string[];
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
}

export interface UserInvitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: import('@horae/shared-types').UserRole;
  token: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
}

// ---------- Task ----------
export interface SubtaskSummary {
  id: string;
  recipeId: string;
  recipeName: string;
  /** Custom name (null = recipe name). */
  title?: string | null;
  /** What to show as the name: title when set, else recipeName. */
  displayName?: string;
  targetQuantity: number;
  targetUnit: import('@horae/shared-types').UnitType;
  status: TaskStatus;
  assignedTo?: { id: string; firstName: string; lastName: string };
}

export interface Task {
  id: string;
  recipeId: string;
  recipeName: string;
  /** Custom name (null = recipe name). */
  title?: string | null;
  /** What to show as the name: title when set, else recipeName. */
  displayName?: string;
  /** Who sees it besides managers/admins (they always see everything). */
  visibility?: import('@horae/shared-types').TaskVisibility;
  /** Extra viewers when visibility = SELECTED. */
  visibleToIds?: string[];
  status: TaskStatus;
  targetQuantity: number;
  targetUnit: import('@horae/shared-types').UnitType;
  scaleFactor: number;
  priority: number;
  plannedDate?: string;
  dueDate?: string;
  notes?: string;
  assignedToId?: string;
  assignedTo?: { id: string; firstName: string; lastName: string };
  actualYield?: number;
  /** When the task was finished (FINALIZAT). */
  completedAt?: string | null;
  varianceAbsolute?: number;
  variancePercent?: number;
  cancelReason?: string;
  parentTaskId?: string;
  /** Tasks created together ("task multiplu"/"familie") share a group. */
  groupId?: string | null;
  groupLabel?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  subtasks?: SubtaskSummary[];
  shortages?: TaskShortage[];
  statusHistory?: TaskStatusHistory[];
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskShortage {
  id: string;
  rawMaterialId?: string;
  rawMaterialTitle?: string;
  recipeId?: string;
  recipeName?: string;
  requiredQuantity: number;
  availableQuantity: number;
  unit: import('@horae/shared-types').UnitType;
}

/**
 * A material a task will consume, scaled to its target quantity. `needed` is the
 * scaled amount actually deducted from stock (not the base recipe amount);
 * `currentStock` is the physical stock now and `stockAfter` is what remains once
 * the task is produced.
 */
export interface TaskMaterialRequirement {
  rawMaterialId: string | null;
  recipeId: string | null;
  title: string;
  unit: import('@horae/shared-types').UnitType;
  needed: number;
  currentStock: number;
  available: number;
  stockAfter: number;
  sufficient: boolean;
}

export interface TaskStatusHistory {
  id: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  changedBy: { id: string; firstName: string; lastName: string };
  reason?: string | null;
  createdAt: string;
}

export interface CreateTaskRequest {
  recipeId: string;
  targetQuantity: number;
  /** API field name — `unit` is rejected by CreateTaskDto (forbidNonWhitelisted). */
  targetUnit: import('@horae/shared-types').UnitType;
  scaleFactor?: number;
  priority?: number;
  plannedDate?: string;
  dueDate?: string;
  notes?: string;
  assignedToId?: string;
  locationId?: string;
  /** Custom name; empty/undefined = recipe name. */
  title?: string;
  visibility?: import('@horae/shared-types').TaskVisibility;
  visibleToIds?: string[];
}

export interface UpdateTaskRequest {
  recipeId?: string;
  targetQuantity?: number;
  targetUnit?: import('@horae/shared-types').UnitType;
  priority?: number;
  plannedDate?: string | null;
  dueDate?: string | null;
  notes?: string;
  assignedToId?: string | null;
  locationId?: string | null;
  /** Custom name; empty string or null clears it (back to the recipe name). */
  title?: string | null;
  visibility?: import('@horae/shared-types').TaskVisibility;
  visibleToIds?: string[];
}

export interface TransitionTaskRequest {
  toStatus: TaskStatus;
  actualYield?: number;
  cancelReason?: string;
  // FINALIZAT only: actual byproduct quantities left over (in each byproduct
  // recipe's own unit). When sent, the list is authoritative — exactly these
  // quantities are credited to stock; recipeId must be an active byproduct of
  // the produced recipe (or of a subtask's recipe). Omitted = legacy fallback
  // (declared yieldQuantity × scaleFactor).
  byproducts?: { recipeId: string; quantity: number }[];
}

export interface CreateMultiTaskRequest {
  items: {
    recipeId: string;
    targetQuantity: number;
    targetUnit: import('@horae/shared-types').UnitType;
  }[];
  groupLabel?: string;
  includeSemipreparate?: boolean;
  dueDate?: string;
  plannedDate?: string;
  locationId?: string;
  assignedToId?: string;
  priority?: number;
  visibility?: import('@horae/shared-types').TaskVisibility;
  visibleToIds?: string[];
  notes?: string;
}

/** One production batch of a finished product ("stoc diferențiat"). */
export interface RecipeLot {
  id: string;
  lotNumber: string;
  quantity: number;
  remainingQuantity: number;
  expiryDate?: string | null;
  producedAt: string;
  locationId: string;
  locationName?: string | null;
}

export interface TestConsumptionRequest {
  locationId: string;
  items: {
    rawMaterialId?: string;
    consumableId?: string;
    quantity: number;
    unit: import('@horae/shared-types').UnitType;
  }[];
  notes?: string;
}

export interface StockImportChange {
  id: string;
  name: string;
  field: 'stockCount' | 'purchasePrice' | 'minimumStock';
  from: number | null;
  to: number;
}

export interface StockImportResult {
  changes: StockImportChange[];
  unknownIds: string[];
  unchanged: number;
  applied: boolean;
}

/** Revizie stocuri — one difference between the uploaded sheet and the app. */
export interface StockReviewChange {
  sheet: string;
  id: string;
  kind: 'LOT' | 'STOC';
  name: string;
  lotNumber: string | null;
  location: string | null;
  field: 'quantity' | 'purchasePrice' | 'expiryDate' | 'supplier';
  from: number | string | null;
  to: number | string | null;
}

export interface StockReviewResult {
  changes: StockReviewChange[];
  unknownIds: string[];
  unchanged: number;
  rowsRead: number;
  applied: boolean;
}

/** Org data snapshot ("Salvează starea") — Setări → Backup. */
export interface OrgSnapshot {
  id: string;
  label?: string | null;
  auto: boolean;
  sizeBytes: string;
  summary?: Record<string, number> | null;
  /** API sends `createdBy` as the already-formatted full name. */
  createdBy?: string | null;
  createdAt: string;
}

/** Resetare date (Setări → Resetare date) — categoriile din API `data-reset.categories.ts`. */
export type ResetCategoryKey =
  | 'TASKS'
  | 'STOCK'
  | 'TRANSFERS'
  | 'ORDERS'
  | 'SALES'
  | 'NOTIFICATIONS'
  | 'RECIPES'
  | 'RAW_MATERIALS';

export interface ResetCategoryPreview {
  key: ResetCategoryKey;
  label: string;
  description: string;
  /** Categorii incluse automat (dependențe FK). */
  requires: ResetCategoryKey[];
  /** Date de bază (rețete / materii prime) — avertisment suplimentar. */
  danger: boolean;
  counts: Record<string, number>;
  total: number;
}

export interface DataResetResult {
  categories: ResetCategoryKey[];
  snapshotId: string | null;
  deleted: Record<string, number>;
  total: number;
}

export interface TaskQuery extends PaginationQuery {
  status?: TaskStatus;
  assignedToId?: string;
  /** "Ziua mea" — open tasks assigned to me, relevant today. */
  myDay?: boolean;
  /** "due" = due date ascending, "completed" = latest finished first. */
  sort?: 'due' | 'completed';
  /** Only tasks with nobody assigned. */
  unassigned?: boolean;
  dueAfter?: string;
  dueBefore?: string;
}

// ---------- Recipe ----------
export interface Recipe {
  id: string;
  name: string;
  type: import('@horae/shared-types').RecipeType;
  unit: import('@horae/shared-types').UnitType;
  quantityPerPiece?: number;
  yieldQuantity?: number;
  // Weight of the whole finished batch (grams) after preparation — the EU-1169 yield
  // factor. When set, drives the per-100g nutrition denominator. null = unknown.
  finishedWeightGrams?: number | null;
  // For a semipreparat yielding BUCATI: what one bucată equals (e.g. 2 KILOGRAME),
  // so it can be used as an ingredient in a mass/volume unit. null = no bridge.
  pieceEquivalentQuantity?: number | null;
  pieceEquivalentUnit?: import('@horae/shared-types').UnitType | null;
  description?: string;
  category?: string;
  estimatedLossPercent?: number;
  // Shelf life of the produced good, in months (1-120). null = untracked ("Fără urmărire").
  shelfLifeMonths?: number | null;
  // Archived recipes are hidden from default listings/pickers; history stays readable.
  isArchived?: boolean;
  archivedAt?: string | null;
  // Draft recipes are hidden from default listings/pickers until published.
  isDraft?: boolean;
  draftedAt?: string | null;
  // Byproduct = a SEMIPREPARAT left over after producing another recipe;
  // listed as its own category in ingredient pickers.
  isByproduct?: boolean;
  // The recipe this byproduct is left over from (byproducts only).
  sourceRecipeId?: string | null;
  // Active byproducts this recipe leaves behind (drives the form checkbox).
  byproducts?: { id: string; name: string }[];
  components?: RecipeComponent[];
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeComponent {
  id: string;
  name: string;
  sortOrder: number;
  ingredients: RecipeIngredient[];
}

export interface RecipeIngredient {
  id: string;
  rawMaterialId?: string;
  rawMaterialTitle?: string;
  // Backend returns `semipreparatRecipeId` (XOR with rawMaterialId) and a display `name`.
  semipreparatRecipeId?: string;
  semipreparatId?: string;
  semipreparatName?: string;
  name?: string;
  prepMethod?: string;
  rawMaterialUnit?: string;
  quantity: number;
  unit: import('@horae/shared-types').UnitType;
  sortOrder: number;
}

// Ingredient payload for recipe create/update (XOR rawMaterialId | semipreparatRecipeId).
// The backend requires a display `name` on every ingredient.
export interface CreateRecipeIngredient {
  rawMaterialId?: string;
  semipreparatRecipeId?: string;
  name: string;
  quantity: number;
  unit: import('@horae/shared-types').UnitType;
  prepMethod?: string;
  sortOrder: number;
}

export interface RecipeYieldEntry {
  id: string;
  taskId: string;
  expectedYield: number;
  actualYield: number;
  varianceAbsolute: number;
  variancePercent: number;
  createdAt: string;
}

export interface CreateRecipeRequest {
  name: string;
  type: import('@horae/shared-types').RecipeType;
  unit: import('@horae/shared-types').UnitType;
  quantityPerPiece?: number;
  yieldQuantity?: number;
  // Whole-batch finished weight in grams. Send a number to set, null to clear,
  // undefined to leave unchanged on update.
  finishedWeightGrams?: number | null;
  // Semipreparat piece equivalent (1 bucată = N unit). null clears, undefined leaves unchanged.
  pieceEquivalentQuantity?: number | null;
  pieceEquivalentUnit?: import('@horae/shared-types').UnitType | null;
  description?: string;
  category?: string;
  estimatedLossPercent?: number;
  // null explicitly clears the shelf life on update; omit/undefined leaves it unchanged.
  shelfLifeMonths?: number | null;
  // Create the recipe as a draft (hidden from default listings until published).
  isDraft?: boolean;
  // Mark as a byproduct semipreparat (forces type=SEMIPREPARAT server-side).
  isByproduct?: boolean;
  // The recipe this byproduct is left over from (with isByproduct=true only).
  sourceRecipeId?: string;
  components?: {
    name: string;
    sortOrder: number;
    ingredients: CreateRecipeIngredient[];
  }[];
}

export interface RecipeQuery extends PaginationQuery {
  type?: import('@horae/shared-types').RecipeType;
  category?: string;
  /** Omitted/false → only active recipes (server default); true → only archived. */
  archived?: boolean;
  /** Omitted/false → excludes drafts (server default); true → only drafts. */
  draft?: boolean;
}

export interface RecipeCostIngredient {
  rawMaterialId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  totalCost: number | null;
  /** True for semipreparat rows — their cost is the sub-recipe's calculated cost. */
  isSemipreparat?: boolean;
}

export interface RecipeCost {
  recipeId: string;
  recipeName: string;
  /** Effective cost — manualCost when set, else ingredientsCost. */
  totalCost: number | null;
  ingredientsCost?: number | null;
  manualCost?: number | null;
  sellingPrice: number | null;
  margin: number | null;
  marginPercent: number | null;
  ingredients: RecipeCostIngredient[];
}

// ---------- Order ----------
export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryPoint?: string;
  deliveryAddress?: string;
  /** Customer name (e.g. WooCommerce billing name for imported orders). */
  customerName?: string | null;
  /** DELIVERY (livrare) or PICKUP (ridicare) — mirrors the API OrderFulfillmentType. */
  fulfillmentType?: 'DELIVERY' | 'PICKUP';
  pickupLocationId?: string | null;
  /** Status in the external system for imported orders (e.g. "processing"). */
  externalStatus?: string | null;
  /**
   * Delivery method chosen in the shop for imported WooCommerce orders
   * (e.g. "Ridicare Napoca 15"; several joined with " + "). Read-only.
   */
  deliveryMethod?: string | null;
  /** Archived orders are hidden from default lists, stats and calendar. */
  isArchived?: boolean;
  archivedAt?: string | null;
  dueDate?: string;
  notes?: string;
  assignedToId?: string;
  assignedTo?: User;
  items: OrderItem[];
  deliveryNote?: DeliveryNote;
  hasInvoice?: boolean;
  invoiceFileName?: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  /** Null for unmapped external products (free-text label items). */
  recipeId: string | null;
  /** Recipe name, or the free-text label for unmapped external products. */
  recipeName: string;
  /** Free-text product name for unmapped external products. */
  label?: string | null;
  quantity: number;
  unit: import('@horae/shared-types').UnitType;
  status: OrderItemStatus;
}

export interface DeliveryNote {
  id: string;
  deliveryAddress?: string;
  deliveryPoint?: string;
  serialNumber?: string | null;
  hasSignature: boolean;
  signedByName?: string | null;
  signedAt?: string | null;
  notes?: string | null;
  generatedAt: string;
  signatureImageBase64?: string | null;
}

export interface CreateProductMappingRequest {
  externalProductId: string;
  externalProductName: string;
  recipeId: string;
}

export interface CreateOrderRequest {
  deliveryPoint?: string;
  fulfillmentType?: 'DELIVERY' | 'PICKUP';
  pickupLocationId?: string;
  deliveryAddress?: string;
  dueDate?: string;
  notes?: string;
  assignedToId?: string;
  items: {
    recipeId: string;
    quantity: number;
    unit: import('@horae/shared-types').UnitType;
  }[];
}

export interface OrderQuery extends PaginationQuery {
  status?: OrderStatus;
  /** Several statuses (sent comma-separated as `statuses=`); combined with `status`. */
  statuses?: OrderStatus[];
  /** true → only archived orders; omitted → only active (server default). */
  archived?: boolean;
  /** intrari = newest placed first; livrari ("Pregătiri" in the UI, web default) = delivery day desc, undated = today. */
  view?: OrderView;
  /** Exact shop delivery-method `name` (one " + " part match, server-side). */
  deliveryMethod?: string;
  /** Orders whose delivery method has this kind (Ridicare / Livrare). */
  deliveryKind?: DeliveryMethodKind;
}

/** Delivery-method kind: Ridicare (PICKUP) or Livrare (DELIVERY). */
export type DeliveryMethodKind = 'PICKUP' | 'DELIVERY';

/** Orders-area view: by the day placed (Intrări) or by the delivery day (`livrari`, labelled Pregătiri). */
export type OrderView = 'intrari' | 'livrari';

/** `GET /orders/delivery-methods` row — most used first. */
export interface DeliveryMethodSummary {
  /** Method exactly as imported from the shop — the filter value. */
  name: string;
  /** Admin-set short name (null = none). */
  shortName: string | null;
  /** What to show: shortName ?? name without a leading "Ridicare la/de la/din". */
  label: string;
  /** Ridicare / Livrare — the admin's choice when `kindSet`, else auto-detected. */
  kind: DeliveryMethodKind;
  /** true = `kind` set by an admin; false = auto-detected. */
  kindSet: boolean;
  /** Active (non-archived) orders with this method. */
  count: number;
}

export interface OrderStats {
  totalOrders: number;
  completedOrders: number;
  statusCounts: Record<string, number>;
}

// ---------- Raw Material ----------
export interface RawMaterial {
  id: string;
  title: string;
  category?: string;
  lotNumber?: string;
  expiryDate?: string;
  producer?: string;
  supplierId?: string | null;
  supplierName?: string | null;
  unit: import('@horae/shared-types').UnitType;
  quantityPerPiece?: number;
  pieceType?: import('@horae/shared-types').PieceType;
  storageType?: import('@horae/shared-types').StorageType;
  status: import('@horae/shared-types').MaterialStatus;
  stockCount: number;
  openedCount: number;
  orderedCount: number;
  reservedCount: number;
  minimumStock?: number;
  estimatedLossPercent?: number;
  purchasePrice?: number;
  invoiceNumber?: string;
  invoiceDate?: string;
  nutrition?: NutritionValues | null;
  /** EU-14 allergen keys declared for this material (shared-types Allergen). */
  allergens?: string[];
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RawMaterialPriceHistory {
  id: string;
  priceType: string;
  oldPrice: number | null;
  newPrice: number;
  createdAt: string;
  changedBy: { id: string; firstName: string; lastName: string };
}

export interface StockLot {
  id: string;
  rawMaterialId: string | null;
  consumableId: string | null;
  materialTitle: string | null;
  unit: string | null;
  lotNumber: string | null;
  barcode: string | null;
  quantity: number;
  expiryDate: string | null;
  purchasePrice: number | null;
  supplier: string | null;
  supplierInvoice: string | null;
  receivedAt: string;
  /** What's left of this intake (FIFO). */
  remainingQuantity?: number;
  /** Held back from FIFO — production consumes every other lot first. */
  onHold?: boolean;
}

export interface CreateRawMaterialRequest {
  title: string;
  category?: string;
  lotNumber?: string;
  expiryDate?: string;
  producer?: string;
  unit: import('@horae/shared-types').UnitType;
  quantityPerPiece?: number;
  pieceType?: import('@horae/shared-types').PieceType;
  storageType?: import('@horae/shared-types').StorageType;
  minimumStock?: number;
  estimatedLossPercent?: number;
  supplierId?: string;
  locationId?: string;
}

export interface RawMaterialQuery extends PaginationQuery {
  status?: import('@horae/shared-types').MaterialStatus;
  storageType?: import('@horae/shared-types').StorageType;
}

// GET /raw-materials/:id/delete-info — gates the hard-delete UI.
export interface RawMaterialDeleteInfo {
  currentStock: number;
  canDelete: boolean;
  everUsed: boolean;
  /** Live transfers (în așteptare / în tranzit) carrying the material — block delete at stock 0. */
  activeTransfers?: number;
}

// ---------- Consumable ----------
export interface Consumable {
  id: string;
  title: string;
  category?: string;
  producer?: string;
  /** Not returned by the API — consumables are always counted in pieces (BUCATI). */
  unit?: import('@horae/shared-types').UnitType;
  status: import('@horae/shared-types').MaterialStatus;
  stockCount: number;
  minimumStock?: number;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

/** CreateConsumableDto has no `unit` — sending one is a 400 (forbidNonWhitelisted). */
export interface CreateConsumableRequest {
  title: string;
  category?: string;
  producer?: string;
  minimumStock?: number;
}

// ---------- Stock Movement ----------
export interface StockMovement {
  id: string;
  movementType: import('@horae/shared-types').StockMovementType;
  rawMaterialId?: string;
  consumableId?: string;
  recipeId?: string;
  /** Name of the moved item — the API returns a single field for all three kinds. */
  itemTitle?: string;
  quantity: number;
  unit: import('@horae/shared-types').UnitType;
  referenceNote?: string;
  performedById?: string;
  createdByName?: string;
  locationName?: string;
  taskId?: string;
  createdAt: string;
}

export interface CreateStockMovementRequest {
  movementType: import('@horae/shared-types').StockMovementType;
  rawMaterialId?: string;
  consumableId?: string;
  quantity: number;
  unit: import('@horae/shared-types').UnitType;
  referenceNote?: string;
  // AJUSTARE on raw materials is per-location — the backend sets that location's
  // absolute quantity (defaults to the user's primary location when omitted).
  locationId?: string;
  // Intake (INTRARE) details — recorded as a StockLot on the backend.
  lotNumber?: string;
  expiryDate?: string;
  purchasePrice?: number;
  /** Whether purchasePrice includes VAT — API normalizes to the org cost basis. */
  priceIncludesVat?: boolean;
  supplier?: string;
  supplierInvoice?: string;
}

// Manual stock movement for a produced product (semipreparat / produs finit).
// Only INTRARE and AJUSTARE; per-location like raw materials.
export interface CreateRecipeMovementRequest {
  movementType: import('@horae/shared-types').StockMovementType;
  recipeId: string;
  quantity: number;
  unit: import('@horae/shared-types').UnitType;
  referenceNote?: string;
  locationId?: string;
}

// ---------- Item availability (GET /stock/item-availability) ----------
// Per-item stock breakdown: totals, task reservations, per-location split and
// pending transfers. `locations`/`pendingTransfers` are empty for consumables.
export interface ItemLocationStock {
  locationId: string;
  locationName: string;
  quantity: number;
  reservedCount: number;
}

export interface ItemPendingTransfer {
  id: string;
  status: TransferStatus;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  quantity: number;
  unit: import('@horae/shared-types').UnitType;
}

/** "Trasabilitate produs" — GET /stock/traceability. */
export type TraceabilityKind = 'CONSUMED' | 'RESERVED' | 'PRODUCED';
export interface TraceabilityRow {
  kind: TraceabilityKind;
  /** ISO — consumption / production time; planned date for RESERVED. */
  date: string;
  taskId: string;
  taskName: string;
  recipeName: string;
  taskStatus: TaskStatus;
  quantity: number;
  unit: string;
  locationName: string | null;
  assignedToName: string | null;
  lots: { lotNumber: string | null; quantity: number; supplierInvoice: string | null }[];
}
export interface StockTraceability {
  item: { kind: 'RAW_MATERIAL' | 'CONSUMABLE' | 'RECIPE'; id: string; name: string; unit: string };
  totals: { consumed: number; reserved: number; produced: number; taskCount: number };
  rows: TraceabilityRow[];
}

export interface StockItemAvailability {
  totalQuantity: number;
  reservedForTasks: number;
  activeTaskCount: number;
  locations: ItemLocationStock[];
  pendingTransfers: ItemPendingTransfer[];
}

export interface StockMovementQuery extends PaginationQuery {
  movementType?: import('@horae/shared-types').StockMovementType;
  rawMaterialId?: string;
  consumableId?: string;
  recipeId?: string;
  locationId?: string;
  /** ISO date (yyyy-mm-dd) — inclusive. */
  from?: string;
  to?: string;
}

// ---------- Batch receive (Recepție marfă) ----------
// One reception line — mirrors apps/api BatchReceiveItemDto (supplierInvoice is per-row).
export interface BatchReceiveItem {
  rawMaterialId?: string;
  consumableId?: string;
  quantity: number;
  unit: import('@horae/shared-types').UnitType;
  lotNumber?: string;
  barcode?: string;
  expiryDate?: string;
  purchasePrice?: number;
  /** Whether purchasePrice includes VAT — API normalizes to the org cost basis. */
  priceIncludesVat?: boolean;
  supplierInvoice?: string;
  referenceNote?: string;
}

export interface BatchReceiveRequest {
  items: BatchReceiveItem[];
  /** Location the stock arrives at (applies to all items). */
  locationId?: string;
}

// ---------- Location ----------
export interface Location {
  id: string;
  name: string;
  type: LocationType;
  address?: string;
  latitude?: number;
  longitude?: number;
  /** Id of this location in the WooCommerce delivery plugin (Pickupia); unique per org. */
  externalId?: string | null;
  /** Main unit: shop sales are deducted from its stock (wooDeliveryEnabled orgs). */
  isMainUnit?: boolean;
  isActive?: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocationStock {
  rawMaterialId: string;
  rawMaterialTitle: string;
  category?: string;
  quantity: number;
  unit: import('@horae/shared-types').UnitType;
}

export interface CreateLocationRequest {
  name: string;
  type: LocationType;
  address?: string;
  latitude?: number;
  longitude?: number;
  /** Pickupia (WooCommerce) location id; empty string or null clears it. Max 100 chars. */
  externalId?: string | null;
  /** Main unit — shop sales are deducted from its stock. */
  isMainUnit?: boolean;
}

// ---------- Transfer ----------
// The web shape is FLAT; the backend returns a NESTED DTO (fromLocation/toLocation
// objects, items with recipeId). `lib/api.ts` (transfers) flattens the raw response
// (`TransferApiResponse`) into this shape — mirror any backend change in both places.
export interface Transfer {
  id: string;
  fromLocationId: string;
  fromLocationName: string;
  fromLocationAddress?: string;
  toLocationId: string;
  toLocationName: string;
  toLocationAddress?: string;
  /**
   * True for ad-hoc destinations (e.g. an event) — `toLocation*` is synthesized
   * server-side from `destinationName`/`destinationAddress` (id = ''), and on
   * FINALIZAT the goods leave the system (no destination stock).
   */
  adhocDestination: boolean;
  /** Recipient (person) at the destination — printed on the aviz. */
  destinationContact?: string | null;
  status: TransferStatus;
  notes?: string | null;
  items: TransferItem[];
  createdById: string;
  createdByName?: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
  // Aviz delegate/transport details + digital receipt signature.
  delegateIdCard?: string | null;
  transportMeans?: string | null;
  dispatchedAt?: string | null;
  receiverName?: string | null;
  receivedAt?: string | null;
  hasReceiverSignature?: boolean;
  completedAt?: string | null;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransferItem {
  id: string;
  // XOR: a transfer line is either a raw material or a produced recipe.
  rawMaterialId: string | null;
  recipeId: string | null;
  rawMaterialTitle: string;
  quantity: number;
  unit: import('@horae/shared-types').UnitType;
}

/** Raw nested transfer DTO as returned by the API — flattened in `lib/api.ts`. */
export interface TransferApiResponse {
  id: string;
  status: TransferStatus;
  notes: string | null;
  fromLocation: { id: string; name: string; address: string };
  // For ad-hoc transfers, synthesized as {id: '', name: destinationName, address: destinationAddress}.
  toLocation: { id: string; name: string; address: string };
  adhocDestination?: boolean;
  /** Recipient (person) at the destination — printed on the aviz. */
  destinationContact?: string | null;
  createdBy: { id: string; firstName: string; lastName: string };
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  delegateIdCard?: string | null;
  transportMeans?: string | null;
  dispatchedAt?: string | null;
  receiverName?: string | null;
  receivedAt?: string | null;
  hasReceiverSignature?: boolean;
  items: {
    id: string;
    rawMaterialId: string | null;
    recipeId: string | null;
    rawMaterialTitle: string;
    quantity: number;
    unit: import('@horae/shared-types').UnitType;
  }[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransferRequest {
  fromLocationId: string;
  // Destination: exactly ONE of `toLocationId` (saved location) XOR `destinationName`
  // (ad-hoc, e.g. an event) — the backend 400s otherwise.
  toLocationId?: string;
  /** Ad-hoc destination name (≤200 chars). Set INSTEAD of `toLocationId`. */
  destinationName?: string;
  /** Optional ad-hoc destination address (≤500 chars). Only with `destinationName`. */
  destinationAddress?: string;
  /** Recipient (person) at the destination — printed on the aviz (≤200 chars). */
  destinationContact?: string;
  notes?: string;
  assignedToId?: string;
  /** Delegate ID card (serie + numar) — printed on the aviz. */
  delegateIdCard?: string;
  /** Means of transport (mijloc de transport). */
  transportMeans?: string;
  /** Dispatch time (ora expeditiei), ISO 8601. */
  dispatchedAt?: string;
  // Each item is a raw material XOR a produced recipe. `unit` is advisory — the
  // backend forces the material's own stock unit.
  items: {
    rawMaterialId?: string;
    recipeId?: string;
    quantity: number;
    unit: import('@horae/shared-types').UnitType;
  }[];
}

/** Approve/reject a transfer — `PATCH /stock/transfers/:id/approval`. */
export type TransferApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Per-location produced-recipe stock — `GET /locations/:id/recipe-stock`. */
export interface LocationRecipeStock {
  id: string;
  locationId: string;
  recipeId: string;
  recipeName: string;
  recipeType: import('@horae/shared-types').RecipeType;
  category: string | null;
  unit: import('@horae/shared-types').UnitType;
  quantity: number;
  reservedCount: number;
  // Earliest batch expiry at this location (null = untracked / no shelf life set).
  expiryDate: string | null;
  updatedAt: string;
}

export interface TransferQuery extends PaginationQuery {
  status?: TransferStatus;
}

/** One party (furnizor/cumpărător) on a transfer aviz — `GET /stock/transfers/:id/aviz`. */
export interface TransferAvizParty {
  name: string;
  address: string | null;
  cui: string | null;
  locationName: string;
}

/** One goods line on a transfer aviz. `unitPrice` is null when unknown. */
export interface TransferAvizItem {
  name: string;
  quantity: number;
  unit: import('@horae/shared-types').UnitType;
  unitPrice: number | null;
}

/**
 * Legal "aviz de însoțire a mărfii" for a transfer — `GET /stock/transfers/:id/aviz`.
 * The `serial` is assigned + persisted on the first call; reprints keep it.
 */
export interface TransferAviz {
  serial: string;
  issuedAt: string;
  transferId: string;
  transferCreatedAt: string;
  supplier: TransferAvizParty;
  buyer: TransferAvizParty;
  delegateName: string | null;
  /** Delegate ID card (serie + numar) — captured on the transfer. */
  delegateIdCard?: string | null;
  /** Means of transport. */
  transportMeans?: string | null;
  /** Dispatch time (ora expeditiei), ISO 8601. */
  dispatchedAt?: string | null;
  /** Name of the person who signed for receipt (semnatura de primire). */
  receiverName?: string | null;
  /** Receipt timestamp. */
  receivedAt?: string | null;
  /** Whether a digital receipt signature is stored (fetch via signature URL). */
  hasReceiverSignature?: boolean;
  /** Recipient (person) at the destination — "Destinatar" on the printed aviz. */
  recipientName?: string | null;
  items: TransferAvizItem[];
}

/**
 * "Declarație de conformitate" for a transfer — `GET /stock/transfers/:id/conformity`.
 * Serial (CB-...) assigned + persisted on the first call.
 */
export interface TransferConformity {
  serial: string;
  issuedAt: string;
  transferId: string;
  deliveredTo: string;
  deliveryDate: string;
  organization: {
    name: string;
    legalAddress: string | null;
    cui: string | null;
    regCom: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    website: string | null;
    administratorName: string | null;
  };
  items: { name: string; quantity: number; unit: string }[];
}

// ---------- Activity ----------
export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export type ActivityQuery = PaginationQuery;

// ---------- Organization ----------
export interface Organization {
  id: string;
  name: string;
  /** Subdomain slug — the org lives at <slug>.horae.ca. */
  slug?: string;
  accentColor?: string;
  /** Secondary brand color (null = default palette). */
  secondaryColor?: string | null;
  /** Tertiary brand color (null = default palette). */
  tertiaryColor?: string | null;
  /** Extended per-platform theme overrides ({ web|ios|android: { light?, dark?, radiusCard?, radiusSheet? } }; legacy data may carry flat color keys = both schemes). */
  brandingTokens?: Record<string, Record<string, string | Record<string, string>>> | null;
  /** Predefined UI font key (null = default). */
  fontFamily?: string | null;
  logoUrl?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  appLogoLightUrl?: string;
  appLogoDarkUrl?: string;
  /** Feature switch: nutrition values per ingredient + recipe nutrition. */
  nutritionEnabled?: boolean;
  /** Feature switch "Livrări din magazinul online": Pickupia delivery import, location
   *  externalId + main units, delivery-method filters on orders. */
  wooDeliveryEnabled?: boolean;
  /** Plătitor de TVA — stored purchase prices are net (fără TVA); non-payers store gross. */
  vatPayer?: boolean;
  /** VAT rate percent used to convert entered prices (default 21). */
  vatRatePercent?: number;
  /** Location DELIVERY orders leave from — dashboard counts them there. */
  defaultDeliveryLocationId?: string | null;
  /** Admin-configurable default production/reception location (task create + goods receipt). */
  defaultLocationId?: string | null;
  /** Fiscal code (CUI) printed on legal documents (avize). */
  cui?: string | null;
  /** Legal/registered address printed on legal documents (avize). */
  legalAddress?: string | null;
  regCom?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  administratorName?: string | null;
}

// ---------- Nutrition (feature-gated by Organization.nutritionEnabled) ----------
export interface NutritionValues {
  calories?: number;
  protein?: number;
  carbs?: number;
  sugars?: number;
  fat?: number;
  saturatedFat?: number;
  fiber?: number;
  salt?: number;
}

export interface RecipeNutrition {
  recipeId: string;
  recipeName: string;
  yieldQuantity: number;
  yieldUnit: string;
  total: Required<NutritionValues>;
  perPiece: Required<NutritionValues>;
  per100g: Required<NutritionValues> | null;
  // Which denominator produced per100g: the recipe's finished weight or the summed
  // ingredient weight.
  per100Basis: 'finished' | 'ingredients';
  // Echo of the recipe's finishedWeightGrams (null when unset).
  finishedWeightGrams: number | null;
  coveredWeightGrams: number;
  missing: { rawMaterialId: string; title: string }[];
  coveredCount: number;
  ingredientCount: number;
  /** EU-14 allergens propagated from the tree, with contributing material titles. */
  allergens?: { allergen: string; sources: string[] }[];
}

// ---------- Recipe Stock ----------
export interface RecipeStock {
  recipeId: string;
  recipeName: string;
  type: import('@horae/shared-types').RecipeType;
  stockCount: number;
  unit: import('@horae/shared-types').UnitType;
  sellingPrice: number | null;
  calculatedCost: number | null;
}

export interface ShoppingListItem {
  rawMaterialId: string;
  rawMaterialTitle: string;
  totalNeeded: number;
  totalAvailable: number;
  shortage: number;
  unit: import('@horae/shared-types').UnitType;
  blockedTaskCount: number;
  blockedTasks: { taskId: string; taskName: string; neededQuantity: number }[];
}

// ---------- Analytics ----------
export interface AnalyticsSummary {
  tasksCompletedToday: number;
  ordersToday: number;
  lowStockItems: number;
  activeUsers: number;
}

export interface ProductionAnalytics {
  period?: { from: string; to: string };
  totalTasksCompleted: number;
  totalTasksCancelled: number;
  averageCompletionHours?: number | null;
  yieldVarianceAvg?: number | null;
}

export interface OrderAnalytics {
  totalOrders: number;
  ordersByStatus: Record<string, number>;
  onTimeRate?: number;
  popularProducts: { name: string; quantity: number }[];
}

export interface UserProductivity {
  userId: string;
  firstName: string;
  lastName: string;
  tasksCompleted: number;
  avgCompletionHours?: number | null;
}

// ---------- Pricing ----------
export interface RecipeMargin {
  recipeId: string;
  recipeName: string;
  sellingPrice?: number | null;
  /** Effective cost — manualCost when set, else the ingredients cost. */
  calculatedCost?: number | null;
  /** Computed ingredients-only cost. */
  ingredientsCost?: number | null;
  /** Manual override (labor & overheads); null = none. */
  manualCost?: number | null;
  margin?: number | null;
  marginPercent?: number | null;
}

export interface PriceHistoryEntry {
  id: string;
  priceType: string;
  oldPrice?: number;
  newPrice: number;
  changedByName: string | null;
  /** Name of the priced item (material / consumable / recipe). */
  itemName?: string | null;
  /** Disambiguating subtitle — the raw material's producer. */
  itemSubtitle?: string | null;
  createdAt: string;
}

// ---------- Dashboard ----------
export interface DashboardStats {
  taskCounts: Record<string, number>;
  orderCounts: Record<string, number>;
  lowStockMaterials: LowStockItem[];
  recentTasks: DashboardTask[];
  todayTasksDue: number;
  todayOrdersDue: number;
  todaySalesAmount: number;
  todayDeliveries: number;
  todayPickups?: number;
  /** Uncapped alert totals — lowStockMaterials is truncated to 10 for display. */
  lowStockCount?: number;
  outOfStockCount?: number;
}

export interface DashboardTask {
  id: string;
  recipeName: string;
  /** Custom task name when set, else the recipe name. */
  displayName?: string;
  status: TaskStatus;
  targetQuantity: number;
  targetUnit: string;
  assignedToName?: string;
  createdAt: string;
}

export interface LowStockItem {
  id: string;
  title: string;
  currentStock: number;
  minimumStock: number;
  unit: import('@horae/shared-types').UnitType;
}

// `GET /stock/expiring` — mixes raw-material/consumable lots ('MATERIE') and
// produced recipe stock ('PRODUS'). Field names mirror the backend ExpiringItemDto.
export interface ExpiringItem {
  lotId: string;
  materialTitle: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  daysUntilExpiry: number;
  itemType: 'MATERIE' | 'PRODUS';
  // Location holding the stock — set for produced goods, null for material lots.
  locationName: string | null;
}

// ---------- Requirements plan (necesar MP) ----------
export interface RequirementsPlanItem {
  recipeId: string;
  quantity: number;
}

export interface PlanProduct {
  recipeId: string;
  recipeName: string;
  quantity: number;
  unit: string;
}

export interface PlanRequirement {
  rawMaterialId: string;
  title: string;
  category: string | null;
  needed: number;
  unit: string;
  currentStock: number;
  available: number;
  deficit: number;
  supplierId: string | null;
  supplierName: string | null;
}

export interface RequirementsPlanResult {
  products: PlanProduct[];
  requirements: PlanRequirement[];
}

// ---------- Task Calendar ----------
export interface TaskCalendarDay {
  date: string;
  counts: Record<TaskStatus, number>;
  total: number;
}

// ---------- Location Dashboard ----------
export interface LocationDashboard {
  location: Location;
  materialCount: number;
  userCount: number;
  pendingTransfers: number;
}

export interface LocationUser {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  role: import('@horae/shared-types').UserRole;
}

// ---------- Integrations ----------
export interface Integration {
  id: string;
  provider: string;
  status: string;
  config?: Record<string, unknown>;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
  mappingsCount: number;
}

export interface ProductMapping {
  id: string;
  integrationId: string;
  externalProductId: string;
  externalProductName: string;
  recipeId: string;
  recipeName: string;
  createdAt: string;
}

export interface ExternalOrder {
  id: string;
  integrationId: string;
  externalId: string;
  orderId?: string;
  syncStatus: string;
  errorMessage?: string;
  createdAt: string;
}

// ========== Backups ==========
export interface BackupInfo {
  name: string;
  createdAt: string;
  sizeBytes: number;
}

// ========== Notifications ==========
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  /** Optional structured payload (e.g. a deep-link target). */
  data?: Record<string, unknown> | null;
  /** ISO timestamp when read, or null while unread. */
  readAt: string | null;
  createdAt: string;
}

// ============================================================================
// Tutorial mode — coachmark walkthroughs + help center
// ============================================================================

export type TutorialPlatform = 'web' | 'ios' | 'android';

export interface TutorialStep {
  /** Stable anchor key mapped to a real UI element via <TutorialAnchor id=...>. */
  id: string;
  title: string;
  body: string;
}

export interface TutorialFlow {
  id: string;
  title: string;
  category: string;
  platforms: TutorialPlatform[];
  steps: TutorialStep[];
}

// ── Scădere stoc din vânzări (sales deductions) ──────────────────────────

export type SalesDeductionSource = 'EXCEL' | 'MANUAL' | 'WOOCOMMERCE';
export type SalesDeductionStatus = 'DRAFT' | 'CONFIRMED' | 'ANULAT';
export type SalesDeductionDecision = 'ACCEPT' | 'DECLINE' | 'CREATE_NEW';

/** Produs vandabil (rețetă activă) cu stocul din locația aleasă. */
export interface SalesProductOption {
  id: string;
  name: string;
  unit: import('@horae/shared-types').UnitType;
  type: string;
  category: string | null;
  stock: number;
}

export interface SalesMatchCandidate {
  id: string;
  name: string;
  score: number;
  kind: string;
}

export interface SalesDeductionLine {
  id: string;
  position: number;
  rawName: string;
  rawUnit: string | null;
  quantityReported: number | null;
  recipeId: string | null;
  recipeName: string | null;
  recipeUnit: import('@horae/shared-types').UnitType | null;
  matchScore: number | null;
  /** ALIAS | EXACT | CONTAINS | FUZZY | MAPPING | NONE | MANUAL */
  matchKind: string | null;
  decision: SalesDeductionDecision;
  quantity: number | null;
  stockOverride: number | null;
  shortfall: number | null;
  stockBefore: number | null;
  stockAfter: number | null;
  currentStock: number | null;
  candidates: SalesMatchCandidate[];
}

export interface SalesDeductionSummary {
  total: number;
  accepted: number;
  declined: number;
  created: number;
  shortfalls: number;
  overrides: number;
  unmatched: number;
}

export interface SalesDeduction {
  id: string;
  locationId: string;
  locationName: string;
  source: SalesDeductionSource;
  status: SalesDeductionStatus;
  fileName: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  note: string | null;
  createdByName: string;
  confirmedByName: string | null;
  createdAt: string;
  confirmedAt: string | null;
  revertedAt: string | null;
  duplicateOf: string[];
  summary: SalesDeductionSummary;
  lines?: SalesDeductionLine[];
}

export interface ConfirmSalesDeductionLine {
  id?: string;
  rawName: string;
  decision: SalesDeductionDecision;
  recipeId?: string;
  quantity?: number;
  stockOverride?: number;
  acceptShortfall?: boolean;
  newProduct?: {
    name: string;
    unit: import('@horae/shared-types').UnitType;
    category?: string;
    initialStock: number;
  };
}

// ── Jurnal sistem (system logs) ──────────────────────────────────────────

export type SystemLogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface SystemLog {
  id: string;
  createdAt: string;
  level: SystemLogLevel;
  /** HTTP | AUTH | EMAIL | JOB | INTEGRATION | SYSTEM */
  category: string;
  action: string;
  message: string;
  organizationId: string | null;
  organizationName: string | null;
  userId: string | null;
  userEmail: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  durationMs: number | null;
  correlationId: string | null;
  ip: string | null;
  metadata: unknown;
}

export interface SystemLogQuery {
  page?: number;
  limit?: number;
  category?: string;
  level?: SystemLogLevel;
  search?: string;
  from?: string;
  to?: string;
  allOrgs?: boolean;
}

/** Result of a `POST /<resource>/bulk-delete` call — per-row outcome. */
export interface BulkDeleteResult {
  deleted: string[];
  failed: { id: string; reason: string }[];
}

export interface BulkDependent {
  key: string;
  label: string;
  count: number;
}

/** `POST /<resource>/bulk-delete/preview` — what else the delete would touch. */
export interface BulkDeletePreview {
  found: number;
  missing: string[];
  dependents: BulkDependent[];
}

/** `POST /<resource>/bulk-action` — per-row outcome. */
export interface BulkActionResult {
  done: string[];
  failed: { id: string; reason: string }[];
}
