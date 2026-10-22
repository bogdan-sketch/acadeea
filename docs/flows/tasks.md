# Production tasks

Sources: `api:tasks/tasks.controller.ts`, `api:tasks/tasks.service.ts`, `api:stock/services/stock-reservation.service.ts`, `api:recipes/services/recipe-resolution.service.ts`, `api:stock/recipe-lot-fifo.util.ts`, `api:bulk-actions/*`, web `web:tasks/**`, `web:calendar/page.tsx`, iOS `ios:Tasks/**`.

## State machine

`VALID_TRANSITIONS` (`api:tasks/tasks.service.ts:49-55`):

| From \ To         | DE_FACUT | BLOCAT      | IN_LUCRU           | FINALIZAT                                            | ANULAT             |
| ----------------- | -------- | ----------- | ------------------ | ---------------------------------------------------- | ------------------ |
| (create)          | ✓        |             |                    |                                                      |                    |
| DE_FACUT          |          | system only | ✓ (reserves stock) |                                                      | ✓                  |
| BLOCAT            | ✓        |             | ✓ (reserves stock) |                                                      | ✓                  |
| IN_LUCRU          |          |             |                    | ✓ (needs `actualYield`; consumes stock, adds output) | ✓ (releases stock) |
| FINALIZAT, ANULAT | terminal |             |                    |                                                      |                    |

`BLOCAT` is never requested by a client: the server sets it when a start fails for stock (`TASK-06`). Web board drop targets mirror the table without ANULAT (`web:tasks/task-views.tsx:61-67`); iOS uses the same table (`apps/ios/Horae/Core/Theme/Enums.swift:281-289`).

Who may transition (`tasks.service.ts:1492-1518`, after the route policy `update Task`): `manage Task` → anything allowed by the table; otherwise **start/finish only if assigned to me**, **cancel only if I created it**; anything else → 403.

## Endpoints

| Method + path                                                | Policy                                   | Body / query                                                                                                                                                                                  |
| ------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------- | ------ | ----------- | ------- | --------------- | --------- |
| `GET /tasks`                                                 | read Task                                | `page, limit, status, assignedToId (managers only), recipeId, dueBefore, dueAfter, search, myDay`                                                                                             |
| `GET /tasks/:id`                                             | read Task                                | —                                                                                                                                                                                             |
| `GET /tasks/calendar`                                        | read Task                                | `from, to` → `{ "yyyy-MM-dd": Task[] }` by `dueDate` (UTC day)                                                                                                                                |
| `GET /tasks/stats`                                           | read Task                                | → `{statusCounts, totalTasks}`                                                                                                                                                                |
| `GET /tasks/shopping-list`                                   | read Task                                | aggregated shortages of BLOCAT tasks                                                                                                                                                          |
| `GET /tasks/preview-requirements`                            | read Task                                | `recipeId, targetQuantity≥0.0001, targetUnit, locationId?`                                                                                                                                    |
| `GET /tasks/:id/material-requirements`                       | read Task                                | scaled needs vs stock                                                                                                                                                                         |
| `GET /tasks/:id/traceability`                                | read Task                                | produced batch, consumed lots, history                                                                                                                                                        |
| `POST /tasks`                                                | create Task                              | `{recipeId, targetQuantity≥0, targetUnit, priority?≥0, plannedDate?, dueDate?, notes?, assignedToId?, locationId?, title? (≤120), visibility? (ASSIGNED                                       | EVERYONE | SELECTED), visibleToIds?[]}` |
| `POST /tasks/multi`                                          | create Task                              | `{items[{recipeId, targetQuantity, targetUnit}] (≥1), groupLabel?, includeSemipreparate?, visibility?, visibleToIds?, dueDate?, plannedDate?, locationId?, assignedToId?, priority?, notes?}` |
| `PATCH /tasks/:id`                                           | update Task                              | any create field (no status)                                                                                                                                                                  |
| `POST /tasks/:id/transition`                                 | update Task                              | `{status, reason?, actualYield?≥0, outputLocationId?, byproducts?[{recipeId, quantity≥0}]}`                                                                                                   |
| `PATCH /tasks/:id/assign`                                    | update Task (+ `manage Task` in service) | `{assignedToId}`                                                                                                                                                                              |
| `DELETE /tasks/:id`                                          | delete Task                              | —                                                                                                                                                                                             |
| `POST /tasks/bulk-action`                                    | update Task                              | `action: status (DE_FACUT                                                                                                                                                                     | IN_LUCRU | ANULAT)                      | assign | plannedDate | dueDate | priority (1..5) | location` |
| `POST /tasks/bulk-delete/preview`, `POST /tasks/bulk-delete` | delete Task                              | `{ids, cascade?}`                                                                                                                                                                             |

