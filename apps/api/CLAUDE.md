# apps/api — NestJS Backend

The single source of truth for Horae: all data, business logic, auth, and realtime. NestJS 10 +
Prisma 6 + PostgreSQL. Serves web, iOS, and android over `/api/v1/*` (REST) and `/ws` (Socket.IO).
**Multi-tenant** — every request runs scoped to one `Organization` (see § Multi-tenancy below).

Read this with the root `CLAUDE.md` and `docs/ARCHITECTURE.md` (full data model + endpoint map +
auth/realtime contract). **This app defines the contract every client mirrors** — schema/enum/endpoint
changes here ripple to all clients.

## Stack

NestJS 10 · TypeScript 5.7 · Prisma 6 (PostgreSQL) · Passport JWT (RS256) + argon2 ·
@casl/ability + @casl/prisma (authz) · socket.io (`/ws`) · class-validator/-transformer ·
@nestjs/swagger (`/api/docs`) · nestjs-pino (logging) · pdfkit · nodemailer · helmet · joi (env).

## Layout

```
src/
├── main.ts            Bootstrap: global ValidationPipe, Helmet, CORS, Pino, Swagger at /api/docs
├── app.module.ts      Root module — imports every feature module
├── common/            Cross-cutting: filters, interceptors, pipes, decorators, base DTOs
│   ├── filters/       HttpExceptionFilter — standard error body + correlationId
│   ├── interceptors/  CorrelationIdInterceptor, TenantInterceptor (global — wraps each request in
│   │                  its org's AsyncLocalStorage scope)
│   ├── cors.ts        buildCorsOrigin — wildcard-subdomain matcher, shared by HTTP + Socket.IO
│   ├── pipes/         ParseUUIDPipe
│   ├── decorators/    CheckPolicies (CASL), re-exports
│   └── dto/           PaginatedDto<T>, ApiErrorDto
├── prisma/
│   ├── schema.prisma       ★ canonical data model (see docs/ARCHITECTURE.md §4)
│   ├── prisma.service.ts   Global PrismaClient + tenant extension (OnModuleInit, shutdown hooks)
│   ├── tenant-context.ts   AsyncLocalStorage tenant scope: runWithTenant/runWithoutTenant/runAsOrg
│   ├── tenant.extension.ts Prisma client extension — injects/stamps organizationId on every scoped op
│   └── seed.ts        Idempotent seed: org (SEED_ORG_NAME/SLUG) → its roles+permissions, admin, categories
└── modules/           One folder per domain (controller → service → Prisma)
```

### Modules

