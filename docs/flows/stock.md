# Stock: raw materials, consumables, lots, locations, transfers

Sources: `api:stock/stock.controller.ts`, `api:stock/stock.service.ts`, `api:stock/services/*` (reservation, review, import/export, requirements plan), `api:stock/recipe-lot-fifo.util.ts`, `api:raw-materials/*`, `api:consumables/*`, `api:suppliers/*`, `api:unit-conversions/*`, `api:locations/*`, `api:bulk-actions/*`, web `web:stock/**`, iOS `ios:Stock/**`. Task reservation/consumption is in [tasks.md](tasks.md) (`TASK-06`, `TASK-09`).

## Stock model in one table

| Stock of                      | Where the quantity lives                                                                                  | Aggregate                                                                   | Lots                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Raw material                  | `MaterialStock(locationId, rawMaterialId).quantity` + `reservedCount` (**per location**, source of truth) | `RawMaterial.stockCount/reservedCount` = Σ locations, resynced after writes | `StockLot` per intake: `quantity`, `remainingQuantity`, expiry, price, supplier, invoice, barcode, `onHold`. **No location.** |
| Consumable                    | `Consumable.stockCount/reservedCount` (**global**, no location)                                           | —                                                                           | `StockLot` per intake (not FIFO-consumed except test consumption)                                                             |
| Recipe (semipreparat / final) | `RecipeStock(locationId, recipeId).quantity` + `reservedCount` + `expiryDate` (earliest batch in stock)   | `Recipe.stockCount/reservedCount` = Σ locations (rounded to integer)        | `RecipeStockLot` per production batch (location-bound), FEFO                                                                  |

Movement types (`schema.prisma:161`): `INTRARE` (receipt), `AJUSTARE` (absolute set), `REZERVARE`, `ELIBERARE`, `IESIRE_PRODUCTIE`, `INTRARE_PRODUCTIE`, `IESIRE_TESTE`, `IESIRE_VANZARE`. Only `INTRARE` and `AJUSTARE` can be posted by hand (`stock.service.ts:115-120`).

Material status (`MaterialStatus`): `ACTIVE | LOW_STOCK | OUT_OF_STOCK | DISCONTINUED`, recomputed from stock vs `minimumStock` after every write; `DISCONTINUED` is sticky (`api:stock/material-status.util.ts`).

Unit conversion (`api:unit-conversions/unit-conversions.service.ts:73-127`): identity → material-specific direct row → universal direct row → two-hop → built-in metric fallback → 400 "No conversion path found". `convertWithPieceBridge` adds the semipreparat piece equivalent (1 buc = N g/ml).

## Endpoints

