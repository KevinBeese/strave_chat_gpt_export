BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) User -> Profile
ALTER TABLE "User" RENAME TO "Profile";
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "email" TEXT NOT NULL DEFAULT '';

-- 2) Build a stable user-id map (text -> uuid) and include ids from all related tables.
CREATE TABLE IF NOT EXISTS "_UserIdMap" (
  "oldId" TEXT PRIMARY KEY,
  "newId" UUID NOT NULL UNIQUE
);

WITH ids AS (
  SELECT id AS old_id FROM "Profile"
  UNION
  SELECT "userId" FROM "StravaConnection" WHERE "userId" IS NOT NULL
  UNION
  SELECT "userId" FROM "ExportSnapshot" WHERE "userId" IS NOT NULL
  UNION
  SELECT "userId" FROM "StravaActivity" WHERE "userId" IS NOT NULL
  UNION
  SELECT "userId" FROM "UserSession" WHERE "userId" IS NOT NULL
)
INSERT INTO "_UserIdMap" ("oldId", "newId")
SELECT
  ids.old_id,
  CASE
    WHEN ids.old_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN ids.old_id::uuid
    ELSE gen_random_uuid()
  END
FROM ids
ON CONFLICT ("oldId") DO NOTHING;

-- 3) Convert Profile.id to uuid.
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "_id_uuid" UUID;
UPDATE "Profile" p
SET "_id_uuid" = m."newId"
FROM "_UserIdMap" m
WHERE m."oldId" = p."id";

UPDATE "Profile"
SET "_id_uuid" = gen_random_uuid()
WHERE "_id_uuid" IS NULL;

ALTER TABLE "Profile" DROP CONSTRAINT IF EXISTS "User_pkey";
ALTER TABLE "Profile" DROP COLUMN "id";
ALTER TABLE "Profile" RENAME COLUMN "_id_uuid" TO "id";
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_pkey" PRIMARY KEY ("id");

-- 4) Convert StravaConnection.userId -> uuid and enforce NOT NULL + unique.
ALTER TABLE "StravaConnection" DROP CONSTRAINT IF EXISTS "StravaConnection_userId_fkey";
ALTER TABLE "StravaConnection" ADD COLUMN IF NOT EXISTS "_userId_uuid" UUID;
UPDATE "StravaConnection" sc
SET "_userId_uuid" = m."newId"
FROM "_UserIdMap" m
WHERE sc."userId" = m."oldId";

DELETE FROM "StravaConnection"
WHERE "userId" IS NULL OR "_userId_uuid" IS NULL;

ALTER TABLE "StravaConnection" DROP COLUMN "userId";
ALTER TABLE "StravaConnection" RENAME COLUMN "_userId_uuid" TO "userId";
ALTER TABLE "StravaConnection" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "StravaConnection" DROP CONSTRAINT IF EXISTS "StravaConnection_userId_athleteId_key";
ALTER TABLE "StravaConnection" DROP CONSTRAINT IF EXISTS "StravaConnection_userId_key";
ALTER TABLE "StravaConnection" ADD CONSTRAINT "StravaConnection_userId_key" UNIQUE ("userId");
ALTER TABLE "StravaConnection"
  ADD CONSTRAINT "StravaConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "Profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) Convert ExportSnapshot.userId -> uuid and enforce NOT NULL.
ALTER TABLE "ExportSnapshot" DROP CONSTRAINT IF EXISTS "ExportSnapshot_userId_fkey";
ALTER TABLE "ExportSnapshot" ADD COLUMN IF NOT EXISTS "_userId_uuid" UUID;
UPDATE "ExportSnapshot" es
SET "_userId_uuid" = m."newId"
FROM "_UserIdMap" m
WHERE es."userId" = m."oldId";

DELETE FROM "ExportSnapshot"
WHERE "userId" IS NULL OR "_userId_uuid" IS NULL;