| Module                                                         | Responsibility                                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`                                                         | JWT RS256 login, refresh-token rotation, argon2, CASL ability factory, guards, strategies; locks account after 5 failed logins (`lockedAt`, `ACCOUNT_LOCKED`)           |
| `password`                                                     | Forgot-password + reactivation: emailed reset tokens (`PasswordResetToken`), set-new-password, blocks reuse of last 3 (`PasswordHistory`), clears lock                  |
| `users` / `roles` / `invitations`                              | User CRUD + deactivation; reactivation locks + emails a set-password link; dynamic RBAC roles & permissions; email invites                                              |
| `recipes` / `pricing`                                          | Recipe versioning, FINAL/SEMIPREPARAT, recursive cost calc, yield variance; price history & margins                                                                     |
| `tasks`                                                        | Production task state machine, semipreparate subtasks, status-history audit                                                                                             |
| `stock` / `raw-materials` / `consumables` / `unit-conversions` | Movements, reservations, lots, per-location MaterialStock, conversions                                                                                                  |
| `orders`                                                       | Orders + items, status machine, delivery notes (signature), invoice upload, conformity certificate PDFs                                                                 |
| `locations`                                                    | Locations, user assignments, per-location stock + dashboard, **stock transfers + approval**                                                                             |
| `equipment`                                                    | Equipment inventory, reservations by task, maintenance logs                                                                                                             |
| `dashboard` / `analytics` / `activity`                         | Aggregated stats; analytics; activity feed/event log                                                                                                                    |
| `notifications`                                                | Device tokens + push delivery                                                                                                                                           |
| `integrations`                                                 | eBriza / WooCommerce webhooks (per-integration + legacy provider routes), product mapping, external order sync                                                          |
| `roles`                                                        | Dynamic RBAC + `role-definitions.ts` (`ROLE_DEFINITIONS`, `RESERVED_ORG_SLUGS`, `slugifyOrgName`) — standard role set cloned per org, shared with the seed              |
| `organization` / `email`                                       | Per-tenant white-label branding + public by-slug lookup + platform-admin org provisioning (`organizations-admin`, `PlatformAdminGuard`); SMTP transport (per-org links) |
| `websocket`                                                    | Socket.IO gateway + `WebsocketService` (injected into services to emit **org-scoped** events)                                                                           |

## Conventions

- **Controllers** are thin: validate (DTO), `@CheckPolicies`, delegate to a service. Base path on the
  controller (e.g. `@Controller('api/v1')`), `@ApiTags`/`@ApiBearerAuth` for Swagger.
- **Guards:** `JwtAuthGuard` (authn) + `PoliciesGuard` (authz). Add authorization with
  `@CheckPolicies((ability) => ability.can('<action>', '<Subject>'))`. No decorator ⇒ allowed.
  Get the user with `@CurrentUser()`. `administrator` ⇒ `manage all`.
- **DTOs:** request DTOs use class-validator; response DTOs are classes with `@ApiProperty` and a
  constructor (`new XResponseDto({...})`). Lists return `PaginatedDto<T>`.
- **Validation** is global: `whitelist + forbidNonWhitelisted + transform + implicit conversion`.
  Unknown body fields are rejected; numeric query/path strings auto-cast.
- **Errors:** throw Nest `*Exception`; the global filter shapes the response and attaches a
  correlationId. Domain error codes live in `@horae/shared-types` (`error-codes.ts`).
- **Realtime:** never touch the gateway directly from a service — inject `WebsocketService` and call
  `emitStockUpdate / emitTaskUpdate / emitLowStockAlert / emitActivity` after a state change. Each
  `emit*` resolves the org from the tenant context (or an explicit `organizationId` arg for
  webhook/system flows) and emits only to that org's room; **an event with no resolvable org is dropped**.
- **DB writes that span tables** (transfers, task transitions, order flows) run inside
  `prisma.$transaction`. XOR FK constraints are enforced in services, not the DB.

## Commands

```bash
pnpm --filter @horae/api dev          # watch mode
pnpm --filter @horae/api build        # tsc → dist/
pnpm --filter @horae/api lint
pnpm --filter @horae/api test         # jest unit
pnpm --filter @horae/api test:e2e
pnpm --filter @horae/api prisma:generate
pnpm --filter @horae/api prisma:migrate
pnpm --filter @horae/api prisma:seed
pnpm --filter @horae/api openapi:export   # → docs/openapi
# (inside apps/api you can drop the --filter and use the npm script directly)
```

Key env: `DATABASE_URL`, `REDIS_URL`, `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH`,
`JWT_ACCESS_EXPIRY` (12h), `JWT_REFRESH_EXPIRY` (30d), `S3_*`, `SMTP_*` (Resend), `FRONTEND_URL`,
`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, `SEED_ORG_NAME`/`SEED_ORG_SLUG`. See repo `.env.example`.
Multi-tenancy env: `TENANT_ENFORCEMENT` (`warn` default | `strict` | `off`),
`PLATFORM_ADMIN_EMAILS` (comma list — who may provision orgs), `BASE_DOMAIN` (org subdomain root for
emailed links, e.g. `horae.ca`; falls back to `FRONTEND_URL`), and `CORS_ORIGINS` — a comma list whose
entries may use a `*` wildcard in the subdomain position (`https://*.horae.ca`; `buildCorsOrigin` in
`common/cors.ts`, shared with the Socket.IO gateway).
Observability (all OPTIONAL, no-op when blank): `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `POSTHOG_API_KEY`,
`POSTHOG_HOST` (default `https://eu.i.posthog.com`).

## Observability

- **Sentry** (`@sentry/nestjs` + `@sentry/profiling-node`). Init lives in `src/instrument.ts`, imported
  at the very TOP of `main.ts` (before everything). `Sentry.init` is **skipped entirely when `SENTRY_DSN`
  is unset**, so with no DSN the whole SDK is a no-op and the app boots normally. `SentryModule.forRoot()`
  is the first import in `app.module.ts`. `tracesSampleRate`/`profilesSampleRate` are `0.1`;
  `SENTRY_ENVIRONMENT` falls back to `NODE_ENV`. The global `HttpExceptionFilter` reports **only 5xx**
  to Sentry via `Sentry.captureException` (4xx stay out), tagging the `correlationId` and the request
  method/url.
- **PostHog** (`posthog-node`). `modules/telemetry` exposes a **global** `TelemetryModule` →
  `PostHogService` (inject anywhere, no re-import). The client is created only when `POSTHOG_API_KEY`
  is set; otherwise every method is a safe no-op. API: `capture(distinctId, event, props?)`, `flush()`,
  `shutdown()` (called on module destroy). Endpoints are **not** auto-instrumented — add events
  explicitly. One example event is wired: `AuthService.login` fires `user_logged_in` `{ role }`.

## Multi-tenancy

- **Every scoped query is org-filtered automatically.** ~22 Prisma models carry `organizationId`;
  `tenant.extension.ts` (a Prisma client extension, derived from the DMMF) injects `where.organizationId`
  on reads and stamps `data.organizationId` on create/upsert. An **explicit** `organizationId` already
  present in `where`/`data` is respected (not overwritten). Per-tenant uniques replace old globals
  (`Order.orderNumber`, `Location.name`, `Role` slug/name, `RecipeCategoryConfig`, document serials are
  composite-unique with `organizationId`).
- **Tenant scope = AsyncLocalStorage** (`tenant-context.ts`). The global `TenantInterceptor` wraps each
  authenticated request in `runWithTenant(user.organizationId, …)`. System/off-request flows use
  `runAsOrg(orgId, …)` (webhooks, provisioning) or `runWithoutTenant(…)` (seed, backups, auth lookups
  before a token exists — sets `bypass`). **Pitfall (documented in the file):** `PrismaPromise` is lazy —
  it must be `await`ed _inside_ the ALS scope, so the helpers wrap `fn` in `async () => await fn()`. Don't
  return a bare un-awaited Prisma promise out of a `runWith*` callback or the extension won't see the org.