| Method + path                                                                                  | Policy                                      | Body / query                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET/POST /raw-materials`, `GET/PATCH /raw-materials/:id`                                      | read / create / update RawMaterial          | create: `title` required; `category, producer, supplierId, locationId, unit (default BUCATI), quantityPerPiece, pieceType, storageType (default WARM), minimumStock, estimatedLossPercent, purchasePrice, priceIncludesVat, allergens[], invoiceNumber, invoiceDate, lotNumber, expiryDate`; update adds `status, nutrition` |
| `GET /raw-materials/:id/price-history`                                                         | read RawMaterial                            | —                                                                                                                                                                                                                                                                                                                            |
| `GET /raw-materials/:id/delete-info`                                                           | delete RawMaterial                          | → `{currentStock, canDelete, everUsed, activeTransfers}`                                                                                                                                                                                                                                                                     |
| `DELETE /raw-materials/:id[?hard=true]`                                                        | delete RawMaterial                          | soft (DISCONTINUED) or hard                                                                                                                                                                                                                                                                                                  |
| `GET/POST /consumables`, `GET/PATCH/DELETE /consumables/:id`                                   | read / create / update / delete Consumable  | DELETE = DISCONTINUED                                                                                                                                                                                                                                                                                                        |
| `GET/POST /suppliers`, `GET/PATCH/DELETE /suppliers/:id`                                       | read RawMaterial / **manage** RawMaterial   | —                                                                                                                                                                                                                                                                                                                            |
| `GET /unit-conversions[?rawMaterialId]`; `POST`, `DELETE /:id`                                 | read RawMaterial; writes `manage all`       | —                                                                                                                                                                                                                                                                                                                            |
| `POST /stock/movements`                                                                        | create StockMovement                        | `{rawMaterialId                                                                                                                                                                                                                                                                                                              | consumableId, movementType: INTRARE                                                                                                                        | AJUSTARE, quantity≥0, unit, referenceNote?, locationId?, lotNumber?, expiryDate?, purchasePrice?≥0, priceIncludesVat?, supplier?, barcode?, supplierInvoice?}` |
| `POST /stock/movements/batch`                                                                  | create StockMovement                        | `{items[{rawMaterialId                                                                                                                                                                                                                                                                                                       | consumableId, quantity≥0.01, unit, lotNumber?, barcode?, expiryDate?, purchasePrice?, priceIncludesVat?, supplierInvoice?, referenceNote?}], locationId?}` |
| `POST /stock/recipe-movements`                                                                 | create StockMovement                        | `{recipeId, movementType: INTRARE                                                                                                                                                                                                                                                                                            | AJUSTARE, quantity≥0, unit, referenceNote?, locationId?}`                                                                                                  |
| `POST /stock/test-consumption`                                                                 | update RawMaterial **or** update Consumable | `{locationId, items[{rawMaterialId                                                                                                                                                                                                                                                                                           | consumableId, quantity>0, unit}], notes?}`                                                                                                                 |
| `GET /stock/movements`, `GET /stock/movements/:id`, `GET /stock/movements/export`              | read StockMovement                          | `page, limit, rawMaterialId, consumableId, recipeId, taskId, movementType, search, from, to (ISO), locationId`                                                                                                                                                                                                               |
| `GET /stock/item-availability`                                                                 | read StockMovement                          | `rawMaterialId                                                                                                                                                                                                                                                                                                               | consumableId                                                                                                                                               | recipeId`                                                                                                                                                      |
| `GET /stock/recipes`, `GET /stock/recipes/:recipeId/lots[?locationId]`                         | read Recipe                                 | recipe stock list / batches                                                                                                                                                                                                                                                                                                  |
| `GET /stock/stats`, `/stock/low-stock`, `/stock/expiring?days=30`, `/stock/lots?rawMaterialId  | consumableId`                               | read StockMovement                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                          |
| `PATCH /stock/lots/:id/hold`                                                                   | update RawMaterial or update Consumable     | `{onHold}`                                                                                                                                                                                                                                                                                                                   |
| `GET /stock/export`, `POST /stock/import?dryRun=`                                              | `manage all`                                | multipart `file` (.xlsx)                                                                                                                                                                                                                                                                                                     |
| `GET /stock/review/export`, `POST /stock/review/import?dryRun=`                                | `manage all`                                | multipart `file`                                                                                                                                                                                                                                                                                                             |
| `POST /stock/requirements-plan`, `POST /stock/requirements-plan/export`                        | read RawMaterial                            | `{items[{recipeId, quantity≥0.001}]}`                                                                                                                                                                                                                                                                                        |
| `POST/GET /locations`, `GET/PATCH/DELETE /locations/:id[?force=true]`                          | create / read / update / delete Location    | `{name, type, address, phone?, isActive?}`                                                                                                                                                                                                                                                                                   |
| `GET /locations/my-locations`, `/locations/:id/stock`, `/recipe-stock`, `/dashboard`, `/users` | read Location                               | —                                                                                                                                                                                                                                                                                                                            |
| `POST /locations/:id/users`, `DELETE /locations/:id/users/:userId`                             | update Location                             | `{userId, isPrimary?}`                                                                                                                                                                                                                                                                                                       |
| `POST/GET /stock/transfers`, `GET /stock/transfers/:id`                                        | create / read StockTransfer                 | see TRF-01                                                                                                                                                                                                                                                                                                                   |
| `PATCH /stock/transfers/:id`                                                                   | update StockTransfer                        | `{status: IN_TRANZIT                                                                                                                                                                                                                                                                                                         | FINALIZAT                                                                                                                                                  | ANULAT, assignedToId?}`                                                                                                                                        |
| `PATCH /stock/transfers/:id/approval`                                                          | update StockTransfer                        | `{status: PENDING                                                                                                                                                                                                                                                                                                            | APPROVED                                                                                                                                                   | REJECTED, reason?}`                                                                                                                                            |
| `GET /stock/transfers/:id/aviz`, `/conformity`                                                 | read StockTransfer                          | allocates serial on first call                                                                                                                                                                                                                                                                                               |
| `PATCH /stock/transfers/:id/aviz/sign`, `GET …/aviz/signature`                                 | update / read StockTransfer                 | multipart `signature` + `receiverName`                                                                                                                                                                                                                                                                                       |
| `POST {raw-materials,consumables,stock/transfers}/bulk-*`                                      | update / delete on the subject              | see README conventions                                                                                                                                                                                                                                                                                                       |

---

## STK-01 Create a raw material

- **Actor:** create RawMaterial. **Steps:** web `/stock/raw-materials` → "+" → form → `POST /raw-materials`; iOS `StockMovementFormView` (new-material mode) / `RawMaterialListView`.
- **Rules:** only `title` required; `unit` defaults to `BUCATI`, `storageType` to `WARM` (`api:raw-materials/raw-materials.service.ts:146-170`); `purchasePrice` normalised to the org cost basis when `priceIncludesVat` is sent (VAT payer → net, non-payer → gross, `apps/api/src/common/vat.ts`); `locationId` creates a zero-quantity `MaterialStock` row so the material shows at that location (`:174-182`).
- **Side effects:** WS `stock:update`.
- **Web:** `/stock/raw-materials`. **iOS:** `ios:Stock/Views/RawMaterialListView.swift`, `StockMovementFormView.swift`.

## STK-02 Edit / discontinue / hard-delete a raw material

- **Steps:** detail → edit → `PATCH /raw-materials/:id` (incl. `status`, `nutrition`, `allergens`, `supplierId`); delete → `GET /raw-materials/:id/delete-info` → soft `DELETE /raw-materials/:id` or hard `DELETE /raw-materials/:id?hard=true`.
- **Rules:** price change writes `PriceHistory PURCHASE`. Hard delete allowed only when global stock = 0, **every** location row = 0, and the material is on **no non-cancelled transfer** (printed avize are fiscal history) (`raw-materials.service.ts:307-367`); re-checked inside the transaction (`:380-395`). Hard delete removes lots, consumptions, movements, reservations, location stock, transfer lines, **recipe ingredient rows**, price history, unit conversions (`:396-405`).
- **Failures:** 400 "Materia primă nu poate fi ștearsă cât timp are stoc sau apare pe un transfer…" / "Stocul s-a schimbat între timp".
- **Web:** `/stock/raw-materials/[id]`. **iOS:** `ios:Stock/Views/RawMaterialDetailView.swift`, `EditRawMaterialFormView.swift`.

## STK-03 Consumables (boxes, ribbons…)

- **Steps:** `/stock/consumables` → `POST /consumables`, `PATCH /consumables/:id`, `DELETE /consumables/:id` (→ DISCONTINUED, `api:consumables/consumables.service.ts:135-150`).
- **Rules:** stock is global (no location). Intake/adjust via `STK-05`.
- **Web:** `/stock/consumables`, `/stock/consumables/[id]`. **iOS:** `ios:Stock/Views/ConsumableListView.swift`, `ConsumableDetailView.swift` (category edit only, `StockService.updateConsumableCategory`).

## STK-04 Suppliers

- **Steps:** `/stock/suppliers` → CRUD on `/suppliers`. Delete unlinks materials (`supplierId = null`) then deletes (`api:suppliers/suppliers.service.ts:74-82`).
- **Rules:** writes need `manage RawMaterial` — none of the seeded non-admin roles have it.
- **Web:** `/stock/suppliers`. **iOS:** `ios:Stock/Views/SuppliersListView.swift`.

## STK-05 Receive stock (single intake)

- **Actor:** create StockMovement (all seeded stock roles). **Steps:** quick action "Intrare" → `POST /stock/movements {movementType:'INTRARE', …}`.
- **Rules (`stock.service.ts:91-343`):** VAT normalisation of `purchasePrice` (`:96-112`); only INTRARE/AJUSTARE (`:115-120`); INTRARE quantity > 0 (`:123-125`); exactly one of `rawMaterialId`/`consumableId` (`:127-137`). Raw material: location = explicit, else my primary location, else first active LABORATOR, else first active location; none → 400 (`:160-167`, `:926-945`); `MaterialStock.quantity += quantity` (`:171-176`); aggregate resynced; material `lotNumber/expiryDate/producer/purchasePrice` set to this intake (`:196-206`).
- **Side effects:** `StockLot` row (`:210-222`), `PriceHistory` when the price changed (`:225-237`), `StockMovement INTRARE`, WS `stock:update` (+ `stock:low`), `activity:new STOCK_AVAILABLE` for every BLOCAT task that can now start (task is **not** moved; `:337`, `:880-925`).
- **Failures:** 400/404 above. The request `unit` is stored on the movement but **not converted** (discrepancy 1).
- **Web:** `components/stock-adjustment-dialog.tsx` from stock lists/detail. **iOS:** `ios:Stock/Views/StockQuickActions.swift`, `StockMovementFormView.swift`.

## STK-06 Receive a delivery (batch / NIR)

- **Steps:** `/stock/receive` → pick location, add lines (material/consumable, qty, unit, lot, expiry, price incl./excl. VAT, invoice) → `POST /stock/movements/batch`.
- **Rules:** each line goes through `STK-05` with `INTRARE` (`stock.service.ts:959-1003`); quantity ≥ 0.01. **Not atomic:** a failing line N leaves lines 1..N−1 received.
- **Web:** `/stock/receive`. **iOS:** `ios:Stock/Views/BatchReceiveView.swift`.

## STK-07 Adjust stock (absolute count)

- **Steps:** "Ajustare" → `POST /stock/movements {movementType:'AJUSTARE', quantity:<new absolute value>, locationId}`; finished goods / semipreparate → `POST /stock/recipe-movements`.
- **Rules:** raw material: the location row is **set** to `quantity` (`stock.service.ts:178-184`); consumable: global `stockCount` set (`:258-261`); recipe: location row set and, if it went down, recipe lots consumed FEFO for the difference (`:815-835`). Quantity 0 is allowed (zeroing). No check against `reservedCount`.
- **Side effects:** `AJUSTARE` movement (stores the absolute value), WS events.
- **Web:** stock-adjustment dialog; `/stock/recipe-stock`. **iOS:** `StockMovementFormView`, `RecipeStockDetailView`.

## STK-08 Test consumption (R&D / test bakes)

- **Actor:** update RawMaterial or update Consumable. **Steps:** `/stock/raw-materials` → "Consum teste" → `POST /stock/test-consumption {locationId, items, notes}`.
- **Rules (`stock.service.ts:1008-1222`):** XOR per item, quantity > 0 (`:1012-1023`); location must exist (`:1025-1029`); one transaction: location stock − qty **clamped at 0** (insufficient stock is allowed), aggregate resynced, raw lots walked FIFO (held last) without `LotConsumption` rows; consumable global stock − qty clamped.
- **Side effects:** `IESIRE_TESTE` movements with note (default "Consum teste"), WS events.
- **Web:** `/stock/raw-materials` dialog. **iOS:** `ios:Stock/Views/TestConsumptionView.swift`.

## STK-09 Lots: list, hold, FIFO

- **Steps:** material detail → `GET /stock/lots?rawMaterialId=` → toggle "Rezervat" → `PATCH /stock/lots/:id/hold {onHold}`.
- **Rules:** held lots are consumed **last** by production/test FIFO (`stock-reservation.service.ts:1276-1283`). `setLotHold` checks the lot's material belongs to the caller's org (`stock.service.ts:1433-1450`).
- **Web:** `/stock/raw-materials/[id]`. **iOS:** `RawMaterialDetailView`.

## STK-10 Movements log and export

- **Steps:** `/stock/movements` → filters (type, item, task, recipe, location, period, search) → `GET /stock/movements`; export → `GET /stock/movements/export` (.xlsx, AJUSTARE shown as "= N", ins/outs signed, `stock.service.ts:420-506`).
- **Web:** `/stock/movements`. **iOS:** `ios:Stock/Views/StockMovementListView.swift` (+ xlsx via `fetchMovementsXlsx`).

## STK-11 Low stock

- **Steps:** `/stock/low-stock` → `GET /stock/low-stock`; iOS `LowStockAlertBanner`.
- **Rules:** items with `minimumStock > 0`, `stockCount ≤ minimumStock`, **status not OUT_OF_STOCK**, sorted by ratio (`stock.service.ts:1255-1310`). Consumable unit always reported as `BUCATI`.
- **Web:** `/stock/low-stock`. **iOS:** `ios:Stock/Views/LowStockAlertBanner.swift`, Dashboard.

## STK-12 Expiring stock

- **Steps:** `/stock/expiring` → `GET /stock/expiring?days=30`.
- **Rules:** raw/consumable lots with `remainingQuantity > 0` and expiry ≤ today + days (org-scoped explicitly), plus `RecipeStock` rows with expiry ≤ cutoff and quantity > 0, merged and sorted (`stock.service.ts:1312-1390`). Already expired items are included (negative `daysUntilExpiry`).
- **Side effects:** none (push reminders: see notifications.md `NTF-05`).
- **Web:** `/stock/expiring`. **iOS:** `ios:Stock/Views/ExpiryTrackingView.swift`.

## STK-13 Item availability snapshot

- **Steps:** detail quick actions / zeroing warning → `GET /stock/item-availability?rawMaterialId|consumableId|recipeId` → per-location quantities, active task reservations, pending transfers (`stock.service.ts:533-665`). Exactly one id → else 400.
- **Web:** `/stock/raw-materials/[id]`. **iOS:** `StockQuickActions`.

## STK-14 Stock export / import (.xlsx)

- **Actor:** administrator (`manage all`). **Steps:** `/stock/raw-materials` → export `GET /stock/export` → edit → `POST /stock/import?dryRun=true` (diff) → confirm `dryRun=false`.
- **Rules:** default `dryRun` is true (anything but `'false'`, `stock.controller.ts:159-190`); apply in one transaction with `AJUSTARE` per quantity change (`api:stock/services/stock-import-export.service.ts`).
- **Web:** `/stock/raw-materials`. **iOS:** missing.

## STK-15 Stock review ("Revizie stocuri") export / import

- **Actor:** administrator. **Steps:** `/stock/review` → `GET /stock/review/export` (sheets Materii prime / Consumabile / Semipreparate / Produse finite; one row per lot, `STOC` rows for stock without lots) → count physically → `POST /stock/review/import?dryRun=true` → review changes and unknown ids → `dryRun=false`.
- **Rules (`api:stock/services/stock-review.service.ts:1-20,320-420`):** wrong workbook → 400 naming the four sheets; only rows present are applied; new items since export untouched; every quantity change is an `AJUSTARE` "Revizie stocuri".
- **Web:** `/stock/review`. **iOS:** export only (`ios:Stock/Views/StockReviewView.swift`, `fetchStockReviewXlsx`).

## STK-16 Requirements plan (procurement)

- **Steps:** `/stock/requirements` → add products + quantities → `POST /stock/requirements-plan` → `{products, requirements[{title, category, needed, unit, currentStock, available, deficit, supplierName}]}`; export `POST /stock/requirements-plan/export` → `necesar-mp.xlsx` (200).
- **Rules (`api:stock/services/requirements-plan.service.ts:36-125`):** quantities are in the recipe's unit; semipreparate are expanded **recursively** to raw materials (unlike task reservation); cycle guard `MAX_EXPANSION_ROUNDS` → 400; `available = stockCount − reservedCount` (global, all locations), `deficit = max(0, needed − available)`.
- **Web:** `/stock/requirements`. **iOS:** `ios:Stock/Views/RequirementsPlanView.swift`.

## STK-17 Finished goods / semipreparate stock

- **Steps:** `/stock/recipe-stock` → `GET /stock/recipes`; batches `GET /stock/recipes/:id/lots`; manual intake/adjust `POST /stock/recipe-movements`.
- **Rules:** manual INTRARE adds quantity at the location but creates **no** `RecipeStockLot` (stock stays unattributed); draft/archived recipes are not refused (`stock.service.ts:778-870`).
- **Web:** `/stock/recipe-stock`. **iOS:** `ios:Stock/Views/ProductListView.swift`, `SemipreparateListView.swift`, `RecipeStockDetailView.swift`.

## STK-18 Unit conversions

- **Steps:** `GET /unit-conversions` (read RawMaterial); admin `POST /unit-conversions`, `DELETE /unit-conversions/:id`. Standard conversions are seeded per org (`unit-conversions.service.ts:226`).
- **Web:** no dedicated screen found. **iOS:** missing.

---

## LOC-01 Locations: create, edit, deactivate

- **Steps:** `/stock/locations` → `POST /locations {name, type, address, phone?, isActive?}`; `PATCH /locations/:id`.
- **Rules:** name unique per org (DB unique → unmapped Prisma error, 500); types `DEPOZIT | FRIGIDER | CONGELATOR | LABORATOR | MAGAZIN | PUNCT_LUCRU`. Inactive locations drop out of every default-location fallback.
- **Web:** `/stock/locations`. **iOS:** `ios:Stock/Views/CreateLocationView.swift`, `EditLocationView.swift`.

## LOC-02 Delete a location

- **Steps:** `DELETE /locations/:id` → 400 "Cannot delete location with transfers referencing it. Use force…" when **any** transfer references it (`api:locations/locations.service.ts:92-112`) → `DELETE /locations/:id?force=true`.
- **Rules (force):** active transfers **into** it give raw stock back to the source; transfers **from** it are not returned; recipe items are not returned; every transfer referencing it deleted; then user links, `MaterialStock`, `RecipeStock`, `RecipeStockLot` rows deleted (`:113-162`).
- **Side effects:** stock disappears without a movement; aggregates not resynced (discrepancy 7).
- **Web:** `/stock/locations/[id]`. **iOS:** `LocationService.deleteLocation(force:)`.

## LOC-03 Default location (org setting)

- **Steps:** Settings → company → default location (`Organization.defaultLocationId`, see organization.md). Used by task creation only (`tasks.service.ts:1373-1386`); web pre-selects it in forms (`apps/web/src/lib/default-location.ts`).

## LOC-04 Assign users to a location

- **Steps:** location → users → `POST /locations/:id/users {userId, isPrimary?}`; remove `DELETE /locations/:id/users/:userId`.
- **Rules:** `isPrimary=true` clears the user's other primary flags (`locations.service.ts:738-776`). The primary location is the first choice for receptions and new tasks.
- **Web:** `/stock/locations/[id]`. **iOS:** `ios:Stock/Views/LocationUsersView.swift`.

## LOC-05 Location stock and dashboard

- **Steps:** `GET /locations/:id/stock`, `/recipe-stock`, `/dashboard`.
- **Web:** `/stock/locations/[id]`. **iOS:** `ios:Stock/Views/LocationDashboardView.swift`, `LocationStockView.swift`.

---

## TRF-01 Create a transfer

- **Actor:** create StockTransfer (all seeded roles incl. sofer). **Steps:** `/stock/transfers/new` → source location → destination location **or** free-text event destination (+ address, contact) → items from source stock (`GET /locations/:id/stock`, `/recipe-stock`) → transport data (assignee, ID card, means, dispatch time) → `POST /stock/transfers`.
- **Body:** `{fromLocationId, toLocationId? XOR destinationName?, destinationAddress?, destinationContact?, notes?, assignedToId?, delegateIdCard?, transportMeans?, dispatchedAt?, items[{rawMaterialId|recipeId, quantity≥0.001, unit? (ignored)}]}`.
- **Rules (`locations.service.ts:228-411`):** destination required, not both (`:232-239`); source ≠ destination (`:241`); ≥ 1 item; locations and assignee must exist; source quantity ≥ requested per item, else 400 "Insufficient stock at source for …" (`:305-310`) — `reservedCount` is not considered; the item unit is always the item's stock unit.
- **Side effects (one transaction):** source `MaterialStock`/`RecipeStock` decremented **at creation**; recipe lots consumed FEFO at the source (`:343`); transfer `IN_ASTEPTARE`; WS `activity:new`. No `StockMovement` rows.
- **Web:** `/stock/transfers/new`. **iOS:** `ios:Stock/Views/CreateTransferView.swift`.

## TRF-02 Approve / reject a transfer

- **Steps:** detail → "Aprobă"/"Respinge" → `PATCH /stock/transfers/:id/approval {status, reason?}` (`web:stock/transfers/[id]`, `web:stock/locations/[id]`).
- **Rules:** upsert of the approval row, any transfer status (`locations.service.ts:1090-1133`). The approval does **not** gate shipping or receiving.
- **Web:** `/stock/transfers/[id]`. **iOS:** `ios:Stock/Views/TransferApprovalView.swift`.

## TRF-03 Ship, receive or cancel

- **Steps:** `PATCH /stock/transfers/:id {status, assignedToId?}`.
- **Rules (`locations.service.ts:477-736`):** transitions `IN_ASTEPTARE → IN_TRANZIT | ANULAT`, `IN_TRANZIT → FINALIZAT | ANULAT`, else 400 (`:498-506`). `IN_TRANZIT` needs an assignee (body or existing) → 400 (`:519-524`).
  - **FINALIZAT:** atomic claim (`IN_TRANZIT` only, else 400 "Transferul a fost deja finalizat.", `:531-542`); to a location → destination stock incremented, recipe expiry carried (earliest wins); ad-hoc destination → goods leave the system, aggregates resynced (`:544-590`).
  - **ANULAT:** atomic claim → source stock given back (`:665-736`).
- **Bulk:** `POST /stock/transfers/bulk-action {action:'status'}`; `IN_TRANZIT` defaults the transporter to the acting user (`bulk-action.service.ts:228-246`). Bulk delete of an active transfer returns its stock first (`bulk-delete.service.ts:284-312`).
- **Web:** `/stock/transfers/[id]`, `/stock/transfers` bulk bar. **iOS:** `ios:Stock/Views/TransferDetailView.swift`, `TransferListView.swift`.

## TRF-04 Aviz de însoțire (delivery note), signature and conformity declaration

- **Steps:** detail → "Aviz" → `GET /stock/transfers/:id/aviz` (printable payload); after delivery → sign on screen → `PATCH /stock/transfers/:id/aviz/sign` (multipart `signature` image + `receiverName`); `GET …/aviz/signature` returns the PNG; "Declarație de conformitate" → `GET /stock/transfers/:id/conformity`.
- **Rules:** the first `GET` allocates a serial `AVZ-yyyyMMdd-N` / `CB-yyyyMMdd-N` (daily counter per org, unique retry ×3, `locations.service.ts:830-880,938-1000,1062-1088`); signing requires a file (400 "Imaginea semnaturii este obligatorie.") and status FINALIZAT (`:1018-1047`).
- **Web:** `/stock/transfers/[id]` (`components/signature-dialog.tsx`). **iOS:** aviz + conformity view only; **signing missing** (`LocationService` has no sign call).

---

## Discrepancies

1. **The movement `unit` is ignored for stock math.** `POST /stock/movements`, `/movements/batch`, `/recipe-movements`, `/test-consumption` add/subtract `quantity` as-is in the stock unit; `unit` is only stored on the movement (`stock.service.ts:171-184,292-302,1008-1222`). Receiving "2 KILOGRAME" of a material stocked in `GRAME` adds 2 g.
2. **Cross-tenant read on `GET /stock/lots`.** `StockLot` has no `organizationId` (tenant extension skips it); `findLots` filters only by the optional ids (`stock.service.ts:1392-1431`). With no query it returns every organisation's lots; with another org's `rawMaterialId` it returns that org's lots. `findExpiring` and `setLotHold` scope explicitly, `findLots` does not.
3. **Cross-tenant read on `GET /stock/expiring` (finished goods).** `RecipeStock` is unscoped and the `producedStock` query has no org filter (`stock.service.ts:1342-1352`). Review import also loads `RecipeStock` rows by uploaded id without an org check (`stock-review.service.ts:378`).
4. **Bulk delete ignores the raw-material delete guards.** `POST /raw-materials/bulk-delete {cascade:true}` deletes materials with stock and with lines on finalised (printed) avize (`bulk-delete.service.ts:355-372`), exactly what `hardDelete` refuses (`raw-materials.service.ts:353-355,370-376`).
5. **Transfers ignore reservations and approvals.** Creation checks `quantity` not `quantity − reservedCount` (`locations.service.ts:305`), so a running task's reserved stock can be shipped; the approval status is never checked by status changes (`:477-736`).
6. **Transfers leave no movement trail and break recipe lots.** No `StockMovement` is written for create/finish/cancel; recipe lots consumed at the source on create are not restored on cancel and no lots are created at the destination on finish (`:343`, `:590-664`, `:665-736`).
7. **Location force-delete loses stock silently.** `MaterialStock`/`RecipeStock` rows are deleted without movements and without resyncing `RawMaterial.stockCount`/`Recipe.stockCount`; outgoing transfers and recipe items are not returned (`locations.service.ts:113-162`).
8. **Low-stock hides empty items.** `findLowStock` excludes `OUT_OF_STOCK` (`stock.service.ts:1259`); an item at 0 never shows on `/stock/low-stock`.
9. **Three different default-location rules** (task create: primary → org default → LABORATOR; reception: primary → LABORATOR; reservation: task location → LABORATOR) (`tasks.service.ts:1363-1396`, `stock.service.ts:926-945`, `stock-reservation.service.ts:130-143`).
10. **`GET /stock/transfers/:id/aviz` writes.** A read endpoint allocates the fiscal serial; any viewer with read StockTransfer burns the next number.
11. **Non-atomic writes.** `createMovement` performs 4–6 writes without a transaction (`stock.service.ts:91-343`); batch receive is not atomic (`:959-1003`).
12. **Parity:** iOS has no stock import/export, no review import, no aviz signing, no consumable edit beyond category; web has no unit-conversion screen.
