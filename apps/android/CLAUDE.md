# apps/android — Kotlin / Jetpack Compose App

Native Android client. **Early-stage:** networking, auth, and core read/transition flows work; several
modules are stubs (see maturity table). Kotlin + Compose + Hilt + Retrofit. Talks to `apps/api` over
REST (`/api/v1`). Read with the root `CLAUDE.md` and `docs/ARCHITECTURE.md` for the API/auth contract.

## Stack

Kotlin 2.0 · Jetpack Compose (BOM 2024.06) · MVVM + **Hilt** DI · **Retrofit 2.11** + OkHttp 4.12 +
**Moshi** (codegen) · Navigation Compose · `androidx.security.crypto` (EncryptedSharedPreferences) ·
Coroutines 1.8 · Timber · **Coil 2.7** (org logo, profile photos). minSdk 26, targetSdk 34, JDK 17.
Versions pinned in `gradle/libs.versions.toml`. Package `com.horae.app` (the `com/acadeea` paths
below are historical — the tree is now `app/src/main/java/com/horae/app/`).

## Redesign structure (slices A–D, integrated 2026-10-17 on `feat/android-integrate`)

**Theme (`ui/theme`).** `AppScheme` enum = the 6 designed schemes shared with web
(`globals.css :root[data-scheme=…]`) and iOS `AppScheme.swift`: ATELIER (default), LAPTE, MIERE,
CACAO, ARDEZIE, PIPER — each a full token set (background/"paper", card, ink, muted, border,
primary + onPrimary, accent-as-text, …). No colour picker. `SchemeStore.scheme` persists the
choice (Profil › Setări › `SchemePicker`); read tokens with `HoraeTheme.scheme` /
`LocalAppScheme.current`, never hard-code colours. `StatusPalette.kt` = semantic status tints
(never re-tinted by scheme). `Theme.kt` maps the scheme onto the Material 3 `ColorScheme`.
**Type.kt:** Fraunces 600 for titles/big numbers (`AppFont.title`, `AppFont.display`), DM Sans
400–700 for everything else (`AppFont.body(size, weight)`). Fonts ship as **static instances**
in `res/font/` (`dm_sans_400…700.ttf` opsz 14, `fraunces_500…700.ttf` opsz 32), cut from the
iOS variable TTFs with `fonttools varLib.instancer <font> wght=<w> opsz=<o> --static` — Compose
`variationSettings` on resource fonts did not apply `wght` on device (bold rendered regular).

**Components (`ui/common`).** `HoraeDesign.kt`: `HCard`, `HChip`, `ChoiceChips` /
`MultiChoiceChips`, `HSegmentedControl`, `HStatusChip`, `HIconButton`, `HFab`,
`HPrimaryButton` / `HSecondaryButton`, `HSectionHeader`, `HScreenTitle`, `HSearchField`,
`accentGradientBackground()`. `HoraeComponents.kt`: `HoraeSectionHeader`, `HoraeStatCard`,
`HoraeFilterChip`, `HoraeQuickTile`, `HoraeCard`, `HoraeStatusBadge`. `ChoiceSheet.kt`:
`ChoiceListSheet` / `MultiChoiceListSheet` / `HPickerField` — **pickers are bottom sheets or
chips, never dropdowns/selects.** `HoraeRefresh.kt`: `HoraeRefreshBox` (pull-to-refresh that
never empties the list; clips itself and hides the idle indicator, so call sites need no
`clipToBounds`), `RequestGate` (drop stale responses), `runRefresh` (silent cancellation).
`ComponentGallery.kt` = debug gallery.
`CollapsingHeader.kt` (1.39.0): `CollapsingHeaderLayout(header, pinned, content)` — THE sticky
pill / collapsing-head mechanism for every main list page (Comenzi + calendar, Producție, Rețete,
Stoc overview + its four tab pages, Expirări, Transferuri). `header` (title, actions, search, lead
lines) follows the finger away on scroll down and back on scroll up (nested-scroll pre-consume,
settles shown/hidden after a fling — instantly with Reduce Motion via `rememberReduceMotion()`);
`pinned` (single-row pill filters / segments) never moves; `content` = the list. Pill rows and
heads sit OUTSIDE `HoraeRefreshBox` (pull-to-refresh wraps only the list), so a vertical drag on
them does nothing. Nested (Stoc → tab page) works: outer head first. Mișcări already had only a
pinned chip row under a TopAppBar — unchanged.

**Navigation (`ui/navigation`).** `AppNavHost` = auth gate (splash → login → app crossfade) +
`MainAppShell` (Scaffold, bottom nav, `consumeWindowInsets`, Panou accent behind the status bar,
`CurrentUserStore` for instant Profil edits). The NavHost only mounts shell routes (Panou,
notifications, users/roles, Profil `settings`, locations, help…) and calls the feature graphs:
`tasksGraph` (`ui/tasks/TasksNavGraph.kt`, `TasksRoutes`), `recipesGraph`
(`ui/recipes/RecipesNavGraph.kt`), `stockGraph` (`ui/stock/StockNavGraph.kt` — stock, Vânzări →
stoc and transfers), `ordersGraph` (`ui/orders/OrdersNavGraph.kt`, `OrdersRoutes`). **New
screens go into their feature graph, not AppNavHost.** Bottom tabs: Acasă · Producție ·
Comenzi · Stoc · Rețete (role-gated in `BottomNavBar`); Profil & setări (Date | Setări) opens
from the Panou user bubble.

