-- Unified admin-managed category on stock items (null = Misc).
ALTER TABLE "RawMaterial" ADD COLUMN "category" TEXT;
ALTER TABLE "Consumable" ADD COLUMN "category" TEXT;
