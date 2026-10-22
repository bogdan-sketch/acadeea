-- Self-service account deletion (GDPR / App Store 5.1.1(v)). When a user deletes
-- their own account we anonymize PII and set this timestamp, but keep the row so
-- tasks/orders/etc. that reference the user by id stay referentially intact.
-- Additive + nullable → safe to apply on live databases.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
