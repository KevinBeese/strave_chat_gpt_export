DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'SUBADMIN', 'SUPERADMIN');
  END IF;
END
$$;

ALTER TABLE "Profile"
ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'USER';

CREATE TABLE IF NOT EXISTS "AdminInviteCode" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "targetRole" "UserRole" NOT NULL,
  "maxUses" INTEGER NOT NULL DEFAULT 1,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "usedByUserId" UUID,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminInviteCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminInviteCode_codeHash_key"
ON "AdminInviteCode"("codeHash");

CREATE INDEX IF NOT EXISTS "AdminInviteCode_targetRole_revokedAt_expiresAt_idx"
ON "AdminInviteCode"("targetRole", "revokedAt", "expiresAt");

CREATE INDEX IF NOT EXISTS "AdminInviteCode_createdByUserId_createdAt_idx"
ON "AdminInviteCode"("createdByUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "AdminInviteCode_usedByUserId_idx"
ON "AdminInviteCode"("usedByUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AdminInviteCode_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "AdminInviteCode"
    ADD CONSTRAINT "AdminInviteCode_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "Profile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AdminInviteCode_usedByUserId_fkey'
  ) THEN
    ALTER TABLE "AdminInviteCode"
    ADD CONSTRAINT "AdminInviteCode_usedByUserId_fkey"
    FOREIGN KEY ("usedByUserId") REFERENCES "Profile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