- **Enforcement:** `TENANT_ENFORCEMENT` = `warn` (default; logs a scoped-query-without-org warning),
  `strict` (throws), or `off`. `apps/api/test/tenant-isolation.e2e-spec.ts` gates isolation under strict.
- **JWT** payload carries `organizationId` + `orgSlug`; `jwt.strategy` **rejects tokens without them**
  (`401` → clients refresh). Login response adds an `organization` branding block + a single-use 60s
  `handoffCode`; `POST /api/v1/auth/handoff/redeem` transfers a session from the apex to the org subdomain.
- **Org endpoints.** `GET /api/v1/organization` now **requires auth** (returns the caller's org);
  `GET /api/v1/organization/by-slug/:slug` is public and returns branding only (login/landing theming).
  `POST`/`GET /api/v1/organizations` are platform-operator only (`PlatformAdminGuard`,
  `PLATFORM_ADMIN_EMAILS`); provisioning clones `ROLE_DEFINITIONS`, seeds standard unit conversions + a
  system category, and emails the first admin a 72h invitation. Reserved slugs: `RESERVED_ORG_SLUGS`.
- **Branding.** `Organization` gained `slug` (unique), `isActive`, and `fontFamily` (predefined key —
  `FONT_FAMILIES` = `inter | manrope | lora | poppins | system`; null = default). All clients apply
  accentColor / logos / font / app-icon at runtime. The brand palette is exactly three colors:
  `accentColor` + nullable `secondaryColor`/`tertiaryColor` (hex, null = client default; secondary/
  tertiary drive chart series 2/3 and adjacent highlights). Clients derive every adjacent tint from
  these. All three ride the login `organization` block, `GET /organization`, by-slug, and
  `PATCH /organization`. On top of the trio, `Organization.brandingTokens` (Json, nullable) carries
  EXTENDED per-platform overrides `{ web|ios|android: { accent, accentPressed, textPrimary,
textSecondary, background, card, radiusCard, radiusSheet, secondary, tertiary } }` — keys AND
  value formats are whitelisted in `sanitizeBrandingTokens` (a module-level function in
  `organization/organization.service.ts`): values trimmed, ≤32 chars, hex `#RGB/#RRGGBB/#RRGGBBAA`
  (3/6/8-digit; 8-digit carries alpha, e.g. a semi-transparent separator) for color keys, `Npx/Nrem`
  for radiusCard/radiusSheet; a non-null payload that sanitizes to nothing → 400 (explicit null still
  clears). Rides the same endpoints; null = trio only. Status colors are never themable. **All clients
  must parse 3/6/8-digit hex** (iOS `Color(hex:)`, web `contrastForeground`, Android `parseHexColorOrNull`).
- **Integration webhooks** are per-integration: `POST /api/v1/integrations/:id/webhook/{ebriza,woocommerce}`
  (org resolved from the integration row). Legacy provider-only routes
  (`/api/v1/integrations/{ebriza,woocommerce}/webhook`) remain as a single-org fallback.
  **WooCommerce webhooks are signed:** `X-WC-Webhook-Signature` must equal base64(HMAC-SHA256(raw
  body, `Integration.config.webhookSecret`)) — `woo-webhook-signature.ts`, raw body via
  `NestFactory.create(..., { rawBody: true })`. The secret is the one typed in WooCommerce › Settings ›
  Advanced › Webhooks and stored with `PATCH /api/v1/integrations/:id { config: { ...,
webhookSecret } }` (config is replaced wholesale — resend the keys). No secret ⇒ every Woo webhook
  is 401 and orders arrive only through the 10-min poll.
- **WooCommerce import** only takes `processing`/`completed` orders (poll job filters `status=` at the
  Woo API; `triggerSync` marks other statuses SKIPPED). Line items resolve ProductMapping by
  `variation_id` → `product_id` only — never the line-item id; unmapped products become recipe-less
  `OrderItem`s carrying the Woo product name in `OrderItem.label` (`recipeId` is now nullable).
  Imported orders store `Order.customerName` (Woo billing name) + `Order.externalStatus` (Woo status).
  **Delivery date + method come from Pickupia** (the shop's delivery plugin, `pickupia.parser.ts`):
  order meta `_pickupia_delivery_groups` (`[{method, external_id, date}]`) → line-item
  `_pickupia_pickup_date` / `_pickupia_delivery_method_external_id` → order-level
  `_pickupia_pickup_date` / `_pickupia_delivery_method_name`. Earliest date = `Order.dueDate` (UTC
  midnight); method name(s) = `Order.deliveryMethod` (+ `deliveryPoint`). A group whose external id
  matches `Location.externalId` (per-org unique, set in location management) makes the order
  `PICKUP` from that location; otherwise `DELIVERY` with the Woo shipping address. Several groups are
  listed under "Livrări:" in the notes. The old free-text "…ridic…" line-item field is **deprecated
  fallback** — only used when no Pickupia date is present (`resolveWooDelivery`).
  **All of the shop-delivery behaviour is behind `Organization.wooDeliveryEnabled`** (PATCH
  `/organization`; the `20261018160000` migration turned it on for orgs with a Woo integration): off ⇒
  the import uses only the legacy text, no location matching, and Woo sales deduct by the legacy rule.
  On ⇒ `Location.isMainUnit` ("unitate principală") decides where `autoDeductWooOrder` deducts: the
  order's Pickupia pickup location when it is a main unit, else the oldest main unit, then the legacy
  fallbacks (org `defaultLocationId` → first MAGAZIN → first location).
- **Order views + delivery methods** (`orders/order-views.ts`). `GET /orders?view=intrari|livrari`:
  intrari (default) = createdAt desc; livrari = Europe/Bucharest delivery day desc with **no due date =
  today**, sorted in JS over light rows then the page is loaded by id. `?deliveryMethod=<name>` matches
  a whole `" + "`-joined part of `Order.deliveryMethod` (never a substring). `GET /orders/calendar`
  takes the same `view` (livrari default — undated orders land on today when it is in range; intrari
  buckets by createdAt) and `deliveryMethod`. `GET /orders/delivery-methods` → distinct method names
  with active counts + short names (`DeliveryMethodAlias`, per org); `PUT /orders/delivery-methods/alias
{name, shortName}` (empty clears; `manage Organization`). Clients map names → labels themselves.
  E2E: `test/woo-delivery.e2e-spec.ts`.
  Admin-gated `POST /api/v1/integrations/:id/woocommerce/backfill` pulls the last 90 days
  (processing/completed) through the same ExternalOrderSource → sync path, but only creates orders
  whose deadline (Pickupia date, else the ro-deadline parser) is today or later — past/undated ones are recorded
  as SKIPPED, and already-SYNCED external ids are never duplicated.
- **Deploy runs `prisma migrate deploy`** (`docker/deploy.sh` + `deploy-test.sh`, and
  `BackupService.syncSchema`), replacing the destructive `db push --accept-data-loss`. Migrations include
  a reconcile squash (`20260706230000`) for fresh DBs; live envs were baselined once —
  `docker/MIGRATION_BASELINE.md`.

## Domain notes (current behaviour)

- **Auth / sessions.** Access token 12h, refresh 30d, **multi-device** (login does NOT revoke other
  devices). Single-flight refresh on clients. Emails are **normalized to lowercase** at the DTO layer
  (`@Transform`), so all lookups are case-insensitive. After **5 failed logins** the account is locked
  (`User.lockedAt`, `failedLoginAttempts`) and the old password stops working — recover via reset.
- **Password module** (`modules/password`): forgot-password → emailed `PasswordResetToken` (1h),
  set-new-password, **blocks reuse of the last 3** (`PasswordHistory`), clears the lock. Admin
  **reactivate** locks the user + emails a 72h set-password link. Reset/reactivation links open the
  **web** `/reset-password` page.
- **Tasks.** `POST /tasks/:id/transition` returns **200** (not 201). Starting a task reserves stock
  first; if short it stays/moves to **BLOCAT** (+`shortages`) and throws **409
  `TASK_BLOCKED_INSUFFICIENT_STOCK`**. Semipreparate ingredients become **subtasks**. **Task
  dependencies and task templates were removed** — don't re-add them. `GET /tasks/:id/material-requirements`
  returns the **scaled** ingredient list (via `StockReservationService.previewForTask` → same
  `resolveTree` reservation uses, so displayed `needed` matches what gets deducted) with each material's
  `currentStock`, `available` (unreserved), and `stockAfter` (current − needed). Read-only; clients use
  it to show "Materiale necesare" without re-deriving the scale factor. `GET /tasks/preview-requirements?recipeId=&targetQuantity=&targetUnit=`
  returns the same shape **before a task exists** (via `StockReservationService.previewRequirements`,
  which `previewForTask` now also delegates to) — powers the task-create form's live recalc +
  insufficient-stock warning as the user edits the quantity. Lives on the tasks controller (not recipes)
  to avoid a stock↔recipes circular module dep. On **finalize**, `transition` passes the DTO's optional
  `outputLocationId` to `fulfillForTask`: goods are produced at the task's production location, and if the
  chosen destination differs, the stock is moved there and a `StockTransfer` (status `FINALIZAT`, a recipe
  line item) is auto-created as the foaie de drum.
- **Recipe archiving.** `Recipe.isArchived` (+`archivedAt`). `GET /recipes` defaults to
  **active only**; `?archived=true` returns the archive instead. The cofetar active-task
  restriction ignores the archive filter (a running task's recipe stays visible). Toggle via
  `PATCH /recipes/:id/archive` `{archived}` (gated `update Recipe`) — a **dedicated endpoint**,
  deliberately outside `PATCH /recipes/:id`, so flipping the flag never touches versioning.
  Use it for test/retired recipes that can't be deleted (tasks/orders reference them).
- **Byproducts.** `Recipe.isByproduct` (+ nullable self-FK `sourceRecipeId` → the recipe it
  remains from; back-relation `byproducts`). A byproduct is a SEMIPREPARAT left over after
  producing another recipe (create forces/validates `type=SEMIPREPARAT`; `sourceRecipeId`
  requires `isByproduct=true`). It behaves like any semipreparat (stock, ingredient use) —
  clients list it as its own group in ingredient pickers. `GET /recipes?byproduct=true|false`
  filters (omitted = all); `RecipeResponseDto` carries `isByproduct`, `sourceRecipeId` and a
  `byproducts[{id,name}]` summary (active only, via `RECIPE_INCLUDE`) that powers the recipe
  form's "lasă byproduct" checkbox. Flag/link are set at CREATE only (not in the update DTO).
  **Crediting on finalize:** the transition DTO takes optional `byproducts: [{recipeId, quantity}]`
  (FINALIZAT) — the operator-reported ACTUAL leftovers (trimmings vary per batch). Validated
  BEFORE the status flips against the active byproducts of the task's recipe AND its subtasks'
  recipes (`STOCK_004` otherwise); `fulfillForTask` credits them at the production location
  (RecipeStock + `INTRARE_PRODUCTIE` movement + shelf-life stamp + stock websocket event).
  When SENT the list is authoritative (unlisted byproducts get 0); when OMITTED a legacy
  fallback credits the produced recipe's own byproducts with `yieldQuantity × scaleFactor`
  (subtask-recipe byproducts get nothing without explicit quantities).
- **Recipe cost** (`GET /recipes/:id/cost`, single implementation in
  `RecipesService.getRecipeCost` — `PricingService.getRecipeMargin` delegates to it). Unit-aware:
  ingredient quantities are converted to the raw material's stock unit before multiplying.
  **Purchase prices are per COMMERCIAL unit** — RON/kg for mass, RON/litru for volume,
  RON/stock-unit otherwise — normalized via `unit-conversions/price-unit.ts`
  (`pricePerStockUnit`), so a material stocked in grams priced "6 RON/kg" costs 0.006/g.
  **VAT:** stored prices are the org's cost basis — net (fără TVA) when
  `Organization.vatPayer` (default), gross otherwise; price inputs may send
  `priceIncludesVat` and `common/vat.ts` converts using `vatRatePercent` (default 21).
  The transfer aviz unit price uses the same normalization. Price source: latest intake lot →
  fallback `RawMaterial.purchasePrice`. Semipreparat ingredients are costed recursively
  (sub-recipe total / yield, scaled; cycle-guarded). Any unpriceable/unconvertible ingredient
  ⇒ `totalCost: null` (clients render "—"); the row's `unitPrice` is expressed per the
  ingredient's own unit.
- **Categories — three separate lists** (`RecipeCategoryConfig`, `kind` column), endpoints under
  `/recipes/categories?kind=` (POST add, **PATCH** rename + re-tag, DELETE): **`MATERIE_PRIMA`**
  (`RawMaterial.category` + `Consumable.category`), **`SEMIPREPARAT`** (SEMIPREPARAT recipes), and
  **`PRODUS_FINIT`** (FINAL recipes). Category values are nullable strings into the matching list
  (**null = "Misc"**); rename/remove re-tags only the rows of that kind (recipes filtered by `type`).
  Legacy kinds are migrated idempotently on `RecipesService` init (`PRODUCT` → `MATERIE_PRIMA`,
  `RECIPE` → both `SEMIPREPARAT` + `PRODUS_FINIT`). "Materii prime" is a system category under
  `MATERIE_PRIMA`. The stock-movement item picker is category-driven (raw materials + consumables in
  one list), not raw-vs-consumable. **Display order is admin-controlled**, not alphabetical:
  `RecipeCategoryConfig.sortOrder` (and `CategoryKindColor.sortOrder` for super-categories) drive
  every listing; `PATCH /recipes/categories/reorder {kind, names}` and
  `PATCH /recipes/super-categories/reorder {kinds}` set it by index. The stock carousel
  (`/recipes/categories/carousel`) orders by super-category order then each category's `sortOrder`
  (NOT the kind slug); clients must render in server order and never re-sort by name.
- **Nutrition (feature-gated, default ON).** `Organization.nutritionEnabled` is the switch
  (PATCH `/organization`, admin) — every client hides nutrition UI while it's off. **Default is
  `true`** (clients need it); the `20260709120000_nutrition_on_by_default` migration also flipped
  every existing org on. An admin can still turn it off per org.
  `RawMaterial.nutrition` (Json, nullable) holds per-100g/100ml values
  `{calories, protein, carbs, sugars, fat, saturatedFat, fiber, salt}` — set via PATCH
  `/raw-materials/:id` (`NutritionValuesDto`, null clears via `Prisma.DbNull`).
  `GET /recipes/:id/nutrition` (`RecipeNutritionService`) resolves the recipe tree
  (semipreparate expanded like the requirements plan), converts quantities to grams/ml
  (BUCATI-stocked materials can't convert → listed in `missing`), sums per-100 values and
  returns total / perPiece / per100g + coverage. Endpoint itself is not gated — only UI is.
  **Only raw materials carry nutrition data**; semipreparate and final products derive it
  automatically via the tree roll-up (no per-recipe entry, no cooking-method modifiers —
  cooking doesn't change macronutrient mass, only weight/water). **Allergens:**
  `RawMaterial.allergens` (String[] of shared-types `Allergen` EU-14 keys) rides the same
  endpoints; the nutrition response's `allergens` field is the union over the resolved tree
  (`{allergen, sources[]}`, sources = contributing material titles). `per100g` divides the totals
  by `Recipe.finishedWeightGrams` (optional EU-1169 yield-factor input — the finished batch
  weight after baking water loss) when set, else by the summed raw ingredient weight; the
  response reports `per100Basis: 'finished' | 'ingredients'` + `finishedWeightGrams` so clients
  can label the basis. Set `finishedWeightGrams` via recipe create/update.
- **Tutorial mode** is a PER-USER, client-local preference (not an org/admin setting — each
  client stores its own on/off + per-step-dismissed state, e.g. web `localStorage`). The api side
  is just content: `GET /tutorial/content` (`modules/tutorial`, single-file module mirroring
  `changelog`, no auth gate) serves curated Romanian flows/steps from `tutorial.data.ts` — stable
  step `id`s are the anchor keys each client maps to a real UI element to show a small contextual
  hint the first time it's encountered (not a forced full-screen tour); steps with no anchor on a
  given client render as read-along text only in the help center, never block. Add new
  flows/steps by extending `TUTORIAL_FLOWS`; wiring a live anchor on a client is a one-line
  follow-up, not a schema change.
- **Requirements plan (necesar MP).** `POST /stock/requirements-plan` (200) takes
  `{items: [{recipeId, quantity}]}` (quantity in the recipe's own unit) and returns the aggregated
  raw-material needs for that ad-hoc production plan: per material `needed` (in its stock unit),
  global `currentStock`/`available`, `deficit` (= what to buy), and supplier. Unlike task
  reservation, **semipreparate are recursively expanded down to raw materials**
  (`RequirementsPlanService`, capped at 10 nesting rounds against recipe cycles), because a
  procurement plan wants the full ingredient need. `POST /stock/requirements-plan/export` returns
  the same as an `.xlsx` download (exceljs). Both gated by `read RawMaterial`.
- **Suppliers.** `Supplier` table (name + contact) with `RawMaterial.supplierId` FK. CRUD under
  `/suppliers` (gated by the `RawMaterial` ability). `GET /suppliers` returns each supplier with its
  materials + a `lowStockCount`, powering the "per furnizori" stock view (group low-stock to order
  fast). Deleting a supplier unlinks its materials (keeps the materials).
- **Traceability + FIFO lots.** `GET /tasks/:id/traceability` builds a traceability sheet for a
  produced task (FINAL/SEMIPREPARAT): product + quantity, operator + dates, consumed ingredients
  (from `IESIRE_PRODUCTIE` movements), semipreparate subtasks, and the status history. Each
  ingredient carries `lots[]` — the **exact intake lots consumed** (lot, invoice, supplier,
  quantity per lot): on finalize, `fulfillForTask` walks the material's `StockLot`s FIFO
  (`receivedAt` asc, `FOR UPDATE`), decrements `StockLot.remainingQuantity` and writes
  `LotConsumption` rows (task × lot × qty). Reception (`createMovement` INTRARE — the single lot
  creator, `batchReceive` delegates to it) sets `remainingQuantity = quantity`; a one-time startup
  backfill (`StockService.onModuleInit`, guarded on `LotConsumption` being empty) initializes
  pre-existing lots. Pre-FIFO tasks fall back to `lots: []` + heuristic top-level lot fields
  (newest lot ≤ consumption time, then the material's legacy fields).
- **Transfers.** Creating a transfer **deducts source `MaterialStock` immediately** (while
  `IN_ASTEPTARE`), so the requested stock is effectively reserved and can't be claimed by another
  transfer; `ANULAT` returns it, `FINALIZAT` adds it to the destination. **Status changes are
  idempotent:** `updateTransferStatus` claims the transition with a guarded `updateMany`
  (`where: {id, status: <expected>}`) inside the transaction — a concurrent/retried FINALIZAT (or
  ANULAT) matches zero rows and throws instead of double-crediting the destination / double-returning
  the source. **Aviz de însoțire** captures `delegateIdCard`, `transportMeans`, `dispatchedAt` (set at
  creation) and a digital receipt signature — `PATCH /stock/transfers/:id/aviz/sign` (multipart
  `signature` + `receiverName`, stores `receiverSignature` Bytes + `receivedAt`), image at
  `GET /stock/transfers/:id/aviz/signature` (PNG); the aviz payload surfaces all of these (blank
  hand-fill lines otherwise). Deleting a raw material entered by mistake is now gated on **stock 0 +
  no in-flight transfer only** — a past appearance on a _finalized_ transfer no longer blocks it
  (just an `everUsed` history warning). Produced-product stock (recipe) has manual movements too:
  `POST /stock/recipe-movements` (INTRARE/AJUSTARE, per-location). **Ad-hoc destinations**
  (event transports): `toLocationId` is nullable — send `destinationName` (+ optional
  `destinationAddress`) instead (XOR, validated in `createTransfer`). On `FINALIZAT` the goods
  **leave the system** (no destination increment; the item's global stockCount is resynced from
  its per-location rows). Responses always carry a `toLocation` block (synthesized with empty id
  from the free-text fields) plus `adhocDestination: boolean`; aviz/conformity payloads fall back
  to the free-text name/address. Each item's `unit` is forced
  to the material's stock unit (client-sent unit ignored). A transfer carries an optional
  `assignedToId` (transport person); moving it to **`IN_TRANZIT` requires an assignee** (set at
  creation or passed with the status change) — it can't teleport. `TransferResponseDto` includes
  the `approval` record (`{status, reason, approvedById}` or null) — approval is a review layer
  (`PATCH /stock/transfers/:id/approval`) that does **not** change `transfer.status`.
- **Material status is DERIVED at read time.** `modules/stock/material-status.util.ts`
  (`deriveMaterialStatus`) is the single rule (qty≤0 → OUT_OF_STOCK, qty≤min → LOW_STOCK,
  DISCONTINUED sticky): `/stock/stats`, the raw-materials/consumables list **status filter**
  (in-memory filter+paginate — Prisma can't compare two columns) and the row `status` in both
  toDto mappers all use it, and the ad-hoc transfer finalize rewrites the stored column with it.
  The stored `status` column can still be stale elsewhere — never trust it for new reads.
- **Product traceability (`GET /stock/traceability`, Acadeea).** Exactly one of `rawMaterialId` /
  `consumableId` / `recipeId`, optional `from`/`to` (ISO, inclusive, on the row date), gated `read
  StockMovement` (`services/stock-traceability.service.ts`). Rows (newest first, one per task × kind):
  `CONSUMED` = the item's `IESIRE_PRODUCTIE` movements tied to a task (summed; raw materials carry the
  FIFO intake lots from `LotConsumption`, float dust < 0.0005 skipped), `RESERVED` = live reservations
  (not fulfilled/released; date = task.plannedDate ?? reservation time), `PRODUCED` (recipes only) =
  `INTRARE_PRODUCTIE`. Plus `item` + `totals`. Web `/stock/traceability?…` and iOS
  `ProductTraceabilityView` ("Trasabilitate" button on raw material / consumable / recipe pages).
- **Item availability.** `GET /stock/item-availability?rawMaterialId=|consumableId=|recipeId=`
  (exactly one, gated `read StockMovement`) returns a one-item snapshot: `totalQuantity`,
  per-location `locations[] {locationId, locationName, quantity, reservedCount}` (empty for
  consumables — global stock), `reservedForTasks`/`activeTaskCount` (active `StockReservation`
  rows: `isFulfilled=false AND isReleased=false`), and `pendingTransfers[]` (transfer items on
  `IN_ASTEPTARE`/`IN_TRANZIT` transfers; empty for consumables). Powers the item-detail quick
  actions on clients: transfer source preselection and the "stoc rezervat" warning before a
  zeroing AJUSTARE. Movement responses also carry `createdByName` + `locationName` for history.
- **Sales deductions (scădere stoc din vânzări, `modules/sales-deductions`).**
  Gated by `SalesDeductionsFeatureGuard` (404 when off): `FEATURE_SALES_DEDUCTIONS=true|false`
  decides; unset ⇒ on unless `NODE_ENV=production`. **On in both test and prod** (both compose files
  set it, prod since 1.33.0) — Woo orders reaching processing are auto-deducted on prod. Flow: a source creates a DRAFT
  (`POST /sales-deductions/excel` multipart file+locationId — header-driven parser
  `sales-report.parser.ts`, .xlsx/.csv, legacy .xls rejected; `/manual`; `/woocommerce {from,to}` —
  aggregates stored `ExternalOrderSource` payloads, mapped via ProductMapping). Lines are matched by
  name (`name-matcher.ts`: learned `SalesProductAlias` → exact-normalized → token containment →
  Dice fuzzy; ≥0.85 pre-accepted, else suggested as candidates / CREATE_NEW). `POST /:id/confirm`
  takes the full reviewed line list (authoritative): ACCEPT (signed quantity, <0 adds back),
  DECLINE, CREATE_NEW (`newProduct {name, unit, initialStock}` → minimal FINAL recipe + RecipeStock).
  Stock never goes negative: selling more than on hand → **409 `SALES_001`** unless the line has
  `acceptShortfall` (clamp to 0, sale still logged in full) or `stockOverride` (absolute). Draft is
  claimed atomically (`SALES_002` on double confirm). One summary notification (confirmer +
  administrators). `POST /:id/revert` puts each line's net delta back; created products stay.
  New snapshot models registered in `backups/snapshot-models.ts`.
- **Resetare date (`modules/data-reset`).** Admin (`manage all`), own org only. `GET data-reset/preview`
  → every category (`data-reset.categories.ts`: TASKS, STOCK, TRANSFERS, ORDERS, SALES, NOTIFICATIONS +
  the "danger" RECIPES / RAW_MATERIALS) with its tables, `requires` (FK deps, auto-included — recipes
  pull tasks/stock/transfers/orders/sales; raw materials pull stock/transfers) and per-model row counts.
  `POST data-reset {categories, confirm:'RESETEAZA'}` → `BackupsService.createSnapshot` first (manual
  snapshot "Înainte de resetare (…)"), then ONE `$transaction` under `withOrgLock` deleting each
  category's tables children-first with the explicit org `where` from `snapshot-models.ts` (never the
  tenant context alone), then zeroes the denormalized counters (`stockCount`/`reservedCount`… on
  RawMaterial/Consumable/Recipe; reservations on MaterialStock/RecipeStock). Logged as SYSTEM
  `data.reset` WARN. There is deliberately NO "reset everything"; users/roles/locations/suppliers/
  equipment/categories/integrations are never touched. Pure-logic spec in `data-reset.categories.spec.ts`.
- **Selectează (`modules/bulk-actions`).** One controller (`api/v1`, registered FIRST in `AppModule`
  so its literal paths beat the resource controllers' `:id` routes) serves the seven list resources:
  `tasks`, `orders`, `stock/transfers`, `raw-materials`, `consumables`, `recipes`, `sales-deductions`.
  **Delete:** `POST <route>/bulk-delete/preview {ids}` → `{found, missing[], dependents[{key, label,
count}]}` = everything ELSE the delete would touch (summed over the selection; labels in
  `bulk-actions.resources.ts`). `POST <route>/bulk-delete {ids, cascade?}` → `{deleted[], failed[{id,
reason}]}`: each id runs in its own transaction, failures never abort the batch; with `cascade` false a
  row that has dependents is refused ("Are dependențe — …"), with `cascade: true` (clients send it after
  the user confirmed the preview) dependents are removed/unlinked so the delete always goes through.
  Routines in `bulk-delete.service.ts` list every RESTRICT FK on purpose (Prisma's default for optional
  FKs is SetNull, which would leave XOR-orphans): tasks (subtasks first, live reservations released via
  `StockReservationService`), orders (delivery note gone, external sources unlinked), transfers (active
  ones return stock to the source), raw materials / consumables (whole stock trail), recipes (their tasks
  via the task routine, order/sales lines unlinked keeping the name, semipreparat ingredient rows of other
  recipes removed, transfer lines removed, stock/lots/movements/yield/price/mappings deleted), sales
  deductions (CONFIRMED → `revert` first). **Other actions:** `POST <route>/bulk-action {ids, action,
params?}` → `{done[], failed[]}` (`bulk-action.service.ts`): the allowed keys per resource live in
  `BULK_ACTIONS` (tasks status|assign|plannedDate|dueDate|priority|location; orders
  status|assign|dueDate|archive; transfers status (IN_TRANZIT defaults the transporter to the actor);
  raw-materials category|status|supplier|minimumStock; consumables category|status|minimumStock; recipes
  archive|draft|category; sales-deductions discard|revert). Params are validated once (400 before any row),
  then every id goes through the resource's EXISTING single-row service call (`TasksService.transition`,
  `OrdersService.update`, `LocationsService.updateTransferStatus`, …) so status machines and stock side
  effects are reused untouched; per-row failures carry the service's Romanian message. Policies mirror the
  single DELETE / PATCH of each resource (sales: `create StockMovement`); logged as SYSTEM `bulk.delete`
  WARN / `bulk.action` INFO. Tests: pure-logic spec `bulk-actions.resources.spec.ts`; end-to-end smoke
  `test/smoke/bulk-delete.py` (52 checks) + `test/smoke/bulk-action.py` (49 checks) against a local API
  seeded with `prisma:seed` + `prisma:seed-demo` (demo user promoted to administrator, plus a `user`-role
  account for the 403 checks).
- **Jurnal sistem (`modules/system-logs`, global).** Durable `SystemLog` table (org-scoped, null org
  = system-wide; 90-day retention via `SystemLogRetentionJob`, `SYSTEM_LOG_RETENTION_DAYS`).
  `RequestLogMiddleware` journals every non-GET request + every 4xx/5xx (any method; non-auth 401s
  skipped as token-refresh noise) on `finish` — user, org, route pattern, status, duration, error
  text (`res.locals.errorMessage`, set by `HttpExceptionFilter`), sanitized params/query/body
  (`sanitizeForLog` redacts password/token/signature…, truncates long strings). Auth events without
  a user are attributed to the org of the email. Inject `SystemLogsService` anywhere:
  `log({category, action, message, level?, organizationId?, …})` is fire-and-forget (never throws);
  `trackJob(action, fn, describe, orgId)` wraps cron work. Categories: HTTP | AUTH | EMAIL | JOB |
  INTEGRATION | SYSTEM. **All email goes through `EmailService.send()`** which journals success /
  failure with the SMTP reason. Read: `GET /system-logs` (`manage all`, own org; platform admins
  `allOrgs=true`), `GET /system-logs/access`. Raw container logs use the **journald** driver (survive
  redeploys; `journalctl CONTAINER_TAG=acadeea-prod-api`), pino access log is compact (no headers,
  - user/org). Not part of org snapshots.
- **Invitations.** Re-inviting an email REPLACES its pending invitation (fresh token = resend). If
  the email fails the invitation is rolled back and the API returns **502 `EMAIL_SEND_FAILED`** with
  the SMTP reason. Resend only accepts verified sender domains — `SMTP_FROM` must be `@horae.ca`.
- **Routing gotcha.** `UsersController` and `InvitationsController` share base `api/v1/users`; the
  `:id` route is UUID-constrained (`@Get(':id([0-9a-fA-F-]{36})')`) so it doesn't shadow
  `/users/invitations`.

## When you change things here

- New **tenant-scoped model** → give it an `organizationId` (+ back-relation on `Organization`), make any
  "unique" composite-unique with `organizationId`, and ship a **migration** (`prisma:migrate`) — not a
  `db push`. The tenant extension then scopes it automatically.
- New/changed **model** → migrate, regenerate, and mirror into web/iOS/android (see root `CLAUDE.md`).
- New/changed **shared enum or error code** → update `packages/shared-types` too.
- New **endpoint** → it appears in `/api/docs`; run `openapi:export` and note it in
  `docs/ARCHITECTURE.md` §3 if it's part of the cross-app surface.
- Roles/permissions live in `seed.ts` — that's the authoritative role set, not the shared-types enum.
  </content>
