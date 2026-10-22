# Recipes, semipreparate, byproducts, pricing

Sources: `api:recipes/recipes.controller.ts`, `api:recipes/recipes.service.ts`, `api:recipes/services/recipe-resolution.service.ts`, `api:pricing/*`, `api:bulk-actions/*`, `api:images/images.service.ts`, web `web:recipes/**`, `apps/web/src/components/recipe-form.tsx`, `web:pricing/page.tsx`, iOS `ios:Recipes/**`.

## Model in one table

| Concept                  | Rule                                                                                                                                                               | Where                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Type                     | `FINAL` (sold product) or `SEMIPREPARAT` (intermediate, stocked)                                                                                                   | `schema.prisma:101`                    |
| Yield                    | `yieldQuantity` in `unit`; `quantityPerPiece` (default 1); optional `finishedWeightGrams`, `pieceEquivalentQuantity/Unit` (1 piece = N g/ml, bridges count ↔ mass) | `recipes.service.ts:313-318`           |
| Components → ingredients | each ingredient references **exactly one** of `rawMaterialId` / `semipreparatRecipeId`                                                                             | `recipes.service.ts:822-845`           |
| Semipreparat ingredient  | unit must convert to the sub-recipe's yield unit (direct conversion or piece bridge)                                                                               | `recipes.service.ts:851-890`           |
| Byproduct                | `isByproduct=true` ⇒ type forced to `SEMIPREPARAT`; optional `sourceRecipeId` (the recipe that yields it)                                                          | `recipes.service.ts:294-307,319`       |
| Draft                    | `isDraft` — hidden from default lists and pickers, blocked from production/orders/stock                                                                            | `recipes.controller.ts:386-403`        |
| Archive                  | `isArchived` — hidden from default lists, history kept                                                                                                             | `recipes.controller.ts:367-384`        |
| Default list             | `isArchived=false AND isDraft=false` unless `archived=true` / `draft=true`                                                                                         | `recipes.service.ts:171-174`           |
| Production resolution    | raw materials → converted to the material's stock unit; **every semipreparat is treated as stocked** (taken from recipe stock, not expanded)                       | `recipe-resolution.service.ts:213-250` |

## Endpoints

| Method + path                                                    | Policy                         | Body / query                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------ | ------------------ |
| `GET /recipes`                                                   | read Recipe **or** update Task | `page, limit, search (name), type, category, createdById, archived, byproduct, draft`                                  |
| `GET /recipes/:id`                                               | read Recipe or update Task     | —                                                                                                                      |
| `POST /recipes`                                                  | create Recipe                  | `CreateRecipeDto` (below)                                                                                              |
| `PATCH /recipes/:id`                                             | update Recipe                  | any create field except `isDraft/isByproduct/sourceRecipeId`, plus `sellingPrice`; `components` = **full replacement** |
| `PATCH /recipes/:id/archive`                                     | update Recipe                  | `{archived: bool}`                                                                                                     |
| `PATCH /recipes/:id/draft`                                       | update Recipe                  | `{draft: bool}`                                                                                                        |
| `DELETE /recipes/:id`                                            | delete Recipe                  | —                                                                                                                      |
| `POST /recipes/:id/photo`, `DELETE /recipes/:id/photo`           | update Recipe                  | multipart `photo`                                                                                                      |
| `GET /recipes/:id/cost`                                          | read **RecipeCost**            | —                                                                                                                      |
| `GET /recipes/:id/margin`                                        | read Recipe                    | —                                                                                                                      |
| `PATCH /recipes/:id/selling-price`                               | update Recipe                  | `{sellingPrice}`                                                                                                       |
| `PATCH /recipes/:id/manual-cost`                                 | update Recipe                  | `{manualCost: number≥0                                                                                                 | null}` |
| `GET /pricing/history`                                           | read Recipe                    | `rawMaterialId? consumableId? recipeId?`                                                                               |
| `GET /recipes/:id/versions`                                      | read Recipe                    | —                                                                                                                      |
| `GET /recipes/:id/yield-history`                                 | read Recipe                    | `page, limit`                                                                                                          |
| `GET /recipes/:id/nutrition`                                     | read Recipe                    | —                                                                                                                      |
| `GET /recipes/:id/resolved-tree`                                 | read Recipe                    | `ResolveRecipeQueryDto` (target quantity + unit)                                                                       |
| `POST /recipes/bulk-delete/preview`, `POST /recipes/bulk-delete` | delete Recipe                  | `{ids[1..500], cascade?}`                                                                                              |
| `POST /recipes/bulk-action`                                      | update Recipe                  | `{ids, action: archive                                                                                                 | draft  | category, params}` |

