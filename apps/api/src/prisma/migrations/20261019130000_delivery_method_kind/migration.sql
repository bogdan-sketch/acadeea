-- Delivery-method display settings: short name optional, Ridicare/Livrare assignment.
ALTER TABLE "DeliveryMethodAlias" ALTER COLUMN "shortName" DROP NOT NULL;
ALTER TABLE "DeliveryMethodAlias" ADD COLUMN "kind" "OrderFulfillmentType";
