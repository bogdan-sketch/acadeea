-- Recipe drafts: works-in-progress recipes are hidden from default listings/pickers
-- and blocked from production/orders/stock (like archived), but kept separate so
-- the author can keep editing before publishing.
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "isDraft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "draftedAt" TIMESTAMP(3);
