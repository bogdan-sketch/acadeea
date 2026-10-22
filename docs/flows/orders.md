# Orders

Sources: `api:orders/orders.controller.ts`, `api:orders/orders.service.ts`, `api:orders/order-archive.job.ts`, `api:orders/certificate-pdf.service.ts`, `api:pricing/pricing.service.ts` (revenue), `api:integrations/*` (Woo import, see [integrations.md](integrations.md)), `api:sales-deductions/*` (Woo auto-deduction, see [sales-deductions.md](sales-deductions.md)), web `web:orders/**`, `web:calendar/page.tsx`, iOS `ios:Orders/**`.

## State machine

`VALID_TRANSITIONS` (`api:orders/orders.service.ts:28-35`), mirrored by web (`web:orders/[id]/page.tsx:65-75`) and iOS (`apps/ios/Horae/Core/Theme/Enums.swift:421-430`):

| From             | To                                   |
| ---------------- | ------------------------------------ |
| NOUA             | IN_PREGATIRE, ANULATA                |
| IN_PREGATIRE     | PREGATITA, ANULATA                   |
| PREGATITA        | IN_TRANZIT, ANULATA                  |
| IN_TRANZIT       | LIVRATA (no cancel once on the road) |
| LIVRATA, ANULATA | terminal                             |

Item statuses (`OrderItemStatus`): `IN_PREGATIRE | GATA | IN_TRANZIT | LIVRAT`, set per item, never derived from the order status. Fulfilment type (`schema.prisma:958`): `DELIVERY` (default) or `PICKUP` (+ `pickupLocationId`).

**Order status changes never move stock.** Stock for site orders is deducted by the sales-deduction module when the WooCommerce order reaches `processing` ("în procesare") (`SALE-06`), not by the Horae order status.

## Endpoints

| Method + path                                                      | Policy                                      | Body / query                                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- | -------- |
| `POST /orders`                                                     | create Order                                | `{deliveryPoint≥1, fulfillmentType?, pickupLocationId?, deliveryAddress?, notes?, assignedToId?, dueDate?, items[{recipeId, quantity≥0.01, unit, notes?}]}` |
| `GET /orders`                                                      | read Order                                  | `page, limit, status, assignedToId, search (number/point/customer), deliveryPoint, dateFrom, dateTo (createdAt), archived`                                  |
| `GET /orders/:id`, `/orders/:id/status-history`                    | read Order                                  | —                                                                                                                                                           |
| `PATCH /orders/:id`                                                | update Order                                | `{status?, deliveryPoint?, deliveryAddress?, notes?, assignedToId?, dueDate?}`                                                                              |
| `PATCH /orders/:id/archive`                                        | update Order                                | `{archived}`                                                                                                                                                |
| `POST /orders/archive-completed`                                   | update Order                                | —                                                                                                                                                           |
| `POST /orders/:id/items`, `PATCH/DELETE /orders/:id/items/:itemId` | update Order                                | add: `{recipeId, quantity≥0.01, unit, notes?}`; update: `{quantity?, unit?, status?, notes?}`                                                               |
| `POST/GET/DELETE /orders/:id/invoice`                              | update / read / update Order                | multipart `file`                                                                                                                                            |
| `POST /orders/:id/delivery-note`, `GET /orders/:id/delivery-note`  | create / read DeliveryNote                  | —                                                                                                                                                           |
| `PATCH /orders/:id/delivery-note/sign`                             | **none** (service checks assignee or admin) | multipart `signature` + `{signedByName≥1, notes?}`                                                                                                          |
| `GET /orders/:id/delivery-note/signature`                          | read DeliveryNote                           | PNG                                                                                                                                                         |
| `POST/GET /orders/:id/conformity-certificate`, `GET …/pdf`         | create / read DeliveryNote                  | —                                                                                                                                                           |
| `GET /orders/stats`                                                | read Order                                  | `dateFrom, dateTo`                                                                                                                                          |
| `GET /orders/calendar`                                             | read Order                                  | `from, to, status[]` → `{yyyy-MM-dd: Order[]}`                                                                                                              |
| `GET /orders/:id/revenue`                                          | read Order                                  | —                                                                                                                                                           |
| `POST /orders/bulk-action`                                         | update Order                                | `action: status                                                                                                                                             | assign | dueDate | archive` |
| `POST /orders/bulk-delete/preview`, `POST /orders/bulk-delete`     | delete Order                                | `{ids, cascade?}`                                                                                                                                           |

---

## ORD-01 Create a manual order

