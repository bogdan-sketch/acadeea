# Organization, settings, backups, logs, dashboard

Sources: `api:organization/*`, `api:recipes/recipes.controller.ts` (categories), `api:backups/*` (per-org snapshots), `api:backup/*` (platform pg_dump), `api:data-reset/*`, `api:system-logs/*`, `api:changelog/changelog.module.ts`, `api:tutorial/tutorial.module.ts`, `api:design-feedback/design-feedback.module.ts`, `api:dashboard/*`, `api:analytics/*`, `api:activity/*`, web `web:profil/**`, `web:settings/**` (`/settings` → `/profil?tab=setari`, `/settings/branding` → `/profil?tab=setari#identitate`), `apps/web/src/app/changelog/page.tsx`, iOS `ios:Settings/**`, `ios:Changelog/**`, `ios:Dashboard/**`, `ios:Analytics/**`, `ios:Activity/**`.

## Endpoints

| Method + path                                                                                                                                                  | Policy                            | Body / query                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------- | --------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /organization`                                                                                                                                            | signed in                         | caller's org (branding + legal identity + VAT + defaults)                                                     |
| `PATCH /organization`                                                                                                                                          | manage Organization               | `{name≤100, accentColor #RRGGBB, secondaryColor?, tertiaryColor?, brandingTokens?, fontFamily (inter          | manrope    | lora      | poppins  | system   | null), defaultDeliveryLocationId?, defaultLocationId?, appIconName?, nutritionEnabled?, vatPayer?, vatRatePercent 0..100, cui≤20, legalAddress≤300, regCom≤30, contactPhone≤30, contactEmail≤120, website≤120, administratorName≤120}` |
| `POST /organization/logo`                                                                                                                                      | manage Organization               | multipart `logo` + `variant` (login-light                                                                     | login-dark | app-light | app-dark | default) |
| `DELETE /organization/logo?variant=`                                                                                                                           | manage Organization               | —                                                                                                             |
| `GET /organization/by-slug/:slug`, `/by-slug/:slug/logo/:variant`                                                                                              | public                            | —                                                                                                             |
| `GET/POST /organizations`                                                                                                                                      | platform admin                    | `{name, slug?, …}`                                                                                            |
| `GET /recipes/categories?kind`, `/categories/detailed?kind`, `/categories/counts?type`, `/categories/carousel`, `/super-categories`                            | read Recipe                       | —                                                                                                             |
| `POST /recipes/categories`, `PATCH /recipes/categories/:name`, `DELETE /recipes/categories/:name?kind`, `PATCH /recipes/categories/reorder`, `/reorder-global` | manage Recipe                     | `{name, kind, color?, parentName?}` / `{newName?, kind, color?}` / `{kind, names[]}` / `{items[{name,kind}]}` |
| `POST /recipes/super-categories`, `PATCH /recipes/super-categories/:kind`, `/reorder`, `DELETE /recipes/super-categories/:kind`                                | manage Recipe                     | `{name, color}` / `{name?, color?}` / `{kinds[]}`                                                             |
| `GET/POST /backups/snapshots`, `POST /backups/snapshots/:id/restore`, `GET …/:id/download`, `DELETE …/:id`                                                     | manage all                        | create `{label?≤200}`; restore `{confirm:'RESTAUREAZA'}`                                                      |
| `GET /backups`, `POST /backups/run`, `POST /backups/:name/restore`, `GET /backups/export`, `POST /backups/import`                                              | manage all **and** platform admin | whole-database pg_dump                                                                                        |
| `GET /data-reset/preview`, `POST /data-reset`                                                                                                                  | manage all                        | `{categories[], confirm:'RESETEAZA'}`                                                                         |
| `GET /system-logs/access`, `GET /system-logs`                                                                                                                  | signed in / manage all            | level, category, search, period, `allOrgs` (platform admin)                                                   |
| `GET /changelog`, `GET /tutorial/content`                                                                                                                      | public                            | —                                                                                                             |
| `GET /dashboard/stats[?locationId]`                                                                                                                            | signed in                         | —                                                                                                             |
| `GET /analytics/{summary,production,stock,orders,users}`                                                                                                       | read Recipe                       | `from, to`                                                                                                    |
| `GET /activity`                                                                                                                                                | signed in                         | `page, limit`                                                                                                 |
| `GET/POST /design-feedback`, `PATCH /design-feedback/:id/resolve`                                                                                              | **public**                        | design-review comments                                                                                        |

---

## ORG-01 Company identity and VAT

- **Actor:** manage Organization (administrator). **Steps:** web `/profil?tab=setari` (identity block) or `/settings/company` → `PATCH /organization` (`web:settings/company/page.tsx:212-215`). iOS: `ios:Settings/Views/SettingsView.swift`.
- **Rules:** field limits above (`api:organization/dto/update-organization.dto.ts`). `vatPayer` + `vatRatePercent` decide how purchase prices sent with `priceIncludesVat` are normalised (`apps/api/src/common/vat.ts`): payer → stored net, non-payer → stored gross. Legal fields print on avize, delivery notes and certificates.
- **Web:** `/profil?tab=setari`, `/settings/company`. **iOS:** `SettingsView`.

## ORG-02 Default production location

- **Steps:** `/profil?tab=setari` → location chips → `PATCH /organization {defaultLocationId}` (`web:profil/_ui/setari-tab.tsx:255,431`).
- **Rules:** only validated as a UUID; used by task creation (`tasks.service.ts:1373-1386`) and by Woo auto-deduction (broken outside the first org, see sales-deductions discrepancy 1); web pre-fills forms with it (`apps/web/src/lib/default-location.ts`). `defaultDeliveryLocationId` is the analogue for deliveries.
- **Web:** `/profil?tab=setari`. **iOS:** `ios:Stock/Views/LocationListView.swift` (sets the default location).

## ORG-03 Logo (login and in-app, light/dark)

- **Steps:** `/profil?tab=setari#identitate` (`web:profil/_ui/logo-card.tsx`) → `POST /organization/logo` (multipart `logo`, `variant`) → stored as a base64 data URI on the org row; served by `GET /organization/by-slug/:slug/logo/:variant` (`api:organization/organization.service.ts:181-200,285-297`). `DELETE /organization/logo?variant=` clears it (non-default variants also clear the legacy `logoUrl`).
- **Web:** `/profil?tab=setari`. **iOS:** `ios:Settings/Views/BrandingSettingsView.swift`.

## ORG-04 Colour scheme (personal, per device)

- **Steps:** web `/profil` → Preferințe → scheme picker (`components/scheme-picker.tsx`); iOS `SchemePickerGrid`.
- **Rules:** six designed schemes `atelier, lapte, miere` (light) and `cacao, ardezie, piper` (dark), stored per browser in `localStorage` (`components/color-scheme-provider.tsx:24-100`) and per device on iOS (`apps/ios/Horae/Core/Theme/AppScheme.swift:12-32`). Not stored on the server.
- **Org palette:** `accentColor/secondaryColor/tertiaryColor/fontFamily/brandingTokens` via `PATCH /organization`; `brandingTokens` are sanitised to whitelisted keys, an empty result → 400 "brandingTokens nu conține nicio valoare validă" (`organization.service.ts:120-151`).
- **Web:** `/profil`. **iOS:** `ios:Settings/Views/SchemePickerGrid.swift`.

## ORG-05 Public branding before login

- **Steps:** org subdomain `/login` → `GET /organization/by-slug/:slug` → name, colours, font, logo URLs only (no legal data) (`organization.service.ts:203-225`). Unknown or inactive org → 404.
- **Web:** `/login`. **iOS:** branding comes from the login response.

## ORG-06 Categories (bento dial)

- **Model:** three system super-categories (kinds) `MATERIE_PRIMA` (Materii prime, raw materials + consumables), `SEMIPREPARAT`, `PRODUS_FINIT`, plus custom kinds; each kind holds flat categories, one optional level of sub-categories; sub-categories inherit the parent colour (`recipes.service.ts:1013-1064`). Legacy kinds `PRODUCT`/`RECIPE` are migrated at boot (`:66-160`).
- **Steps:** `/settings/categories` (web) / `CategoryManagementView` (iOS) → add `POST /recipes/categories {name, kind, color?, parentName?}`; rename/recolour `PATCH /recipes/categories/:name {newName?, kind, color?}`; delete `DELETE /recipes/categories/:name?kind=`; reorder within a kind `PATCH /categories/reorder`, across kinds `PATCH /categories/reorder-global`; super-categories create/rename/recolour/reorder/delete.
- **Rules:** empty name → 400; existing name → silently returns the list (no error) (`:1279-1291`); parent must exist and be top level (`:1293-1302`); system categories cannot be renamed or deleted (`:1342-1344,1374-1375`); rename clash → 400; rename/delete re-tags raw materials + consumables (MATERIE_PRIMA), semipreparate or final recipes (`:947-981`); system super-categories cannot be deleted; deleting a custom super-category deletes its categories (`:1126-1140`).
- **Web:** `/settings/categories`. **iOS:** `ios:Settings/Views/CategoryManagementView.swift`, `CategoryReorderView.swift`.

## ORG-07 Organisation snapshots (backup / restore)

- **Actor:** administrator (`manage all`). **Steps:** `/settings/backups` → "Creează" `POST /backups/snapshots {label?}` → list `GET /backups/snapshots` → download `GET /backups/snapshots/:id/download` → restore: type `RESTAUREAZA` → `POST /backups/snapshots/:id/restore {confirm:'RESTAUREAZA'}` → client logs out → delete `DELETE /backups/snapshots/:id`.
- **Rules (`api:backups/backups.service.ts`):** snapshot = gzip JSON of all org tables, file `org-snapshots/<org>/<stamp>.json.gz` on the API volume (`:132-200`); one snapshot/restore at a time per org, in-process lock → 400 (`:516-527`); restore confirm must match → 400 (`:207-211`); snapshot must belong to the org and be version 1 (`:216-219`); one transaction (10 min): delete restorable tables, revoke **all** refresh tokens, upsert roles, **delete users not in the snapshot**, upsert snapshot users, reinsert data (`:259-338`). Download only for emails in `BACKUP_ADMIN_EMAILS` (default `admin@acadeea.ro,sergiu@tigan.dev`) → 403 (`:34,384-398`).
- **Nightly:** 01:30 auto snapshot per active org, keep newest 30 auto snapshots (`backups.job.ts:26`, `AUTO_RETENTION`).
- **Web:** `/settings/backups`. **iOS:** `ios:Settings/Views/BackupSettingsView.swift` (restore + forced logout, `BackupViewModel.swift`).

## ORG-08 Whole-database backups (platform operator)

- **Actor:** platform admin. **Steps:** `GET /backups`, `POST /backups/run`, `POST /backups/:name/restore`, `GET /backups/export`, `POST /backups/import`.
- **Rules:** pg_dump custom format, daily 03:00 UTC + catch-up at boot, newest N kept; restore takes a safety dump first, kills connections, `pg_restore --single-transaction`, re-syncs the schema (`api:backup/backup.service.ts:1-40`).
- **Web:** client functions exist (`apps/web/src/lib/api.ts:1740-1780`) but no screen calls them. **iOS:** missing.

## ORG-09 Reset data

- **Actor:** administrator. **Steps:** `/settings/reset` → `GET /data-reset/preview` (categories + row counts) → choose categories (TASKS, STOCK, TRANSFERS, ORDERS, SALES, NOTIFICATIONS, RECIPES, RAW_MATERIALS; dependencies pulled in) → type `RESETEAZA` → `POST /data-reset {categories, confirm:'RESETEAZA'}`.
- **Rules (`api:data-reset/data-reset.service.ts:68-131`):** wrong confirm → 400; no category → 400; **a snapshot is taken first**, then the org-scoped wipe, counters reset, SystemLog entry.
- **Web:** `/settings/reset`. **iOS:** `ios:Settings/Views/DataResetView.swift`.

## ORG-10 System journal ("Jurnal sistem")

- **Steps:** `/settings/logs` → `GET /system-logs/access` (`{platformAdmin}`) → `GET /system-logs?…`.
- **Rules:** written by the request middleware for every non-GET request and every failure (4xx/5xx; 401 only on auth routes), plus email, job and integration events (`api:system-logs/request-log.middleware.ts`); bodies sanitised; purged after `SYSTEM_LOG_RETENTION_DAYS` (default 90) daily at 03:30 Europe/Bucharest (`system-log-retention.job.ts:18-20`); `allOrgs=true` only for platform admins → 403 (`system-logs.controller.ts:37-60`).
- **Web:** `/settings/logs`. **iOS:** missing.

## ORG-11 Changelog / "Noutăți"

- **Steps:** `GET /changelog` → `{currentVersion, entries}` from `changelog.data.ts`. Web `/changelog`; iOS `ChangelogView` + `WhatsNewSheet` on a new version.
- **Web:** `/changelog`. **iOS:** `ios:Changelog/Views/ChangelogView.swift`, `WhatsNewSheet.swift`.

## ORG-12 Tutorial and help

- **Steps:** `GET /tutorial/content` (public, `tutorial.data.ts`) drives anchored tutorial overlays (`components/tutorial-overlay.tsx`, iOS `Tutorial/*`); `/help` and iOS `HelpCenterView` are static.
- **Web:** `/help`. **iOS:** `ios:Help/Views/HelpCenterView.swift`.

## ORG-13 Provision a new organisation (platform)

- **Actor:** platform admin (`PLATFORM_ADMIN_EMAILS`). **Steps:** `POST /organizations {name, slug?, admin…}`.
- **Rules (`api:organization/organizations-admin.service.ts:45-135`):** slug from name if omitted; empty slug → 400; reserved slugs `www, api, app, test, admin, mail, status` → 400; duplicate slug → 409; clones the standard roles, creates the first admin (legacy role `ADMINISTRATOR`), seeds defaults.
- **Web/iOS:** missing (API only).

## ORG-14 Dashboard

- **Steps:** web `/` → `GET /dashboard/stats[?locationId]` (`api:dashboard/dashboard.service.ts`); iOS `DashboardView`.
- **Web:** `/`. **iOS:** `ios:Dashboard/Views/DashboardView.swift`.

## ORG-15 Analytics

- **Steps:** web `/stats` → `GET /analytics/summary|production|orders|users`; iOS `AnalyticsDashboardView` (also `/analytics/stock`).
- **Rules:** every analytics route needs only `read Recipe`, including per-user productivity (`analytics.controller.ts:22-64`).
- **Web:** `/stats`. **iOS:** `ios:Analytics/Views/AnalyticsDashboardView.swift`.

## ORG-16 Activity feed

- **Steps:** web `/activity` → `GET /activity`; iOS `ActivityFeedView` + live `activity:new`.
- **Rules:** merges latest task status changes, INTRARE/AJUSTARE movements and orders (`api:activity/activity.service.ts:25-160`).
- **Web:** `/activity`. **iOS:** `ios:Activity/Views/ActivityFeedView.swift`.

---

## Discrepancies

1. **`GET /activity` leaks other organisations' task history.** `TaskStatusHistory` has no `organizationId` (not tenant-scoped) and `getTaskEvents` queries it with no filter (`activity.service.ts:61-66`): every org sees the latest task transitions, recipe names and user names of all orgs.
2. **Analytics mix organisations.** `recipeYieldHistory.findMany` (`analytics.service.ts:47-50`) and `orderItem.findMany` (`:183-186`) hit unscoped models without an org filter, so yield variance and "popular products" include other tenants' data.
3. **Snapshot restore deletes users created after the snapshot** and revokes every session (`backups.service.ts:259-338`), including possibly the admin who restored. No safety snapshot is taken before a restore (data reset does take one).
4. **`design-feedback` is public and unscoped.** Anyone can list, add and resolve design comments (`design-feedback.module.ts:97-118`); `DesignComment` has no org.
5. **`defaultLocationId` is not checked against the org's locations** (UUID only, `update-organization.dto.ts`); a deleted or foreign id is stored and silently ignored later.
6. **Duplicate category add is a silent success** (`recipes.service.ts:1288-1291`); clients cannot tell "created" from "already existed". Deleting a custom super-category leaves recipes/materials still tagged with its category names (no re-tag, `:1126-1140`).
7. **Category routes take raw `@Body('name')` strings** (`recipes.controller.ts:104-190`) without DTO validation.
8. **Snapshot download allow-list has hard-coded fallback emails** (`backups.service.ts:34`) independent of roles.
9. **`docs/ENVIRONMENTS.md` is stale on iOS bundle ids** (`dev.tigan.acadeea[.test]`); push uses `ca.horae.app[.test]` (`api:notifications/push-sender.service.ts:1-20`).
