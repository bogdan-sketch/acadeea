# Horae — user flows reference

This is the reference for test writers and future builders. Every flow says who does it, what must be true first, which screen and API calls it uses, the rules the server enforces (with `file:line`), side effects, failure modes, and whether it exists on web and iOS.

Snapshot: branch `feat/web-redesign` @ `f060e2e` (17.10.2026). Line numbers point at that commit. When code moves, update the line numbers in the same PR.

## Index

| File                                       | Domain                                                                                        | Flow IDs                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------- |
| [auth.md](auth.md)                         | Login, refresh, Apple/Google, handoff, invite, password reset, delete account, throttles      | `AUTH-*`                  |
| [users-roles.md](users-roles.md)           | Users, invitations (admin side), roles and permissions                                        | `USR-*`, `ROLE-*`         |
| [recipes.md](recipes.md)                   | Recipes, semipreparate, byproducts, versions, pricing, photos, categories                     | `REC-*`, `PRC-*`          |
| [stock.md](stock.md)                       | Raw materials, consumables, lots, FIFO, locations, movements, transfers, review, requirements | `STK-*`, `LOC-*`, `TRF-*` |
| [tasks.md](tasks.md)                       | Production tasks, reservations, transitions, yield, board                                     | `TASK-*`                  |
| [orders.md](orders.md)                     | Orders, items, delivery notes, invoices, certificates, calendar, stats                        | `ORD-*`                   |
| [sales-deductions.md](sales-deductions.md) | Stock deduction from sales (eBriza file, manual, site)                                        | `SALE-*`                  |
| [organization.md](organization.md)         | Org settings, branding, categories, backups, logs, reset, changelog                           | `ORG-*`                   |
| [integrations.md](integrations.md)         | WooCommerce / eBriza integrations, sync, product mapping                                      | `INT-*`                   |
| [notifications.md](notifications.md)       | Push, inbox, WebSocket events, scheduled jobs                                                 | `NTF-*`                   |
| [TEST-MATRIX.md](TEST-MATRIX.md)           | Every flow ID with priority and coverage columns                                              | —                         |

## Conventions