- **Actor:** create Order (administrator, sef-cofetar, cofetar on the API). **Steps:** web `/orders/new` → delivery point, address, due date, assignee, products + quantity → `POST /orders`. iOS `CreateOrderSheet` → same.
- **Rules (`orders.service.ts:66-128`):** every recipe must exist, be `FINAL`, not archived, not draft → 400 (`:72-89`). Number `CMD-yyyyMMdd-NNN` (daily, per org, `:592-617`). `fulfillmentType` defaults to `DELIVERY` (`:98`). `items` may be empty (no minimum).
- **Side effects:** WS `activity:new ORDER_CREATED`. No status history row for the initial NOUA.
- **Failures:** concurrent creates on the same day can collide on the number (unique per org) → unmapped Prisma error.
- **Web:** `/orders/new`. **iOS:** `ios:Orders/Views/CreateOrderSheet.swift`.

## ORD-02 Import an order from WooCommerce

- See `INT-03` … `INT-06`. Result: order `WOO-<shop number>`, `deliveryPoint "WooCommerce"`, `customerName`, `externalStatus`, `createdAt` = time placed in the shop, `dueDate` from the parsed pickup deadline (high/medium confidence; else "Termen (needs review): …" in notes), items `unit BUCATI`, unmapped products kept as free-text `label` lines (`api:integrations/integrations.service.ts:199-403`).

## ORD-03 Browse orders

- **Steps:** web `/orders` → `GET /orders` (archive tab `archived=true`). iOS `OrderListView` with `OrderListFilters`.
- **Rules:** default excludes archived; newest first by `createdAt`, then number (`orders.service.ts:131-180`). Search covers order number, delivery point and customer name.
- **Web:** `/orders`. **iOS:** `ios:Orders/Views/OrderListView.swift`.

## ORD-04 Move an order through its statuses

- **Steps:** detail → next-status button → `PATCH /orders/:id {status}`; bulk `action:'status'`.
- **Rules (`orders.service.ts:197-251`):** transition must be in the table → 400 "Cannot transition from X to Y"; `LIVRATA` sets `completedAt`; a status history row is written (`:238-248`).
- **Side effects:** none on stock, tasks or notifications.
- **Web:** `/orders/[id]`. **iOS:** `ios:Orders/Views/OrderActionBar.swift`.

## ORD-05 Edit order details and assignee

- **Steps:** `PATCH /orders/:id {deliveryPoint?, deliveryAddress?, notes?, assignedToId?, dueDate?}` (web edit, iOS `EditOrderSheet`).
- **Rules:** `fulfillmentType`/`pickupLocationId` cannot be changed after creation (not in `UpdateOrderDto`).
- **Web:** `/orders/[id]`. **iOS:** `ios:Orders/Views/EditOrderSheet.swift`.

## ORD-06 Add, change, remove products

- **Steps:** `POST /orders/:id/items`, `PATCH /orders/:id/items/:itemId`, `DELETE /orders/:id/items/:itemId`.
- **Rules:** add/remove only while NOUA or IN_PREGATIRE → 400 (`orders.service.ts:304-326,362-381`); added recipe must be FINAL, not archived/draft. **Update has no status check** (`:341-360`).
- **Web:** `/orders/[id]` (editable only in NOUA / IN_PREGATIRE, `web:orders/[id]/page.tsx:76`). **iOS:** `ios:Orders/Views/OrderItemRow.swift`.

## ORD-07 Pickup vs delivery

- **Rules:** `PICKUP` + `pickupLocationId` can only be set through `POST /orders` (`orders.service.ts:98-99`); `pickupLocationId` is not validated. Clients display the type (`web:orders/order-ui.ts`, `ios:Orders/Models/OrderDisplay.swift`) but neither create form offers it, and the Woo import never sets it.
- **Web:** display only. **iOS:** display only.

## ORD-08 Invoice attachment

- **Steps:** `POST /orders/:id/invoice` (multipart `file`) → stored in the DB row; download `GET /orders/:id/invoice` (web fetches with the bearer token, `web:orders/[id]/page.tsx:361-372`); `DELETE` removes it.
- **Rules:** missing file → 400 "File is required" (`orders.controller.ts:221`); no type or size limit beyond the server default.
- **Web:** `/orders/[id]`. **iOS:** `ios:Orders/Views/OrderDocumentsCard.swift`.

## ORD-09 Delivery note ("foaie de drum") and customer signature

- **Steps:** `POST /orders/:id/delivery-note` → serial `FD-yyyyMMdd-NNN` (`orders.service.ts:384-406,691-715`); deliverer opens it on the phone → customer signs → `PATCH /orders/:id/delivery-note/sign` (multipart `signature`, `signedByName`, `notes?`) (`web:` `components/signature-dialog.tsx`; iOS `SignatureCaptureSheet`).
- **Rules:** one note per order → 400 on a second; sign requires the note (404) and caller = order assignee or `manage all` → 403 "Only the assigned delivery person or admin can sign" (`:435-476`). Re-signing overwrites. Signing does **not** change the order status.
- **Failures:** missing signature file → `throw new Error` → **500** (`orders.controller.ts:333-335`).
- **Web:** `/orders/[id]`. **iOS:** `ios:Orders/Views/DeliveryNoteView.swift`, `SignatureCaptureSheet.swift`.

