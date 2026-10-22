-- Ad-hoc transfer destinations (event transports): toLocationId becomes
-- nullable, free-text destination name/address added.
ALTER TABLE "StockTransfer" ALTER COLUMN "toLocationId" DROP NOT NULL;
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "destinationName" TEXT;
ALTER TABLE "StockTransfer" ADD COLUMN IF NOT EXISTS "destinationAddress" TEXT;
