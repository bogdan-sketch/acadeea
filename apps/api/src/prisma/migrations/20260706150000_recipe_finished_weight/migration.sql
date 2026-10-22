-- Optional finished-batch weight (grams) for EU-1169 nutrition per-100g yield
-- factor. Null = fall back to summed raw ingredient weight.
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "finishedWeightGrams" DECIMAL(65,30);
