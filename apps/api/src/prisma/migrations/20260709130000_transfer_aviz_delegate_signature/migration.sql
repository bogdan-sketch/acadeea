-- Aviz de insotire a marfii: capture the delegate/transport details and a
-- digital receipt signature that were previously blank hand-filled lines on the
-- printed document.
ALTER TABLE "StockTransfer" ADD COLUMN "delegateIdCard" TEXT;
ALTER TABLE "StockTransfer" ADD COLUMN "transportMeans" TEXT;
ALTER TABLE "StockTransfer" ADD COLUMN "dispatchedAt" TIMESTAMP(3);
ALTER TABLE "StockTransfer" ADD COLUMN "receiverName" TEXT;
ALTER TABLE "StockTransfer" ADD COLUMN "receiverSignature" BYTEA;
ALTER TABLE "StockTransfer" ADD COLUMN "receivedAt" TIMESTAMP(3);
