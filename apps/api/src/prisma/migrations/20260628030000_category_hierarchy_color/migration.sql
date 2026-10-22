-- Category hierarchy (super-category -> sub-category) + per-super color.
ALTER TABLE "RecipeCategoryConfig" ADD COLUMN IF NOT EXISTS "parentId" UUID;
ALTER TABLE "RecipeCategoryConfig" ADD COLUMN IF NOT EXISTS "color" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecipeCategoryConfig_parentId_fkey') THEN
    ALTER TABLE "RecipeCategoryConfig" ADD CONSTRAINT "RecipeCategoryConfig_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "RecipeCategoryConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "RecipeCategoryConfig_parentId_idx" ON "RecipeCategoryConfig"("parentId");

-- Existing categories become super-categories (parentId stays null). Give each a
-- deterministic colour from a palette so the carousel is colour-coded out of the box.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY kind ORDER BY "sortOrder", name) AS rn
  FROM "RecipeCategoryConfig"
  WHERE "parentId" IS NULL
)
UPDATE "RecipeCategoryConfig" c
SET color = (ARRAY[
  '#D4527B','#E53935','#FB8C00','#43A047','#00897B',
  '#1E88E5','#5E35B1','#8E24AA','#6D4C41','#FDD835'
])[((ranked.rn - 1) % 10) + 1]
FROM ranked
WHERE ranked.id = c.id AND c.color IS NULL;
