# Horae — System Architecture & Data Model

This is the system-wide reference: how the apps fit together, the auth/realtime contract, and the
full data model. Per-app internals live in each `apps/*/CLAUDE.md`. The repo overview is in the
root `CLAUDE.md`.

**Horae** (horae.ca) is the multi-tenant platform; **Acadeea** is the seed organization (one tenant).
Every request is scoped to one `Organization`: ~22 data models carry `organizationId`, injected/stamped
by a Prisma client extension driven by request-scoped `AsyncLocalStorage` (see `apps/api/CLAUDE.md`
§ Multi-tenancy). Uniques that used to be global (`Order.orderNumber`, `Location.name`, `Role` slug,
document serials, category configs) are now unique **per org**.

---

## 1. System shape

A single backend (`apps/api`, NestJS + Prisma + PostgreSQL) owns all data and business logic.
Four clients consume it over the same REST + WebSocket contract:

| Client                         | Stack                           | Role                                                   |
| ------------------------------ | ------------------------------- | ------------------------------------------------------ |
| `apps/web`                     | Next.js 16 App Router, React 19 | Full admin/dashboard, all features                     |
| `apps/ios`                     | SwiftUI, iOS 17+, @Observable   | Production-grade native app, all domains               |
| `apps/android`                 | Kotlin, Jetpack Compose, Hilt   | Early-stage; core flows only (no recipes/dashboard UI) |
| External (eBriza, WooCommerce) | Webhooks → integrations module  | Inbound order ingestion                                |

Backing services: **PostgreSQL** (data), **Redis** (cache/sessions), **S3-compatible** object store
(invoices, signatures, logos, PDFs), **SMTP** (invitations / notifications).

---

## 2. Client ↔ API contract

### REST

- Base path: **`/api/v1/*`**, JSON in/out.
- Swagger UI at **`/api/docs`**; exported spec under `docs/openapi/`.
- Lists are paginated: `{ data: T[], total, page, limit, totalPages }`.
- Standard error body (global `HttpExceptionFilter`):
  ```json
  {
    "statusCode": 400,
    "errorCode": "BAD_REQUEST",
    "message": "...",
    "correlationId": "uuid",
    "timestamp": "ISO-8601"
  }
  ```
- Domain error codes (e.g. `STOCK_001` insufficient stock, `TASK_001` invalid transition,
  `RECIPE_001` circular dependency) are defined once in
  `packages/shared-types/src/error-codes.ts` and re-mapped per client.

### Auth (identical across web/ios/android)

1. `POST /api/v1/auth/login {email, password}` → `{ accessToken, refreshToken, user, organization, handoffCode? }`.
   `organization` is the caller's white-label branding block; `handoffCode` (single-use, 60s) is present
   on login only and hands the session from the apex domain to the org subdomain.
2. Access token (JWT, **RS256**) sent as `Authorization: Bearer <token>`. The payload carries
   `organizationId` + `orgSlug`; **tokens minted before multi-tenancy lack them and are rejected (`401`)**,
   forcing a refresh.
3. Refresh token (opaque UUID, argon2-hashed server-side) → `POST /api/v1/auth/refresh` (rotation).
4. On `401`: client refreshes once, retries; if refresh fails → clear tokens → logout.
5. `GET /api/v1/auth/me` restores the session on app launch.
6. **Apex→subdomain handoff:** `POST /api/v1/auth/handoff/redeem {code}` → a fresh
   `{ accessToken, refreshToken, user, organization }`. The web apex login redirects to
   `<slug>.horae.ca/auth/handoff?code=…`, which redeems it to establish the session on the org host.

Token storage per client: web → `localStorage`; iOS → Keychain (`dev.tigan.acadeea`);
android → EncryptedSharedPreferences (AES256-GCM).

### Authorization — CASL

Backend builds a CASL ability from the user's **DB-defined role** (`Role` + `RolePermission`),
cached ~60s per role slug. Routes are guarded by `@CheckPolicies((a) => a.can('read', 'Recipe'))`
via `PoliciesGuard`. `administrator` → `manage all`.

Actions: `create | read | update | delete | manage`.
Subjects: `User, RawMaterial, Consumable, Recipe, Task, StockMovement, StockReservation, Order,
OrderItem, DeliveryNote, Location, StockTransfer, Organization, Role, all`.

