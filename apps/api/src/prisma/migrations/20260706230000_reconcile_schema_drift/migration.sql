-- Reconciles the migration-chain state to the actual pre-1.8.0 schema.
-- The chain was incomplete (environments were maintained via 'prisma db push',
-- which never records history) — this squash brings a fresh DB to the exact
-- schema live environments already have. Live envs are BASELINED past this
-- migration (see docker/MIGRATION_BASELINE.md) and never execute it.
-- Generated with: prisma migrate diff --from-migrations --to-schema-datamodel <pre-1.8.0 schema>

-- CreateEnum
CREATE TYPE "TransferApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('MIXER', 'CUPTOR', 'TAVA', 'ROBOT', 'FRIGIDER', 'CONGELATOR', 'MASINA_AMBALAT', 'CANTAR', 'TERMOMETRU', 'ALTELE');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('EBRIZA', 'WOOCOMMERCE');

-- CreateEnum
CREATE TYPE "IntegrationSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('DISPONIBIL', 'IN_UTILIZARE', 'IN_MENTENANTA', 'DEFECT', 'SCOS_DIN_UZ');

-- CreateEnum
CREATE TYPE "OrderFulfillmentType" AS ENUM ('DELIVERY', 'PICKUP');

-- DropForeignKey
ALTER TABLE "Consumable" DROP CONSTRAINT "Consumable_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Location" DROP CONSTRAINT "Location_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialStock" DROP CONSTRAINT "MaterialStock_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "RawMaterial" DROP CONSTRAINT "RawMaterial_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Recipe" DROP CONSTRAINT "Recipe_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "RecipeEquipment" DROP CONSTRAINT "RecipeEquipment_recipeId_fkey";

-- DropForeignKey
ALTER TABLE "RecipeWorkStep" DROP CONSTRAINT "RecipeWorkStep_recipeId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "StockReservation" DROP CONSTRAINT "StockReservation_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransfer" DROP CONSTRAINT "StockTransfer_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransfer" DROP CONSTRAINT "StockTransfer_toLocationId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransferItem" DROP CONSTRAINT "StockTransferItem_rawMaterialId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransferItem" DROP CONSTRAINT "StockTransferItem_recipeId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "TransferApproval" DROP CONSTRAINT "TransferApproval_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "UnitConversion" DROP CONSTRAINT "UnitConversion_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "UserInvitation" DROP CONSTRAINT "UserInvitation_createdById_fkey";

-- DropForeignKey
ALTER TABLE "UserInvitation" DROP CONSTRAINT "UserInvitation_organizationId_fkey";

-- DropIndex
DROP INDEX "Consumable_organizationId_idx";

-- DropIndex
DROP INDEX "Location_organizationId_idx";

-- DropIndex
DROP INDEX "Location_organizationId_name_key";

-- DropIndex
DROP INDEX "MaterialStock_organizationId_idx";

-- DropIndex
DROP INDEX "Order_organizationId_idx";

-- DropIndex
DROP INDEX "Order_organizationId_orderNumber_key";

-- DropIndex
DROP INDEX "Organization_slug_key";

-- DropIndex
DROP INDEX "RawMaterial_organizationId_idx";

-- DropIndex
DROP INDEX "Recipe_organizationId_idx";

-- DropIndex
DROP INDEX "StockMovement_organizationId_idx";

-- DropIndex
DROP INDEX "StockReservation_organizationId_idx";

-- DropIndex
DROP INDEX "StockTransfer_organizationId_idx";

-- DropIndex
DROP INDEX "Task_organizationId_idx";

-- DropIndex
DROP INDEX "UnitConversion_organizationId_fromUnit_toUnit_rawMaterialId_key";

-- DropIndex
DROP INDEX "UnitConversion_organizationId_idx";

-- DropIndex
DROP INDEX "User_organizationId_idx";

-- DropIndex
DROP INDEX "UserInvitation_organizationId_idx";

-- AlterTable
ALTER TABLE "Consumable" DROP COLUMN "organizationId",
ADD COLUMN     "purchasePrice" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Location" DROP COLUMN "organizationId";

