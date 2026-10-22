# apps/ios — SwiftUI App

> **Acadeea on-prem (read first).** This file was written for Horae; the technical content holds.
> Here: project `Acadeea.xcodeproj` (generated from `project.yml` with `xcodegen generate`), ONE
> scheme **Acadeea** (Debug/Release — no "Horae Test", no `API_TEST`), bundle `ro.acadeea.app`,
> version from `MARKETING_VERSION` in `project.yml`, build number = UTC timestamp (post-build
> script). `AppConfig` reads Info.plist `API_BASE_URL` (https://api.acadeea.ro), `BRAND_NAME`
> (Acadeea) and `ORG_SLUG` (acadeea): `isStandalone` → public branding fetched before login,
> login form shown ON the splash (`SplashView(showLogin:)` in `HoraeApp`), Apple/Google sign-in
> hidden. The Swift module/target is still called `Horae` on purpose.
> TestFlight upload: archive scheme Acadeea (Release) + `xcodebuild -exportArchive` with
> method `app-store-connect`, destination `upload`, `-allowProvisioningUpdates` and an App Store
> Connect API key (`-authenticationKeyPath/-ID/-IssuerID`). Internal group "Real Users" gets every
> build automatically.


Production-grade native iOS client covering all domains. SwiftUI, iOS 17+, `@Observable` state,
actor-based services. Talks to `apps/api` over REST (`/api/v1`) + Socket.IO (`/ws`). Read with the
root `CLAUDE.md` and `docs/ARCHITECTURE.md` for the API/auth/realtime contract.

## Stack

SwiftUI · Swift 5.9 · iOS 17.0 min · **`@Observable`** (Observation framework, not classic MVVM) ·
async/await + **actor** services · `KeychainAccess` (tokens) · `socket-io-client-swift` (realtime) ·
`swift-openapi-*` (codegen runtime). Bundle id `dev.tigan.acadeea`. Project: `Acadeea.xcodeproj`
(generated from `project.yml`).

## Layout

```
Acadeea/
├── AcadeeaApp.swift            Entry — switches Login ↔ AppTabView on AuthManager.isAuthenticated
├── Core/
│   ├── Auth/                   AuthManager (@Observable session), KeychainService (Sendable, tokens)
│   ├── Networking/             APIClient (baseURL, 401→refresh→retry, makeDecoder),
│   │                           APIError (typed codes → Romanian msgs), AuthInterceptor (actor,
│   │                           coalesces refreshes), PaginatedResponse<T>
│   ├── WebSocket/              WebSocketManager (@Observable Socket.IO, /ws, room+event handlers)
│   ├── Theme/                  AppTheme (Colors/Spacing/CornerRadius + status colors + formatters),
│   │                           Enums.swift (UnitType, TaskStatus, OrderStatus, … — mirror backend)
│   ├── Branding/               BrandingManager (per-tenant white-label: org name/accent/font/logo/
│   │                           app-icon from the login `organization` block + /organization; cached)
│   ├── Permissions/            PermissionManager (CASL: can(action, subject))
│   ├── Logging/                AppLogger (file logs in Documents/acadeea_logs)
│   └── Extensions/
├── Navigation/                 AppTabView (tabs gated by permissions), Route (enum, 50+ cases),
│                               AppRouter (@Observable per-tab NavigationPath + `push(_:on:)`),
│                               `\.routeNavigator` env (programmatic push onto the CURRENT tab's stack)
└── Features/                   Auth, Dashboard, Orders, Tasks, Recipes, Stock, SalesDeductions, Users,
                                Roles, Activity, Analytics, Integrations
```

### Per-feature structure (the standard to follow)

```
Features/<Name>/
├── Models/      <Name>Models.swift — Codable response DTOs, request bodies, *Query builders
├── Services/    <Name>Service.swift — `actor`, `static let shared`, one method per endpoint
├── ViewModels/  <Name>ViewModel.swift — `@Observable final class`, list/form state, calls the service
└── Views/       <Name>ListView / DetailView / FormView / … (NavigationStack + Route, no nav logic in VM)
```

## How it talks to the API

- **Every network call goes through a feature `Service` actor**, which builds the request, attaches
  the Keychain Bearer token, calls `APIClient.authenticatedData(for:)`, then decodes with
  `APIClient.makeDecoder()` and validates the status (throwing `APIError.from(data:statusCode:)`).
- `APIClient.authenticatedData` handles `401` → `AuthInterceptor` refresh (coalesced) → retry; a second
  `401` forces `AuthManager.logout()`.
- Base URL: `APIClient.baseURL` = `https://api.horae.ca`.
- **Realtime:** `WebSocketManager` connects to `/ws` with the token in the handshake, auto-joins
  `tasks`/`stock`/`role:<slug>`, and exposes callbacks for `task:update`, `stock:update`, `stock:low`,
  `activity:new`. Wire ViewModels to these to live-update lists.

## Conventions

- New endpoint → add a method to the feature `Service` (actor), not ad-hoc `URLSession` in a View.
- New backend field/enum → mirror into the feature `Models` and, for enums, `Core/Theme/Enums.swift`
  (each enum has `displayName` + `id`). New error code → `Core/Networking/APIError.swift`.
- Use `AppTheme` tokens (spacing/colors/corner radius/formatters) — no hardcoded numbers/colors.
- Gate UI with `PermissionManager.can(...)` (mirrors backend CASL; enforcement is server-side).
- Singletons are `.shared` (`AuthManager`, `BrandingManager`, `WebSocketManager`, every `*Service`).
- Romanian user-facing strings; `APIError` messages are already localized to Romanian.

## Domain notes (current behaviour)

- **Auth.** Login has a show-password toggle + "Ai uitat parola?" (→ `POST /auth/forgot-password`;
  the emailed link opens the web reset page). Logout asks for confirmation (`.alert`). Sessions are
  long (12h access / 30d refresh); `AuthInterceptor` coalesces refreshes. **Multi-tenant:** the login
  response carries an `organization` white-label block (name/slug/accent/font/logos/appIcon) that
  `BrandingManager` applies + caches; the JWT is org-scoped, so tokens predating multi-tenancy are
  rejected (`401`) and force a refresh. The apex→subdomain `handoffCode` is web-only — native apps talk
  to the single API host directly and don't redeem it. **Branding persistence:** the device stays on
  the LAST org's branding (app icon, accent, name, login logo) across relaunches AND logouts, until a
  different org signs in (`apply` overwrites); only a fresh install shows the neutral Horae.ca brand
  (`HoraeWordmark` + default icon). `BrandingManager.reset()` exists for a future org-switch action
  but is NOT called on logout.
- **Social sign-in (Apple + Google).** Login screen shows "Continuă cu Apple" (native
  `SignInWithAppleButton`) + "Continuă cu Google" under the password form
  (`Features/Auth/Views/SocialSignInButtons.swift` + `SocialSignInViewModel`). Apple uses
  `AuthenticationServices`: a raw nonce is generated (`Core/Auth/SignInNonce.swift`), sha256'd into the
  request, and the RAW nonce + `identityToken` (+ name on first auth) POST to `/auth/apple`; entitlement
  `com.apple.developer.applesignin` (Default) is in `project.yml` for both bundle ids. Google uses the
  `GoogleSignIn` SPM package (`Core/Auth/GoogleSignInManager.swift`) → `idToken` → `/auth/google`; it is
  **config-gated**: needs Info.plist `GIDClientID` + a reversed-client-id `CFBundleURLTypes` scheme (both
  ship as `GOOGLE_IOS_CLIENT_ID_PLACEHOLDER` in `project.yml`), and the Google button is HIDDEN until a
  real client id is set (`GoogleSignInManager.isConfigured`). Both endpoints return the SAME
  `AuthResponse`; `AuthManager.bootstrap` is the shared session setup (login + social). `AuthUser` gained
  `linkedProviders` + optional `hasPassword`. Settings → "Cont" → "Conturi conectate"
  (`LinkedAccountsView` + `LinkedAccountsViewModel`, Route `.linkedAccounts`) links/unlinks providers via
  authed `AuthProviderService` (`POST`/`DELETE /auth/link/:provider`, `GET /auth/me`); unlink is
  client-guarded when it's the sole method with no known password, else the server `LAST_LOGIN_METHOD`
  guard applies. New error codes in `APIError`: `PROVIDER_NO_ACCOUNT` (→ "ai nevoie de o invitație"),
  `PROVIDER_ALREADY_LINKED`, `LAST_LOGIN_METHOD`. iOS has NO invite-acceptance screen (invites are
  redeemed via the web set-password link), so the buttons carry no `invitationToken` today — the plumbing
  (`SocialSignInViewModel(invitationToken:)`) is ready if such a screen is added.
- **Selectează (bulk delete + bulk actions).** Every main list (tasks, orders, transfers, raw materials,
  consumables, recipes, sales deductions) has a toolbar `checkmark.circle` → "Gata" toggle (shown when
  `permissions.can(.delete, <subject>)` OR `.update` — sales use `StockMovement` / `.create`). Shared piece:
  `SharedComponents/BulkSelect.swift` — `@Observable BulkSelection` (`isActive`, `selected`), `BulkSelectRow`
  (replaces the row's `NavigationLink`: navigates normally, in select mode shows a leading checkmark and
  toggles on tap), `.bulkSelectToolbar(_:isEnabled:)` and
  `.bulkSelectBar(_:allIds:warning:canDelete:actions:onAction:onPreview:onDelete:onDone:)` — bottom
  `safeAreaInset` bar **Toate · N selectate · Acțiuni ▾ · 🗑** (no "Anulează" — "Gata" in the toolbar exits;
  the trash is icon-only `.bordered` red, gated on `canDelete`). **Delete = preview → confirm → cascade:**
  🗑 calls `POST /<resource>/bulk-delete/preview` (`bulkDeletePreview(ids:)` on the feature service →
  `BulkDeletePreview { found, missing, dependents }`), the confirm `.alert` shows the `BulkDeleteWarning`
  text plus "Se vor afecta și: • label: count" and "X nu mai există"; the destructive button reads "Șterge"
  / "Șterge tot"; confirm → `POST …/bulk-delete { ids, cascade: true }` → `BulkDeleteResult`. **Actions:**
  `actions: [BulkAction]` come from `BulkActionCatalog.{tasks,orders,transfers,rawMaterials,consumables,
  recipes,sales}` (mirror of the API `BULK_ACTIONS`); each `BulkAction` has a `BulkActionParam` — `.choice`
  / `.bool` render as nested `Menu` entries, `.user` / `.location` / `.supplier` / `.category(kinds:)` /
  `.date` / `.number` open `BulkParamPickerSheet` (loads users / locations / suppliers / categories through
  the existing services; "Fără furnizor" and "Misc" send `.null`). Picking ends in a confirm alert
  "Aplici „Label: value” la N elemente?" → `onAction(ids, key, params)` → the feature service's
  `bulkAction(ids:action:params:)` (`BulkActionRequest` with `BulkParams = [String: BulkParamValue]`,
  `Core/Networking/BulkDelete.swift`) → `BulkActionResult { done, failed }`. Both flows end in a toast
  ("N elemente șterse/actualizate") or a partial-result alert with the first reasons, then `onDone` reloads
  and select mode exits. Tasks only offer it in list mode (not the board).
- **Simulator verification (do it before every deploy).** `AppConfig.baseURL` honours a Debug-only
  `HORAE_API_URL` env override and `HoraeApp` auto-logs-in from `HORAE_DEBUG_LOGIN="email:password"`
  (Debug only), so the app can run headless against a local API: `xcrun simctl boot <udid>` (never
  `open -a Simulator` — it steals the user's focus), build with `-derivedDataPath`, `simctl install`,
  `SIMCTL_CHILD_HORAE_API_URL=http://localhost:3077 SIMCTL_CHILD_HORAE_DEBUG_LOGIN=… simctl launch`,
  `simctl io <udid> screenshot`. For screens that need taps, `HoraeScreenshots/BulkSelectScreenshots.swift`
  is an XCUITest that logs in the same way, opens select mode on Producție / Comenzi / Rețete, taps Toate
  and Acțiuni and writes PNGs to `TEST_RUNNER_SHOT_DIR` (`xcodebuild test -scheme HoraeScreenshots
  -only-testing:HoraeScreenshots/BulkSelectScreenshots` with `TEST_RUNNER_DEMO_USER/_PASS/_HORAE_API_URL`
  exported as environment variables, not build settings). `typeText` does NOT work on headless simulators
  (no keyboard focus) — that is why login goes through the env hook.
- **iPad / regular width layout.** `AppTabView` switches on `horizontalSizeClass`: compact = the
  TabView (unchanged); regular = `NavigationSplitView` with `Navigation/AppSidebarView` (branding
  header, the five sections as `SidebarItem.tab`, then Instrumente / Administrare / Setări rows as
  `SidebarItem.route(route, host:)` that pop the host section to root and push the route; the
  signed-in user sits in the footer) and the selected section's `NavigationStack` as detail (`.id(tab)`,
  paths still live in `AppRouter`, so `\.routeNavigator` keeps working). Both layouts share
  `rootView(for:)` + `destinationView(for:)`. `Core/Layout/AdaptiveLayout.swift` holds the helpers:
  `.readableWidth()` (regular only — centres forms/details/settings in an 820pt column and paints the
  page background full-bleed; it sets `\.screenBackgroundHandled` so the inner `.appScreenBackground()`
  skips its own gradient), `.adaptiveCard()` (card chrome for grid cells), `AdaptiveLayout.gridColumns`,
  and `Route.prefersFullWidth` (lists/boards/calendars/charts keep the full detail width — the route
  resolver applies `.readableWidth()` to every other route). `PaginatedListView` renders a
  `LazyVGrid` of cards on regular width (`adaptiveGrid: true` default; rows are `NavigationLink`s, so
  the grid applies `.buttonStyle(.plain)`); `StockOverviewView` does the same through its
  `StockListSection`/`StockListEntry` data + `stockSections(_:refresh:)` renderer; `AppStatRow` and
  the stock quick actions use `ViewThatFits` (centred when they fit, horizontal scroll otherwise);
  `DashboardView` puts header + quick actions on one row and the sections in two columns (`isWide`);
  `TaskBoardView.columnWidth(available:)` grows the board columns (200–360pt) to fill the width.
  Verify with `HoraeScreenshots/IPadLayoutScreenshots` (same env vars as the bulk-select capture, run
  on an iPad simulator udid — it rotates to landscape, walks the sidebar and writes PNGs to `SHOT_DIR`).
- **iPad hide-sidebar + dock (1.29.0).** Every section root gets a `sidebar.leading` toolbar button
  (`AppTabView.sidebarToggleToolbar`, regular width only; the system toggle is removed with
  `.toolbar(removing: .sidebarToggle)` on the sidebar content). `columnVisibility == .detailOnly`
  overlays `Navigation/AppDockView` at the bottom centre: a show-sidebar button, the five sections
  (same permission gates as the sidebar) and a "+" `Menu` with the Acasă quick actions (Stoc nou →
  `.stockMovementCreate`, Task nou → `.taskCreate`, Rețetă nouă → `.recipeCreate`, Transfer →
  `.transferCreate`, pushed on the current section's stack). Verify with
  `HoraeScreenshots/IPadDockScreenshots` (same env vars; it also opens Locații stoc).
- **Category bento / kind dial (1.31.0; NEVER a dropdown — owner's rule).**
  `SharedComponents/CategoryBentoViews.swift`: `CategoryBentoView(categories:counts:selection:)` (recipe
  list — parent categories as small tinted tiles with count + prim/semi/finit, empty ones hidden,
  sub-categories as pills; counts from `RecipeListViewModel.categoryCounts`), `KindDialView(kinds:selection:)`
  (stock screens — the three super-category tiles under the location picker) and `CategoryPillHeader`
  (group header: category pill + "semi · 4"), `CategoryChipCarousel(categories:selection:)` (1.32.0: the
  flat chip strip under the kind tiles / recipe type tabs, parents tinted, no "Toate", the active
  chip clears on tap; `StockOverviewView.matchesCategory` expands a parent to its children). `StockOverviewView` filters by `selectedKind` and builds
  its sections per category (`categorySections`, carousel order, Misc last; `StockListSection.kind`
  tints the header); `ProductListView` has the two-tile dial (`selectedType`, totals via
  `loadKindCounts`) and `groupedItems`. Groups collapse on a tap of the pill header
  (`collapsedGroups` on both views; `CategoryPillHeader(isCollapsed:onToggle:)`). Design:
  https://claude.ai/artifact/5XJBNbpXBeK4RVTY9TrBYv.
- **Task name + visibility (1.29.0).** `TaskResponse.title` (custom name, nil = recipe),
  `.visibility` (`TaskVisibility` ASSIGNED | EVERYONE | SELECTED, Core/Theme/Enums.swift) and
  `.visibleToIds`; `name` / `displayName` prefer the title, so every list/board/detail already shows
  it. `TaskFormView` adds "Nume task" (single mode) and a "Vizibilitate" section (menu picker; for
  SELECTED the chosen people as rows + "Adauga persoana" → `UserPickerView(selectedIds:)` multi-select
  that toggles `viewModel.visibleTo`). Create/Update requests carry `title`/`visibility`/
  `visibleToIds` ("" title clears). Detail shows the custom title above the recipe link; the
  dashboard's recent tasks use the server's `displayName`.
- **Default location (1.29.0).** `Organization.defaultLocationId` is decoded into
  `BrandingManager.defaultLocationId` (cached in UserDefaults, `defaultLocationIdPresent` guards
  login/me omitting it) and set by admins with `BrandingManager.setDefaultLocation(_:)` (PATCH
  `/organization`, explicit null clears). `[LocationResponse].preferredDefault` (LocationModels) =
  configured default if in the list → "laborator" by name → first; used by TaskForm, Stoc nou,
  Recepție, Consum test, Vânzări (over the magazine-first order) and as the transfer source when no
  deep-link preselection. `LocationListView` shows an "Implicita" star badge and, for admins, a
  leading swipe action to set/clear it.
- **Resetare date.** Settings → Administrare → "Resetare date" (Route `.dataReset`, `eraser`, admin-gated).
  `Features/Settings/{Models/DataResetModels,Services/DataResetService,ViewModels/DataResetViewModel,Views/DataResetView}`
  — twin of web `settings/reset` over `/api/v1/data-reset`. Category keys stay `String` (new server
  categories must not break decoding); the VM resolves `requires` transitively so implied toggles show
  "inclus automat" and are disabled; danger categories get a red tint; confirm = `.alert` with typed
  `RESETEAZA`. No forced logout (sessions survive a reset, unlike restore).
- **Backup & Restaurare.** Settings → Administrare → "Backup & Restaurare" (Route `.backupSettings`,
  `externaldrive.badge.timemachine`, gated on `permissions.isAdmin` like the other admin entries).
  `Features/Settings/{Models/BackupModels,Services/BackupService,ViewModels/BackupViewModel,Views/BackupSettingsView}`
  — the iOS twin of web `settings/backups`, over `/api/v1/backups/snapshots` (all routes need `manage all`).
  `OrgSnapshot.sizeBytes` is a **String** (Prisma `BigInt`; `JSON.stringify` can't serialize BigInt) — the
  decoder also tolerates a number, and reads the author from `createdBy` OR `createdByName` (the API sends
  `createdBy`, the web type names it `createdByName`). Rows show `dd.MM.yyyy HH:mm` (new
  `Date.dottedDateTime`), an "Automat" badge or the manual label, human size and author; tap → detail sheet,
  long-press → context menu, swipe → delete (manual snapshots only, `auto == false`).
  **Restore is double-guarded:** it exists ONLY in the detail sheet, behind an alert that spells out what is
  lost and whose red button stays disabled until `RESTAUREAZA` is typed verbatim. On success the server
  revokes every refresh token of the org, so the VM toasts and then force-logs-out
  (`finishRestoreLogout` → `WebSocketManager.disconnect()` + `AuthManager.logout()`); a blocking overlay
  covers the list while the restore transaction runs. **Download** writes the `.json.gz` to a temp file and
  opens a `UIActivityViewController` (`ShareSheet`) — `ShareLink` can't be triggered programmatically and the
  file doesn't exist before the tap; a `403` (admin not in `BACKUP_ADMIN_EMAILS`) is remapped from
  "Permisiuni insuficiente" to "Doar administratorii platformei pot descărca fișierul de backup".
  Every presentation (detail sheet, share sheet, alerts) is anchored on the list view and the detail sheet
  dismisses itself before handing an action back, so two presentations never race and errors stay visible.
- **Stock categories.** `RawMaterialResponse`/`ConsumableResponse` carry `category: String?`
  (null = "Misc"). The stock-movement item picker (`StockItemPickerView`) lists raw materials +
  consumables in one list filtered by admin categories (`fetchCategories` + Misc) — no
  raw-vs-consumable split. Item create forms + the raw-material/consumable detail views let you set
  the category (`updateRawMaterialCategory`/`updateConsumableCategory`).
- **Category reordering (single global order).** `CategoryManagementView`'s toolbar has a
  permission-gated (`manage Recipe`) "Reordoneaza" button opening `CategoryReorderView` (sheet,
  `CategoryReorderViewModel` @Observable). It is ONE flat, permanently-editing `List`
  (`.environment(\.editMode, .constant(.active))`) of every category across all super-categories —
  one `ForEach` + `.onMove`. Each row keeps its super-category colour (dot) + shows the super name
  as a secondary label. A category can be dragged ANYWHERE globally (e.g. a Semipreparat above every
  Materie prima). The initial order is `RecipeService.fetchCategoryCarousel()`
  (`GET /recipes/categories/carousel`, already sorted by the global ordinal — NEVER re-sort
  client-side); a move PATCHes the whole flat list via
  `RecipeService.reorderAllCategories(items:)` → `PATCH /recipes/categories/reorder-global` body
  `{ items: [{name, kind}] }` (index = global order), returning the reordered carousel list.
  Optimistic with rollback + a toast on failure; on dismiss the parent reloads. This one order drives
  the stock carousel + filters on every client.
- **Stock item quick actions.** Raw-material/consumable/recipe-stock detail views show an icon quick-action
  row (Receptie / Transfer / Ajustare, permission-gated: `.create .StockMovement` / `.create .StockTransfer`)
  that opens `BatchReceiveView(preselectedMaterialId:)`, `CreateTransferView(preselection: TransferPreselection)`
  or `StockMovementFormView(preselectedItem:lockItem:initialType:)` in sheets; details refresh on dismiss.
  `StockService.fetchItemAvailability(rawMaterialId:|consumableId:|recipeId:)` (`GET /stock/item-availability`
  → `StockItemAvailability`) feeds a "Stoc pe locatii" section, the transfer source preselect (single stocked
  location) and a "stoc rezervat" confirm before any AJUSTARE to 0 (tasks/pending transfers). AJUSTARE prefills
  the selected location's quantity for raw materials and has an "Adu stocul la 0" shortcut; recipe adjust has an
  optional note (referenceNote). Movement rows show referenceNote + new `createdByName`/`locationName`.
- **Unified ingredient picker + byproducts.** The recipe form's ingredient row has NO
  materie-primă/semipreparat menu anymore — one button opens `IngredientPickerView`
  (RecipeFormView.swift): a single `.searchable` List with sections Materii prime /
  Semipreparate / Byproduct (raw materials + one `type=SEMIPREPARAT` recipes fetch loaded
  concurrently, split by `isByproduct`). A "Byproduct" Form section (Toggle) opens
  `ByproductFormSheet` (nume + cantitate + unitate); the pending byproduct is created via
  `createRecipe({isByproduct: true, sourceRecipeId})` right after the recipe saves
  (`RecipeFormViewModel.createPendingByproduct`). `RecipeResponse` carries `isByproduct`,
  `sourceRecipeId`, `byproducts[{id,name}]`; existing byproducts list read-only in the section.
- **Recipe archiving.** `RecipeResponse.isArchived`; `RecipeQuery.archived` (false default). The
  recipe list's `ellipsis.circle` menu toggles to "Retete arhivate" (title + empty state follow);
  recipe detail's menu has Arhiveaza/Reactiveaza (`RecipeService.setArchived` →
  `PATCH /recipes/:id/archive`) and shows a "Stare: Arhivata" row. Default lists/pickers only see
  active recipes — the server hides archived ones unless `archived=true` is sent.
- **Recipe sub-units.** A raw-material ingredient's unit is a picker limited to the **same measure
  family** (solid/liquid/count) as the material — flour stocked in kg can be used in g, but not in
  litres (`UnitType.measure` + `UnitType.units(for:)`). It prefills to the material's stock unit on
  pick. The backend (`recipe-resolution.service`) converts the ingredient unit → the material's stock
  unit for cost and stock reservation, so sub-units need no special handling client-side. Semipreparate
  ingredients keep the sub-recipe's yield unit (read-only).
- **Necesar MP.** `RequirementsPlanView` (Route `.requirementsPlan`, quick action on
  `StockOverviewView`): pick recipes + quantities → `StockService.planRequirements`
  (`POST /stock/requirements-plan`, 200) shows aggregated raw-material needs with supplier +
  purchase deficit; "Export Excel" downloads the `.xlsx`
  (`StockService.exportRequirementsPlan`) to a temp file shared via `ShareLink`.
- **Stock search.** `StockSearchView` (Route `.stockSearch`, "Cauta" quick action on
  `StockOverviewView`): one debounced `.searchable` that queries raw materials, recipe stock
  (semipreparate + produse finite) and consumables concurrently (all three `search=` params),
  grouped in sections; each row pushes the matching detail route. The stock hub's quick-action
  row is a horizontal `ScrollView` (fixed 60pt buttons) so it survives more actions.
- **Consum teste (R&D).** `TestConsumptionView` (Route `.testConsumption`, "Consum teste" quick action
  on `StockOverviewView`, gated on `update RawMaterial || update Consumable`): location picker + rows
  picked through the shared `StockItemPickerView(restrictToLocationId:)` (raw materials + consumables)
  with a comma-tolerant quantity and a `UnitSelector` prefilled from the item's stock unit, plus an
  optional note → `StockService.testConsumption` (`POST /stock/test-consumption`, 201) → toast +
  dismiss. Same stock effect as production consumption (per-location, FIFO on lots) with no task and no
  recipe output. The new `IESIRE_TESTE` movement type is in `Core/Theme/Enums.swift` — **it had to be
  added or every movement list would fail to decode** once one exists.
- **Vânzări → stoc (sales deductions) — env-gated.** `Features/SalesDeductions/` is the iOS twin of web
  `stock/sales` over `/api/v1/sales-deductions` (`SalesDeductionService` actor, one method per endpoint;
  Excel upload is hand-built multipart `file` + `locationId`, like `OrderService.uploadInvoice`).
  **Gate:** `SalesDeductionFeature.shared` (@MainActor @Observable) asks `GET /sales-deductions/feature`
  (cached 60s, refreshed from `StockOverviewView`/`RecipeStockDetailView` `.task`) — NOT a compile flag, so
  prod lights up when the API flag flips. `isAvailable(permissions)` = enabled && `read StockMovement`;
  writes (new / confirm / discard / revert / "+" rows) additionally need `create StockMovement`.
  **Entry points:** "Vânzări" quick action on `StockOverviewView` (Route `.salesDeductions`) and a
  "Scade vânzări" `StockQuickActionButton` on `RecipeStockDetailView` (pushes the same route through
  `\.routeNavigator`). **Flow:** `SalesDeductionListView` (paginated log, infinite scroll, "+" →
  `NewSalesDeductionSheet`: location (shops first, falls back to `fetchMyLocations`) then source —
  `.fileImporter` xlsx/csv(/xls so the server explains "save as .xlsx"), Manual, or WooCommerce date range
  sent as local [00:00, 23:59:59] ISO) → on create the sheet closes and `routeNavigator` pushes
  `.salesDeductionDetail(id:)`. `SalesDeductionDetailView` shows `SalesDeductionConfirmerView` for a DRAFT
  and `SalesDeductionLogDetailView` (lines + "Anulează scăderea" alert → revert) otherwise; a confirm swaps
  in place. The confirmer (`SalesDeductionConfirmViewModel`) ports web's row model 1:1: per line a
  Section with Scade / Produs nou / Ignoră (segmented), product picker sheet (`SalesProductPickerView`:
  name-match suggestions, then all products with stock at the location), ± stepper (signed text, comma
  tolerant, `numbersAndPunctuation` keyboard so "-" can be typed — negative = retur în stoc), live
  "stoc before → after" walking rows in order (same product twice compounds), shortfall radios
  (oprește la 0 = `acceptShortfall` / suprascrie stocul = `stockOverride`), new product name + unit
  (buc/kg/g/l) + PRODUS_FINIT category + stoc acum, hand-added rows (toolbar "+"), filter chips (Toate /
  De verificat / Probleme stoc / Produse noi / Ignorate), duplicate-file warning (`duplicateOf` → link to the
  earlier deduction), bottom bar Renunță (discard) / Confirmă tot → `SalesConfirmSheet` (grouped summary,
  one "Am înțeles" toggle that clamps every unresolved shortfall, optional note). The confirm body is
  authoritative (every row is sent). Errors: `SALES_001` → `APIError.salesExceedsStock(message)` (keeps the
  server's product list; the VM reloads live stock), `SALES_002` → `.salesAlreadyFinalized`. Enums
  `SalesDeductionSource/Status/Decision` live in `Core/Theme/Enums.swift`; `matchKind` stays a String.
- **Loturi de produse finite.** `RecipeStockDetailView` has a lazy "Loturi" `DisclosureGroup` that on
  first expand calls `StockService.fetchRecipeLots` (`GET /stock/recipes/:recipeId/lots`) →
  `[RecipeLotResponse]` (FIFO: earliest expiry, then oldest production). Each row shows lot number,
  remaining/total + unit, "Produs la dd.MM.yyyy" (`Date.dottedDate`) and the expiry — red when past,
  orange under 3 days. Empty state: "Fara loturi — stoc dinaintea versiunii 1.21" (stock produced
  before lots existed genuinely has none, so an empty list is not an error).
- **Tasks.** No task **dependencies** or **templates** screens (the features were removed). Semipreparate
  show as **subtasks**. Starting a task can return `409` (insufficient stock → BLOCAT). Task detail
  shows a **"Materiale necesare"** section from `GET /tasks/:id/material-requirements`
  (`TaskService.fetchMaterialRequirements` → `[TaskMaterialRequirement]`): per ingredient the **scaled**
  need (matches stock deduction, not the base recipe), current stock, and stock after production. Loaded
  best-effort in `TaskDetailViewModel.load` — a failure leaves the list empty, never hides the task.
  The **task-create form** prefills `targetQuantity` from the recipe's `yieldQuantity` on pick
  (editable to scale up) and runs a debounced live stock check via `GET /tasks/preview-requirements`
  (`TaskService.previewRequirements`), warning per-material when the requested quantity exceeds stock.
  Creating a short task is allowed (it just can't start). `RecipeSummary` carries `yieldQuantity` for
  the prefill. Recipe form already defaults the yield unit to `BUCATI` (picker allows g/ml/l/…).
  The form also has a **production location** picker (`LocationService.fetchMyLocations`); it prefills
  with the **laborator** — the first location whose name contains "laborator" (case-/diacritic-insensitive,
  `TaskFormViewModel.defaultLocation(in:)`), falling back to the user's first location. There is no
  per-user saved choice; an already-set `locationId` (edit mode, explicit pick) is never overwritten.
  The location is sent on create and passed to the live stock check so warnings reflect that location's
  stock. Task detail shows the location. Stock is per-location
  on the backend (see api `CLAUDE.md`); produced goods land in the task's location. **Finalize**
  (`YieldCaptureSheet`) has a destination-location picker prefilled with the production location; picking
  a different one sends `outputLocationId` and the backend generates a foaie de drum (transfer). The
  board's quick-finalize lands at the production location (no picker there).
  The **recipe picker** (`RecipePickerView`, shared with the order form via
  `RecipeService.searchRecipes`) fetches up to 200 and sorts alphabetically with Romanian collation
  (`RecipeService.romanianSort`) — the backend has no stable ordering.
  `TaskListView`/`TaskBoardView` re-fetch on `onAppear` after the first appearance (`hasAppearedOnce`),
  so returning from the form shows the new tasks.
- **Task multiplu (familie).** The create form has a segmented "Un produs" / "Mai multe produse" mode
  (`TaskFormViewModel.isMultiMode`, single stays the default; create-only, hidden when editing).
  Batch mode swaps the single recipe+quantity fields for a list of `MultiItem` rows (recipe picker per
  row, quantity as text so a comma parses, unit locked to the recipe's yield unit), plus "Nume grup
  (optional)" and a "Creeaza si taskuri pentru semipreparate" toggle; the location/priority/dates/
  notes/assignee fields stay shared. Submit → `TaskService.createMultiTasks` (`POST /tasks/multi`, 201)
  → `MultiTaskResponse {groupId, tasks}` → toast + dismiss. The live stock check is single-product only.
  `TaskResponse` carries `groupId`/`groupLabel` (both `String?`, null for one-at-a-time tasks); the
  board card shows the label as a discreet grey capsule (`SharedComponents/TaskGroupBadge.swift`).
- **Stock quick-info cards = filters + deep link.** `StockOverviewView` keeps a
  `selectedStatus` filter (nil = "toate", default) driven by the tappable stat cards
  (value 0 ⇒ disabled; tap-again or "Total" resets). Row status is derived from the ROW's
  quantity (per-location or cumulated) + the material's `minimumStock`
  (`materialMetaById`, built in `loadCumulatedStock`) — same rule as the API. Homepage
  stock cards deep-link via `StockDeepLink.shared` (@Observable one-shot in
  `Navigation/AppRouter.swift`): `open(status:locationId:)` bumps `requestID`;
  `AppTabView` switches to the stock tab (permission-gated) and `StockOverviewView`
  `consume()`s the intent.
- **Mod tutorial (contextual hints + help center).** A **PER-USER, per-device preference** toggled in
  Settings → **Preferinte** → "Mod tutorial" — NOT an admin/org setting, no backend field, no
  permission gate (the old `Organization.tutorialModeEnabled` flag, `TutorialSettingsView` and
  `Route.tutorialSettings` were REMOVED everywhere, api included). State lives in `UserDefaults` keyed
  by the logged-in user id — `tutorial.<userId>.enabled` (Bool) + `tutorial.<userId>.dismissedSteps`
  (JSON `[String]` ⇒ `Set`) — so two accounts on one iPad keep their own setting and their own "seen"
  hints; `TutorialCenter.syncCurrentUser()` (called from `AppTabView.task` + `SettingsView.task`)
  rebinds them on login/account switch. Same posture as `lastSeenWhatsNewVersion`, and mirrors web's
  `localStorage` keying.
  Content still comes from the PUBLIC `GET /tutorial/content`
  (`Features/Tutorial/Services/TutorialService`, actor, no auth — same shape as `ChangelogService`)
  into `TutorialCenter.shared` (`@Observable` singleton mirroring `ToastCenter`:
  `enabled/dismissedSteps/flows/activeFlow/stepIndex/peekedId/screenDismissedIds` +
  `syncCurrentUser/setEnabled/dismiss/resetDismissed/loadContentIfNeeded/start/next/prev/stop/
peek/endPeek/clearPeek/dismissAllOnScreen/screenChanged`); flows whose `platforms` lack `"ios"`
  (web-only Excel import/export) are filtered out at load. `Features/Help/Views/HelpCenterView`
  (`Route.helpCenter`, Settings → Functionalitati, **always visible**) groups flows by category with
  `.searchable` + expandable read-along steps and a "Porneste turul" button.
  **Interaction model — contextual, NOT a forced next/next tour.** `.tutorialAnchor(id:)`
  (`Features/Tutorial/TutorialAnchor.swift`) reports a tagged view's frame through an
  `anchorPreference` dictionary (`[String: Anchor<CGRect>]`); `.tutorialOverlay()` — attached ONCE at
  the `AppTabView` root next to `.toastOverlay()` — reads it with `overlayPreferenceValue` and, while
  the user has the toggle on, shows ONE small callout next to the **topmost undismissed anchor on the
  current screen** (dictionaries are unordered — anchors are ranked by `minY`/`minX`), with a single
  "Am inteles" that marks it dismissed forever. **No scrim, nothing dimmed, nothing blocked** — only a
  thin accent ring around the described element; everything but the card is hit-transparent.
  "Reafiseaza sfaturile ascunse" in Settings clears the dismissed set.
  **Tour mode stays as a secondary, user-triggered option:** "Porneste turul" sets `activeFlow` and the
  SAME callout follows that flow's steps in order (counter + Inapoi/Inainte), across screens — a step
  whose anchor isn't on screen shows the card near the bottom with a "deschide ecranul…" note.
  **Two on-demand mechanics on top of that (mirroring web's hover-peek + per-page dismiss-all):**
  - **Long-press peek** — `.tutorialAnchor(id:)` is a `ViewModifier` (`TutorialAnchorModifier`) that,
    while `enabled && activeFlow == nil`, also carries two `simultaneousGesture`s: a
    `LongPressGesture(minimumDuration: 0.4)` → `TutorialCenter.peek(id:)` (+ a light haptic) and a
    `DragGesture(minimumDistance: 0)` on end → `endPeek(id:)`. `simultaneousGesture` (never `.gesture`)
    so the underlying TextField/Button/List keeps its own behaviour, and `including: .subviews` disarms
    both when tutorial mode is off. A peek shows that step's callout **even if dismissed forever**,
    outranks tour + auto in the overlay's `resolve`, writes NOTHING, is hit-transparent (the card can't
    swallow the finger holding it), and self-clears after an 8s timeout when the lift never arrives
    (gesture cancelled by a scroll / a sheet opening).
  - **Per-screen dismiss-all** — a floating "Ascunde sfaturile" pill (bottom-leading, shown while this
    screen has ANY anchored step and no tour/peek is active) calls `dismissAllOnScreen(anchorIds)`,
    which stores the CURRENT on-screen anchor ids in `screenDismissedIds` and suppresses every hint
    while they're up. Deliberately **transient — never written to `UserDefaults`**, unlike "Am inteles":
    the overlay's `.onChange(of: anchorIds)` calls `screenChanged(currentAnchorIds:)`, which drops the
    set as soon as it's disjoint from what's on screen (i.e. the user navigated away). So other screens
    are unaffected and this screen's hints return on a later visit. The anchor set IS the screen
    fingerprint — no `Route` plumbing needed.
  **Sheets need their own overlay.** A `.sheet` is a separate presentation host, so its
  `anchorPreference`s never reach the `AppTabView` overlay (same class of problem as `.toolbar`
  content, which is why toolbar-only buttons are deliberately NOT anchored). Sheet call sites that
  present anchored screens therefore attach `.tutorialOverlay()` **inside the sheet closure**:
  `StockOverviewView` (`CreateRawMaterialFormView`), `RawMaterialDetailView` (`BatchReceiveView`,
  `CreateTransferView`), `RecipeStockDetailView` (`CreateTransferView`), `UserListView`
  (`InviteUserSheet`). Everything else (task/recipe/order/transfer/receipt forms) is pushed as a typed
  `Route` from `AppTabView`, so the root overlay covers it. Never add a second overlay inside a view
  that is also pushed as a Route — you'd get two callouts.
  Live anchors today (40, one per step id, all unique): tasks — `tasks.create.{mode,selectRecipe,
quantity,location,dates}` (`TaskFormView`), `tasks.multi.{rows,family}` (`TaskFormView`),
  `tasks.multi.group` (the group badge on `TaskBoardView`), `tasks.transitions.{start,finalize}`
  (the action buttons) + `tasks.transitions.blocked` ("Lipsuri stoc") on `TaskDetailView`,
  `calendar.myDay.filter` (`TaskBoardView`), `calendar.myDay.calendar` (`ProductionCalendarView`);
  stock — `stock.{receive,transfers,testConsumption}.open` + `stock.finishedGoods.overview` on
  `StockOverviewView`, `stock.receive.addRow` (`BatchReceiveView`), `stock.rawMaterial.create.unit`
  (`StockMovementFormView`), `stock.testConsumption.rows` (`TestConsumptionView`),
  `stock.finishedGoods.{lots,fifo}` (`RecipeStockDetailView`), `stock.transfers.items`
  (`CreateTransferView`), `stock.transfers.{transit,finalize}` (`TransferDetailView`); recipes —
  `recipes.create.{open,ingredients,byproduct,save}` (`RecipeFormView`); orders —
  `orders.create.{open,items}` (`CreateOrderSheet`), `orders.create.{status,deliveryNote}`
  (`OrderDetailView`); admin — `locations.manage.create` (`CreateLocationView`), `users.roles.invite`
  (`InviteUserSheet`), `users.roles.permissions` (`RoleDetailView`), `users.roles.deactivate`
  (`UserDetailView`), `settings.org.branding` (`BrandingSettingsView`), `profile.tutorial` +
  `auth.basics.account` (`SettingsView`).
  **Deliberately unanchored** (content exists, iOS UI doesn't — the help center still shows the text):
  `tasks.create.{open,submit}`, `stock.receive.submit`, `stock.rawMaterial.create.open`,
  `recipes.create.open`'s "+" and `orders.create.open`'s "+" (all **toolbar-only** — those anchors sit
  on the form's first section instead), `tasks.multi.mode` (same control as `tasks.create.mode`),
  `tasks.transitions.byproducts` (`YieldCaptureSheet` has no byproduct input yet),
  `locations.manage.default{Delivery,Production}` + `settings.org.company` (web-only screens),
  `auth.basics.login` (the overlay lives inside `AppTabView`, and the preference is only known after
  login) and `auth.basics.sidebar` (anchoring the whole `TabView` would ring the screen and outrank
  every other hint). Adding more is one content entry (api `tutorial.data.ts`) + one
  `.tutorialAnchor(id:)` call.
  The help center shows a short "Sfaturi contextuale" section (only while the mode is on) explaining
  the long-press and the pill — both are invisible affordances otherwise.
- **Accent color: use `AppTheme.Colors.primary`, NOT `Color.accentColor`.** It is computed
  from `BrandingManager.shared.accentColor` because `.buttonStyle(.plain)` — applied at List
  level on every picker so row text doesn't tint — resets the environment tint and
  `Color.accentColor` would fall back to system blue inside those rows. Corollary: `.plain`
  hit-tests only drawn content, so every picker row needs `.contentShape(Rectangle())`
  (and text-only labels `.frame(maxWidth: .infinity, alignment: .leading)` too).
- **SwiftUI gotchas seen here.** A plain `Picker(.menu)` has an oversized tap target that bleeds onto
  neighbours — use a `Menu` with a bounded `.contentShape`. `.onDelete` only works inside a `List`,
  not a `VStack` — use explicit delete buttons there. **Never present screens via
  `navigationDestination(item:)`** — when a further Route is pushed on top (e.g. detail → Editare)
  any re-render of the presenting view re-evaluates the item binding and pops the whole stack
  (the task board's edit button "bounced back" this way); always push typed `Route` values through
  the stack-level resolver instead. After deleting/adding files, run `xcodegen
  generate` before `xcodebuild` (the project lists files explicitly).
- **Collapsing head + pinned pills (1.39.0).** Main list screens (Stoc, Comenzi list + calendar,
  Producție list, Rețete, Calendar, Expirări) are `VStack { bigHead.autoCollapsible(headVisible);
  pillRows; ScrollView/List.refreshable{…}.autoHideOnScroll($headVisible) }`
  (`SharedComponents/AutoHideOnScroll.swift`): the head (eyebrow, title, icon buttons, search,
  action strips, stat/kind tiles) hides on scroll down and returns on scroll up / at the top (iOS 18
  `onScrollGeometryChange`, iOS 17 drag-direction fallback, no animation under Reduce Motion). Pill
  rows sit between head and list — never inside the refreshable scroll view.
- **Orders status filter + Pregătiri (1.39.0).** `OrdersAreaState` holds `view` (default
  `.livrari`, labelled **"Pregătiri"**, shown first) and `statusFilter` (default `[.NOUA]`, empty =
  Toate), shared by list + calendar for the session. `OrderStatusFilterButton` (menu, stays open
  while ticking; dot when ≠ default) sits next to the calendar icon and in the calendar toolbar.
  List sends `statuses=` (comma list); an API that 400s on it falls back for the session to
  `status=` (one) or client-side filtering (several). Calendar sends `status=` comma list.

## Observability (Sentry + PostHog)

Wired in `Core/Observability/Observability.swift` (the single `Observability.start()` call in
`AcadeeaApp.init`) with config in `Core/Config/ObservabilityConfig.swift`. **Sentry** (`sentry-cocoa`)
= errors / crash / perf (`tracesSampleRate` 0.1, `environment` = `AppConfig.environment`). **PostHog**
(`posthog-ios`) = product analytics, with autocapture (`captureScreenViews` +
`captureApplicationLifecycleEvents`) plus a `route.screenName` `trackScreen(_:)` modifier applied at the
`AppTabView` Route resolver for `NavigationStack` destinations.

- **Both SDKs are guarded:** an empty key/DSN ⇒ that SDK never initialises and every `Observability.*`
  call is a no-op. Missing config = disabled, not crashing.
- **Identity:** `AuthManager` calls `Observability.identify(userId:email:role:)` after login + session
  restore (PostHog `identify` with `email`/`role` props + Sentry `setUser`), and
  `Observability.clearIdentity()` on logout (PostHog `reset()` + Sentry user cleared).

### Config keys (no hardcoded secrets)

Read at runtime from `Bundle.main.infoDictionary` (Info.plist), fed from build vars by an xcconfig:

| Info.plist / xcconfig key | Purpose | Empty ⇒ |
|---|---|---|
| `SENTRY_DSN` | Sentry DSN | Sentry disabled |
| `POSTHOG_KEY` | PostHog project API key | PostHog disabled |
| `POSTHOG_HOST` | PostHog host **without** scheme (e.g. `eu.i.posthog.com`); app prepends `https://` | defaults to `https://eu.i.posthog.com` |

`project.yml` wires `Config/Observability.xcconfig` as the target `configFiles` for all four configs and
maps the three vars into an explicit generated `Acadeea/Info.plist` (`$(SENTRY_DSN)` etc.).
`GENERATE_INFOPLIST_FILE` is off — the Info.plist is now declared in `project.yml`'s `info:` block, so
add Info.plist keys there, not via `INFOPLIST_KEY_*`.

**Where real values go:** `apps/ios/Config/Observability.xcconfig` — **git-ignored**, never commit it.
Bootstrap it from the committed template, fill in values, regenerate:

```bash
cp apps/ios/Config/Observability.example.xcconfig apps/ios/Config/Observability.xcconfig
# edit the new file: SENTRY_DSN / POSTHOG_KEY (POSTHOG_HOST without scheme)
cd apps/ios && xcodegen generate
```

The repo ships the xcconfig with **empty** `SENTRY_DSN` / `POSTHOG_KEY`, so a clean checkout builds with
observability disabled.

## Build

```bash
xcodebuild -project apps/ios/Horae.xcodeproj -scheme Horae -configuration Debug build
xcodebuild -project apps/ios/Horae.xcodeproj -scheme Horae \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

Not part of pnpm/turbo. `project.yml` is the source for the Xcode project (regenerate if you use
XcodeGen). SwiftUI cross-file symbols may show false "cannot find in scope" diagnostics outside a full
project build — verify with `xcodebuild`.
</content>
