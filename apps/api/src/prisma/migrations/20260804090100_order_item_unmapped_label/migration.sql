-- WooCommerce line items with no ProductMapping must never resolve to a wrong
-- recipe. Such items are now stored recipe-less, carrying the Woo product name
-- as a free-text `label` instead. recipeId becomes nullable; existing rows keep
-- their recipe. Additive/relaxing → safe to apply on live databases.
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "OrderItem" ALTER COLUMN "recipeId" DROP NOT NULL;