`CreateRecipeDto` (`api:recipes/dto/create-recipe.dto.ts`): `name≥1, unit, yieldQuantity≥0` required; optional `quantityPerPiece≥0, finishedWeightGrams≥0, pieceEquivalentQuantity≥0, pieceEquivalentUnit, type, category, estimatedLossPercent 0..100, shelfLifeMonths 1..120, flavors[], isDraft, isByproduct, sourceRecipeId (uuid v4), components[{name≥1, sortOrder≥0, ingredients[{rawMaterialId?|semipreparatRecipeId?, name≥1, quantity≥0, unit, prepMethod?, sortOrder≥0}]}]`. No `sellingPrice` on create.

---

## REC-01 Browse recipes (bento dial + list)

- **Actor:** read Recipe. **Steps:** web `/recipes` → `GET /recipes/categories/counts?type=FINAL` and `?type=SEMIPREPARAT` (tile sizes, `web:recipes/page.tsx:93-94`) → `GET /recipes?...` (`:106`). iOS `RecipeListView` loads `GET /recipes/categories?kind=PRODUS_FINIT|SEMIPREPARAT` (`ios:Recipes/ViewModels/RecipeListViewModel.swift:46-50`).
- **Rules:** search is `name contains` case-insensitive; category filter goes through `categoryFilter` (a parent category matches its sub-categories, `api:recipes/category-filter.ts`); order `createdAt desc`.
- **Web:** `/recipes`. **iOS:** `ios:Recipes/Views/RecipeListView.swift`.

## REC-02 Cofetar sees only recipes of their active tasks

- **Actor:** a role without `read Recipe` and without `create Task` (seeded `cofetar`).
- **Rules:** list is limited to recipes of tasks **assigned to me with status `IN_LUCRU`**, including archived/draft ones (`recipes.service.ts:187-200`); `GET /recipes/:id` without such a task → 403 "Acces permis doar la retete din task-uri active" (`:265-276`).
- **Edge:** the route policy is `read Recipe || update Task` (`recipes.controller.ts:197,285`); a role with neither gets a plain 403 from the guard.
- **Web:** recipe link inside `/tasks/[id]`. **iOS:** recipe card inside `TaskDetailView`.

## REC-03 Create a recipe

- **Actor:** create Recipe (administrator in the seeded set).
- **Steps:** web `/recipes/new` → `RecipeForm` → "Salvează" (`POST /recipes {…, isDraft:false}`) or "Salvează ca schiță" (`isDraft:true`) (`components/recipe-form.tsx:570`). iOS `RecipeFormView` → `POST /recipes`.
- **Rules:** XOR ingredient → 400 "must reference exactly one of rawMaterialId or semipreparatRecipeId" (`recipes.service.ts:837-841`); semipreparat unit without conversion → 400 with the Romanian hint to set the piece equivalent (`:883-888`); `isByproduct` + `type=FINAL` → 400 (`:294-296`); `sourceRecipeId` without `isByproduct` → 400 (`:297-299`); unknown source → 404 (`:300-307`). Unknown `rawMaterialId`/`semipreparatRecipeId` → Prisma FK error (no friendly mapping).
- **Side effects:** recipe + components + ingredients in one nested create. No version row (see discrepancies).
- **Web:** `/recipes/new`. **iOS:** `ios:Recipes/Views/RecipeFormView.swift`.

## REC-04 Edit a recipe

