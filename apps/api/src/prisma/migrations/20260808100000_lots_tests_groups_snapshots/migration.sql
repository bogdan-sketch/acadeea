-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'IESIRE_TESTE';

-- AlterTable Task: multi/family groups
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "groupId" UUID;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "groupLabel" TEXT;
CREATE INDEX IF NOT EXISTS "Task_groupId_idx" ON "Task"("groupId");

-- CreateTable RecipeStockLot
CREATE TABLE IF NOT EXISTS "RecipeStockLot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    "recipeId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "remainingQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expiryDate" TIMESTAMP(3),
    "taskId" UUID,
    "producedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecipeStockLot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecipeStockLot_recipeId_locationId_idx" ON "RecipeStockLot"("recipeId", "locationId");
CREATE INDEX IF NOT EXISTS "RecipeStockLot_organizationId_idx" ON "RecipeStockLot"("organizationId");
CREATE INDEX IF NOT EXISTS "RecipeStockLot_taskId_idx" ON "RecipeStockLot"("taskId");
ALTER TABLE "RecipeStockLot" ADD CONSTRAINT "RecipeStockLot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeStockLot" ADD CONSTRAINT "RecipeStockLot_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeStockLot" ADD CONSTRAINT "RecipeStockLot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeStockLot" ADD CONSTRAINT "RecipeStockLot_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable OrgSnapshot
CREATE TABLE IF NOT EXISTS "OrgSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    "label" TEXT,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "summary" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OrgSnapshot_organizationId_createdAt_idx" ON "OrgSnapshot"("organizationId", "createdAt");
ALTER TABLE "OrgSnapshot" ADD CONSTRAINT "OrgSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrgSnapshot" ADD CONSTRAINT "OrgSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
