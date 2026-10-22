-- Extended per-platform branding tokens (nullable JSON — null = brand trio only).
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "brandingTokens" JSONB;