- **Steps:** web `/recipes/[id]/edit` → `PATCH /recipes/:id`, then `PATCH /recipes/:id/draft {draft:false}` when publishing a draft (`recipe-form.tsx:562-563`). iOS `RecipeFormView` → `PATCH /recipes/:id` (`RecipeService.updateRecipe`).
- **Rules:** when `components` is sent, **all** components are deleted and recreated in one transaction (`recipes.service.ts:379-444`); an empty array removes every ingredient. Scalars are merged. `finishedWeightGrams: 0` and `pieceEquivalentQuantity: 0` are stored as `null` (`:397-400`). Validation as REC-03 for components only.
- **Side effects:** ingredient ids change on every save (anything referencing ingredient ids breaks). No version snapshot.
- **Web:** `/recipes/[id]/edit`. **iOS:** `ios:Recipes/Views/RecipeFormView.swift`.

## REC-05 Semipreparate inside a recipe

- **Steps:** in the form, pick an ingredient from the semipreparat picker (`GET /recipes?type=SEMIPREPARAT`, all pages, `recipe-form.tsx:336`).
- **Rules:** the unit check of REC-03; at production the semipreparat is consumed from recipe stock in its yield unit, converted through the piece bridge, falling back to the raw quantity in the ingredient's unit if no path exists (`recipe-resolution.service.ts:215-250`).
- **Web:** `RecipeForm`. **iOS:** `RecipeFormView`.

## REC-06 Declare a byproduct

- **Actor:** create Recipe. **Steps:** in the recipe form, add a byproduct → after the main recipe is saved the web creates `POST /recipes {name, type:SEMIPREPARAT, unit, yieldQuantity, isByproduct:true, sourceRecipeId:<saved id>}` (`recipe-form.tsx:588-605`).
- **Failures:** byproduct create fails → recipe stays saved, toast "Rețeta a fost salvată, dar byproductul nu a putut fi creat".
- **Use:** captured at task completion (`TASK-09`). List with `GET /recipes?byproduct=true`.
- **Web:** `RecipeForm`. **iOS:** check `RecipeFormView` (no `isByproduct` field in `CreateRecipeRequest` usage found) — treat as missing.

## REC-07 Duplicate a recipe

- **Actor:** create Recipe. **Steps:** web `/recipes/[id]` → "Duplică" → `POST /recipes` with the source fields, name `"<name> (copie)"`, `isDraft:true` → opens `/recipes/<new>/edit` (`web:recipes/[id]/page.tsx:223-256`).
- **Rules:** client-side copy; **not copied:** `pieceEquivalentQuantity/Unit`, `flavors`, `isByproduct/sourceRecipeId`, `sellingPrice`, `manualCost`, photo.
- **Web:** `/recipes/[id]`. **iOS:** missing.

## REC-08 Draft / publish

- **Steps:** `PATCH /recipes/:id/draft {draft}` (`web:recipes/[id]/page.tsx:197`, iOS `RecipeDetailViewModel`).
- **Rules:** `draftedAt` kept when re-drafting an existing draft, cleared on publish (`recipes.service.ts:486-505`). Does not touch versions.
- **Web:** `/recipes/[id]`. **iOS:** `ios:Recipes/Views/RecipeDetailView.swift`.

## REC-09 Archive / restore

- **Steps:** `PATCH /recipes/:id/archive {archived}` (`web:recipes/[id]/page.tsx:184`); bulk `POST /recipes/bulk-action {action:'archive', params:{archived}}`. Archive list: `GET /recipes?archived=true`.
- **Rules:** `archivedAt` preserved on repeated archive (`recipes.service.ts:458-477`).
- **Web:** `/recipes/[id]`, `/recipes` bulk bar. **iOS:** `RecipeDetailView`.

## REC-10 Delete a recipe (single)

- **Actor:** delete Recipe. **Steps:** `/recipes/[id]` → delete → `DELETE /recipes/:id` (`web:recipes/[id]/page.tsx:215`).
- **Rules:** refused if any task references it → 400 "Reteta are N task-uri in istoric…" (`recipes.service.ts:523-528`); refused if any order line references it → 400 (`:529-534`).
- **Side effects (transaction, `:536-545`):** deletes recipe stock, recipe lots, yield history, product mappings, the recipe. Components/ingredients/versions cascade.
- **Web:** `/recipes/[id]`. **iOS:** single delete missing (bulk delete only, `RecipeService.bulkDelete`).

