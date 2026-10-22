# Horae — Implementation Guide (read before coding)

A repeatable process for turning a request into a correct change across **api + web + ios + android**,
with the least bugs. When a request comes in, follow the phases in order. Don't start editing a random
file. Pair this with `docs/ARCHITECTURE.md` (data model + contract) and each `apps/*/CLAUDE.md`.

---

## The golden rule

> **The API is the source of truth. Build every feature as a vertical slice, backend-first, then
> ripple outward to the clients. There is NO shared client logic — each client re-implements the same
> contract, so the same change must be made in 4 places by hand.**

Direction of work, always:

```
Prisma schema ─► api DTO/service/controller ─► (shared-types if enum/error) ─► web ─► ios ─► android
```

If you change a client without changing the API, you're almost always doing it wrong. If you change
the API without updating the clients, you've shipped a half-feature.

And: **a change isn't done until the build is green.** Every platform you touch gets built; a red build
gets fixed and rebuilt in a loop until it passes (Phase 4). No exceptions.

---

## Phase 0 — Classify the request

Pick the smallest category that fits. It decides how many layers you touch.

| Type                                  | Example                                                    | Layers touched                                             |
| ------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| **A. UI-only**                        | reorder fields, fix a label, new screen over existing data | one client only                                            |
| **B. New field on existing model**    | add `phone` to Location                                    | schema → api DTOs → all clients' models                    |
| **C. New endpoint / behavior**        | "force delete location + transfers"                        | api service+controller → client service methods + UI       |
| **D. New feature / domain**           | a whole new module                                         | full vertical slice, all layers                            |
| **E. New enum / status / error code** | new TaskStatus, new error                                  | schema + shared-types → every client's enum + error mapper |
| **F. Bugfix**                         | wrong calculation, crash                                   | locate root cause first; may be 1 layer or all             |

Before writing code, state out loud: **which category, which platforms, which exact files.** If the
request says "in all parts" assume B/C/D/E and plan the full ripple.

---

## Phase 1 — Locate (where things live)

Use this map to find the files to read first. Always **read the neighbours** of what you'll change and
copy their pattern — consistency prevents bugs.

### Concern → file, per platform

| Concern                    | api                                     | web                                 | ios                                              | android                                                        |
| -------------------------- | --------------------------------------- | ----------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| **Data model**             | `src/prisma/schema.prisma`              | —                                   | —                                                | —                                                              |
| **Endpoint (route)**       | `modules/<x>/<x>.controller.ts`         | `src/lib/api.ts`                    | `Features/<X>/Services/<X>Service.swift`         | `data/remote/api/<X>Api.kt`                                    |
| **Business logic**         | `modules/<x>/<x>.service.ts`            | (in component/page)                 | `Features/<X>/ViewModels/*`                      | `ui/<x>/*ViewModel.kt` + `data/repository/*`                   |
| **Request/response shape** | `modules/<x>/dto/*.ts`                  | `src/lib/types.ts`                  | `Features/<X>/Models/*Models.swift`              | `data/remote/dto/*Dtos.kt`                                     |
| **Enums / statuses**       | `schema.prisma` + `@horae/shared-types` | `lib/types.ts` + `lib/constants.ts` | `Core/Theme/Enums.swift`                         | `domain/model/Enums.kt`                                        |
| **Error codes**            | `shared-types/error-codes.ts`           | `lib/api.ts` (`ApiError`)           | `Core/Networking/APIError.swift`                 | error layer                                                    |
| **Auth / token**           | `modules/auth/*`                        | `contexts/auth-context.tsx`         | `Core/Auth/*`, `Core/Networking/APIClient.swift` | `data/local/TokenManager.kt`, `interceptor/AuthInterceptor.kt` |
| **Permissions (UI gate)**  | `modules/auth/casl/*` (enforcement)     | `auth-context.tsx` `usePermissions` | `Core/Permissions/PermissionManager.swift`       | `domain/model/PermissionManager.kt`                            |
| **Realtime**               | `modules/websocket/*`                   | — (none)                            | `Core/WebSocket/WebSocketManager.swift`          | — (none yet)                                                   |
| **Navigation**             | —                                       | `app/(dashboard)/<x>/` routes       | `Navigation/Route.swift` + `AppTabView`          | `ui/navigation/Screen.kt` + `AppNavHost`                       |
| **Theme / formatting**     | —                                       | Tailwind + `components/ui`          | `Core/Theme/AppTheme.swift`                      | `ui/theme/*`                                                   |

### Fast locate commands

