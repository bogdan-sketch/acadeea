-- Nutrition is now a default-on feature (the client needs it). Flip the column
-- default and enable it for every existing organization so it stops being
-- hidden behind an off-by-default switch.
ALTER TABLE "Organization" ALTER COLUMN "nutritionEnabled" SET DEFAULT true;
UPDATE "Organization" SET "nutritionEnabled" = true;
