-- CreateEnum
CREATE TYPE "SalesDeductionSource" AS ENUM ('EXCEL', 'MANUAL', 'WOOCOMMERCE');

-- CreateEnum
CREATE TYPE "SalesDeductionStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ANULAT');

-- CreateEnum
CREATE TYPE "SalesDeductionDecision" AS ENUM ('ACCEPT', 'DECLINE', 'CREATE_NEW');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'IESIRE_VANZARE';

-- CreateTable
CREATE TABLE "SalesDeduction" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    "locationId" UUID NOT NULL,
    "source" "SalesDeductionSource" NOT NULL,
    "status" "SalesDeductionStatus" NOT NULL DEFAULT 'DRAFT',
    "fileName" TEXT,
    "fileHash" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "confirmedById" UUID,
    "confirmedAt" TIMESTAMP(3),
    "revertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesDeductionLine" (
    "id" UUID NOT NULL,
    "salesDeductionId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rawName" TEXT NOT NULL,
    "rawUnit" TEXT,
    "quantityReported" DECIMAL(65,30),
    "recipeId" UUID,
    "matchScore" DECIMAL(65,30),
    "matchKind" TEXT,
    "decision" "SalesDeductionDecision" NOT NULL DEFAULT 'ACCEPT',
    "quantity" DECIMAL(65,30),
    "stockOverride" DECIMAL(65,30),
    "shortfall" DECIMAL(65,30),
    "stockBefore" DECIMAL(65,30),
    "stockAfter" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesDeductionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesProductAlias" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    "normalizedName" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "recipeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesDeduction_organizationId_idx" ON "SalesDeduction"("organizationId");

-- CreateIndex
CREATE INDEX "SalesDeduction_locationId_idx" ON "SalesDeduction"("locationId");

-- CreateIndex
CREATE INDEX "SalesDeduction_fileHash_idx" ON "SalesDeduction"("fileHash");

-- CreateIndex
CREATE INDEX "SalesDeduction_createdAt_idx" ON "SalesDeduction"("createdAt");

-- CreateIndex
CREATE INDEX "SalesDeductionLine_salesDeductionId_idx" ON "SalesDeductionLine"("salesDeductionId");

-- CreateIndex
CREATE INDEX "SalesDeductionLine_recipeId_idx" ON "SalesDeductionLine"("recipeId");

-- CreateIndex
CREATE INDEX "SalesProductAlias_organizationId_idx" ON "SalesProductAlias"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesProductAlias_organizationId_normalizedName_key" ON "SalesProductAlias"("organizationId", "normalizedName");

-- AddForeignKey
ALTER TABLE "SalesDeduction" ADD CONSTRAINT "SalesDeduction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDeduction" ADD CONSTRAINT "SalesDeduction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDeduction" ADD CONSTRAINT "SalesDeduction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDeduction" ADD CONSTRAINT "SalesDeduction_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDeductionLine" ADD CONSTRAINT "SalesDeductionLine_salesDeductionId_fkey" FOREIGN KEY ("salesDeductionId") REFERENCES "SalesDeduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDeductionLine" ADD CONSTRAINT "SalesDeductionLine_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductAlias" ADD CONSTRAINT "SalesProductAlias_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProductAlias" ADD CONSTRAINT "SalesProductAlias_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

