-- ============================================================================
-- Multi-Tenancy Migration
-- ============================================================================
-- Creates Organization table, Location-related tables, adds organizationId
-- to 13 data tables, backfills to default org, adds tenant-scoped constraints.
-- ============================================================================

-- ============================================================================
-- 0. Create Organization table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Acadeea',
    "accentColor" TEXT NOT NULL DEFAULT '#D4527B',
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 1. Organization table changes — add slug + isActive
-- ============================================================================

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;

UPDATE "Organization"
SET "slug" = LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'))
WHERE "slug" IS NULL;

ALTER TABLE "Organization" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");

ALTER TABLE "Organization" ALTER COLUMN "isActive" SET NOT NULL;
ALTER TABLE "Organization" ALTER COLUMN "isActive" SET DEFAULT true;

-- ============================================================================
-- 2. Add BLOCAT to TaskStatus enum if not present
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'BLOCAT'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'TaskStatus')
    ) THEN
        ALTER TYPE "TaskStatus" ADD VALUE 'BLOCAT' AFTER 'DE_FACUT';
    END IF;
END $$;

-- ============================================================================
-- 3. Add shortages column to Task if not present
-- ============================================================================

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "shortages" JSONB;

-- ============================================================================
-- 4. Create Location-related enums and tables
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LocationType') THEN
        CREATE TYPE "LocationType" AS ENUM ('DEPOZIT', 'FRIGIDER', 'CONGELATOR', 'LABORATOR', 'MAGAZIN', 'PUNCT_LUCRU');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TransferStatus') THEN
        CREATE TYPE "TransferStatus" AS ENUM ('IN_ASTEPTARE', 'IN_TRANZIT', 'FINALIZAT', 'ANULAT');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Location" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MaterialStock" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "rawMaterialId" UUID NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "organizationId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialStock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockTransfer" (
    "id" UUID NOT NULL,
    "fromLocationId" UUID NOT NULL,
    "toLocationId" UUID NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'IN_ASTEPTARE',
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockTransferItem" (
    "id" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "rawMaterialId" UUID NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" "UnitType" NOT NULL,

    CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- 5. Add organizationId + backfill + NOT NULL (all 13 tables)
-- ============================================================================

DO $$
DECLARE
    default_org_id UUID;
BEGIN
    SELECT "id" INTO default_org_id FROM "Organization" LIMIT 1;

    -- If no organization exists yet (fresh DB), create one
    IF default_org_id IS NULL THEN
        default_org_id := gen_random_uuid();
        INSERT INTO "Organization" ("id", "name", "slug", "accentColor", "isActive", "createdAt", "updatedAt")
        VALUES (default_org_id, 'Acadeea', 'acadeea', '#D4527B', true, NOW(), NOW());
    END IF;

    -- Add organizationId columns (NULLABLE) to tables that don't have it yet
    -- Location, MaterialStock, StockTransfer already have it from CREATE TABLE above

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'organizationId') THEN
        ALTER TABLE "User" ADD COLUMN "organizationId" UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'RawMaterial' AND column_name = 'organizationId') THEN
        ALTER TABLE "RawMaterial" ADD COLUMN "organizationId" UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Consumable' AND column_name = 'organizationId') THEN
        ALTER TABLE "Consumable" ADD COLUMN "organizationId" UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Recipe' AND column_name = 'organizationId') THEN
        ALTER TABLE "Recipe" ADD COLUMN "organizationId" UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Task' AND column_name = 'organizationId') THEN
        ALTER TABLE "Task" ADD COLUMN "organizationId" UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'organizationId') THEN
        ALTER TABLE "Order" ADD COLUMN "organizationId" UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UnitConversion' AND column_name = 'organizationId') THEN
        ALTER TABLE "UnitConversion" ADD COLUMN "organizationId" UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserInvitation' AND column_name = 'organizationId') THEN
        ALTER TABLE "UserInvitation" ADD COLUMN "organizationId" UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StockMovement' AND column_name = 'organizationId') THEN
        ALTER TABLE "StockMovement" ADD COLUMN "organizationId" UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'StockReservation' AND column_name = 'organizationId') THEN
        ALTER TABLE "StockReservation" ADD COLUMN "organizationId" UUID;
    END IF;

    -- Backfill all rows → default organization
    UPDATE "User"             SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "RawMaterial"      SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "Consumable"       SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "Recipe"           SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "Task"             SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "Order"            SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "UnitConversion"   SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "UserInvitation"   SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "StockMovement"    SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;
    UPDATE "StockReservation" SET "organizationId" = default_org_id WHERE "organizationId" IS NULL;

    -- Make organizationId NOT NULL
    ALTER TABLE "User"             ALTER COLUMN "organizationId" SET NOT NULL;
    ALTER TABLE "RawMaterial"      ALTER COLUMN "organizationId" SET NOT NULL;
    ALTER TABLE "Consumable"       ALTER COLUMN "organizationId" SET NOT NULL;
    ALTER TABLE "Recipe"           ALTER COLUMN "organizationId" SET NOT NULL;
    ALTER TABLE "Task"             ALTER COLUMN "organizationId" SET NOT NULL;
    ALTER TABLE "Order"            ALTER COLUMN "organizationId" SET NOT NULL;
    ALTER TABLE "UnitConversion"   ALTER COLUMN "organizationId" SET NOT NULL;
    ALTER TABLE "UserInvitation"   ALTER COLUMN "organizationId" SET NOT NULL;
    ALTER TABLE "StockMovement"    ALTER COLUMN "organizationId" SET NOT NULL;
    ALTER TABLE "StockReservation" ALTER COLUMN "organizationId" SET NOT NULL;

    -- SET DEFAULT on all organizationId columns so Prisma can INSERT without specifying it
    -- (Prisma schema doesn't model organizationId yet, DB default fills it in)
    EXECUTE format('ALTER TABLE "User"             ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "RawMaterial"      ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "Consumable"       ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "Recipe"           ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "Task"             ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "Order"            ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "UnitConversion"   ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "UserInvitation"   ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "StockMovement"    ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "StockReservation" ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "Location"         ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "MaterialStock"    ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);
    EXECUTE format('ALTER TABLE "StockTransfer"    ALTER COLUMN "organizationId" SET DEFAULT %L', default_org_id);

END $$;

-- ============================================================================
-- 6. Add foreign keys to Organization
-- ============================================================================

ALTER TABLE "User"             ADD CONSTRAINT "User_organizationId_fkey"             FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RawMaterial"      ADD CONSTRAINT "RawMaterial_organizationId_fkey"      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consumable"       ADD CONSTRAINT "Consumable_organizationId_fkey"       FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recipe"           ADD CONSTRAINT "Recipe_organizationId_fkey"           FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task"             ADD CONSTRAINT "Task_organizationId_fkey"             FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order"            ADD CONSTRAINT "Order_organizationId_fkey"            FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Location"         ADD CONSTRAINT "Location_organizationId_fkey"         FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitConversion"   ADD CONSTRAINT "UnitConversion_organizationId_fkey"   FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserInvitation"   ADD CONSTRAINT "UserInvitation_organizationId_fkey"   FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement"    ADD CONSTRAINT "StockMovement_organizationId_fkey"    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer"    ADD CONSTRAINT "StockTransfer_organizationId_fkey"    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialStock"    ADD CONSTRAINT "MaterialStock_organizationId_fkey"    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 7. Add organizationId indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS "User_organizationId_idx"             ON "User"("organizationId");
CREATE INDEX IF NOT EXISTS "RawMaterial_organizationId_idx"      ON "RawMaterial"("organizationId");
CREATE INDEX IF NOT EXISTS "Consumable_organizationId_idx"       ON "Consumable"("organizationId");
CREATE INDEX IF NOT EXISTS "Recipe_organizationId_idx"           ON "Recipe"("organizationId");
CREATE INDEX IF NOT EXISTS "Task_organizationId_idx"             ON "Task"("organizationId");
CREATE INDEX IF NOT EXISTS "Order_organizationId_idx"            ON "Order"("organizationId");
CREATE INDEX IF NOT EXISTS "Location_organizationId_idx"         ON "Location"("organizationId");
CREATE INDEX IF NOT EXISTS "UnitConversion_organizationId_idx"   ON "UnitConversion"("organizationId");
CREATE INDEX IF NOT EXISTS "UserInvitation_organizationId_idx"   ON "UserInvitation"("organizationId");
CREATE INDEX IF NOT EXISTS "StockMovement_organizationId_idx"    ON "StockMovement"("organizationId");
CREATE INDEX IF NOT EXISTS "StockReservation_organizationId_idx" ON "StockReservation"("organizationId");
CREATE INDEX IF NOT EXISTS "StockTransfer_organizationId_idx"    ON "StockTransfer"("organizationId");
CREATE INDEX IF NOT EXISTS "MaterialStock_organizationId_idx"    ON "MaterialStock"("organizationId");

-- ============================================================================
-- 8. Update unique constraints for tenant scoping
-- ============================================================================

DROP INDEX IF EXISTS "Order_orderNumber_key";
CREATE UNIQUE INDEX "Order_organizationId_orderNumber_key" ON "Order"("organizationId", "orderNumber");

DROP INDEX IF EXISTS "Location_name_key";
CREATE UNIQUE INDEX "Location_organizationId_name_key" ON "Location"("organizationId", "name");

DROP INDEX IF EXISTS "UnitConversion_fromUnit_toUnit_rawMaterialId_key";
CREATE UNIQUE INDEX "UnitConversion_organizationId_fromUnit_toUnit_rawMaterialId_key"
    ON "UnitConversion"("organizationId", "fromUnit", "toUnit", "rawMaterialId");

-- ============================================================================
-- 9. Location table indexes and FKs
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "MaterialStock_locationId_rawMaterialId_key" ON "MaterialStock"("locationId", "rawMaterialId");
CREATE INDEX IF NOT EXISTS "MaterialStock_locationId_idx" ON "MaterialStock"("locationId");
CREATE INDEX IF NOT EXISTS "MaterialStock_rawMaterialId_idx" ON "MaterialStock"("rawMaterialId");
CREATE INDEX IF NOT EXISTS "StockTransfer_status_idx" ON "StockTransfer"("status");
CREATE INDEX IF NOT EXISTS "StockTransfer_fromLocationId_idx" ON "StockTransfer"("fromLocationId");
CREATE INDEX IF NOT EXISTS "StockTransfer_toLocationId_idx" ON "StockTransfer"("toLocationId");
CREATE INDEX IF NOT EXISTS "StockTransferItem_transferId_idx" ON "StockTransferItem"("transferId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaterialStock_locationId_fkey') THEN
        ALTER TABLE "MaterialStock" ADD CONSTRAINT "MaterialStock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaterialStock_rawMaterialId_fkey') THEN
        ALTER TABLE "MaterialStock" ADD CONSTRAINT "MaterialStock_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_fromLocationId_fkey') THEN
        ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_toLocationId_fkey') THEN
        ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_createdById_fkey') THEN
        ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransferItem_transferId_fkey') THEN
        ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransferItem_rawMaterialId_fkey') THEN
        ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- 10. UserLocation join table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UserLocation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserLocation_userId_locationId_key" ON "UserLocation"("userId", "locationId");
CREATE INDEX IF NOT EXISTS "UserLocation_userId_idx" ON "UserLocation"("userId");
CREATE INDEX IF NOT EXISTS "UserLocation_locationId_idx" ON "UserLocation"("locationId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserLocation_userId_fkey') THEN
        ALTER TABLE "UserLocation" ADD CONSTRAINT "UserLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserLocation_locationId_fkey') THEN
        ALTER TABLE "UserLocation" ADD CONSTRAINT "UserLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- 11. TransferApproval table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "TransferApproval" (
    "id" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "approvedById" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferApproval_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferApproval_transferId_fkey') THEN
        ALTER TABLE "TransferApproval" ADD CONSTRAINT "TransferApproval_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TransferApproval_approvedById_fkey') THEN
        ALTER TABLE "TransferApproval" ADD CONSTRAINT "TransferApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