Clients keep their own permission maps to show/hide UI (web `auth-context.tsx`, iOS
`PermissionManager`, android `PermissionManager.kt`). **These can drift from backend roles** — see
the role warning in the root `CLAUDE.md`. The backend is the enforcement point; client maps are UX only.

### Realtime — Socket.IO

- Namespace **`/ws`**, JWT passed in the connection handshake (`token`), verified RS256. The token
  **must** carry `organizationId` — connections with pre-multi-tenancy tokens are rejected.
- On connect, a socket auto-joins **org-scoped** rooms: `org:<id>`, `org:<id>:role:<slug>`,
  `user:<userId>`. All emits are confined to the connecting user's organization.
- Events emitted by backend services (each resolves the org from tenant context or an explicit arg;
  an event with no resolvable org is **dropped**):
  | Event | Room | Meaning |
  | --------------- | ----------------------------- | -------------------------------- |
  | `task:update` | `org:<id>` | Task created / status changed |
  | `stock:update` | `org:<id>` | Stock movement applied |
  | `stock:low` | `org:<id>:role:gestionar` | Low-stock alert for warehouse roles |
  | `activity:new` | `org:<id>` | New activity-feed entry |
- Consumers: iOS `WebSocketManager`, android (planned). **Web does not use WebSocket** — it polls via
  `useEffect` + REST.

---

## 3. Endpoint map (by domain)

All under `/api/v1`. Grouped by backend module (see `apps/api/CLAUDE.md` for the module list).

- **auth** — `login`, `refresh`, `logout`, `me`, `handoff/redeem` (apex→subdomain session transfer),
  `accept-invite`, `invite-status/:token`
- **users / roles / invitations** — `users`, `users/:id`, `users/invite`, `users/:id/role`,
  `users/:id/reactivate`, `users/invitations`, `roles`
- **recipes / pricing** — `recipes`, `recipes/:id`, `recipes/:id/cost`, `recipes/:id/yield-history`,
  `recipes/:id/versions`, `recipes/:id/archive` (hide from default lists; `GET /recipes?archived=true` lists the archive),
  `recipes/categories`, `recipes/:id/margin`, `recipes/:id/selling-price`
- **tasks** — `tasks`, `tasks/:id`, `tasks/:id/transition`, `tasks/:id/assign`,
  `tasks/shopping-list`, `tasks/calendar`
- **stock / raw-materials / consumables / unit-conversions** — `stock/raw-materials`,
  `stock/consumables`, `stock/movements`, `stock/movements/batch`, `stock/recipe-movements`,
  `stock/recipes`, `stock/low-stock`, `stock/expiring`, `stock/lots`,
  `stock/item-availability` (one-item snapshot: per-location quantities + active task
  reservations + pending transfers — powers detail quick actions and the zeroing warning),
  `stock/requirements-plan` (+`/export` .xlsx — ad-hoc production plan → aggregated raw-material
  needs with supplier + purchase deficit), `raw-materials/:id`, `consumables/:id`
- **orders** — `orders`, `orders/:id`, `orders/:id/items`, `orders/:id/delivery-note`,
  `orders/:id/delivery-note/sign`, `orders/:id/invoice`, `orders/:id/conformity-certificate`,
  `orders/stats`, `orders/calendar`
- **locations / transfers** — `locations`, `locations/:id`, `locations/my-locations`,
  `locations/:id/stock`, `locations/:id/users`, `locations/:id/dashboard`, `stock/transfers`,
  `stock/transfers/:id`, `stock/transfers/:id/approval`