-- AlterTable
ALTER TABLE "MaterialStock" DROP COLUMN "organizationId";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "organizationId",
ADD COLUMN     "fulfillmentType" "OrderFulfillmentType" NOT NULL DEFAULT 'DELIVERY',
ADD COLUMN     "invoiceData" BYTEA,
ADD COLUMN     "invoiceFileName" TEXT,
ADD COLUMN     "invoiceMimeType" TEXT,
ADD COLUMN     "pickupLocationId" UUID;

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "isActive",
DROP COLUMN "slug",
ADD COLUMN     "administratorName" TEXT,
ADD COLUMN     "appIconName" TEXT,
ADD COLUMN     "appLogoDarkUrl" TEXT,
ADD COLUMN     "appLogoLightUrl" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "cui" TEXT,
ADD COLUMN     "defaultDeliveryLocationId" UUID,
ADD COLUMN     "legalAddress" TEXT,
ADD COLUMN     "logoDarkUrl" TEXT,
ADD COLUMN     "logoLightUrl" TEXT,
ADD COLUMN     "nutritionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "regCom" TEXT,
ADD COLUMN     "website" TEXT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PasswordHistory" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PasswordResetToken" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RawMaterial" DROP COLUMN "organizationId",
ADD COLUMN     "estimatedLossPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "nutrition" JSONB,
ADD COLUMN     "purchasePrice" DECIMAL(65,30),
ADD COLUMN     "supplierId" UUID;

-- AlterTable
ALTER TABLE "Recipe" DROP COLUMN "organizationId",
ADD COLUMN     "calculatedCost" DECIMAL(65,30),
ADD COLUMN     "costCalculatedAt" TIMESTAMP(3),
ADD COLUMN     "estimatedLossPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "sellingPrice" DECIMAL(65,30),
ADD COLUMN     "shelfLifeMonths" INTEGER;

-- AlterTable
ALTER TABLE "RecipeCategoryConfig" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RecipeStock" ADD COLUMN     "expiryDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RolePermission" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StockMovement" DROP COLUMN "organizationId";

-- AlterTable
ALTER TABLE "StockReservation" DROP COLUMN "organizationId";

-- AlterTable
ALTER TABLE "StockTransfer" DROP COLUMN "organizationId",
ADD COLUMN     "assignedToId" UUID,
ADD COLUMN     "avizSerial" TEXT,
ADD COLUMN     "conformitySerial" TEXT;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "organizationId",
DROP COLUMN "title",
ADD COLUMN     "plannedDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TransferApproval" DROP COLUMN "decision",
DROP COLUMN "notes",
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "status" "TransferApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "approvedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UnitConversion" DROP COLUMN "organizationId";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "organizationId";

-- AlterTable
ALTER TABLE "UserInvitation" DROP COLUMN "organizationId",
ALTER COLUMN "createdById" DROP NOT NULL;

-- DropTable
DROP TABLE "RecipeEquipment";

