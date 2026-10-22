-- "Unitate principală": locations WooCommerce sales are deducted from.
ALTER TABLE "Location" ADD COLUMN "isMainUnit" BOOLEAN NOT NULL DEFAULT false;

-- Keep today's behaviour: the org's default location (where Woo sales were
-- deducted so far) becomes its main unit.
UPDATE "Location" l
SET "isMainUnit" = true
FROM "Organization" o
WHERE o."defaultLocationId" = l.id;

-- Short names for shop delivery methods (order filters + cards).
CREATE TABLE "DeliveryMethodAlias" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryMethodAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryMethodAlias_organizationId_name_key" ON "DeliveryMethodAlias"("organizationId", "name");
CREATE INDEX "DeliveryMethodAlias_organizationId_idx" ON "DeliveryMethodAlias"("organizationId");

ALTER TABLE "DeliveryMethodAlias" ADD CONSTRAINT "DeliveryMethodAlias_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Feature switch for all of the above (+ the Pickupia import): on for orgs
-- that already sell through WooCommerce, off for everyone else.
ALTER TABLE "Organization" ADD COLUMN "wooDeliveryEnabled" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Organization" o
SET "wooDeliveryEnabled" = true
WHERE EXISTS (
  SELECT 1 FROM "Integration" i WHERE i."organizationId" = o.id AND i.provider = 'WOOCOMMERCE'
);