## REC-11 Bulk delete recipes (with cascade)

- **Steps:** select rows → `POST /recipes/bulk-delete/preview {ids}` → `{found, missing[], dependents[{key,label,count}]}`; confirm → `POST /recipes/bulk-delete {ids, cascade}` → `{deleted[], failed[{id,reason}]}`.
- **Rules (`api:bulk-actions/bulk-delete.service.ts`):** dependents = tasks, order lines, recipes using it as semipreparat, active transfer lines, sales lines (`:187-204`). `cascade:false` refuses rows with dependents. `cascade:true` (`:396-438`): deletes its tasks (releasing live reservations), unlinks order lines keeping the label, **removes ingredient rows of other recipes** that used it, deletes transfer lines, reservations, movements, lots, recipe stock, yield + price history, product mappings, unlinks sales lines and byproducts. Each id in its own transaction; max 500 ids.
- **Side effects:** SystemLog `bulk.delete`.
- **Web:** `/recipes` bulk bar. **iOS:** `SharedComponents/BulkSelect.swift`.

## REC-12 Photo

- **Steps:** `POST /recipes/:id/photo` (multipart `photo`, ≤60 MB) → WebP, max 1600 px, EXIF-rotated → `photoUrl = /api/v1/images/<id>` (`api:images/images.service.ts:11,16,44-60`); `DELETE /recipes/:id/photo` clears it.
- **Failures:** no file → 400 "Lipsește fișierul imagine."; >60 MB → 400.
- **Web:** `/recipes/[id]`, edit form. **iOS:** `ios:Recipes/Views/RecipePhotoHeader.swift`.

## REC-13 Version history

- **Steps:** `GET /recipes/:id/versions` → snapshots newest first (`recipes.service.ts:767-790`).
- **Rules:** see discrepancy 2 — nothing writes versions.
- **Web:** missing. **iOS:** `ios:Recipes/Views/RecipeVersionHistoryView.swift` (always empty).

## REC-14 Yield history

- **Steps:** `GET /recipes/:id/yield-history?page&limit` (`web:recipes/[id]/page.tsx:120`). Rows are written at task completion (`TASK-09`).
- **Web:** `/recipes/[id]`. **iOS:** `ios:Recipes/Views/RecipeYieldHistoryView.swift`.

## REC-15 Nutrition

- **Steps:** `GET /recipes/:id/nutrition` → totals + coverage (`api:recipes/services/recipe-nutrition.service.ts`); shown only when the org has `nutritionEnabled`.
- **Web:** `components/nutrition.tsx`. **iOS:** `ios:Stock/Views/NutritionViews.swift`.

---

## PRC-01 See production cost and margin

- **Actor:** read RecipeCost (cost) / read Recipe (margin).
- **Steps:** web `/pricing` → `GET /recipes?limit=100` (`web:pricing/page.tsx:59`) + `GET /recipes/:id/margin`; breakdown modal → `GET /recipes/:id/cost` (`:127`). iOS `RecipePricingView` → margin; `RecipeCostView` → cost.
- **Rules (`recipes.service.ts:615-763`):** per raw ingredient: price = **latest lot's** `purchasePrice`, else the material's `purchasePrice`, normalised to the stock unit (`pricePerStockUnit`), × quantity converted to the stock unit. Per semipreparat: sub-recipe total ÷ yield × converted quantity, recursively. Any unpriced or unconvertible ingredient makes `totalCost = null`. `manualCost`, when set, **replaces** the computed cost and propagates to parents (`:739-744`). `margin = sellingPrice − cost`; `marginPercent = margin / sellingPrice × 100`.
- **Web:** `/pricing`, recipe detail. **iOS:** `ios:Recipes/Views/RecipePricingView.swift`, `RecipeCostView.swift`.

## PRC-02 Set the selling price

