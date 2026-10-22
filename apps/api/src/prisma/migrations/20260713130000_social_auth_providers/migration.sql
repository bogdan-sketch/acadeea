-- Sign in with Apple / Google: linked social identities + optional password.
-- A user may link several providers; a social identity maps to one account.

-- Password is now optional (provider-only accounts have no password).
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Provider enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuthProviderKind') THEN
        CREATE TYPE "AuthProviderKind" AS ENUM ('APPLE', 'GOOGLE');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserAuthProvider" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "AuthProviderKind" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAuthProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserAuthProvider_provider_providerUserId_key"
    ON "UserAuthProvider"("provider", "providerUserId");
CREATE INDEX IF NOT EXISTS "UserAuthProvider_userId_idx" ON "UserAuthProvider"("userId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserAuthProvider_userId_fkey'
    ) THEN
        ALTER TABLE "UserAuthProvider"
            ADD CONSTRAINT "UserAuthProvider_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
