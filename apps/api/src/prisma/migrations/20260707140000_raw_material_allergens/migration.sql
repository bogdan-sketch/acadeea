-- EU-14 allergen keys declared per raw material; recipes derive theirs from
-- the resolved tree.
ALTER TABLE "RawMaterial" ADD COLUMN "allergens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