- **equipment** — `equipment`, `equipment/:id`, `equipment/:id/maintenance`
- **dashboard / analytics / activity** — `dashboard/stats`, `analytics/*`, `activity`
- **organization** — `organization` (auth-required; caller's org), `organization/by-slug/:slug`
  (public branding lookup), `organization/logo`; **platform-admin only** (`PlatformAdminGuard`,
  `PLATFORM_ADMIN_EMAILS`): `organizations` (list), `POST organizations` (provision a tenant)
- **integrations** — `integrations`, `integrations/:id`, `integrations/:id/mappings`,
  `integrations/:id/sync`, `integrations/:id/orders`,
  `integrations/:id/webhook/{ebriza,woocommerce}` (public, per-integration; org from the integration row),
  `integrations/{ebriza,woocommerce}/webhook` (public, legacy single-org fallback)
- **data-reset** (admin) — `data-reset/preview` (categories + row counts), `POST data-reset`
  `{categories[], confirm:'RESETEAZA'}` (snapshot first, then selective org-scoped wipe)
- **bulk-actions** — `POST {tasks,orders,stock/transfers,raw-materials,consumables,recipes,sales-deductions}/bulk-delete/preview`
  `{ids[]}` → `{found, missing[], dependents[{key,label,count}]}`; `POST …/bulk-delete {ids[], cascade?}` →
  `{deleted[], failed[{id,reason}]}` (per-row isolation; cascade removes/unlinks dependents);
  `POST …/bulk-action {ids[], action, params?}` → `{done[], failed[]}` (status/assign/dates/category/… per
  resource; see apps/api/CLAUDE.md)
- **system-logs** — `system-logs` (admin; `allOrgs=true` for platform admins), `system-logs/access`
- **sales-deductions** (feature flag `FEATURE_SALES_DEDUCTIONS`, on in test AND prod since 1.33.0) — `sales-deductions` (log), `sales-deductions/feature`,
  `sales-deductions/products?locationId=`, `sales-deductions/template?locationId=` (CSV: every sellable product, quantity blank), `POST sales-deductions/{excel,manual,woocommerce}` (→ DRAFT),
  `sales-deductions/:id`, `POST sales-deductions/:id/{confirm,discard,revert}`

---

## 4. Data model

Prisma schema: **`apps/api/src/prisma/schema.prisma`** (the canonical definition; the tables below
summarize it). UUID PKs; `createdAt`/`updatedAt` on most models. "XOR" = exactly one of several FKs
is set, enforced in the service layer (not the DB).

### Identity & access

- **User** — email (unique), passwordHash (argon2), firstName, lastName, roleId, isActive.
- **Role** — name, slug (unique **per org**), isSystem, description; `organizationId` FK — the standard
  set is cloned into each org from `role-definitions.ts`. **RolePermission** — roleId, action, subject
  (unique per role). Dynamic RBAC source of truth.
- **RefreshToken** — userId, hashed token, revoked flag, expiry (rotation/revocation).
- **UserInvitation** — email, token (unique), roleId, expiresAt, acceptedAt.
- **DeviceToken** — userId, token (unique), platform (push notifications).
- **Organization** — the **tenant** row. `slug` (unique subdomain), `isActive`, white-label `name`,
  `accentColor` + optional `secondaryColor`/`tertiaryColor` (brand palette — clients derive all
  adjacent tints/chart colors from these three; null = client defaults), `brandingTokens` (Json,
  nullable — extended per-platform theme overrides `{web|ios|android: {token: value}}`, whitelisted
  keys, for tenants with a fully custom design),
  `fontFamily` (predefined key: inter|manrope|lora|poppins|system), logo set
  (login + in-app, light/dark), `appIconName`, `nutritionEnabled`, plus legal identity for printed
  docs (cui, legalAddress, regCom, contact…). Back-relates to every org-scoped model. Roles, users,
  and all inventory/production data belong to exactly one Organization.

### Recipes & pricing

- **Recipe** — name, unit, yieldQuantity, `type` (FINAL | SEMIPREPARAT), sellingPrice,
  calculatedCost, version counter, category, `isByproduct` + nullable self-FK `sourceRecipeId`
  (a byproduct = SEMIPREPARAT left over after producing another recipe; back-relation
  `byproducts`).
- **RecipeComponent** — logical ingredient grouping (sortOrder).
- **RecipeIngredient** — XOR(rawMaterialId | semipreparatRecipeId), quantity, unit, prepMethod.
  (Semipreparat reference = recipes nest → cost is computed recursively.)
- **RecipeVersion** — immutable snapshot per version. **RecipeYieldHistory** — actual vs expected
  yield variance per batch.
- **PriceHistory** — XOR(rawMaterial | consumable | recipe), priceType (PURCHASE | SELLING),
  oldPrice, newPrice, changedById.

### Inventory

- **RawMaterial** — title, producer, unit, quantityPerPiece, pieceType, stockCount, openedCount,
  orderedCount, reservedCount, storageType (COLD | WARM | FROZEN), purchasePrice, invoice info.
  `purchasePrice` (and `StockLot.purchasePrice`) is per **commercial** unit — RON/kg for
  mass-stocked materials, RON/litru for volume, RON/stock-unit otherwise — normalized to the
  stock unit by `unit-conversions/price-unit.ts` wherever quantity × price math happens.
- **Consumable** — non-ingredient supplies (boxes, ribbons…).
- **StockLot** — batch with expiry, barcode, supplier invoice; `remainingQuantity` is drawn
  down FIFO by production.
- **LotConsumption** — exact FIFO lot attribution per task (taskId × stockLotId × quantity);
  written on task finalize, read by the traceability sheet.
- **MaterialStock** — per-location quantity, unique (locationId, rawMaterialId). **Drives transfers
  and location dashboards.**
- **UnitConversion** — fromUnit, toUnit, factor; universal or scoped to a rawMaterial.
- **StockMovement** — XOR(rawMaterial | consumable | recipe), movementType
  (INTRARE | IESIRE_PRODUCTIE | INTRARE_PRODUCTIE | AJUSTARE | REZERVARE | ELIBERARE | IESIRE_TESTE |
  IESIRE_VANZARE), quantity, unit,
  taskId, performedById.
- **StockReservation** — XOR target, quantityReserved, isFulfilled, isReleased.

### Production / tasks

- **Task** — recipeId, `title` (custom name, null = recipe name), `visibility` (ASSIGNED | EVERYONE |
  SELECTED — who sees it besides `manage Task`; admins see all) + `visibleToIds`, scaleFactor, targetQuantity/unit, `status`
  (DE_FACUT | BLOCAT | IN_LUCRU | FINALIZAT | ANULAT), priority, dueDate, assignedToId, createdById,
  startedAt/completedAt/cancelledAt(+reason), shortages (JSON), actualYield, variance.
- **TaskStatusHistory** — fromStatus → toStatus, changedById, reason (audit).
- **EquipmentReservation** — equipmentId, taskId, quantity, reservedFrom/Until.

### Orders & delivery

- **Order** — orderNumber (unique **per org**), `status`
  (NOUA | IN_PREGATIRE | PREGATITA | IN_TRANZIT | LIVRATA | ANULATA), deliveryPoint/Address,
  deliveryMethod (shop delivery method of imported Woo orders), notes,
  dueDate, createdById, assignedToId, invoice file ref.
- **OrderItem** — orderId, recipeId, quantity, unit, `status`
  (IN_PREGATIRE | GATA | IN_TRANZIT | LIVRAT). **OrderStatusHistory** — audit.
- **DeliveryNote** — per-order snapshot, serialNumber, signature image, signedByName/At.
- **ConformityCertificate** — deliveryNoteId, serialNumber, issuedByUserId (PDF download).
- **ExternalOrderSource** — integrationId, externalId, orderId, syncStatus
  (PENDING | SYNCED | FAILED | SKIPPED), rawPayload.

### Locations & transfers

- **Location** — name (unique **per org**), `type`
  (DEPOZIT | FRIGIDER | CONGELATOR | LABORATOR | MAGAZIN | PUNCT_LUCRU), address, phone,
  `externalId` (nullable, unique per org — the Pickupia delivery-method id that WooCommerce imports
  match to make an order a PICKUP from this location), `isMainUnit` ("unitate principală" — Woo sales
  are deducted here), isActive. **DeliveryMethodAlias** — per-org short name for a shop delivery method
  (`name` → `shortName`), used by order filters/cards. `Organization.wooDeliveryEnabled` gates the
  whole shop-delivery feature.
- **UserLocation** — user ↔ location (isPrimary).
- **StockTransfer** — fromLocationId, toLocationId, `status`
  (IN_ASTEPTARE | IN_TRANZIT | FINALIZAT | ANULAT), notes, createdById, completedAt.
  Source stock is decremented at creation; arriving stock is added on FINALIZAT; ANULAT returns stock.
- **StockTransferItem** — transferId (cascade), rawMaterialId, quantity, unit.
- **TransferApproval** — transferId (unique, cascade), status (PENDING | APPROVED | REJECTED).

### Equipment

- **Equipment** — name, `type`
  (MIXER | CUPTOR | TAVA | ROBOT | FRIGIDER | CONGELATOR | MASINA_AMBALAT | CANTAR | TERMOMETRU | ALTELE),
  quantity, locationId, `status` (DISPONIBIL | IN_UTILIZARE | IN_MENTENANTA | DEFECT | SCOS_DIN_UZ),
  purchaseDate, warrantyExpiry.
- **MaintenanceLog** — equipmentId, description, performedById, nextScheduled, cost.

### Integrations

- **Integration** — provider (EBRIZA | WOOCOMMERCE), status (INACTIVE | ACTIVE | ERROR), config (JSON),
  lastSyncAt. **ProductMapping** — integrationId, externalProductId/Name, recipeId.

### Observability — Jurnal sistem

- **SystemLog** — organizationId? (null = system-wide), level (INFO | WARN | ERROR), category
  (HTTP | AUTH | EMAIL | JOB | INTEGRATION | SYSTEM), action, message, userId/userEmail, method, path,
  statusCode, durationMs, correlationId, ip, metadata (sanitized JSON). Written by the global request
  middleware (all mutations + all failures), EmailService, cron jobs and integrations; 90-day retention.

### Sales deductions (scădere stoc din vânzări)

- **SalesDeduction** — org-scoped session/audit log: locationId, source (EXCEL | MANUAL | WOOCOMMERCE),
  status (DRAFT | CONFIRMED | ANULAT), fileName/fileHash (sha256 — duplicate-upload warning),
  periodFrom/To, note, createdBy/confirmedBy/confirmedAt/revertedAt.
- **SalesDeductionLine** — rawName/rawUnit/quantityReported (from the source), recipeId, matchScore/
  matchKind, decision (ACCEPT | DECLINE | CREATE_NEW), confirmed signed `quantity`, `stockOverride`,
  `shortfall`, stockBefore/After (captured at confirm).
- **SalesProductAlias** — learned normalized report name → recipeId (unique per org).

---

## 5. Key cross-domain flows

- **Production:** Order → Tasks (per recipe, scaled) → task transition consumes RawMaterial via
  StockMovement(IESIRE_PRODUCTIE) and may produce stock (INTRARE_PRODUCTIE) → yield variance recorded
  → OrderItem marked GATA → DeliveryNote signed → ConformityCertificate issued.
- **Transfers:** create transfer (decrement source MaterialStock) → optional approval →
  FINALIZAT (increment destination) or ANULAT (return to source). Deleting a location with active
  transfers requires `?force=true`, which returns active-transfer stock to source then deletes.
- **External orders:** webhook → `ExternalOrderSource` (PENDING) → admin `sync` → `Order` created
  from `ProductMapping` → syncStatus SYNCED/FAILED/SKIPPED.
- **Sales → stock:** source (eBriza .xlsx/.csv, manual, Woo orders in a date range) → DRAFT with
  name-matched lines → user review → bulk confirm in ONE transaction: per line RecipeStock set
  (clamped ≥ 0 unless overridden), FIFO lot consumption, `IESIRE_VANZARE` movement with the confirmed
  (full) quantity + `AJUSTARE` for overrides, aliases learned, ONE summary notification.

---

## 6. Keeping this in sync

The model lives in `apps/api/src/prisma/schema.prisma`. A change there must propagate (by hand) to:
web `src/lib/types.ts`, iOS `Features/*/Models` + `Core/Theme/Enums.swift`, android
`data/remote/dto` + `domain/model/Enums.kt`, and shared enums/error codes into
`packages/shared-types`. Update this file when the model or the cross-app contract changes.
Schema changes ship as **Prisma migrations** (`prisma:migrate`) — deploys run `prisma migrate deploy`,
never `db push` (see `docker/MIGRATION_BASELINE.md`). New tenant-scoped tables need an `organizationId`
FK and per-org composite uniques so the tenant extension scopes them.
</content>
