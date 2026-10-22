-- Lots held back from FIFO consumption (kept for a specific purpose).
ALTER TABLE "StockLot" ADD COLUMN "onHold" BOOLEAN NOT NULL DEFAULT false;
