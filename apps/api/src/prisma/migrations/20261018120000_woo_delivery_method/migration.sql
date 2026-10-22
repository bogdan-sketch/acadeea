-- Pickupia (WooCommerce delivery plugin): per-location external id that the
-- import matches against the order's delivery method, and the method's name
-- on imported orders.
ALTER TABLE "Location" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX "Location_organizationId_externalId_key" ON "Location"("organizationId", "externalId");

ALTER TABLE "Order" ADD COLUMN "deliveryMethod" TEXT;