---

## TASK-01 Create a single task

- **Actor:** create Task (administrator, sef-cofetar). **Preconditions:** recipe exists, not archived, not draft, yield > 0.
- **Steps:** web `/tasks/new` → recipe, quantity + unit, location (defaulted, `web:tasks/new/page.tsx:161`), assignee, dates, visibility, title → live `GET /tasks/preview-requirements` (`:181`) → `POST /tasks` (`:234`). iOS `TaskFormView` → `POST /tasks`.
- **Rules (`tasks.service.ts:291-401`):** recipe 404; archived → 400 "Reteta este arhivata…"; draft → 400 "Rețeta este schiță…"; yield×quantityPerPiece ≤ 0 → 400; `targetQuantity ≤ 0` → 400 (`:296-325`). `scaleFactor = targetQuantity / (yield × quantityPerPiece)` (`:326`). Location = explicit, else assignee's (or creator's) primary location, else org `defaultLocationId` if active, else first active LABORATOR, else first active location (`:330`, `:1363-1396`). `visibleToIds` kept only for `SELECTED`.
- **Side effects:** status history `null → DE_FACUT`; **auto-subtasks** for every semipreparat ingredient whose `recipe.stockCount − reservedCount` is below the need (`:1398-1470`, deficit only); WS `task:update` + `activity:new` (`:384-396`); notification `TASK_ASSIGNED` to the assignee unless self-assigned (`:398`, `:111-139`).
- **Failures:** 400/404 above; unknown `assignedToId`/`locationId` → Prisma FK error (500).
- **Web:** `/tasks/new`. **iOS:** `ios:Tasks/Views/TaskFormView.swift`.

## TASK-02 Create several tasks at once (family)

- **Steps:** `/tasks/new` with several products → `POST /tasks/multi` (`web:tasks/new/page.tsx:218-226`) → `{groupId, tasks[]}`.
- **Rules (`tasks.service.ts:410-455`):** one `create()` per item with a shared `groupId`/`groupLabel`; auto-subtasks are **skipped**; with `includeSemipreparate=true` each item gets one subtask per semipreparat at the **full** resolved quantity (not deficit), merged by recipe+unit (`:464-522`). Not transactional: an error on item N leaves items 1..N−1 created. Per-item `title` is not supported.
- **Web:** `/tasks/new`. **iOS:** `TaskFormViewModel` (`createMultiTasks`).

## TASK-03 See tasks (board, list, "Ziua mea")

- **Steps:** web `/tasks` board/list toggle (`web:tasks/page.tsx:81`), "this week" filter uses Monday-first weeks (`:104-105`) → `GET /tasks`. iOS `TaskBoardView`, `TaskListView`.
- **Rules (`tasks.service.ts:140-257`):** only top-level tasks (`parentTaskId = null`), subtasks nested. Without `manage Task` the user sees: assigned to me, a subtask assigned to me, `visibility=EVERYONE`, or `SELECTED` listing me (`:259-266`). `assignedToId` filter honoured only for managers. `myDay`: open, assigned to me (or a subtask), due before end of today, or undated and not planned for a future day (`:176-201`; "today" = server clock). Order: newest first.
- **Web:** `/tasks`. **iOS:** `ios:Tasks/Views/TaskBoardView.swift`, `TaskListView.swift`.

## TASK-04 Edit a task

- **Steps:** task detail → change quantity/dates/notes/location/title/visibility → `PATCH /tasks/:id` (`web:tasks/[id]/page.tsx:166,181`). iOS `TaskDetailView` → `updateTask`.
- **Rules (`tasks.service.ts:528-620`):** a new `recipeId` must not be archived/draft; `scaleFactor` recalculated when quantity or recipe change; visibility change resets `visibleToIds` unless `SELECTED`. Status cannot change here.
- **Side effects:** notification on a genuine reassignment (`:609-616`).
- **Web:** `/tasks/[id]`. **iOS:** `ios:Tasks/Views/TaskDetailView.swift`.

