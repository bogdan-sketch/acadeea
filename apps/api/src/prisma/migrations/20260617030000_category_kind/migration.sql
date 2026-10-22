-- Split categories into RECIPE vs PRODUCT lists.
ALTER TABLE "RecipeCategoryConfig" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'RECIPE';

-- name was globally unique; now unique per (name, kind).
DROP INDEX IF EXISTS "RecipeCategoryConfig_name_key";
CREATE UNIQUE INDEX "RecipeCategoryConfig_name_kind_key" ON "RecipeCategoryConfig"("name", "kind");
