-- Convert Recipe.category from RecipeCategory enum to plain String
-- This allows admin to define custom categories dynamically.

-- 1. Add a temporary text column
ALTER TABLE "Recipe" ADD COLUMN "category_text" TEXT;

-- 2. Copy enum values as text strings
UPDATE "Recipe" SET "category_text" = "category"::TEXT WHERE "category" IS NOT NULL;

-- 3. Drop the enum column
ALTER TABLE "Recipe" DROP COLUMN "category";

-- 4. Rename text column to category
ALTER TABLE "Recipe" RENAME COLUMN "category_text" TO "category";

-- 5. Drop the enum type (no longer needed)
DROP TYPE IF EXISTS "RecipeCategory";