**Routes — one source of truth per feature.** `Screen.kt` keeps the legacy route strings;
`StockRoutes` owns stock links (`STOCK_REVIEW`, `SALES_DEDUCTIONS` = `stock/sales`, `EXPIRING`
= `stock/expiring`, `RECEIVE`, `MOVEMENT_NEW`, `TEST_CONSUMPTION`, `REQUIREMENTS`, `SUPPLIERS`,
`receive()` / `movementNew()` builders); `OrdersRoutes` / `TasksRoutes` likewise.
`SharedRoutes.kt` only holds `ROUTE_PROFILE` and `NavController.hasExactRoute(route)` — use it
to hide a link whose destination is not mounted (unlike `findNode`, `orders/create` does not
match `orders/{orderId}`). Panou: KPI cards → Producție / Comenzi / `LowStock` /
`StockRoutes.EXPIRING`; "+" sheet = Task nou · Comandă nouă (`OrdersRoutes.CREATE`) · Rețetă
nouă · Intrare în stoc · Transfer (permission-gated). "Producție acum" = active tasks from
`/tasks` (IN_LUCRU, BLOCAT, DE_FACUT in that order; `DashboardRepository.activeTasks`), 3 on a
phone, 6 wide.

**Formatting rules (no Americanisms).** App locale is always ro-RO (`RoLocale`, applied in
`AcadeeaApp` + `MainActivity.attachBaseContext`), zone Europe/Bucharest (`RoDate.zone`, passed
explicitly). Dates/times only via `RoDate` (day before month, 24-hour clock, weeks Monday →
Sunday: `startOfWeek`, `weekDays`), numbers via `RoFormat.number` (comma decimal, dot thousands
from 10.000), money via `RoFormat.ron` / `ronPer`, quantities via `formatQty(value, unit)`
(metric, auto-scaled). Parse user input with `RoFormat.parseDecimal`. All UI copy is Romanian
(e.g. "Subprodus", never "Byproduct").

## Layout

```
app/src/main/java/com/acadeea/app/
├── AcadeeaApp.kt           @HiltAndroidApp, Timber init
├── MainActivity.kt         Single activity, Compose entry
├── data/
│   ├── local/              TokenManager (EncryptedSharedPreferences), BrandingManager
│   ├── remote/
│   │   ├── api/            15 Retrofit interfaces (Auth, Task, Stock, Recipe, Order, User, Role,
│   │   │                   Location, Dashboard, Organization, Equipment, Changelog, + Analytics/Pricing/Integration stubs)
│   │   │                   + SalesDeductionApi (Vânzări → stoc, incl. multipart Excel upload)
│   │   ├── dto/            Moshi DTOs (~880 lines) + PaginatedResponse<T> (+ SalesDeductionDtos.kt)
│   │   ├── interceptor/    AuthInterceptor — Bearer inject, 401→refresh→retry (thread-safe)
│   │   └── ApiErrors.kt    Central errorCode → Romanian message map (mirrors shared-types
│   │                       error-codes.ts; `ApiErrors.userMessage(e, fallback)`, `errorCode(e)`)
│   └── repository/         9 thin repos wrapping APIs (Auth, Task, Stock, Recipe, Order, User, Role, Organization, Changelog)
├── domain/model/           User, Enums.kt (mirrors backend enums), PermissionManager.kt
├── ui/
│   ├── auth/ dashboard/ tasks/ stock/ orders/ users/ roles/ equipment/ locations/ recipes/ settings/
│   ├── common/             StatusBadge, LoadingOverlay, ErrorDialog, PriorityBadge (task priority
│   │                       1–5 as colored triangle w/ digit; 0 renders nothing), QuantityFormat
│   │                       (`formatUnitQty` — humanized display: auto-scales metric mass mg→g→kg and
│   │                       volume ml→l to the largest unit ≥ 1; buc/spoons/cups/oz/lbs and 0 pass
│   │                       through; display-only, never for inputs/API payloads)
│   ├── theme/              Color, Theme, Type (Material 3)
│   └── navigation/         AppNavHost (auth gate + bottom-nav shell), BottomNavBar (role-based), Screen (routes)
├── observability/          Analytics (Sentry + PostHog wrapper, guarded/no-op when disabled)
└── di/                     AppModule, NetworkModule (Retrofit/OkHttp/Hilt providers)
```

## Maturity (be honest when extending)

