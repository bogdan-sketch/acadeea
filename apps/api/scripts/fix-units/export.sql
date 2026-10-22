-- READ-ONLY export for scripts/fix-units/plan.py (run with psql; writes CSV to stdout
-- sections separated by "-- @@<name>" marker lines). Touches nothing.
\echo '-- @@materials'
\copy (select id, title, unit, "stockCount" from "RawMaterial") to stdout with csv header
\echo '-- @@stock'
\copy (select id, "rawMaterialId", "locationId", quantity from "MaterialStock") to stdout with csv header
\echo '-- @@movements'
\copy (select id, "rawMaterialId", "locationId", "movementType", quantity, unit, "createdAt" from "StockMovement" where "rawMaterialId" is not null order by "createdAt", id) to stdout with csv header
\echo '-- @@transfers'
\copy (select sti."rawMaterialId", st."fromLocationId", st."toLocationId", sti.quantity, sti.unit, st."createdAt", coalesce(st."receivedAt", st."completedAt") as recv, exists(select 1 from "StockMovement" sm where sm."rawMaterialId" = sti."rawMaterialId" and sm."referenceNote" like 'Transfer %' and sm."createdAt" between st."createdAt" - interval '5 seconds' and st."createdAt" + interval '5 seconds') as journaled from "StockTransferItem" sti join "StockTransfer" st on st.id = sti."transferId" where sti."rawMaterialId" is not null and st.status <> 'ANULAT') to stdout with csv header
\echo '-- @@lots'
\copy (select id, "rawMaterialId", quantity, "remainingQuantity", "onHold", "receivedAt", "createdAt" from "StockLot" where "rawMaterialId" is not null) to stdout with csv header
\echo '-- @@reservations'
\copy (select sr.id, sr."rawMaterialId", sr."quantityReserved" as quantity, sr.unit from "StockReservation" sr join "RawMaterial" rm on rm.id = sr."rawMaterialId" where sr.unit <> rm.unit) to stdout with csv header
\echo '-- @@lotconsumptions'
\copy (select lc.id, lc."rawMaterialId", lc.quantity, lc.unit from "LotConsumption" lc join "RawMaterial" rm on rm.id = lc."rawMaterialId" where lc.unit <> rm.unit) to stdout with csv header
\echo '-- @@recipemovements'
\copy (select sm.id, sm."recipeId", r.name, r.unit as recipe_unit, sm."locationId", sm."movementType", sm.quantity, sm.unit, sm."createdAt" from "StockMovement" sm join "Recipe" r on r.id = sm."recipeId" order by sm."createdAt", sm.id) to stdout with csv header
\echo '-- @@recipestock'
\copy (select rs."recipeId", rs."locationId", rs.quantity from "RecipeStock" rs) to stdout with csv header
