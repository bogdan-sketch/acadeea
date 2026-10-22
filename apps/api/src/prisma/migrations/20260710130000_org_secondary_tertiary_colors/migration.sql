-- Brand palette companions to accentColor (nullable — null = client defaults).
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "secondaryColor" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "tertiaryColor" TEXT;
