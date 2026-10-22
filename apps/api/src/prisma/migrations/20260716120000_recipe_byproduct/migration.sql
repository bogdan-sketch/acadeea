-- Byproduct semipreparate: a SEMIPREPARAT left over after producing another
-- recipe. `isByproduct` marks it; `sourceRecipeId` links it to the recipe it
-- remains from (nullable self-FK).
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "isByproduct" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "sourceRecipeId" UUID;

DO $$ BEGIN
  ALTER TABLE "Recipe"
    ADD CONSTRAINT "Recipe_sourceRecipeId_fkey"
    FOREIGN KEY ("sourceRecipeId") REFERENCES "Recipe"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Recipe_sourceRecipeId_idx" ON "Recipe"("sourceRecipeId");
