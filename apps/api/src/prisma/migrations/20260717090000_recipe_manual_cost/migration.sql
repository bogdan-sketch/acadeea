-- Manual cost override for recipes (labor & overheads on top of, or instead
-- of, the computed ingredients cost). Null = use the computed cost.
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "manualCost" DECIMAL(65,30);
