# Sales deductions ("Scădere stoc din vânzări")

Sources: `api:sales-deductions/sales-deductions.controller.ts`, `api:sales-deductions/sales-deductions.service.ts`, `api:sales-deductions/sales-report.parser.ts`, `api:sales-deductions/name-matcher.ts`, `api:sales-deductions/sales-deductions.feature.ts`, `api:bulk-actions/*`, web `web:stock/sales/page.tsx`, `web:stock/sales/[id]/page.tsx`, iOS `ios:SalesDeductions/**`.

Sold finished products leave the **recipe stock of one location**. Every source produces a **DRAFT** with name-matched lines; a person reviews and confirms; the confirm writes everything in one transaction.

## Feature flag

`FEATURE_SALES_DEDUCTIONS=true|false`; unset ⇒ on in dev, off when `NODE_ENV=production` (`sales-deductions.feature.ts`). Off ⇒ every route except `GET /sales-deductions/feature` answers 404 (`SalesDeductionsFeatureGuard`), and Woo auto-deduction is skipped (`sales-deductions.service.ts:296`). On in test and prod since 1.33.0 (`docs/ARCHITECTURE.md` §3). Clients ask `GET /sales-deductions/feature` → `{enabled}` before showing the menu (`ios:SalesDeductions/Services/SalesDeductionFeature.swift`).

## Statuses and decisions

| SalesDeduction.status | Meaning                                 | Next                                    |
| --------------------- | --------------------------------------- | --------------------------------------- |
| DRAFT                 | lines matched, nothing written to stock | CONFIRMED (confirm) or ANULAT (discard) |
| CONFIRMED             | stock written                           | ANULAT (revert)                         |
| ANULAT                | discarded draft or reverted deduction   | terminal                                |

Line decision: `ACCEPT` (deduct from the chosen product), `DECLINE` (ignore the line), `CREATE_NEW` (create a FINAL product with an initial stock, then nothing is deducted). Match kinds: `MAPPING` (Woo product mapping, score 1), `ALIAS` (name confirmed before, score 1), `EXACT` (0.95–1), `CONTAINS` (0.65–0.9), `FUZZY` (Dice × 0.85), `NONE`, `MANUAL` (line added by the user) (`name-matcher.ts:1-125`). Only scores ≥ **0.85** (`CONFIDENT_SCORE`, `:125`) are pre-selected as ACCEPT; weaker ones become `CREATE_NEW` with candidates suggested (`sales-deductions.service.ts:412-440`).

## Endpoints (all policies on `StockMovement`)

| Method + path                                                   | Policy    | Body / query                                                                                                                                                       |
| --------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `GET /sales-deductions/feature`                                 | signed in | —                                                                                                                                                                  |
| `GET /sales-deductions/template?locationId`                     | read      | CSV `Denumire;Cantitate;U.M.`, BOM, every sellable product                                                                                                         |
| `GET /sales-deductions/products?locationId`                     | read      | `[{id, name, unit, type, category, stock}]`                                                                                                                        |
| `GET /sales-deductions?page&limit`, `GET /sales-deductions/:id` | read      | —                                                                                                                                                                  |
| `POST /sales-deductions/excel`                                  | create    | multipart `file` (≤10 MB, .xlsx/.csv) + `locationId`                                                                                                               |
| `POST /sales-deductions/manual`                                 | create    | `{locationId}`                                                                                                                                                     |
| `POST /sales-deductions/woocommerce`                            | create    | `{locationId, from, to}` (ISO)                                                                                                                                     |
| `POST /sales-deductions/:id/confirm`                            | create    | `{lines[≤2000]{id?, rawName, decision, recipeId?, quantity?, stockOverride?≥0, acceptShortfall?, newProduct?{name, unit, category?, initialStock≥0}}, note?≤1000}` |
| `POST /sales-deductions/:id/discard`                            | create    | — (204)                                                                                                                                                            |
| `POST /sales-deductions/:id/revert`                             | create    | —                                                                                                                                                                  |
| `POST /sales-deductions/bulk-action`                            | create    | `action: discard                                                                                                                                                   | revert` |
| `POST /sales-deductions/bulk-delete/preview`, `/bulk-delete`    | delete    | `{ids, cascade?}`                                                                                                                                                  |

