-- Recipe archiving: archived recipes are hidden from default listings/pickers
-- but stay in the DB (tasks/movements reference them).
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