-- DropTable
DROP TABLE "RecipeWorkStep";

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConformityCertificate" (
    "id" UUID NOT NULL,
    "deliveryNoteId" UUID NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "issuedByUserId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConformityCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus" NOT NULL,
    "toStatus" "OrderStatus" NOT NULL,
    "changedById" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLot" (
    "id" UUID NOT NULL,
    "rawMaterialId" UUID,
    "consumableId" UUID,
    "lotNumber" TEXT,
    "barcode" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "remainingQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expiryDate" TIMESTAMP(3),
    "purchasePrice" DECIMAL(65,30),
    "supplier" TEXT,
    "supplierInvoice" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotConsumption" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "stockLotId" UUID NOT NULL,
    "rawMaterialId" UUID NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" "UnitType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignComment" (
    "id" UUID NOT NULL,
    "page" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "anchor" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EquipmentType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "locationId" UUID,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'DISPONIBIL',
    "purchaseDate" TIMESTAMP(3),
    "warrantyExpiry" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentReservation" (
    "id" UUID NOT NULL,
    "equipmentId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "reservedFrom" TIMESTAMP(3) NOT NULL,
    "reservedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" UUID NOT NULL,
    "equipmentId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "performedById" UUID NOT NULL,
    "nextScheduled" TIMESTAMP(3),
    "cost" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeVersion" (
    "id" UUID NOT NULL,
    "recipeId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" UUID NOT NULL,
    "rawMaterialId" UUID,
    "consumableId" UUID,
    "recipeId" UUID,
    "priceType" TEXT NOT NULL,
    "oldPrice" DECIMAL(65,30),
    "newPrice" DECIMAL(65,30) NOT NULL,
    "changedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalOrderSource" (
    "id" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "orderId" UUID,
    "syncStatus" "IntegrationSyncStatus" NOT NULL DEFAULT 'PENDING',
    "rawPayload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOrderSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMapping" (
    "id" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "externalProductName" TEXT NOT NULL,
    "recipeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ConformityCertificate_deliveryNoteId_key" ON "ConformityCertificate"("deliveryNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "ConformityCertificate_serialNumber_key" ON "ConformityCertificate"("serialNumber");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_idx" ON "OrderStatusHistory"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE INDEX "StockLot_rawMaterialId_idx" ON "StockLot"("rawMaterialId");

-- CreateIndex
CREATE INDEX "StockLot_consumableId_idx" ON "StockLot"("consumableId");

-- CreateIndex
CREATE INDEX "StockLot_expiryDate_idx" ON "StockLot"("expiryDate");

-- CreateIndex
CREATE INDEX "StockLot_barcode_idx" ON "StockLot"("barcode");

-- CreateIndex
CREATE INDEX "LotConsumption_taskId_idx" ON "LotConsumption"("taskId");

-- CreateIndex
CREATE INDEX "LotConsumption_stockLotId_idx" ON "LotConsumption"("stockLotId");

-- CreateIndex
CREATE INDEX "LotConsumption_rawMaterialId_idx" ON "LotConsumption"("rawMaterialId");

-- CreateIndex
CREATE INDEX "DesignComment_page_idx" ON "DesignComment"("page");

-- CreateIndex
CREATE INDEX "Equipment_type_idx" ON "Equipment"("type");

-- CreateIndex
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status");

-- CreateIndex
CREATE INDEX "Equipment_locationId_idx" ON "Equipment"("locationId");

-- CreateIndex
CREATE INDEX "EquipmentReservation_equipmentId_idx" ON "EquipmentReservation"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentReservation_taskId_idx" ON "EquipmentReservation"("taskId");

-- CreateIndex
CREATE INDEX "MaintenanceLog_equipmentId_idx" ON "MaintenanceLog"("equipmentId");

-- CreateIndex
CREATE INDEX "RecipeVersion_recipeId_idx" ON "RecipeVersion"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeVersion_recipeId_version_key" ON "RecipeVersion"("recipeId", "version");

-- CreateIndex
CREATE INDEX "PriceHistory_rawMaterialId_idx" ON "PriceHistory"("rawMaterialId");

-- CreateIndex
CREATE INDEX "PriceHistory_consumableId_idx" ON "PriceHistory"("consumableId");

-- CreateIndex
CREATE INDEX "PriceHistory_recipeId_idx" ON "PriceHistory"("recipeId");

-- CreateIndex
CREATE INDEX "PriceHistory_createdAt_idx" ON "PriceHistory"("createdAt");

-- CreateIndex
CREATE INDEX "Integration_provider_idx" ON "Integration"("provider");

-- CreateIndex
CREATE INDEX "ExternalOrderSource_integrationId_idx" ON "ExternalOrderSource"("integrationId");

-- CreateIndex
CREATE INDEX "ExternalOrderSource_syncStatus_idx" ON "ExternalOrderSource"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOrderSource_integrationId_externalId_key" ON "ExternalOrderSource"("integrationId", "externalId");

-- CreateIndex
CREATE INDEX "ProductMapping_integrationId_idx" ON "ProductMapping"("integrationId");

-- CreateIndex
CREATE INDEX "ProductMapping_recipeId_idx" ON "ProductMapping"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMapping_integrationId_externalProductId_key" ON "ProductMapping"("integrationId", "externalProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "RawMaterial_supplierId_idx" ON "RawMaterial"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_avizSerial_key" ON "StockTransfer"("avizSerial");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_conformitySerial_key" ON "StockTransfer"("conformitySerial");

-- CreateIndex
CREATE UNIQUE INDEX "TransferApproval_transferId_key" ON "TransferApproval"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitConversion_fromUnit_toUnit_rawMaterialId_key" ON "UnitConversion"("fromUnit", "toUnit", "rawMaterialId");

-- AddForeignKey
ALTER TABLE "RawMaterial" ADD CONSTRAINT "RawMaterial_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConformityCertificate" ADD CONSTRAINT "ConformityCertificate_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConformityCertificate" ADD CONSTRAINT "ConformityCertificate_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferApproval" ADD CONSTRAINT "TransferApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotConsumption" ADD CONSTRAINT "LotConsumption_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotConsumption" ADD CONSTRAINT "LotConsumption_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "StockLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentReservation" ADD CONSTRAINT "EquipmentReservation_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentReservation" ADD CONSTRAINT "EquipmentReservation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrderSource" ADD CONSTRAINT "ExternalOrderSource_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrderSource" ADD CONSTRAINT "ExternalOrderSource_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMapping" ADD CONSTRAINT "ProductMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMapping" ADD CONSTRAINT "ProductMapping_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