## TASK-05 Assign / reassign

- **Steps:** detail → assignee chips → `PATCH /tasks/:id/assign {assignedToId}` (`web:tasks/[id]/page.tsx:190`); bulk `action:'assign'`.
- **Rules:** service requires `manage Task` → 403 "Insufficient permissions to reassign tasks" (`tasks.service.ts:871-879`). The user id is not validated (unknown id → Prisma error).
- **Side effects:** WS `task:update`, notification `TASK_ASSIGNED` (`:903-910`).
- **Web:** `/tasks/[id]`. **iOS:** `TaskDetailView`.

## TASK-06 Start a task (reserve stock) / blocked by stock

- **Actor:** assignee, or `manage Task`. **Preconditions:** status DE_FACUT or BLOCAT.
- **Steps:** "Începe" or drag to "În lucru" → `POST /tasks/:id/transition {status:'IN_LUCRU'}`.
- **Rules (`stock-reservation.service.ts:204-430`, top-level tasks only):**
  1. Production location = task location, else first active LABORATOR, else first active location; none → 400 `STOCK_002` "Nicio locație de producție configurată" (`:213-221`).
  2. Resolve the recipe at the task quantity: raw materials converted to their stock unit (kept in the recipe unit if no conversion), semipreparate in their yield unit (`recipe-resolution.service.ts:88-262`).
  3. In one transaction with `SELECT … FOR UPDATE` on `MaterialStock` and `RecipeStock` **of that location only**: available = `quantity − reservedCount`; any shortfall → 400 `STOCK_001` with `shortages[]` (`:236-300`).
  4. Otherwise increment `reservedCount`, create `StockReservation` + `StockMovement REZERVARE` per line, resync aggregates (`:302-395`).
- **Blocked path:** the tasks service catches `STOCK_001`, sets the task to **BLOCAT** with `shortages` and history reason "Stoc insuficient", emits WS, then answers **409 `TASK_BLOCKED_INSUFFICIENT_STOCK`** "Nu poți începe taskul — Stoc insuficient: …" with `shortages` (`tasks.service.ts:680-743`).
- **Success side effects:** `startedAt`, `shortages` cleared, history row, WS `task:update` + `stock:update` (+ `stock:low` when at/below minimum) + `activity:new`.
- **Subtasks:** no stock operation at all (`:676-679`).
- **Web:** `/tasks/[id]`, board. **iOS:** `TaskDetailView`, `TaskBoardView`, `TaskTimerView`.

## TASK-07 Shopping list from blocked tasks

- **Steps:** `/tasks/shopping-list` → `GET /tasks/shopping-list` (`web:tasks/shopping-list/page.tsx:40`).
- **Rules:** aggregates `shortages` JSON of all BLOCAT tasks per item; `shortage = Σneeded − min(available)` (`tasks.service.ts:964-1030`). Not filtered by visibility.
- **Web:** `/tasks/shopping-list`. **iOS:** `ios:Tasks/Views/ShoppingListView.swift`.

## TASK-08 Material requirements and preview

- **Steps:** `GET /tasks/preview-requirements?recipeId&targetQuantity&targetUnit&locationId` before creation; `GET /tasks/:id/material-requirements` for an existing task → `[{title, unit, needed, currentStock, available, stockAfter, sufficient}]` (`stock-reservation.service.ts:1153-1300`).
- **Web:** `/tasks/new`, `/tasks/[id]`. **iOS:** `TaskFormView`, `TaskDetailSections.swift`.

## TASK-09 Finish a task (yield capture, byproducts, output location)

