-- Backlog schema changes: Epic 2 (Recipes), Epic 1 (Tasks), Epic 3 (Stock), Epic 4 (Transfers)

-- ============================================================================
-- Epic 2.1: Remove isStocked from Recipe
-- ============================================================================
ALTER TABLE "Recipe" DROP COLUMN IF EXISTS "isStocked";

-- ============================================================================
-- Epic 2.4: Add RecipeCategory enum and update Recipe.category
-- ============================================================================
CREATE TYPE "RecipeCategory" AS ENUM ('TORTURI', 'MONOPORTII', 'COOKIES', 'PATISERIE', 'FELII', 'CANDY_BAR', 'INGHETATA', 'BAR');

-- Convert existing string categories to enum values
ALTER TABLE "Recipe" ADD COLUMN "category_new" "RecipeCategory";

UPDATE "Recipe" SET "category_new" = CASE
    WHEN "category" = 'Torturi' THEN 'TORTURI'::"RecipeCategory"
    WHEN "category" = 'Patiserie' THEN 'PATISERIE'::"RecipeCategory"
    WHEN "category" = 'Deserturi' THEN 'MONOPORTII'::"RecipeCategory"
    WHEN "category" = 'Cookies' THEN 'COOKIES'::"RecipeCategory"
    WHEN "category" = 'Felii' THEN 'FELII'::"RecipeCategory"
    WHEN "category" = 'Candy bar' THEN 'CANDY_BAR'::"RecipeCategory"
    WHEN "category" = 'Inghetata' THEN 'INGHETATA'::"RecipeCategory"
    WHEN "category" = 'Bar' THEN 'BAR'::"RecipeCategory"
    ELSE NULL
END;

ALTER TABLE "Recipe" DROP COLUMN "category";
ALTER TABLE "Recipe" RENAME COLUMN "category_new" TO "category";

-- ============================================================================
-- Epic 1.2: Add parentTaskId to Task for subtask support
-- ============================================================================
ALTER TABLE "Task" ADD COLUMN "parentTaskId" UUID;
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- ============================================================================
-- Epic 3.2: Add invoice fields to RawMaterial
-- ============================================================================
ALTER TABLE "RawMaterial" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "RawMaterial" ADD COLUMN "invoiceDate" TIMESTAMP(3);

-- ============================================================================
-- Epic 4.2: Add serialNumber to DeliveryNote
-- ============================================================================
ALTER TABLE "DeliveryNote" ADD COLUMN "serialNumber" TEXT;
CREATE UNIQUE INDEX "DeliveryNote_serialNumber_key" ON "DeliveryNote"("serialNumber");