---

## SALE-01 Draft from an eBriza (POS) report

- **Actor:** create StockMovement (all seeded stock roles). **Steps:** `/stock/sales` → "Raport eBriza" → pick location → upload `.xlsx`/`.csv` → `POST /sales-deductions/excel` → opens `/stock/sales/[id]`.
- **Rules:** file required → 400 "Niciun fișier încărcat." (`sales-deductions.service.ts:145`); location must exist → 404 (`:880-890`). Parser is header-driven: finds a row with a product-name column and a quantity column (RO/EN labels) on any sheet, reads following rows with a name and numeric quantity, skips totals, merges duplicate names; legacy `.xls` → 400 "save as .xlsx" (`sales-report.parser.ts:1-20`). `fileHash` = sha256 of the file, stored.
- **Web:** `/stock/sales`. **iOS:** `ios:SalesDeductions/Views/NewSalesDeductionSheet.swift`.

## SALE-02 Manual deduction (with CSV template)

- **Steps:** "Scoatere manuală" → `POST /sales-deductions/manual {locationId}` → empty DRAFT → add lines by product picker (`GET /sales-deductions/products`). Offline variant: download `GET /sales-deductions/template?locationId` → fill quantities in Excel → upload as SALE-01.
- **Web:** `/stock/sales` (`web:stock/sales/page.tsx:434-445`). **iOS:** `NewSalesDeductionSheet`, `SalesProductPickerView.swift`.

## SALE-03 Draft from site (WooCommerce) orders in a period