- **Actor:** assignee or `manage Task`. **Preconditions:** IN_LUCRU; every subtask FINALIZAT or ANULAT.
- **Steps:** web: drag to "Finalizat" opens `/tasks/[id]?finish=1` (`web:tasks/page.tsx:250-253`) → enter actual yield and each declared byproduct's leftover → `POST /tasks/:id/transition {status:'FINALIZAT', actualYield, byproducts?}` (`web:tasks/[id]/page.tsx:228-245`). iOS `YieldCaptureSheet` → `{status, actualYield, outputLocationId?}`.
- **Rules:** `actualYield` required and ≥ 0 (`tasks.service.ts:653-659`); open subtasks → 400 "Task-ul nu poate fi finalizat — N subtask-uri nefinalizate" (`:661-673`); byproduct ids must be active byproducts of the recipe or of a subtask's recipe → 400 `STOCK_004` (`:749-756`, `stock-reservation.service.ts:922-960`).
- **Side effects (`stock-reservation.service.ts:436-918`):**
  - Status FINALIZAT, `completedAt`, `actualYield`, `varianceAbsolute`, `variancePercent` (`tasks.service.ts:762-776`).
  - Each reservation: location stock `quantity` and `reservedCount` − reserved qty (floored at 0), `IESIRE_PRODUCTIE` movement, raw-material **lots consumed FIFO** (`onHold` last, then `receivedAt`, then `createdAt`; lots are not per location) with `LotConsumption` rows (`:1268-1300`); semipreparat lots consumed earliest-expiry first (`recipe-lot-fifo.util.ts`).
  - Output: `actualYield` added to `RecipeStock` at the production location in the **recipe's unit**, `INTRARE_PRODUCTIE` movement, expiry = today + `shelfLifeMonths` (clamped to month end), earliest expiry kept on the stock row (`:634-697`).
  - `outputLocationId` ≠ production location → goods moved there and an automatic **FINALIZAT transfer** is recorded (`:699-742`).
  - Produced lot `RecipeStockLot` with a daily lot number (`buildLotNumber`, Bucharest day, advisory lock per recipe) (`:745-788`).
  - Byproducts: operator quantities when sent (authoritative), else `yieldQuantity × scaleFactor` for direct byproducts; each `INTRARE_PRODUCTIE` "Rest din producția …" (`:791-850`).
  - `RecipeYieldHistory` row (also for subtasks) (`tasks.service.ts:818-832`); WS `task:update`, `stock:update`, `stock:low`, `activity:new`.
- **Web:** `/tasks/[id]`. **iOS:** `ios:Tasks/Views/YieldCaptureSheet.swift`.

## TASK-10 Cancel a task

- **Actor:** creator, or `manage Task`. **Steps:** `POST /tasks/:id/transition {status:'ANULAT', reason?}` (`web:tasks/[id]/page.tsx:260`, web sends `cancelReason` mapped to `reason`, `apps/web/src/lib/api.ts:413-423`).
- **Rules:** allowed from DE_FACUT, BLOCAT, IN_LUCRU. From IN_LUCRU the reservations are released: `reservedCount` − qty, `ELIBERARE` movements, `isReleased=true` (`stock-reservation.service.ts:965-1125`).
- **Side effects:** `cancelledAt`, `cancelReason`, history, WS.
- **Web:** `/tasks/[id]`. **iOS:** `TaskDetailView`.

## TASK-11 Delete a task

- **Steps:** `DELETE /tasks/:id`; bulk `POST /tasks/bulk-delete` (dependents = subtasks).
- **Rules (`tasks.service.ts:919-962`):** IN_LUCRU → reservations released first; then reservations, yield history, status history and subtasks (same cleanup) deleted. Stock movements keep `taskId = null`.
- **Web:** `/tasks` bulk bar. **iOS:** `TaskService.deleteTask`, bulk select.

## TASK-12 Bulk actions on tasks

- **Steps:** list view → select → `POST /tasks/bulk-action {ids, action, params}` → `{done[], failed[{id,reason}]}`.
- **Rules (`api:bulk-actions/bulk-action.service.ts:174-207`):** `status` only to DE_FACUT / IN_LUCRU / ANULAT (FINALIZAT needs a per-task yield) and each row goes through `transition()` (so per-row 409 for stock); `priority` 1..5 (single create allows any int ≥ 0); unknown action → 400 listing the allowed ones (`:126-131`). SystemLog `bulk.action`.
- **Web:** `/tasks` (list view). **iOS:** `SharedComponents/BulkSelect.swift`.

## TASK-13 Traceability sheet

