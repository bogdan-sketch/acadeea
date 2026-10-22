-- RecipeCategoryConfig: admin-managed category list
CREATE TABLE "RecipeCategoryConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "sortOrder" INT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecipeCategoryConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecipeCategoryConfig_name_key" ON "RecipeCategoryConfig"("name");

-- Seed from existing distinct recipe categories
INSERT INTO "RecipeCategoryConfig" ("id", "name", "sortOrder")
SELECT gen_random_uuid(), cat, ROW_NUMBER() OVER (ORDER BY cat)
FROM (SELECT DISTINCT "category" AS cat FROM "Recipe" WHERE "category" IS NOT NULL) sub
ON CONFLICT DO NOTHING;