- **Steps:** "Comenzi site" → location + interval → `POST /sales-deductions/woocommerce {locationId, from, to}` (`web:stock/sales/page.tsx:429`).
- **Rules (`sales-deductions.service.ts:178-275`):** `from ≤ to` → else 400; at least one WooCommerce integration → else 400; reads stored `ExternalOrderSource` rows (window widened by 7 days, then filtered by the order's own `date_created`), status processing/completed only, **skips orders already auto-deducted** (`woo:<integrationId>:<orderId>` keys, `:214-221`); products resolve by mapping (variation id, then product id), else by name; quantities summed per product. No orders → 400 with a message that says how many were already auto-deducted.
- **Web:** `/stock/sales`. **iOS:** `NewSalesDeductionSheet`.

## SALE-04 Review and confirm

- **Steps:** `/stock/sales/[id]` → per line: product chips / candidates, quantity, decision (ACCEPT / DECLINE / CREATE_NEW), stock mode (clamp to 0 or override) → "Confirmă" → `POST /sales-deductions/:id/confirm`.
- **Rules (`sales-deductions.service.ts:524-775`):**
  - Only DRAFT → else 409 `SALES_002` (`:533-539`); line ids must belong to the draft; ACCEPT needs `recipeId` and `quantity` or `stockOverride`; CREATE_NEW needs `newProduct` → 400 with up to 10 line messages (`:776-792`); chosen products must exist → 400.
  - **Pre-flight shortfall:** for each ACCEPT line, `quantity > stock` without `stockOverride` and without `acceptShortfall` → **409 `SALES_001`** "Vânzări mai mari decât stocul: … Confirmă scăderea până la 0 sau suprascrie stocul." (first 5 listed) (`:556-591`).
  - One transaction (60 s): atomic claim DRAFT → CONFIRMED (`:597-614`); lines missing from the body are deleted (the body is authoritative); ACCEPT: `stockAfter = stockOverride ?? max(0, stock − qty)`, recipe lots consumed FEFO for the removed amount, movement `IESIRE_VANZARE` with the **full** confirmed quantity (negative qty → `INTRARE` "corecție"), plus `AJUSTARE` when overridden; alias learned when the report name differs from the product name; `stockBefore/After/shortfall` stored on the line. CREATE_NEW: FINAL recipe (yield 1, no components) + `RecipeStock` initial stock + `INTRARE` movement + alias.
- **Side effects:** recipe aggregates resynced, WS `stock:update`, notification `SALES_DEDUCTION` "Vânzări scăzute din stoc — <location>" to the confirmer and every active administrator (`:971-1012`).
- **Web:** `/stock/sales/[id]`. **iOS:** `ios:SalesDeductions/Views/SalesDeductionConfirmerView.swift`, `SalesConfirmSheet.swift`, `SalesLineEditorSection.swift`.

## SALE-05 Discard a draft / revert a confirmed deduction

- **Steps:** discard `POST /sales-deductions/:id/discard` (204); revert `POST /sales-deductions/:id/revert`.
- **Rules:** discard only DRAFT → 409 `SALES_002` (`:797-808`). Revert only CONFIRMED (`:817-829`); per ACCEPT line puts back `stockBefore − stockAfter` on **today's** stock (clamped ≥ 0) with an `AJUSTARE` movement; products created by the deduction are kept; consumed lots are not restored (`:830-872`).
- **Bulk:** `bulk-action` discard/revert; bulk delete reverts CONFIRMED rows first, then deletes (`bulk-delete.service.ts:439-452`).
- **Web:** `/stock/sales`, `/stock/sales/[id]`. **iOS:** `SalesDeductionDetailView.swift`, `SalesDeductionListView.swift`.

## SALE-06 Automatic deduction when a site order reaches "în procesare"

- **Actor:** system (Woo webhook or the 15-minute poll, `INT-04`/`INT-05`). **Preconditions:** feature on; order status processing/completed.
- **Rules (`sales-deductions.service.ts:291-399`):** one deduction per Woo order (key `woo:<integrationId>:<orderId>`, skipped if a non-ANULAT one exists); acting user = oldest active user with the **legacy** `role = ADMINISTRATOR` column, none → skipped; location = org `defaultLocationId` if active, else first active `MAGAZIN`, else first active location; lines built like SALE-03 and immediately confirmed with `acceptShortfall: true` — matched lines ACCEPT, unmatched DECLINE (kept for review). Never throws; failures are logged and the order import continues. The 90-day backfill passes `autoDeduct: false` (`integrations.service.ts:504`).
- **Side effects:** a CONFIRMED deduction with note "Comanda WooCommerce #N · scăzută automat la „în procesare”", movements and notification as SALE-04.
- **Web/iOS:** visible in the deductions log.

---

## Discrepancies

1. **Auto-deduction ignores the org's default location in every org but one.** `this.prisma.organization.findFirst({ select: { defaultLocationId } })` (`sales-deductions.service.ts:320`) has no `where`; `Organization` is not tenant-scoped, so it reads the first organisation in the database. `stock.service.ts:98-104` explicitly warns about this pattern.
2. **Auto-deduction depends on the legacy role column.** It looks for an active user with `role: 'ADMINISTRATOR'` (`:315-319`). Only the admin created when the org was provisioned carries that value (`api:organization/organizations-admin.service.ts:115`); invited or `POST /users` accounts get `COFETAR` (`users.service.ts:141`, `invitations.service.ts:64`) even when their dynamic role is administrator. If the provisioning admin is deactivated or deletes their account, auto-deduction silently stops ("no administrator"). Woo sync uses the same lookup without the `isActive` filter (`integrations.service.ts:218-224`).
3. **Cancelled or refunded site orders keep their deduction.** Nothing reacts to a Woo status change away from processing/completed; stock is only returned by a manual revert.
4. **Reverting an auto-deduction re-arms it.** The idempotency check ignores ANULAT rows (`:305`), so the next webhook update for that order deducts again.
5. **No duplicate-upload warning.** `fileHash` is stored (`:156-162`) but never compared; `docs/ARCHITECTURE.md` §4 describes a "duplicate-upload warning".
6. **The reported unit is ignored.** `rawUnit` is kept for display; the quantity is applied in the product's stock unit without conversion (`:676-705`).
7. **Archived or draft products can be deducted.** `confirm` loads `isArchived/isDraft` but never checks them (`:548-555`); matching itself only proposes active products.
8. **`locationId` on the Excel upload is not validated as a UUID** (`@Body('locationId')`, `sales-deductions.controller.ts:114-146`); a malformed value reaches Prisma and fails as a 500.
9. **"One summary notification"** (`docs/ARCHITECTURE.md` §5) is one notification per recipient (confirmer + every active administrator).
