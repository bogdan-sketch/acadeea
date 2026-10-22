-- Semipreparat "piece equivalent": what one yield unit (bucată) is equal to in
-- another unit/family (e.g. 1 bucată = 2 kg), so a BUCATI-yield semipreparat can
-- be used as an ingredient in a mass/volume unit.
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "pieceEquivalentQuantity" DECIMAL(65,30);
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "pieceEquivalentUnit" "UnitType";
