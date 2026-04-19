-- Safe manual migration for: 20260413182000_add_activity_provider_columns
-- Run in Supabase SQL Editor (or psql) against production.
-- Idempotent: can be re-run safely.

-- 1) Add new columns as nullable first (fast metadata change)
ALTER TABLE "Activity"
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "providerActivityId" TEXT;

-- 2) Backfill existing rows
UPDATE "Activity"
SET "provider" = 'strava'
WHERE "provider" IS NULL;

UPDATE "Activity"
SET "providerActivityId" = "id"::text
WHERE "providerActivityId" IS NULL;

-- 3) Default for new writes
ALTER TABLE "Activity"
  ALTER COLUMN "provider" SET DEFAULT 'strava';

-- 4) Create indexes concurrently (avoid long table lock)
-- NOTE: CONCURRENTLY cannot run inside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Activity_userId_provider_startDate_idx"
  ON "Activity"("userId", "provider", "startDate");

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Activity_userId_provider_providerActivityId_key"
  ON "Activity"("userId", "provider", "providerActivityId");

-- 5) Enforce NOT NULL last
-- If this times out due lock contention, re-run this section during low traffic.
ALTER TABLE "Activity"
  ALTER COLUMN "provider" SET NOT NULL,
  ALTER COLUMN "providerActivityId" SET NOT NULL;