```bash
# find the module/feature that owns a concept
grep -rln "Transfer" apps/api/src/modules --include=*.ts | head
grep -rln "transfer" apps/web/src/lib apps/ios/Horae/Features apps/android/app/src

# see the endpoint contract end-to-end
grep -rn "stock/transfers" apps/api/src apps/web/src/lib/api.ts \
  apps/ios/Horae/Features apps/android/app/src/main/java/com/acadeea/app/data/remote/api
```

---

## Phase 2 — Plan the slice

Write the touch-list before coding. Template:

```
Request: <one line>
Category: <A–F>   Platforms: <api/web/ios/android>
Contract change: <new/changed endpoint or field, exact name + shape>
Files to edit, in order:
  api:     schema? dto? service? controller?
  shared:  enum? error code?
  web:     types.ts? api.ts? page/component?
  ios:     Models? Service? ViewModel? View? Enums? Route?
  android: dto? api? repository? viewmodel? screen?  (or: skip if module is a stub)
Connections: what else consumes this? (realtime event? permission? another module's service?)
Verify: build/lint per platform.
```

Connection check — ask every time:

- Does this need a **permission** check? Add `@CheckPolicies` on the api route; mirror the UI gate.
- Should it emit a **realtime** event? Call `WebsocketService.emit*` in the api service; handle in iOS.
- Does it cross tables (stock + transfer + movement)? Wrap in `prisma.$transaction`.
- Does another module read this data? (e.g. orders → tasks → stock). Trace the consumers.

---

## Phase 3 — Implement, backend-first

### 3a. api (always first)

Order inside the module: **schema → dto → service → controller**.

1. **Schema** (`schema.prisma`) — add the model/field/enum. Then:
   `pnpm --filter @horae/api prisma:migrate && prisma:generate`.
2. **DTO** (`modules/<x>/dto/`) — request DTO with class-validator; response DTO class with
   `@ApiProperty` + constructor. Lists → `PaginatedDto<T>`.
3. **Service** (`<x>.service.ts`) — business logic. Multi-table writes inside `prisma.$transaction`.
   Enforce XOR FK constraints in code. Throw Nest exceptions (typed error code if domain-specific).
   Emit realtime via injected `WebsocketService` after state changes.
4. **Controller** (`<x>.controller.ts`) — thin: `@CheckPolicies`, validate, delegate. Swagger
   decorators. New query/body params → reflect in the DTO and Swagger.
5. Verify: `pnpm --filter @horae/api build && lint`. Update `/api/docs` via `openapi:export` if it's
   part of the cross-app surface; note the endpoint in `docs/ARCHITECTURE.md §3`.

### 3b. shared-types (only for enums / error codes)

