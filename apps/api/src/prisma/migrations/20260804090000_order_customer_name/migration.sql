-- WooCommerce order import fixes: imported orders now carry the customer name
-- (billing first+last name) and the status in the external system
-- ("processing"/"completed"), so staff can see who ordered and the shop status.
-- Additive + nullable → safe to apply on live databases.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "externalStatus" TEXT;