- Paths are relative to the repo root. `api:` = `apps/api/src/modules/`, `web:` = `apps/web/src/app/(dashboard)/` (unless a full path is given), `ios:` = `apps/ios/Horae/Features/`.
- All endpoints are under `/api/v1`. The tables write `POST /tasks/:id/transition` for `/api/v1/tasks/:id/transition`.
- Flow template: **Actor** · **Preconditions** · **Steps** · **Rules** · **Side effects** · **Failures** · **Web** · **iOS**.
- "Policy" = the `@CheckPolicies` handler on the route. No policy on a guarded controller = any signed-in user (`api:auth/casl/policies.guard.ts:33-36`).
- Request bodies are validated with `whitelist: true, forbidNonWhitelisted: true` (`apps/api/src/main.ts:41-44`): **an unknown field gives 400**. Test writers: send only the DTO fields listed.
- Error body (global `HttpExceptionFilter`, `apps/api/src/common/filters/http-exception.filter.ts:23-47`): `{ statusCode, errorCode, message, correlationId, timestamp }`. `errorCode` is the explicit code when the service throws one (e.g. `ACCOUNT_LOCKED`), else the HTTP status name (`BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, `UNAUTHORIZED`). Domain codes live in `packages/shared-types/src/error-codes.ts`.
- Lists are paginated: `{ data, total, page, limit, totalPages }` unless the flow says otherwise.
- "Discrepancies" at the end of each domain file lists places where web, iOS and API disagree, or the code contradicts a doc/comment. Those are bugs or decisions waiting to happen, not documentation errors.

## Environments

|          | Prod                                                                  | Test                                                                 |
| -------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| API      | `https://api.horae.ca`                                                | `https://api-test.horae.ca`                                          |
| Web      | `https://<slug>.horae.ca` (apex `horae.ca` = landing + generic login) | `https://<slug>.test.horae.ca`, e.g. `https://acadeea.test.horae.ca` |
| Seed org | `acadeea`                                                             | `acadeea` (name "Horae.ca Test")                                     |
| Swagger  | `/api/docs`                                                           | `/api/docs`                                                          |

Source: `docs/ENVIRONMENTS.md`. Legacy hosts `app.acadeea.ro` / `app-test.acadeea.ro` map to the seed org (`NEXT_PUBLIC_LEGACY_HOSTS`, `apps/web/src/lib/tenant.ts:19-37`).

### How the tenant is chosen

- **API:** the tenant comes from the **JWT**, not from the host. `organizationId` + `orgSlug` are in the access token; `TenantInterceptor` (`apps/api/src/common/interceptors/tenant.interceptor.ts`) runs the request inside `tenantStorage` and a Prisma extension scopes every org-owned model. Tokens without `organizationId` are rejected with 401 (`api:auth/strategies/jwt.strategy.ts:36-38`).
- **Web:** the subdomain picks the org for **branding before login** (`GET /organization/by-slug/:slug`, public) and decides where the session lives. `classifyHost()` (`apps/web/src/lib/tenant.ts:33-58`): apex → landing/login, `<slug>.<root>` → org app, `*.vercel.app` → preview. If you log in on another org's subdomain, the web clears tokens and redirects with a handoff code to the right subdomain (see `AUTH-04`).
- **iOS:** one app per environment (scheme `Horae` = prod API, `Horae Test` = test API, `apps/ios/Horae/Core/Config/AppConfig.swift`). The org comes from the login response; no subdomain.
- Public routes (no token): login, refresh, handoff redeem, Apple/Google, forgot/reset password, invite status/accept, `organization/by-slug/*`, `images/:id`, `changelog`, `tutorial/content`, integration webhooks, `design-feedback`.

## Roles and permissions model

**Server (the only enforcement point).** CASL abilities are built from the DB role (`Role` + `RolePermission`), keyed by the role **slug carried in the JWT**, cached 60 s per `org:slug` in process memory (`api:auth/casl/casl-ability.factory.ts:45,59-99`). Slug `administrator` short-circuits to `manage all` without a DB query (`:63-67`). Unknown slug → no permissions. Because the slug is in the token, a role change takes effect for the user only after their next token refresh (access token lives 12 h, `apps/api/src/app.module.ts:88`).

Actions: `create | read | update | delete | manage` (`manage` = all actions). Subjects (`api:auth/casl/casl-ability.factory.ts:8-25`, `api:roles/roles.service.ts:14-31`):
`User, RawMaterial, Consumable, Recipe, RecipeCost, Task, StockMovement, StockReservation, UserInvitation, Order, OrderItem, DeliveryNote, Location, StockTransfer, Organization, Role, all`.

Seeded roles (`api:roles/role-definitions.ts`), cloned into each org:

| Subject                 | administrator | sef-cofetar          | cofetar                      | gestionar            | sofer                | user |
| ----------------------- | ------------- | -------------------- | ---------------------------- | -------------------- | -------------------- | ---- |
| all                     | manage        |                      |                              |                      |                      |      |
| Recipe                  | ✓             | read                 | — (only from an active task) |                      |                      |      |
| RecipeCost              | ✓             | read                 |                              |                      |                      |      |
| Task                    | ✓             | manage               | read, update                 |                      |                      | read |
| Order                   | ✓             | read, create, update | read, create, update         |                      |                      |      |
| OrderItem               | ✓             | read                 | read                         |                      |                      |      |
| RawMaterial, Consumable | ✓             | read, create, update | read, create, update         | read, create, update |                      |      |
| StockMovement           | ✓             | read, create         | read, create                 | read, create         |                      |      |
| StockReservation        | ✓             | read                 |                              |                      |                      |      |
| Location                | ✓             | read                 | read                         | read                 | read                 |      |
| StockTransfer           | ✓             | read, create, update | read, create, update         | read, create, update | read, create, update |      |
| DeliveryNote            | ✓             | read, create         | read, create                 | read, create         | read, create         |      |

`administrator` and `user` are system roles (cannot be deleted). Many admin features are guarded by `manage all`, i.e. **administrator only** in practice: backups, data reset, integrations, stock import/export/review, unit-conversion writes, system logs, `GET /stock/export`.

**Platform admin** is separate: emails in `PLATFORM_ADMIN_EMAILS` (`api:organization/platform-admin.guard.ts`). Needed for `/organizations` (tenant provisioning), legacy `/backups` (whole-DB dumps) and `system-logs?allOrgs=true`.

**Web `can()` is not driven by the server.** `usePermissions()` (`apps/web/src/contexts/auth-context.tsx:279-293`) looks the user's role slug up in a **hard-coded map** (`:183-276`) and ignores the `permissions` array the API returns. Web subjects differ from API subjects: web uses `Transfer` (API `StockTransfer`), `Invitation`, `Activity`, `Equipment`, `Integration` (no API equivalents). Any custom role, or any permission edit made in the Roles screen, is invisible to the web UI. Web checks used in screens: `can('create','StockMovement')` ×11, `can('manage','all')` ×7, `can('update','Task')` ×5, `can('create','Transfer')` ×5, then Recipe/RawMaterial/Order/User/Organization/Location checks.

**iOS `PermissionManager`** (`apps/ios/Horae/Core/Permissions/PermissionManager.swift:34-50`) uses the server `permissions` array from login/`me` — it matches the API.

## Units and formatting rules

- **Metric only.** Stock and recipe units are the Prisma enum `UnitType` (`apps/api/src/prisma/schema.prisma:74`): `MILIGRAME, GRAME, KILOGRAME, MILILITRI, LITRI, BUCATI, LINGURITE, LINGURI, CANI, OUNCES, POUNDS`. The enum still contains `OUNCES`/`POUNDS` and kitchen measures; web shows labels `oz`/`lbs` (`apps/web/src/lib/constants.ts:133-134`). New UI must not offer them (owner rule).
- Display scaling: show the largest unit where the number stays ≥ 1 (3000 g → "3 kg", 0,0037 kg → "3,7 g"); `buc` stays `buc`. Web `formatUnitQty`/`scaleUnitQty` (`apps/web/src/lib/utils.ts:61-104`). Never scale values in inputs or payloads: those stay in the stock unit.
- Prices: `purchasePrice` is per **commercial** unit (RON/kg for mass, RON/l for volume, RON/stock unit otherwise), normalised in `api:unit-conversions/price-unit.ts`.
- Numbers: Romanian locale, decimal comma (`ro-RO` on web, `ro_RO` on iOS `Core/Theme/RoFormat.swift:7`).
- Dates: **day before month** (`dd.MM.yyyy`, `d MMM`, `dd MMM yyyy`). Never `MM/DD`. API dates are ISO-8601 UTC; date-only API params are `yyyy-MM-dd`.
- Time: **24-hour** (`HH:mm`). Never AM/PM.
- Weeks: **Monday → Sunday** (`weekStartsOn: 1`, e.g. `web:tasks/page.tsx:104`, `web:calendar/page.tsx:49`).
- UI language: Romanian product copy. Server error messages are mixed English/Romanian; clients map `errorCode`, not message text (see discrepancies where they still match on text).