| Implemented | Stub / not wired |
| --- | --- |
| Auth (login, session restore, refresh, logout) + branding load on login/restore | Recipe yield-history / versions screens (routes still stubs; data layer has them) |
| Recipes: list (search + type chips, row→detail, FAB→create), **detail** (header + info + components/ingredients + cost breakdown, Editează→edit), **create/edit form** (name, type segmented, yield qty+unit, category dropdown from `GET /recipes/categories?kind=`, components w/ ingredient rows, unified ingredient picker bottom-sheet over raw materials + semipreparate, "Subprodus" checkbox → created after save via `createRecipe(isByproduct,sourceRecipeId)`) | |
| Panou (stats per location, Producție acum = active tasks, Comenzile de azi, stock alerts, Expiră în 3 zile, "+" quick create — see Redesign structure) | Recipe yield-history/versions screens (routes still stubs; data layer has them) |
| Tasks: list/detail/transitions (+ yield capture), **create/edit form** (`TaskCreateScreen` — recipe picker, quantity, priority, due date, notes; `TasksRoutes.createFromRecipe(id)` opens it with the recipe preselected — the recipe detail's bottom "Pornește producția" button, gated on `create Task`; single-product only, no multi-task/batch mode and no production-location picker — the API defaults it) | Equipment — `EquipmentListScreen` is mounted (Settings → Funcționalități → Echipamente) but its create FAB and row-tap detail are stubs (`onDetail = {}`) |
| Stock: overview, raw materials (incl. hard delete from detail via `/raw-materials/{id}/delete-info` + `DELETE ?hard=true`), consumables, semipreparate, products, low-stock screen, **movement create** (`StockMovementCreateScreen` — quantity + lot/expiry/price on Intrare) | Raw-material **create** — no such screen/FAB exists (`RawMaterialListScreen` has none); stock-in only happens via a movement against an EXISTING material. Consum-teste has no dedicated screen either. Finished-goods lot list (loturi/FIFO) isn't shown anywhere on Android |
| Category groups (1.31.0; NEVER a dropdown — owner's rule): `ui/common/CategoryDial.kt` holds `CategoryKindStyle` (kind colour/label), `KindDial(kinds, selected, onSelected)` (three tinted tiles) and `CategoryPillHeader(name, kind, count)`. `ProductListScreen` lists `state.groupedItems` (loaded items grouped by category, carousel order via `RecipeRepository.getCategoryCarousel()`, Misc last) with a pill header per group — no chip strip, no dropdown; a tap on the header folds the group (`collapsedGroups`, `CategoryPillHeader(collapsed:onToggle:)`); above the list (1.32.0) a `LazyRow` of `HoraeFilterChip`s with the finished-goods categories — no "Toate", the active chip clears on tap. Design: https://claude.ai/artifact/5XJBNbpXBeK4RVTY9TrBYv | |
| Tasks: custom name + visibility (1.29.0) — `TaskResponse.title/visibility/visibleToIds` (`name` = title ?: recipeName, `displayName` uses it); `TaskCreateScreen` adds the "Nume task" field and "Vizibilitate" chips (ASSIGNED / EVERYONE / SELECTED; SELECTED loads active users via `UserRepository.getUsers` and shows them as toggle chips). Create/Update requests carry `title`/`visibility`/`visibleToIds`; dashboard recent tasks use the server `displayName` | |
| Locations: list + per-location dashboard (`LocationListScreen`/`LocationDashboardScreen`, both mounted) — READ-ONLY, no create/edit and no default-delivery toggle (web-only). Since 1.29.0 the list takes `role` and shows the org **default location** ("Implicită" badge; administrators toggle it with the star `IconButton` → `OrganizationRepository.setDefaultLocation(id|null)` = PATCH `/organization` with `UpdateDefaultLocationRequest` (`@SerializeNulls`, separate from the branding request so branding saves never clear it)). `BrandingManager.defaultLocationId` (prefs-cached from `OrganizationBranding.defaultLocationId`) seeds the transfer source (`TransferCreateViewModel.loadLocations`) and the sales location (`SalesDeductionListViewModel`, over magazine-first) when nothing is picked yet | |
| Transfers: list/detail/create + status transitions (`ui/transfers/`, all mounted) | |
| **Vânzări → stoc** (sales → stock deductions, `ui/sales/`, mirrors web `/stock/sales` + `/stock/sales/[id]`): log list (paginated, status/source/summary) + "Scădere nouă" bottom sheet (location first — MAGAZIN sorted first — then source: Excel eBriza via `ActivityResultContracts.OpenDocument` → multipart `POST /sales-deductions/excel`, Manual, or WooCommerce date range → ISO local start/end-of-day). Detail = DRAFT **confirmer** (per line Scade/Produs nou/Ignoră segmented, product picker sheet with "Sugestii după nume" candidates first, ± quantity stepper incl. negative = return to stock, live `stoc before → after` preview compounding same product across rows (`computeRows`, port of the web function), shortfall box with "Scade până la 0" (acceptShortfall) vs "Suprascrie stocul la" (stockOverride), create-new-product with unit/category (`GET /recipes/categories?kind=PRODUS_FINIT`)/initial stock, add/remove manual rows, filter chips Toate/De verificat/Probleme stoc/Produse noi/Ignorate, duplicate-file warning via `duplicateOf`, bulk confirm sheet with summary sections + "Am înțeles" ack + note, discard draft) or CONFIRMED/ANULAT **read-only** entry (+ "Anulează" revert, `create StockMovement`). **Gate:** `GET /sales-deductions/feature` (cached per process in `SalesDeductionRepository.isFeatureEnabled`, false on error) via `rememberSalesFeatureEnabled()`; entry points = Stoc top-bar receipt icon (`read StockMovement`) and "Scade vânzări" button on the Produse tab (`create StockMovement`). SALES_001 shows the server message (lists offending products); SALES_002 reloads into read-only | |
| Orders: list/detail/transitions, create (dialog w/ FINAL-recipe items → POST /orders), delivery-note signature, stats screen | |
| Woo pickup routing (read-only on Android): `OrderResponse.deliveryMethod` (shop method, e.g. "Ridicare Napoca 15") → detail "Metodă" row + muted row line `rowMethodLine` (`OrderDisplay.kt`); `meaningfulDeliveryPoint` hides a deliveryPoint that just repeats it. `LocationResponse.externalId` (Pickupia id) is in the DTO/`CreateLocationRequest`, but Android has **no location create/edit form** yet | |
| **Orders views + shop delivery (1.37.0):** `ui/orders/OrdersFilterStore` (@Singleton shared by list ⇄ calendar ⇄ detail): `OrderView` Intrări/Livrări (`view=` on `GET /orders` + `/orders/calendar`), delivery-method filter (`deliveryMethod=` exact name) and `GET /orders/delivery-methods` (short names). `OrdersFilterBar.kt` = `OrdersTopControls` (segmented + chip row "Toate"/methods with count, ellipsized via `HChip(maxWidth)`, admin "Denumiri" → short-name sheet, `PUT /orders/delivery-methods/alias`) + `LocalDeliveryMethodLabels`. Methods/filter/labels only when `BrandingManager.wooDeliveryEnabled` (prefs-cached `Organization.wooDeliveryEnabled`; admin toggle in Profil › Setări › Comenzi din site). List = sticky day headers (`groupOrdersByDay`: future days, Mâine, Azi, Ieri, Mai vechi) scrolled to "Azi" on load/switch (Livrări pages forward until today is loaded); calendar defaults to Zi. `LocationResponse.isMainUnit` → "Principală" badge (settings + locations list)**1.38.0:** filter = `DeliveryFilter` (All "Toate" | Delivery "Livrare" → `deliveryKind=DELIVERY` | Method(name) → `deliveryMethod=`), one at a time, tap-selected-again = Toate (`store.select`); chip order from `deliveryChips()`: Toate · PICKUP methods · Livrare (sum count) · DELIVERY methods only when 2+. `DeliveryMethodDto.kind/kindSet`; methods re-fetched on every list/calendar (re)load + ON_RESUME + editor save, a vanished method → Toate (`validIn`). Admin chip "Metode" → "Metode de livrare" sheet: muted full name, short-name field (`{name, shortName}`, "" = default label), Ridicare|Livrare segment saved on tap (`{name, kind}`, "Auto" resets = kind null; "auto" hint while !kindSet). Segmented + chips sit in the fixed header above `HoraeRefreshBox` (pull-to-refresh only on the list). **1.39.0:** `OrderView` = **Pregătiri** (`PREGATIRI`, API `view=livrari`, first + DEFAULT) | Intrări. Status filter = `OrdersFilterStore.statuses` (default `DEFAULT_ORDER_STATUSES` = {NOUA}, never empty, process-lifetime only, shared list ⇄ calendar): `OrderStatusFilterButton` (FilterList icon next to the calendar icon / in the calendar TopAppBar, dot badge when ≠ default) → sheet "Toate" + six statuses, applied on tap; list sends `statuses=` (`OrderRepository.getOrders(statuses)`), calendar `status=` (replaces its old hard-coded active set); `OrderStatusHint` ("Doar: Nouă") pinned above the list. | |
| Users: list/detail/invite/role | Profile (stub) |
| Roles management (`ui/roles/`): list (system badge, user count, delete for non-system roles with 0 users) + full-screen editor — Nume (locked for system roles) / Descriere / per-subject access-level dropdown (Fără acces / Vizualizare / Editare / Gestionare completă, "Personalizat" when custom) + "Mod avansat" per-action checkboxes; save = create/PATCH + `PUT /roles/:id/permissions` (full set collapses to `manage`). Entry: "Roluri" action in the Utilizatori top bar, admin-only. Subject/preset labels mirror the web roles page (`RolePermissions.kt`) | |
| **Selectează și șterge** (multi-select + bulk delete, mirrors web/iOS): `ui/common/BulkSelect.kt` = `BulkSelectionState` (`rememberBulkSelectionState()`, isActive/selected/toggle/toggleAll/exit) + `BulkSelectAction` (top-bar Checklist icon, shown only when `PermissionManager.can(role, DELETE, <subject>)`) + `BulkSelectTopBar` (close · "N selectate" · select-all, swapped in for the screen's TopAppBar while active) / `BulkSelectInlineHeader` (same, for screens with no TopAppBar — raw materials, consumables) + `BulkSelectCheckbox` (leading row checkbox) + `BulkSelectBottomBar` (Anulează / red "Șterge (N)" → `onRequestPreview` → ViewModel `previewBulkDelete(ids)` = `POST /<resource>/bulk-delete/preview` → `bulkPreview: BulkDeletePreviewDto` in state → `BulkDeleteConfirmDialog`: entity text from `BulkDeleteWarnings` + "Se vor afecta și:" one line per `dependents[{label,count}]` + "X nu mai există" for `missing`; confirm = "Șterge"/"Șterge tot") + `BulkDeleteResultDialog` ("X șterse" + first 5 failure reasons). Rows use `combinedClickable`: tap toggles in select mode (else navigates), long-press enters it. **Bulk actions** (`ui/common/BulkActions.kt`): the bar's "Acțiuni" `DropdownMenu` (gated on `update <subject>`, sales: `create StockMovement`; select mode itself opens on delete OR update) lists the screen's `BulkActionCatalog.<screen>` `BulkActionDef(key,label,param,paramName)`s — `BulkParam.Bool` = two direct entries, `None` = direct, everything else opens `BulkActionParamPicker` (radio list for `Enum`/`User`/`Location`/`Category(kinds)`/`Supplier`, options via `BulkActionPickerViewModel` over Users/Locations/Recipes-categories/Suppliers repos; `DatePickerDialog` → ISO instant for `Date`; numeric field for `Number`) → confirm "Aplici „<label>” la N elemente?" → ViewModel `bulkAction(ids, key, params)` → `repo.bulkAction…` (`POST /<resource>/bulk-action` `{ids, action, params}`, `BulkActionRequest`/`BulkActionResultDto`) → shared `BulkDeleteResultDialog` over `BulkOutcome` ("N actualizate" / "N șterse" + failure reasons) → reload + exit. `StockApi.getSuppliers()` (`SupplierDtos.kt`) was added for the supplier picker. Each list ViewModel has `previewBulkDelete(ids)` + `bulkDelete(ids)` + `bulkAction(ids, action, params)` → `repo.bulkDelete(ids)` (`POST /<resource>/bulk-delete` with `cascade = true` always — the user confirmed the preview; `BulkDeleteDtos.kt`, per-row failures in `failed`) → reload; the screen exits select mode when the result dialog is dismissed. Wired on: tasks, orders, transfers (`CASLSubject.STOCK_TRANSFER`), raw materials (`bulkDeleteRawMaterials`, HARD delete incl. stock history), consumables (`bulkDeleteConsumables`), recipes, sales deductions (`delete StockMovement`) | |
| Changelog: Settings → "Noutati" (full multi-version list, public GET /changelog) + one-time "Ce e nou" dialog after update (staging builds only) with link to the full list | |
| Settings (logout + admin branding screen, in nav) — no company/legal-data screen (web-only). **Resetare date** (`ui/settings/DataResetScreen` + `DataResetViewModel`, `Screen.DataReset`, admin row in Administrare; `DataResetApi`/`DataResetRepository`, mirrors web `settings/reset`: category switches with counts, implied deps disabled + "inclus automat" badge, red "Date de bază" card, typed-`RESETEAZA` AlertDialog) | Analytics, Pricing, Integrations (Retrofit APIs only, no UI) |
| Tutorial mode: PER-USER local toggle (Settings → Preferințe → "Tutorial", every user, no admin gate), "Centru de ajutor" help center (Settings → Funcționalități → "Ajutor", visible only while the signed-in user has it on), contextual callouts (auto + long-press peek) wired broadly — task create/detail, stock movement create, transfers, orders, users/roles, recipes, dashboard shortcuts, settings, board filter | A handful of flows stay help-center-text-only for real structural reasons (no matching screen): raw-material create, test-consumption, finished-goods lots, locations create/toggles, settings company data, task multi-mode — see the Tutorial mode section below |

> **2026-08-30 correction:** an earlier version of this table called task create/edit, stock
> movement create, and locations/transfers "stubs" — they are not; all are implemented and mounted
> in `AppNavHost`. Verify claims like this against `grep -n "composable(Screen\." ui/navigation/AppNavHost.kt`
> before trusting this doc, the same way you'd verify any other stale-doc claim in this repo.

## How it talks to the API

- **Layering:** ViewModel → Repository → Retrofit `*Api` interface. Add endpoints to the relevant
  `Api` interface + DTOs, expose via the Repository; don't call Retrofit from a ViewModel directly.
- Base URL: `BuildConfig.BASE_URL`, set per **product flavor** (`env` dimension):
  `prod` → `https://api.horae.ca`, `staging` → `https://api-test.horae.ca`. The `staging` flavor (AGP forbids flavor names starting with "test") also
  suffixes the applicationId with `.test` and labels the app **Horae Test** (prod = **Horae**), so
  both install side by side. Build a specific variant: `./gradlew assembleProdDebug` /
  `assembleStagingDebug`. See `docs/ENVIRONMENTS.md`.
- `AuthInterceptor` injects the Bearer token and, on `401`, synchronously refreshes via
  `/auth/refresh` and retries; on failure it clears tokens (forces re-login). It skips `/auth/login`
  and `/auth/refresh`. Tokens live in EncryptedSharedPreferences (`acadeea_secure_prefs`, AES256-GCM).
- **No WebSocket yet** — realtime (`/ws`) is not consumed; UI is request/response.

## Observability (Sentry + PostHog)

Errors/crash/perf via **Sentry** (`io.sentry:sentry-android`, manual init — no Gradle plugin, so
builds stay offline-safe) and product analytics via **PostHog** (`com.posthog:posthog-android`). Both
are wrapped by `observability/Analytics.kt` (a plain object) and initialised once in
`AcadeeaApp.onCreate` via `Analytics.init(this)`.

- **Keys are never hardcoded.** They come from gradle properties, read from the **git-ignored
  `local.properties`** (real keys) with a fallback to project/gradle properties, wired into
  `BuildConfig` by `app/build.gradle.kts`. Copy `local.properties.example` → `local.properties` and
  fill in. **Missing/empty key ⇒ that provider is disabled** (its init is a no-op); the app builds
  and runs fine with no keys.

  | Property       | BuildConfig field      | Default (if blank)            | Empty ⇒ |
  | -------------- | ---------------------- | ----------------------------- | ------- |
  | `SENTRY_DSN`   | `BuildConfig.SENTRY_DSN`   | `""`                       | Sentry disabled |
  | `POSTHOG_KEY`  | `BuildConfig.POSTHOG_KEY`  | `""`                       | PostHog disabled |
  | `POSTHOG_HOST` | `BuildConfig.POSTHOG_HOST` | `https://eu.i.posthog.com` | (falls back to EU host) |

- **Identity:** `LoginViewModel` calls `Analytics.identify(user)` on login success and on session
  restore (PostHog `identify(id, {email, role})` + `Sentry.setUser`), and `Analytics.reset()` on
  logout (PostHog `reset()` + clears Sentry user). All calls are no-ops when disabled.
- **Screen tracking:** `AppNavHost` observes the inner nav controller's current route and emits a
  PostHog `$screen` event (`Analytics.screen(route)`) on change. Sentry perf `tracesSampleRate` 0.1.
- Timber stays the local logger; nothing is removed. Add ad-hoc events with `Analytics.capture(...)`.

## Tutorial mode (`ui/tutorial`)

**PER-USER, per-device, client-local preference — NOT an org/admin setting.** There is no
`Organization.tutorialModeEnabled` field (removed from the api entirely); every signed-in user
turns their own tutorial mode on/off from Settings → Preferințe → "Tutorial" (no `isAdmin` gate).
Content is curated Romanian copy served by the api (`GET /api/v1/tutorial/content`, public) — see
`apps/api/src/modules/tutorial/tutorial.data.ts` for every flow/step id; Android just maps ids to
real composables where the screen exists. Interaction model mirrors the web reference
(`apps/web/src/contexts/tutorial-context.tsx` + `tutorial-overlay.tsx`): contextual, not a forced
next/next/next tour — one small non-blocking callout at a time, no full-screen scrim.

- `data/remote/api/TutorialApi.kt` + `data/repository/TutorialRepository.kt` — thin GET wrapper
  (same shape as `ChangelogRepository`), unchanged.
- `ui/tutorial/TutorialCenter.kt` — `@Singleton` (not a ViewModel — it must survive across every
  nav destination, not just one). Owns BOTH the manual-tour state (`StateFlow<UiState>` —
  `activeFlow`/`stepIndex`, `start/next/prev/stop`) AND the per-user preference: `enabled`
  (`mutableStateOf<Boolean>`) + a dismissed-step-id set, persisted in plain `SharedPreferences`
  (`horae_tutorial_prefs`, same simple-prefs mechanism `BrandingManager` already uses — no
  DataStore dependency in this codebase) keyed by the signed-in user's id
  (`tutorial.<userId>.enabled` / `tutorial.<userId>.dismissed`, the latter via native
  `getStringSet`/`putStringSet`, so it's per-account on a shared device). `setCurrentUser(userId)`
  (re)loads this user's state and is called from `AppNavHost.MainAppShell` via
  `LaunchedEffect(user?.id)` whenever the signed-in user changes (login/session-restore/logout →
  null); tenant branding-style "survives logout" quirks don't matter here since nothing reads the
  stale in-memory state while logged out. Also still holds the `mutableStateMapOf<String, Rect>`
  anchor registry. Obtained outside ViewModel scope via `rememberTutorialCenter()` (a Hilt
  `@EntryPoint` on `SingletonComponent`, resolved through `LocalContext.current.applicationContext`)
  — the same trick any Composable or modifier needs when it wants a Hilt singleton that isn't
  nav-graph-scoped.
- `ui/tutorial/TutorialAnchor.kt` — `Modifier.tutorialAnchor(id: String)`: reports the tagged
  element's `boundsInRoot()` into `TutorialCenter.anchors[id]` on layout, clears it on dispose. Only
  tag composables that genuinely exist on screen. Also wires a **long-press "peek"**: a low-level
  `pointerInput` gesture on `PointerEventPass.Initial` (observes without consuming, so it never
  steals the element's own click) that, on a genuine long-press (no `up` before the platform's
  `longPressTimeoutMillis`), calls `TutorialCenter.peek(id)` — shown immediately regardless of
  dismissed state — and auto-clears it ~2.5s later via a side coroutine (`delay` can't be called
  directly inside `awaitEachGesture`'s restricted-suspension scope, so the clear runs on
  `rememberCoroutineScope()` instead). **Elements inside their own `AlertDialog`/`ModalBottomSheet`
  content must NOT be tagged** — Compose renders dialog content in a separate Android `Window`, so
  `boundsInRoot()` there is relative to the DIALOG's root, not the main app window `TutorialOverlay`
  draws in; anchor the dialog's TRIGGER button instead (see `CreateOrderDialog.kt` and
  `YieldCaptureDialog.kt` for the reasoning in-place — both deliberately skip tagging content that
  lives inside their `AlertDialog`).
  `TutorialOverlay.kt` — mounted once at the root (`AppNavHost.MainAppShell`, a `Box` wrapping the
  bottom-nav `Scaffold`). Renders nothing while `TutorialCenter.enabled` is off. Three ways a hint
  shows, in priority order, all through the same small callout card (no scrim — nothing else on
  screen is ever dimmed/blocked): **1. long-press peek** (highest priority, ignores dismissed
  state); **2. tour mode** (`TutorialCenter.start(flowId)` from the help center) follows the active
  flow's current step with Prev/Next + a step counter, but only while that step's anchor is live on
  the current screen — a multi-screen tour simply shows nothing until the user navigates to the
  right screen; **3. auto mode** (default, lowest priority) scans the curated flows in authored
  order for the first step whose id has a live anchor on the current screen, hasn't been dismissed
  by this user forever, AND isn't hidden for this screen visit only (see dismiss-all below) — shows
  one "Am înțeles"-dismiss callout. A floating "Ascunde sfaturile" pill (bottom-start, shown
  whenever an auto-mode hint is showable) hides every hint on the CURRENT screen only —
  `TutorialCenter.onRouteChanged(route)`, wired from `AppNavHost`'s existing PostHog
  route-tracking `LaunchedEffect(currentRoute)`, clears it (and any lingering peek) on navigation.
- `ui/help/HelpCenterScreen.kt` — "Centru de ajutor" (`Screen.HelpCenter`), searchable
  LazyColumn grouped by category; each flow expands to its steps + a "Pornește turul" button
  (`TutorialCenter.start(flowId)`) that sequences that flow's steps through the same small-callout
  UI. Reachable from Settings → Funcționalități only while the signed-in user's own toggle is on.
- **No dedicated tutorial-settings screen** (the old admin-only `TutorialSettingsScreen` /
  `Screen.TutorialSettings` were deleted). The toggle is an inline `Switch` row directly in
  `ui/settings/SettingsScreen.kt`'s "Preferințe" section, bound to
  `TutorialCenter.enabled`/`setTutorialEnabled(...)` — visible to every user regardless of role.
- **Live-anchor coverage is now broad**, not just one screen: task create/detail (recipe picker,
  quantity, submit, start/finalize transition buttons — each transition button gets its OWN anchor
  id via a `when (targetStatus)` map, not the whole actions block), stock movement create (Intrare
  quantity), finished-goods overview, recipe create/edit, transfers (open FAB, items picker,
  în-tranzit, finalizează), orders (create-order entry, status, delivery-note; the in-dialog product
  picker stays text-only per the dialog-content caveat above), users/roles (invite, permissions,
  deactivate), dashboard shortcuts, board "Ziua mea" filter, and Settings (branding, tutorial
  toggle, account row). Flows that stay help-center-text-only do so for real structural reasons, not
  laziness — see the maturity table above (raw-material create, test-consumption, finished-goods lot
  list, locations create/toggles, settings company data, task multi-mode all have no matching
  Android screen today).

## Conventions

- New backend field/enum → mirror into `data/remote/dto` and `domain/model/Enums.kt`.
- New backend error code → add it to `data/remote/ApiErrors.kt` (Romanian copy). Use
  `ApiErrors.userMessage(e, fallback)` in ViewModels instead of hand-parsing error bodies (older
  screens still have private `extractApiMessage` copies).
- Role-based nav via `domain/model/PermissionManager.kt` + `BottomNavBar` (UX gate; backend enforces). Tapping "Acasă" (the start destination) pops back to it (`popBackStack(start.id, false)`) — `navigate(start){saveState/restoreState}` silently did nothing in some stack states (1.33.0).
- `AndroidManifest.xml` declares `androidx.core.content.FileProvider` (`${applicationId}.fileprovider`, `res/xml/file_paths.xml` = cacheDir) — needed by every share-a-file flow (delivery-note PDF, the sales CSV template `shareCsv` in `SalesDeductionListScreen`).
  Same caveat as other clients: this role map can lag the backend's dynamic roles.
- Romanian user-facing strings (stubs read "In curand…").
- Material 3 theming from `ui/theme`; reuse `ui/common` components.
- **White-label (Horae rebrand):** user-facing brand is "Horae"; package/applicationId stay
  `com.acadeea.*`. `BrandingManager` persists Organization branding (name, slug, accentColor,
  secondaryColor, tertiaryColor, logoUrl, fontFamily) in SharedPreferences; it's applied from the
  login and `/auth/me` responses
  (`organization` object) and refreshed via `GET /organization` (now auth-required). `MainActivity`
  feeds `brandingManager.accentColor/secondaryColor/tertiaryColor` into `AcadeeaTheme(…)`, which
  re-tints primary (hand-tuned palette kept when accent = default pink) and ALWAYS re-tints
  secondary/tertiary (+ container) slots. When the org's secondary/tertiary are null they are
  **derived from the current accent** by hue rotation (`ui/theme/Color.kt`
  `deriveBrandSecondary` = hue +45°, `deriveBrandTertiary` = hue −45° slightly darkened; mirrors
  web + iOS) so the trio is always harmonious per tenant. Orders-type stats use
  `colorScheme.secondary` (OrderStatsScreen "Total"); semantic status colors are never re-tinted.
  **Extended tokens:** `Organization.brandingTokens.android` (`{light?, dark?}` × 9 color keys;
  legacy flat platform-level colors apply to BOTH schemes, scheme-specific wins) is parsed by
  `data/local/BrandingTokens.kt` into `AndroidBrandingTokens` and persisted RAW (whole
  multi-platform JSON) by `BrandingManager` so PATCHes can read-modify-write without dropping
  web/iOS blocks. `AcadeeaTheme(brandingTokens=…)` overlays the current scheme's tokens LAST
  (fallback chain per slot: android token → accent-trio branding → hand-tuned defaults):
  accent→primary(+containers), background→background, card→surface+surfaceVariant,
  textPrimary→onBackground/onSurface, textSecondary→onSurfaceVariant, separator→outline+
  outlineVariant (dividers), secondary/tertiary→their slots(+containers), accentPressed→ripple
  (`LocalRippleTheme` override). Semantic status colors (`ui/theme` Success/Warning/Error/Info/
  StatusPurple/StatusIndigo — now the single source for status tints across screens) are NEVER
  themable.
  The branding settings screen ("Personalizare") has "Culoare
  secundară"/"Culoare terțiară" preset pickers whose "Implicit" reset swatch previews the color
  derived from the currently edited accent; reset PATCHes an
  explicit JSON `null` via the `@SerializeNulls` Moshi qualifier
  (`data/remote/dto/SerializeNulls.kt`, factory registered in `NetworkModule`). It also edits
  the ANDROID brandingTokens block only: Luminos/Întunecat scheme switcher + 9 hex fields with
  live swatch, per-token reset and Romanian usage hints, plus a font dropdown over the 5
  predefined `fontFamily` keys. Saving PATCHes the FULL merged brandingTokens
  (`UpdateOrganizationRequest.brandingTokens` is `@SerializeNulls` — always pass the merged map;
  explicit null clears all platforms). `fontFamily` is wired end-to-end but approximated with
  system typefaces until fonts are bundled (`ui/theme/Type.kt` `typographyFor`: "lora"→Serif,
  rest→default). The login
  title shows the persisted org name. No image-loading lib, so org logos aren't rendered.
  **Branding persistence:** the device stays on the LAST org's branding (accent, name) across
  relaunches AND logouts, until a different org signs in (`apply` overwrites); only a fresh install
  shows the neutral Horae brand. `BrandingManager.clear()` exists for a future org-switch action but
  is not called on logout. **Preloader:** app launch shows the designer splash
  (`ui/common/PreloaderScreen.kt`, mounted in `AppNavHost`) for a fixed ≥2.9s
  (`PRELOADER_MIN_DURATION_MS` 2500 formation + `PRELOADER_HOLD_MS` 400 hold) or while the
  session restores — mirrors iOS `SharedComponents/SplashView.swift` 1:1: near-black `#0D0D0F`
  + vertical accent gradient (92%→70%→25%), a procedural dot-VORTEX Canvas texture (32 spiral
  arms, r 88→230dp, step 3.6dp, twist 0.0135 rad/dp, deterministic sin-hash sizes/alphas, clear
  hole in the middle whose innermost dots melt in via `innerFade = min(1, normalized/0.3)`;
  whole vortex dimmed to 60% at draw time — `alpha · eased · 0.6`) and
  a soft radial glow at the center (white 0.16→0.05→transparent, 20→175dp). The CENTER stays
  EMPTY — matching iOS/web, only a real org logo may appear there (none until an image lib
  lands). The formation animates ONCE over 2.5s (dots fly in
  from +110dp/−0.55 rad with per-dot 0–0.4 delay, cubic ease-out, then static + short hold);
  "Horae" + tagline at the bottom; animator scale 0 (reduced motion) draws the final state with
  no animation. **Splash→login reveal (logged-out):** `AppNavHost` is state-driven (no more
  Login nav route) — while the session restores it shows the plain `PreloaderScreen`; once the
  fixed formation window elapses (`formationDone`), a logged-OUT user gets `SplashLoginScreen`
  (same file), which reuses the shared `SplashSurface` (vortex/glow/gradient drawn once) and, on
  reveal, LIFTS the center glow up `SPLASH_LOGO_LIFT` 150dp (`animateDpAsState`, 1s
  FastOutSlowIn), fades the bottom tagline out, and fades in the login form (`AnimatedVisibility`)
  on the SAME gradient — mirrors iOS SplashView `showLogin`. Reduced motion snaps to the final
  state. The form is the Claude Design "splash-form": dark pill fields (`#1C1C1E`, transparent
  indicators, grey placeholders), password eye toggle (`Icons.Filled.Visibility`), right-aligned
  accent "Ai uitat parola?" `TextButton`, accent "Autentificare" button — all driven by the shared
  `LoginViewModel` (no login logic changed, only restyled + wrapped in the reveal). A logged-IN
  user (session restore or login) `Crossfade`s from the splash into the app once `formationDone`;
  logout flips back to `SplashLoginScreen` with the form already shown (no vortex replay). The old
  standalone `ui/auth/LoginScreen.kt` is now unused. **Forgot password (new):** the "Ai uitat
  parola?" link opens an `AlertDialog` that posts `POST /api/v1/auth/forgot-password`
  (`AuthApi.forgotPassword` → `AuthRepository.requestPasswordReset` → `LoginViewModel`, always a
  neutral "if the account exists…" confirmation, no enumeration); the emailed link opens the web
  `/reset-password` page. The launcher
  icon is the neutral Horae clock dial: adaptive icon = `@color/ic_launcher_background` (`#17171A`) +
  density PNG foregrounds (`drawable-*dpi/ic_launcher_foreground.png`, dial scaled to 66% for the
  safe zone), plus legacy `mipmap-*dpi/ic_launcher(.round).png` sets.

## Build

```bash
cd apps/android
./gradlew assembleDebug        # debug APK (both flavors; assembleStagingDebug = Horae Test)
./gradlew installDebug         # install on device/emulator
./gradlew assembleRelease      # minified release
./gradlew test
```

Not part of pnpm/turbo — build with Gradle/Android Studio.
</content>