- **Steps:** web `/pricing` → edit price → `PATCH /recipes/:id/selling-price {sellingPrice}` (`web:pricing/page.tsx:90`); iOS `RecipePricingView` → same.
- **Side effects (intended):** `priceHistory` row `SELLING` with old/new price (`api:pricing/pricing.service.ts:68-97`).
- **Failures:** **currently always 400** — see discrepancy 1.
- **Web:** `/pricing`. **iOS:** `RecipePricingView`.

## PRC-03 Manual cost override (labour and overheads)

- **Steps:** `/pricing` → `PATCH /recipes/:id/manual-cost {manualCost | null}` (`web:pricing/page.tsx:109`). `null` clears it.
- **Side effects:** price history row (`pricing.service.ts:35-66`; clearing records `newPrice 0`).
- **Web:** `/pricing`. **iOS:** missing.

## PRC-04 Price history

- **Steps:** `GET /pricing/history?recipeId|rawMaterialId|consumableId` → newest first (`pricing.service.ts:99-140`).
- **Web:** `/pricing`. **iOS:** `ios:Recipes/Views/PriceHistoryView.swift`, raw material detail.

---

## Discrepancies

1. **`PATCH /recipes/:id/selling-price` rejects every request.** `SetSellingPriceDto.sellingPrice` has no class-validator decorator (`api:pricing/dto/pricing-response.dto.ts:44-47`); the global pipe (`whitelist + forbidNonWhitelisted`, `apps/api/src/main.ts:41-49`) answers 400 "property sellingPrice should not exist". The same bug was fixed for `SetManualCostDto` in `c98226b`. Web `/pricing` and iOS `RecipePricingView` both call it.
2. **Recipe versions are never written.** `snapshotVersion()` (`recipes.service.ts:794-816`) has no caller and `Recipe.version` is never incremented; `GET /recipes/:id/versions` is always `[]`. iOS shows an empty version screen; `docs/ARCHITECTURE.md` promises "immutable snapshot per version".
3. **No circular-dependency check on save.** `RECIPE_001` exists in `packages/shared-types/src/error-codes.ts` but nothing throws it. A recipe can list itself (or an ancestor) as semipreparat. Cost logs a warning and returns `null` (`recipes.service.ts:717-719`); resolution's `visited` set is never consulted (`recipe-resolution.service.ts:108` vs `:148-250`).
4. **Cost is `null` when the same semipreparat appears twice.** `seen` is shared and never cleared after a branch (`recipes.service.ts:647,690`), so a second use of the same sub-recipe (two components, or a diamond through two sub-recipes) is treated as a cycle and nulls `totalCost`.
5. **Single delete breaks other recipes.** `DELETE /recipes/:id` does not check recipes that use it as semipreparat; the FK `RecipeIngredient.semipreparatRecipe` has no `onDelete` (`schema.prisma:735`), so Prisma's default SetNull leaves ingredients with neither reference (XOR broken). It also leaves stock movements / reservations / price history pointing at nothing. Bulk delete handles all of these (`bulk-delete.service.ts:396-438`).
6. **Cost leak through margin.** `GET /recipes/:id/margin` needs only `read Recipe` (`pricing.controller.ts:22-23`) but returns `recipeCost`/`ingredientsCost`/`manualCost`, which `GET /recipes/:id/cost` protects with `read RecipeCost`.
7. **`PATCH /recipes/:id` with `sellingPrice` skips price history** (`recipes.service.ts:409`) — the history only records the pricing endpoints.
8. **A byproduct can become FINAL.** `UpdateRecipeDto.type` is accepted on byproducts without the create-time check (`recipes.service.ts:404` vs `:294-296`).
9. **`resolved-tree` / production scale ignores the target unit.** `scaleFactor = targetQuantity / (yieldQuantity × quantityPerPiece)` (`recipe-resolution.service.ts:104`) — `targetUnit` is never converted.
10. **iOS calls an endpoint that does not exist.** `RecipeService.fetchKindColors` / `setKindColor` call `GET/PATCH /recipes/category-kinds` (`ios:Recipes/Services/RecipeService.swift:299-318`); the API has `super-categories` instead (`recipes.controller.ts:97-133`). No view calls them today (dead code).
11. **Parity gaps:** web has no version history; iOS has no duplicate, no single delete, no manual cost.
