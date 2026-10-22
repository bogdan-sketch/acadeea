-- Recipe photos and user avatars, compressed server-side to WebP.
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

CREATE TABLE "ImageAsset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    "kind" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/webp',
    "data" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "originalName" TEXT,
    "originalBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImageAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImageAsset_organizationId_idx" ON "ImageAsset"("organizationId");
CREATE INDEX "ImageAsset_kind_ownerId_idx" ON "ImageAsset"("kind", "ownerId");
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