- **Steps:** `GET /tasks/:id/traceability` → produced batch, consumed lots (from `LotConsumption` of the task and its subtasks), status history (`tasks.service.ts:1273-1350`).
- **Web:** `/tasks/[id]` (traceability section). **iOS:** `ios:Tasks/Views/TaskTraceabilityView.swift`.

## TASK-14 Production calendar

- **Steps:** web `/calendar` loads `GET /orders/calendar` + `GET /tasks` for the visible Monday-first range (`web:calendar/page.tsx:49,202-203`); iOS `ProductionCalendarView` → `GET /tasks/calendar?from&to`.
- **Rules:** `GET /tasks/calendar` filters by `dueDate` and groups by `dueDate.toISOString()` date (UTC) (`tasks.service.ts:1055-1098`); visibility scope applies.
- **Web:** `/calendar`. **iOS:** `ios:Tasks/Views/ProductionCalendarView.swift`.

---

## Discrepancies

1. **Subtask production never touches stock.** Subtasks skip reservation and fulfilment (`tasks.service.ts:676-679,801-815`), so finishing a semipreparat subtask adds no `RecipeStock` and consumes no raw materials. The parent then reserves that semipreparat from stock at start (`stock-reservation.service.ts:267-290`) — the very stock whose deficit created the subtask — and is blocked (`TASK-06`). The auto-subtask flow cannot complete without a manual stock entry.
2. **Finish is not atomic.** Status is written FINALIZAT (`tasks.service.ts:780`) before `fulfillForTask` (`:808`); if fulfilment throws, the task stays FINALIZAT with reservations unfulfilled and no output.
3. **`PATCH /tasks/:id` bypasses assignment rules.** `assignedToId` in the update body needs only `update Task` (`tasks.service.ts:557-561`), while `PATCH /tasks/:id/assign` requires `manage Task` (`:871-879`). A cofetar can reassign or edit any task, including tasks they cannot see.
4. **Visibility is enforced only on lists.** `GET /tasks/:id`, `/material-requirements`, `/traceability`, `/stats`, `/shopping-list` do not apply `visibilityScope` (`tasks.service.ts:272-284`, `:964`, `:1033`).
5. **Editing a running task leaves reservations stale.** Changing `targetQuantity`/`recipeId` on an IN_LUCRU task recalculates `scaleFactor` only (`tasks.service.ts:586-598`); finish consumes the old reserved quantities.
6. **Unit mismatches at finish.** `actualYield` is entered in `targetUnit` but credited to `RecipeStock` and the movement in `recipe.unit` (`stock-reservation.service.ts:634-697`); resolution ignores `targetUnit` (recipes discrepancy 9). Auto-subtask deficit compares `ingredient.quantity × scale` (ingredient unit) with `recipe.stockCount` (yield unit) without conversion (`tasks.service.ts:1426-1436`).
7. **Raw-material lots are global, stock is per location.** FIFO lot consumption ignores location (`stock-reservation.service.ts:1276-1283`, `StockLot` has no `locationId`), so traceability can cite a lot that sits in another location; expired lots are not skipped.
8. **Two different "default production location" rules.** Task creation prefers the org `defaultLocationId` (`tasks.service.ts:1373-1386`); reservation fallback for a task with no location ignores it (`stock-reservation.service.ts:130-143`).
9. **Clients and the blocked start.** API answers 409 and the task is BLOCAT on the server; iOS keeps the old card status after the error (`ios:Tasks/ViewModels/TaskBoardViewModel.swift:63-80`, comment still expects a BLOCAT 200).
10. **Parity:** web never sends `outputLocationId` (no "finish elsewhere"); iOS never sends `byproducts` (`TransitionTaskRequest` has no field, `ios:Tasks/Models/TaskModels.swift:215-220`), so iOS finishes always use the declared-yield fallback.
11. **`myDay=false` means true.** `@Type(() => Boolean)` turns any non-empty string into `true` (`tasks/dto/task-query.dto.ts:83-85`); clients only send `true`, but API consumers will trip on it. `myDay` and `GET /tasks/calendar` use the server clock / UTC day, not Europe/Bucharest.
12. **Priority range differs:** create/update accept any integer ≥ 0, bulk accepts 1..5 (`bulk-action.service.ts:199`).