`packages/shared-types/src/enums.ts` or `error-codes.ts`. Then it must propagate to every client's
local copy (web/ios/android don't import it at runtime except web). **Don't** add role-keyed logic —
roles are dynamic in the DB (see the role warning in root `CLAUDE.md`).

### 3c. web

Order: **types → api client → page/component**.

1. `src/lib/types.ts` — add/adjust the interface to match the api response exactly.
2. `src/lib/api.ts` — add/extend the method on the right module object. Never `fetch` from a component.
3. Page in `app/(dashboard)/<x>/` — `useEffect` + `lib/api` call (web polls, no WebSocket). Gate UI with
   `usePermissions().can(...)`. Labels/colors in `lib/constants.ts`. Reuse `components/ui` + `data-table`.
4. Verify: `pnpm --filter web build && lint`.

### 3d. ios

Order: **Models → Service → ViewModel → View** (+ Enums/Route/APIError as needed).

1. `Features/<X>/Models/*Models.swift` — Codable DTO matching api (decoded via `APIClient.makeDecoder()`,
   ISO8601 fractional seconds — don't hand-roll a decoder).
2. `Features/<X>/Services/<X>Service.swift` — `actor`; add a method per endpoint using the existing
   `authenticatedRequest` + `validateResponse` helpers. New error code → `Core/Networking/APIError.swift`.
3. `ViewModels` — `@Observable`, call the service, hold list/form/error state.
4. `Views` — SwiftUI; `AppTheme` tokens only; gate with `PermissionManager.can(...)`; navigate via
   `Route` enum (add a case + handle in `AppTabView.destinationView`). New enum/status →
   `Core/Theme/Enums.swift` (with `displayName`). Wire realtime via `WebSocketManager` if relevant.
5. Verify (mandatory build gate, Phase 4): `xcodebuild -project apps/ios/Horae.xcodeproj -scheme
Horae build`. If it fails, fix the root cause and rebuild — **loop until it compiles green.**
   Ignore SourceKit "cannot find in scope" until a real build (cross-file false positives); only
   `xcodebuild` success counts.

### 3e. android

Order: **dto → api → repository → viewmodel → screen**.

1. `data/remote/dto/*Dtos.kt` — Moshi DTO. 2. `data/remote/api/<X>Api.kt` — Retrofit method.
2. `data/repository/<X>Repository.kt` — expose it. 4. `ui/<x>/*ViewModel.kt` — call repo, hold state.
3. `ui/<x>/*Screen.kt` — Compose; route in `ui/navigation/Screen.kt` + `AppNavHost`. New enum →
   `domain/model/Enums.kt`.
4. **Maturity check:** android has stub modules (recipes, dashboard UI, create/edit forms — see
   `apps/android/CLAUDE.md`). If the target module is a stub, either implement the data layer only and
   say the UI is still a stub, or flag that the module needs full build-out. Don't pretend it's done.
5. Verify: `cd apps/android && ./gradlew assembleDebug`.

---

## Phase 4 — Verify & report

### Build gate (mandatory — not optional)

> **Every platform you touch MUST build green before you call the work done. If the build fails, read
> the error, fix it, and build again — loop until it passes. Never report a change as complete on a
> red build.**

For each touched platform, run its build and iterate:

```bash
# api
pnpm --filter @horae/api build      # (or: npx tsc --noEmit -p apps/api/tsconfig.json for a quick check)
pnpm --filter @horae/api lint

# web
pnpm --filter web build
pnpm --filter web lint

# ios  — the build IS the source of truth; SourceKit in-editor errors are unreliable
xcodebuild -project apps/ios/Horae.xcodeproj -scheme Horae -configuration Debug build

# android
cd apps/android && ./gradlew assembleDebug
```

The loop, per platform:

1. Build. 2. If red → read the **first** error (later ones are often cascades), fix the root cause,
   go to 1. 3. Green → lint → fix lint → done with that platform.

Notes:

- **iOS especially:** don't trust the editor's "cannot find in scope" diagnostics — they're cross-file
  false positives. Only `xcodebuild` succeeding counts. Conversely, if `xcodebuild` is red, it's a real
  error; fix until it compiles. Same spirit for android: `assembleDebug` green is the bar.
- Don't "fix" a red build by deleting/commenting the failing code or weakening types to silence it —
  fix the actual cause. If the only honest fix is out of scope, stop and say so; don't ship red.

### Then

- If a platform was intentionally skipped (e.g. android stub), **say so** — don't imply full coverage.
- State exactly which build/lint commands you ran and that they passed.
- Update the relevant `CLAUDE.md` and `docs/ARCHITECTURE.md` if model/contract changed.
- Manual sanity: trace one happy path end-to-end (request → api → DB → response → client render).

---

## Bug traps (the ones that actually bite here)

1. **Role names.** Backend roles are dynamic DB rows (`administrator, sef-cofetar, cofetar, gestionar,
sofer, user`); the `shared-types` `UserRole` enum + client permission maps are **stale**. Gate on
   CASL abilities (action × subject), never on a role-name string. Enforcement is server-side; client
   maps are UX only.
2. **Two environments, per-client selection.** Prod (`api.horae.ca`) vs Test (`api-test.horae.ca`).
   iOS picks via scheme/`API_TEST` compile flag (`Core/Config/AppConfig.swift`), android via product
   flavor (`BuildConfig.BASE_URL`), web via `NEXT_PUBLIC_API_URL`. Don't hardcode a host in a client —
   route it through that mechanism. See `docs/ENVIRONMENTS.md`.
3. **Date decoding (iOS).** Always use `APIClient.makeDecoder()` (handles Prisma's fractional-second
   ISO8601). A default `JSONDecoder` will throw on timestamps.
4. **Multi-table writes.** Transfers, task transitions, order flows must be in `prisma.$transaction`,
   or you get half-applied stock. Returning/decrementing stock has direction — re-read the existing
   transfer/movement logic before adding a new path.
5. **XOR FKs.** Models like `StockMovement`/`RecipeIngredient`/`PriceHistory` allow exactly one of
   several FKs. The DB won't enforce it — the service must.
6. **Realtime is push-only from the api.** Don't emit from a gateway directly; inject `WebsocketService`.
   Web ignores `/ws` (it polls); iOS consumes it; android doesn't yet — don't rely on WS for web/android.
7. **Status code expectations.** Clients assert specific codes (POST→201, DELETE→204). Keep
   `@HttpCode` on the api side consistent or client decoders throw.
8. **Forbidden non-whitelisted DTO fields.** The global ValidationPipe rejects unknown body props. If a
   client sends a field the DTO doesn't declare, it's a 400 — add it to the DTO.
9. **Half-rippled enums.** Adding a status in the api but not in `Enums.swift`/`Enums.kt`/`types.ts`
   leads to client decode failures or missing labels. Ripple enums everywhere in the same change.

---

## Worked example — "delete location + its transfers, on confirm" (category C)

A real change shipped through this process. Original request: deleting a location errored
`Cannot delete location with active transfers`; the user wanted a confirm that deletes the location
**and** its transfers.

**Phase 0 — Classify.** Category **C** (new behavior on an existing endpoint), not a new model. The
delete endpoint exists; it needs a "force" path. Platforms: **api** + the client that surfaces the
error (**ios**, where the screenshot came from). Web/android use the same endpoint — they'd need the
same client change to expose it, but the request was iOS-driven.

**Phase 1 — Locate.** Find the owner and the full path of the existing delete:

```bash
grep -rln "deleteLocation" apps/ios/Horae            # → LocationService.swift, EditLocationView.swift
# api side: modules/locations/locations.{service,controller}.ts
```

Read all four files + the Prisma relations:

```bash
grep -n "onDelete\|StockTransfer\|TransferItem\|TransferApproval" apps/api/src/prisma/schema.prisma
```

Key finding: `StockTransfer → Location` has **no** `onDelete: cascade`, so deleting a location with
transfers hits an FK error — transfers must be deleted explicitly. `StockTransferItem` and
`TransferApproval` **do** cascade off the transfer.

**Phase 2 — Plan.**

```
Contract change: DELETE /locations/:id gains optional ?force=true
Files in order:
  api:  locations.service.ts (force path) → locations.controller.ts (query param + Swagger)
  ios:  LocationService.swift (force arg) → EditLocationView.swift (2nd confirm on the error)
Connections checked:
  - permission: reuse existing @CheckPolicies('delete','Location') — no change
  - transaction: YES — return stock + delete transfers + delete location must be atomic
  - stock direction: active transfers already decremented source on creation → on force-delete,
    return stock to source IF source ≠ the location being deleted (else it's gone anyway)
  - realtime: none needed
```

**Phase 3 — Implement, backend-first.**

- `locations.service.ts`: `deleteLocation(id, force = false)`. Without `force`, keep the existing
  active-transfer guard. With `force`, inside the existing `prisma.$transaction`: find active
  transfers, upsert-return their stock to source (skip when `fromLocationId === id`),
  `stockTransfer.deleteMany` (items + approval cascade), then the existing userLocation/materialStock/
  location deletes. (Trap #4 + #5 — transaction + stock direction.)
- `locations.controller.ts`: add `@Query('force') force?: string`, pass `force === 'true'`; document
  with `@ApiQuery`. Verified with `tsc --noEmit` → clean.
- `LocationService.swift`: `deleteLocation(id:force:Bool=false)`, append `?force=true` when set.
- `EditLocationView.swift`: the VM catches the `400 validationError` whose message contains
  `active transfers` and sets `needsForceConfirmation` instead of showing the raw error; a second
  `.alert` ("Locatia are transferuri active" → "Sterge tot") retries `delete(force: true)`.

**Why this matched the playbook (and where it could have gone wrong):**

- Backend-first: the force semantics live in the service; the client just exposes them. If we'd added
  a client-side "delete transfers then delete location" loop, we'd have raced the FK and skipped the
  stock-return — bug.
- The error is detected by **message substring**, because the contract returns a generic
  `validationError` (no dedicated code). A cleaner future step: add a domain error code in
  `shared-types` (`LOCATION_001`) and match on that instead (trap #1-style brittleness).
- **Not yet rippled:** web and android still can't force-delete. Per Phase 4, that's stated, not
  hidden — if "in all parts" is required, repeat 3c/3e: add `force` to web `api.ts` +
  confirm dialog, and to android `LocationApi`/repository + dialog.

---

## Quick reference — the slice for a typical "new field" (category B)

```
schema.prisma           + field (migrate, generate)
api dto (create/update/response)   + field + validation + @ApiProperty
api service             handle it (and persist)
web  lib/types.ts       + field;  api.ts if request body changes;  form/detail UI
ios  Models/*           + field;  Service if body changes;  ViewModel + View
android dto/*           + field;  api/repo if body changes;  screen (or note stub)
verify: api build · web build · ios xcodebuild · android assembleDebug
```

</content>