ALTER TABLE "ExportSnapshot" DROP COLUMN "userId";
ALTER TABLE "ExportSnapshot" RENAME COLUMN "_userId_uuid" TO "userId";
ALTER TABLE "ExportSnapshot" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ExportSnapshot"
  ADD CONSTRAINT "ExportSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "Profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) Convert UserSession.userId -> uuid.
ALTER TABLE "UserSession" DROP CONSTRAINT IF EXISTS "UserSession_userId_fkey";
ALTER TABLE "UserSession" ADD COLUMN IF NOT EXISTS "_userId_uuid" UUID;
UPDATE "UserSession" us
SET "_userId_uuid" = m."newId"
FROM "_UserIdMap" m
WHERE us."userId" = m."oldId";

DELETE FROM "UserSession"
WHERE "_userId_uuid" IS NULL;

ALTER TABLE "UserSession" DROP COLUMN "userId";
ALTER TABLE "UserSession" RENAME COLUMN "_userId_uuid" TO "userId";
ALTER TABLE "UserSession" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "UserSession"
  ADD CONSTRAINT "UserSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "Profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 7) StravaActivity -> Activity with new primary key strategy and new fields.
ALTER TABLE "StravaActivity" RENAME TO "Activity";
ALTER TABLE "Activity" DROP CONSTRAINT IF EXISTS "StravaActivity_userId_fkey";

ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "_userId_uuid" UUID;
UPDATE "Activity" a
SET "_userId_uuid" = m."newId"
FROM "_UserIdMap" m
WHERE a."userId" = m."oldId";

DELETE FROM "Activity"
WHERE "userId" IS NULL OR "_userId_uuid" IS NULL;

ALTER TABLE "Activity" DROP COLUMN "userId";
ALTER TABLE "Activity" RENAME COLUMN "_userId_uuid" TO "userId";
ALTER TABLE "Activity" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "Activity" DROP CONSTRAINT IF EXISTS "StravaActivity_pkey";
ALTER TABLE "Activity" RENAME COLUMN "id" TO "legacyId";
ALTER TABLE "Activity" RENAME COLUMN "stravaActivityId" TO "id";
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_pkey" PRIMARY KEY ("id");
ALTER TABLE "Activity" DROP CONSTRAINT IF EXISTS "StravaActivity_userId_stravaActivityId_key";

ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "distance" DOUBLE PRECISION;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "movingTime" INTEGER;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "elapsedTime" INTEGER;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "rawJson" JSONB;

UPDATE "Activity"
SET
  "distance" = COALESCE("distance", "distanceMeters"),
  "movingTime" = COALESCE("movingTime", "movingTimeSeconds"),
  "elapsedTime" = COALESCE("elapsedTime", "elapsedTimeSeconds"),
  "rawJson" = COALESCE(
    "rawJson",
    jsonb_build_object(
      'id', "id",
      'name', "name",
      'type', "type",
      'start_date', "startDate",
      'distance', "distanceMeters",
      'moving_time', "movingTimeSeconds",
      'elapsed_time', "elapsedTimeSeconds",
      'total_elevation_gain', "elevationGainMeters",
      'average_speed', "averageSpeed",
      'max_speed', "maxSpeed"
    )
  );

ALTER TABLE "Activity" ALTER COLUMN "distance" SET NOT NULL;
ALTER TABLE "Activity" ALTER COLUMN "movingTime" SET NOT NULL;
ALTER TABLE "Activity" ALTER COLUMN "elapsedTime" SET NOT NULL;
ALTER TABLE "Activity" ALTER COLUMN "rawJson" SET NOT NULL;

ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "Profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Activity" DROP COLUMN IF EXISTS "legacyId";

CREATE INDEX IF NOT EXISTS "Activity_athleteId_startDate_idx" ON "Activity" ("athleteId", "startDate");
CREATE INDEX IF NOT EXISTS "Activity_userId_startDate_idx" ON "Activity" ("userId", "startDate");

-- 8) Cleanup temporary map table.
DROP TABLE IF EXISTS "_UserIdMap";

COMMIT;
