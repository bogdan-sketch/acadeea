-- VAT settings: payer status + rate. Stored purchase prices are the org's
-- real cost basis (net for VAT payers, gross for non-payers).
ALTER TABLE "Organization" ADD COLUMN "vatPayer" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "vatRatePercent" DECIMAL(65,30) NOT NULL DEFAULT 21;
