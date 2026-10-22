-- Super-categories become dynamic: CategoryKindColor gains a display name,
-- sort order and a system flag (the 3 seeded ones can't be deleted).
ALTER TABLE "CategoryKindColor" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "CategoryKindColor" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CategoryKindColor" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- Seed display names + mark the original three as system, ordered.
INSERT INTO "CategoryKindColor" ("kind", "color", "name", "sortOrder", "isSystem") VALUES
  ('MATERIE_PRIMA', '#43A047', 'Materii prime', 0, true),
  ('SEMIPREPARAT',  '#1E88E5', 'Semipreparate', 1, true),
  ('PRODUS_FINIT',  '#D4527B', 'Produse finite', 2, true)
ON CONFLICT ("kind") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sortOrder" = EXCLUDED."sortOrder",
  "isSystem" = true;
