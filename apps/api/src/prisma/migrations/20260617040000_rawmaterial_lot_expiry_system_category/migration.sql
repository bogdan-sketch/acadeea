-- Raw material lot number + expiry date
ALTER TABLE "RawMaterial" ADD COLUMN "lotNumber" TEXT;
ALTER TABLE "RawMaterial" ADD COLUMN "expiryDate" TIMESTAMP(3);

-- System (non-deletable) categories, e.g. the seeded "Materii prime" product category
ALTER TABLE "RecipeCategoryConfig" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- Seed the system product category
INSERT INTO "RecipeCategoryConfig" ("id", "name", "kind", "isSystem", "sortOrder")
VALUES (gen_random_uuid(), 'Materii prime', 'PRODUCT', true, 0)
ON CONFLICT ("name", "kind") DO UPDATE SET "isSystem" = true;
