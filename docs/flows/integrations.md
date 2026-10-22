# Integrations (WooCommerce, eBriza)

Sources: `api:integrations/integrations.controller.ts`, `api:integrations/integrations.service.ts`, `api:integrations/woocommerce.client.ts`, `api:integrations/woo-poll.job.ts`, `api:integrations/ro-deadline.parser.ts`, `api:sales-deductions/sales-deductions.service.ts` (auto-deduction), web `web:integrations/page.tsx`, iOS `ios:Integrations/**`.

## Model

| Row                   | Key fields                                             | Notes                                                                        |
| --------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- | ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `Integration`         | `provider` (EBRIZA                                     | WOOCOMMERCE), `status` (free **string**, default `INACTIVE`; meant `INACTIVE | ACTIVE | ERROR`), `config`(JSON),`lastSyncAt` | Woo config keys: `storeUrl`/`url`, `consumerKey`/`ck`, `consumerSecret`/`cs` (`woocommerce.client.ts:1-10,95-110`) |
| `ProductMapping`      | `externalProductId`, `externalProductName`, `recipeId` | unique per integration + external id                                         |
| `ExternalOrderSource` | `externalId`, `rawPayload`, `syncStatus` (PENDING      | SYNCED                                                                       | FAILED | SKIPPED), `errorMessage`, `orderId`  | unique per integration + external id                                                                               |

All management routes require `manage all` (class-level policy, `integrations.controller.ts:43-45`). Webhook routes are public.

## Endpoints

| Method + path                                                                         | Body                                                      |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `GET /integrations`, `GET /integrations/:id`                                          | — (response includes the full `config`, secrets included) |
| `POST /integrations`                                                                  | `{provider, config?}`                                     |
| `PATCH /integrations/:id`                                                             | `{status?: string, config?: object}`                      |
| `DELETE /integrations/:id`                                                            | —                                                         |
| `GET/POST /integrations/:id/mappings`, `DELETE /integrations/:id/mappings/:mappingId` | `{externalProductId, externalProductName, recipeId}`      |
| `GET /integrations/:id/orders`                                                        | external orders, newest first                             |
| `POST /integrations/:id/sync`                                                         | → `{synced, failed}`                                      |
| `POST /integrations/:id/woocommerce/backfill`                                         | → `{fetched, stored, skippedPast, synced, failed}`        |
| `POST /integrations/:id/webhook/woocommerce`, `/:id/webhook/ebriza`                   | public, provider payload                                  |
| `POST /integrations/woocommerce/webhook`, `/ebriza/webhook`                           | public, legacy (single-org only)                          |

---

## INT-01 Connect a WooCommerce shop

- **Actor:** administrator. **Steps:**
  1. Web `/integrations` → "Adaugă" → `POST /integrations {provider:'WOOCOMMERCE'}` (web sends only the provider, `apps/web/src/lib/api.ts:1448`).
  2. Store keys: `PATCH /integrations/:id {config:{storeUrl, consumerKey, consumerSecret}}` — **no UI on web or iOS**; done through the API.
  3. Activate: `PATCH /integrations/:id {status:'ACTIVE'}` — iOS `IntegrationDetailView` has the toggle (`ios:Integrations/Views/IntegrationDetailView.swift:43`); web has none.
  4. In WooCommerce, register the webhook URL `https://<api>/api/v1/integrations/<id>/webhook/woocommerce` (order created + updated).
- **Rules:** invalid config is detected only when used: missing fields → "WooCommerce config missing required field(s): …"; non-http(s) `storeUrl` → error (`woocommerce.client.ts:102-106`).
- **Web:** `/integrations`. **iOS:** `ios:Integrations/Views/IntegrationsListView.swift`, `IntegrationDetailView.swift`.

## INT-02 Map shop products to recipes

- **Steps:** integration → "Mapări" → `POST /integrations/:id/mappings {externalProductId, externalProductName, recipeId}`; remove with `DELETE …/mappings/:mappingId`.
- **Rules:** recipe must exist → 404 (`integrations.service.ts:145-165`); duplicate external id → unique violation (unmapped 500). Matching at import uses **variation id first, then product id**, never the line-item id (`:258-268`).
- **Web:** `/integrations`. **iOS:** `IntegrationDetailView`.

## INT-03 Receive a WooCommerce webhook

- **Actor:** WooCommerce. **Steps:** `POST /integrations/:id/webhook/woocommerce` with the order JSON → 200.
- **Rules (`integrations.service.ts:560-625`):** integration resolved by id + provider (404 if none); legacy route without id → 409 when more than one org has the provider. Payload with `line_items[]` → `upsertWooExternalOrder` (`:412-447`): **auto stock deduction first** (`SALE-06`), then the external row is created/refreshed as PENDING unless already SYNCED. Other payloads → plain PENDING row. The webhook does **not** create the Horae order — the next poll or manual sync does.
- **Failures:** none surfaced to Woo beyond 404/409.
- **Web/iOS:** none.

