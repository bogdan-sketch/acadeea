-- ============================================================================
-- Tenant-scope the remaining top-level models + auth handoff (1.8.0)
-- ============================================================================
-- Adds organizationId to Role, Supplier, Equipment, Integration, PriceHistory,
-- RecipeCategoryConfig, CategoryKindColor, DeliveryNote, ConformityCertificate;
-- swaps their global uniques (and StockTransfer's printed serials) to
-- per-organization; creates AuthHandoffCode; adds Organization.fontFamily.
-- Idempotent throughout.
-- ============================================================================

-- ─── 1. Organization.fontFamily (white-label font, predefined set) ──────────

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "fontFamily" TEXT;

-- ─── 2. organizationId on the remaining tenant tables ───────────────────────

DO $$
DECLARE
    default_org_id UUID;
    t TEXT;
    tenant_tables TEXT[] := ARRAY[
        'Role', 'Supplier', 'Equipment', 'Integration', 'PriceHistory',
        'RecipeCategoryConfig', 'CategoryKindColor', 'DeliveryNote',
        'ConformityCertificate'
    ];
BEGIN
    SELECT id INTO default_org_id FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1;
    IF default_org_id IS NULL THEN
        INSERT INTO "Organization" ("id", "name", "slug", "updatedAt")
        VALUES (gen_random_uuid(), 'Acadeea', 'acadeea', CURRENT_TIMESTAMP)
        RETURNING id INTO default_org_id;
    END IF;

    FOREACH t IN ARRAY tenant_tables LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "organizationId" UUID', t);
        EXECUTE format('UPDATE %I SET "organizationId" = %L WHERE "organizationId" IS NULL', t, default_org_id);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN "organizationId" SET NOT NULL', t);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN "organizationId" SET DEFAULT %L', t, default_org_id);
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = t || '_organizationId_fkey'
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
                t, t || '_organizationId_fkey'
            );
        END IF;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("organizationId")', t || '_organizationId_idx', t);
    END LOOP;
END $$;

-- CategoryKindColor gets a composite PK — no plain organizationId index needed
DROP INDEX IF EXISTS "CategoryKindColor_organizationId_idx";

-- ─── 3. Per-tenant unique swaps ──────────────────────────────────────────────

-- Roles: name/slug unique per organization
DROP INDEX IF EXISTS "Role_name_key";
DROP INDEX IF EXISTS "Role_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Role_organizationId_name_key"
    ON "Role"("organizationId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Role_organizationId_slug_key"
    ON "Role"("organizationId", "slug");

-- Recipe categories: (name, kind) unique per organization
DROP INDEX IF EXISTS "RecipeCategoryConfig_name_kind_key";
CREATE UNIQUE INDEX IF NOT EXISTS "RecipeCategoryConfig_organizationId_name_kind_key"
    ON "RecipeCategoryConfig"("organizationId", "name", "kind");

-- CategoryKindColor: PK (kind) → (organizationId, kind)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        WHERE r.relname = 'CategoryKindColor'
          AND c.contype = 'p'
          AND (SELECT COUNT(*) FROM unnest(c.conkey)) = 1
    ) THEN
        ALTER TABLE "CategoryKindColor" DROP CONSTRAINT "CategoryKindColor_pkey";
        ALTER TABLE "CategoryKindColor" ADD CONSTRAINT "CategoryKindColor_pkey"
            PRIMARY KEY ("organizationId", "kind");
    END IF;
END $$;

-- Delivery note / conformity certificate serials per organization
DROP INDEX IF EXISTS "DeliveryNote_serialNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryNote_organizationId_serialNumber_key"
    ON "DeliveryNote"("organizationId", "serialNumber");

DROP INDEX IF EXISTS "ConformityCertificate_serialNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ConformityCertificate_organizationId_serialNumber_key"
    ON "ConformityCertificate"("organizationId", "serialNumber");

-- StockTransfer printed serials per organization
DROP INDEX IF EXISTS "StockTransfer_avizSerial_key";
DROP INDEX IF EXISTS "StockTransfer_conformitySerial_key";
CREATE UNIQUE INDEX IF NOT EXISTS "StockTransfer_organizationId_avizSerial_key"
    ON "StockTransfer"("organizationId", "avizSerial");
CREATE UNIQUE INDEX IF NOT EXISTS "StockTransfer_organizationId_conformitySerial_key"
    ON "StockTransfer"("organizationId", "conformitySerial");

-- ─── 4. AuthHandoffCode (apex → subdomain login handoff) ────────────────────

CREATE TABLE IF NOT EXISTS "AuthHandoffCode" (
    "id"        UUID NOT NULL,
    "userId"    UUID NOT NULL,
    "codeHash"  TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthHandoffCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthHandoffCode_codeHash_key" ON "AuthHandoffCode"("codeHash");
CREATE INDEX IF NOT EXISTS "AuthHandoffCode_userId_idx" ON "AuthHandoffCode"("userId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuthHandoffCode_userId_fkey') THEN
        ALTER TABLE "AuthHandoffCode" ADD CONSTRAINT "AuthHandoffCode_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