## ORD-10 Conformity certificate

- **Steps:** `POST /orders/:id/conformity-certificate {notes?}` → serial `CC-yyyyMMdd-NNN`; `GET …/conformity-certificate` (JSON) and `GET …/pdf`.
- **Rules:** requires a delivery note → 400; one per note → 400 (`orders.service.ts:623-655`).
- **Web:** missing (web only has the transfer conformity declaration). **iOS:** `ios:Orders/Views/OrderDocumentsCard.swift`.

## ORD-11 Archive

- **Steps:** `PATCH /orders/:id/archive {archived}`; "Arhivează finalizate" → `POST /orders/archive-completed`; nightly job at 03:30 archives LIVRATA/ANULATA orders closed more than 60 days ago (`order-archive.job.ts:10,29-42`).
- **Rules:** only LIVRATA/ANULATA can be archived → 400 "Doar comenzile livrate sau anulate pot fi arhivate" (`orders.service.ts:257-282`). The manual "archive completed" uses 0 days (everything closed). Archived orders leave lists, stats and calendar.
- **Web:** `/orders`, `/orders/[id]`. **iOS:** `OrderDetailViewModel`.

## ORD-12 Order calendar

- **Steps:** web `/orders/calendar` and `/calendar` → `GET /orders/calendar?from&to&status=…`; iOS `OrderCalendarView`.
- **Rules:** non-archived orders with a `dueDate`, grouped by the **UTC** date of `dueDate` (`orders.service.ts:527-572`). Web ranges are Monday-first.
- **Web:** `/orders/calendar`, `/calendar`. **iOS:** `ios:Orders/Views/OrderCalendarView.swift`.

## ORD-13 Order stats

- **Steps:** `/orders/stats` → `GET /orders/stats?dateFrom&dateTo` → `{totalOrders, completedOrders, statusCounts, deliveryPointCounts}` (non-archived, by `createdAt`, `orders.service.ts:479-525`).
- **Web:** `/orders/stats`. **iOS:** `ios:Orders/Views/OrderStatsView.swift`.

## ORD-14 Status history and revenue

- **Steps:** `GET /orders/:id/status-history`; `GET /orders/:id/revenue` = Σ `recipe.sellingPrice × quantity` (lines without a price make it partial, `pricing.service.ts:144-170`).
- **Web:** missing. **iOS:** `OrderDetailViewModel` (history), `PricingService.fetchOrderRevenue`.

## ORD-15 Bulk actions and delete

- **Steps:** `/orders` select → `POST /orders/bulk-action` (`status`, `assign`, `dueDate`, `archive`) → per-row `update()` / `setArchived()` (`api:bulk-actions/bulk-action.service.ts:208-227`); delete → preview + `POST /orders/bulk-delete` (removes delivery note, unlinks external sources so a webhook replay cannot recreate it, `bulk-delete.service.ts:262-281`). There is no single `DELETE /orders/:id`.
- **Web:** `/orders`. **iOS:** `OrderService.bulk*`.

---

## Discrepancies

1. **Web role map hides orders from cofetar.** API grants `cofetar` read/create/update Order (`api:roles/role-definitions.ts`), the web map grants none and `sef-cofetar` only read (`apps/web/src/contexts/auth-context.tsx:187-209`).
2. **Pickup cannot be chosen anywhere.** API supports `PICKUP` on create only; web/iOS create forms never send it and Woo imports (which are pickups with a "termen de ridicare") are created as `DELIVERY` (`integrations.service.ts:346-366`).
3. **Signing without a file is a 500**, not a 400 (`orders.controller.ts:333-335`); the route has no `@CheckPolicies` (any signed-in user reaches the service check).
4. **Item edits on closed orders.** `updateItem` skips the NOUA/IN_PREGATIRE rule that add/remove enforce (`orders.service.ts:341-360`).
5. **Order number generation sorts as text and has no retry.** `orderBy: { orderNumber: 'desc' }` (`orders.service.ts:604-607`) breaks after 999 orders a day and concurrent creates collide on the unique key; transfer avize already fixed both (`locations.service.ts:1073-1082`). Same pattern for `FD-`/`CC-` serials.
6. **No initial history row.** Order creation writes no `OrderStatusHistory` for NOUA; Woo-imported orders have none at all until the first change.
7. **Calendar day = UTC day** of `dueDate` (`orders.service.ts:563`), not Europe/Bucharest; a 00:30 local due time lands on the previous day.
8. **Parity:** web has no order conformity certificate, no status history, no revenue; iOS has them.