## INT-04 Poll WooCommerce every 15 minutes

- **Actor:** cron `*/15 * * * *` (`woo-poll.job.ts:40`). For every `ACTIVE` WooCommerce integration (all orgs, each run inside its org): fetch orders with `date_created > lastSyncAt` (first run: last 7 days), status `processing,completed`, 100 per page, max 50 pages → `upsertWooExternalOrder` (with auto-deduction) → `triggerSync` → `lastSyncAt = run start` (`:62-125`).
- **Side effects:** SystemLog `INTEGRATION job.woo-poll` (INFO/WARN; invalid config → WARN and skip; failure → ERROR).

## INT-05 Sync pending external orders into Horae orders

- **Steps:** web/iOS "Sincronizează" → `POST /integrations/:id/sync`; also run by the poll job and the backfill.
- **Rules (`integrations.service.ts:199-403`):** for each PENDING row: Woo status not processing/completed → SKIPPED with reason; Woo order: each line → mapped recipe or free-text `label` "Produs WooCommerce #id"; legacy shape: every item must be mapped, else FAILED; order number `WOO-<shop number>` / `EXT-<timestamp>`; `createdAt` = shop placed time; customer name from billing; pickup text (meta key containing "ridic") parsed by `parseRomanianDeadline` → `dueDate` only on high/medium confidence, else "Termen (needs review): <raw>" appended to notes; order + SYNCED row in one transaction; any error → FAILED with message. Orders are created on behalf of the first user with the legacy `role = ADMINISTRATOR` → none: 400 (`:218-224`). Finally `lastSyncAt = now` (`:397-400`).
- **Web:** `/integrations`. **iOS:** `IntegrationDetailView`.

## INT-06 Backfill the last 90 days

- **Steps:** `POST /integrations/:id/woocommerce/backfill` (no client UI).
- **Rules (`integrations.service.ts:461-552`):** WooCommerce only → else 400; config invalid → 400; fetch processing/completed orders of the last 90 days; orders whose parsed pickup deadline is today or later → PENDING (**without** auto-deduction); past or undatable → SKIPPED with reason; then `triggerSync`. Idempotent (SYNCED rows never touched).

## INT-07 Review imported external orders

- **Steps:** `GET /integrations/:id/orders` → rows with `syncStatus`, `errorMessage`, linked `orderId`.
- **Web:** `/integrations`. **iOS:** `IntegrationDetailView`.

## INT-08 eBriza

- **Rules:** only the generic webhook path exists (`/integrations/:id/webhook/ebriza`) storing PENDING rows in the legacy `{items:[{externalProductId, quantity}]}` shape; sync requires every item mapped. POS sales reports are imported through sales deductions (`SALE-01`), not this integration.

---

## Discrepancies

1. **Webhooks are unauthenticated.** No WooCommerce HMAC (`X-WC-Webhook-Signature`) or shared secret is checked (`integrations.controller.ts:189-236`); anyone who knows an integration id can inject orders and trigger stock deductions. Inactive integrations still accept webhooks (status is not checked in `processWebhook`).
2. **Manual sync moves the poll watermark.** `triggerSync` sets `lastSyncAt = now` (`integrations.service.ts:397-400`) while the poll uses `lastSyncAt` as its `after` filter (`woo-poll.job.ts:94-96`); orders created between the last poll and a manual "Sincronizează" are never polled (only webhooks would bring them in).
3. **Orders paid later are missed by the poll.** The poll filters on `date_created`; an order created as `pending` and paid after the next poll window never becomes processing in the poll's eyes.
4. **No UI for keys or activation on web.** Web creates integrations with `{provider}` only and has no `PATCH` (`apps/web/src/lib/api.ts:1443-1484`); new integrations stay `INACTIVE` and are never polled. iOS can toggle status but not edit config.
5. **Secrets in responses.** `GET /integrations` returns `config` verbatim, including `consumerSecret` (`integrations.service.ts:630-641`).
6. **`status` is a free string** (`update-integration.dto.ts`, `schema.prisma` `Integration.status String`); typos silently disable polling.
7. **Woo orders are created as DELIVERY** even though they are shop pickups with a pickup deadline (no `fulfillmentType`, `integrations.service.ts:346-366`).
8. **Legacy admin lookup** for `createdById` — see sales-deductions discrepancy 2.
