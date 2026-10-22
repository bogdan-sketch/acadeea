-- ============================================================================
-- Promote multi-tenancy into the Prisma schema (1.8.0)
-- ============================================================================
-- Re-establishes what the dormant 20260609000000_add_multi_tenancy migration
-- created and `prisma db push` deploys may have since dropped. Fully
-- idempotent: safe on a DB with or without any of these objects.
--
-- Covers: Organization.slug/isActive + organizationId on the original 13
-- tenant tables (User, RawMaterial, Consumable, Recipe, Task, Order,
-- UnitConversion, UserInvitation, StockMovement, StockReservation, Location,
-- MaterialStock, StockTransfer) with backfill to the default org, NOT NULL,
-- a DB DEFAULT safety net, FKs, indexes, and per-tenant unique swaps.
-- ============================================================================

-- ─── 1. Organization: slug + isActive ───────────────────────────────────────

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;

UPDATE "Organization"
SET "slug" = LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'))
WHERE "slug" IS NULL;

ALTER TABLE "Organization" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");

UPDATE "Organization" SET "isActive" = true WHERE "isActive" IS NULL;
ALTER TABLE "Organization" ALTER COLUMN "isActive" SET NOT NULL;
ALTER TABLE "Organization" ALTER COLUMN "isActive" SET DEFAULT true;

-- ─── 2. organizationId on the 13 tenant tables ──────────────────────────────

DO $$
DECLARE
    default_org_id UUID;
    t TEXT;
    tenant_tables TEXT[] := ARRAY[
        'User', 'RawMaterial', 'Consumable', 'Recipe', 'Task', 'Order',
        'UnitConversion', 'UserInvitation', 'StockMovement',
        'StockReservation', 'Location', 'MaterialStock', 'StockTransfer'
    ];
BEGIN
    -- Resolve (or create) the default organization.
    SELECT id INTO default_org_id FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1;
    IF default_org_id IS NULL THEN
        INSERT INTO "Organization" ("id", "name", "slug", "updatedAt")
        VALUES (gen_random_uuid(), 'Acadeea', 'acadeea', CURRENT_TIMESTAMP)
        RETURNING id INTO default_org_id;
    END IF;

    FOREACH t IN ARRAY tenant_tables LOOP
        -- Column
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "organizationId" UUID', t);
        -- Backfill
        EXECUTE format('UPDATE %I SET "organizationId" = %L WHERE "organizationId" IS NULL', t, default_org_id);
        -- NOT NULL + DEFAULT (safety net until strict enforcement is proven; dropped in a later cleanup migration)
        EXECUTE format('ALTER TABLE %I ALTER COLUMN "organizationId" SET NOT NULL', t);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN "organizationId" SET DEFAULT %L', t, default_org_id);
        -- FK
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = t || '_organizationId_fkey'
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
                t, t || '_organizationId_fkey'
            );
        END IF;
        -- Index
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("organizationId")', t || '_organizationId_idx', t);
    END LOOP;
END $$;

-- ─── 3. Per-tenant unique swaps ──────────────────────────────────────────────

-- Order numbers are per-organization
DROP INDEX IF EXISTS "Order_orderNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Order_organizationId_orderNumber_key"
    ON "Order"("organizationId", "orderNumber");

-- Location names are per-organization
DROP INDEX IF EXISTS "Location_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Location_organizationId_name_key"
    ON "Location"("organizationId", "name");

-- Unit conversions are per-organization
DROP INDEX IF EXISTS "UnitConversion_fromUnit_toUnit_rawMaterialId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "UnitConversion_organizationId_fromUnit_toUnit_rawMaterialId_key"
    ON "UnitConversion"("organizationId", "fromUnit", "toUnit", "rawMaterialId");
