-- Per-location stock: production reserves/consumes from a task's location and
-- finished goods land in a location's RecipeStock. Global Recipe/RawMaterial
-- counts are kept as the sum of per-location rows (maintained by the app).

-- 1. Task production location
ALTER TABLE "Task" ADD COLUMN "locationId" UUID;
ALTER TABLE "Task" ADD CONSTRAINT "Task_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Task_locationId_idx" ON "Task"("locationId");

-- 2. StockMovement location (audit of where a movement happened)
ALTER TABLE "StockMovement" ADD COLUMN "locationId" UUID;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "StockMovement_locationId_idx" ON "StockMovement"("locationId");

-- 3. StockReservation location (which location stock was reserved from)
ALTER TABLE "StockReservation" ADD COLUMN "locationId" UUID;
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "StockReservation_locationId_idx" ON "StockReservation"("locationId");

-- 4. Per-location reservation tracking for raw materials
ALTER TABLE "MaterialStock" ADD COLUMN "reservedCount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- 5. Per-location stock for produced recipes (FINAL + SEMIPREPARAT)
CREATE TABLE "RecipeStock" (
  "id"            UUID NOT NULL,
  "locationId"    UUID NOT NULL,
  "recipeId"      UUID NOT NULL,
  "quantity"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "reservedCount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecipeStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecipeStock_locationId_recipeId_key" ON "RecipeStock"("locationId", "recipeId");
CREATE INDEX "RecipeStock_locationId_idx" ON "RecipeStock"("locationId");
CREATE INDEX "RecipeStock_recipeId_idx" ON "RecipeStock"("recipeId");
ALTER TABLE "RecipeStock" ADD CONSTRAINT "RecipeStock_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeStock" ADD CONSTRAINT "RecipeStock_recipeId_fkey"
  FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Transfer items can carry produced recipes (foaie de drum for finished goods).
--    XOR rawMaterialId / recipeId — enforced in the app layer.
ALTER TABLE "StockTransferItem" ALTER COLUMN "rawMaterialId" DROP NOT NULL;
ALTER TABLE "StockTransferItem" ADD COLUMN "recipeId" UUID;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_recipeId_fkey"
  FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Backfill existing global stock into the default location (first active
--    LABORATOR, else first active location). No-op when no location exists.
INSERT INTO "RecipeStock" ("id", "locationId", "recipeId", "quantity", "reservedCount", "updatedAt")
SELECT gen_random_uuid(), loc.id, r.id, r."stockCount", r."reservedCount", now()
FROM "Recipe" r
CROSS JOIN (
  SELECT id FROM "Location"
  WHERE "isActive" = true
  ORDER BY (type = 'LABORATOR') DESC, "createdAt" ASC
  LIMIT 1
) loc
WHERE r."stockCount" <> 0 OR r."reservedCount" <> 0
ON CONFLICT ("locationId", "recipeId") DO NOTHING;

INSERT INTO "MaterialStock" ("id", "locationId", "rawMaterialId", "quantity", "reservedCount", "updatedAt")
SELECT gen_random_uuid(), loc.id, rm.id, rm."stockCount", rm."reservedCount", now()
FROM "RawMaterial" rm
CROSS JOIN (
  SELECT id FROM "Location"
  WHERE "isActive" = true
  ORDER BY (type = 'LABORATOR') DESC, "createdAt" ASC
  LIMIT 1
) loc
WHERE rm."stockCount" <> 0 OR rm."reservedCount" <> 0
ON CONFLICT ("locationId", "rawMaterialId") DO UPDATE
  SET "quantity" = EXCLUDED."quantity", "reservedCount" = EXCLUDED."reservedCount";
