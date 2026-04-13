-- Cleanup for duplicate local app users after repeated OAuth/export requests.
-- Target: PostgreSQL (Supabase/Prisma schema with quoted model names).
--
-- What it does:
-- 1) Picks the canonical user as the owner of the most recently updated Strava connection.
-- 2) Finds "empty users" (no StravaConnection, no StravaActivity, no ExportSnapshot).
-- 3) Reassigns UserSession rows from those empty users to the canonical user.
-- 4) Deletes those empty users.
--
-- Safety:
-- - If no canonical user exists (no Strava connection), this script changes nothing.
-- - Data rows with activities/snapshots/connections are never deleted by this script.

BEGIN;

-- Before-state overview
SELECT 'before_users' AS label, COUNT(*)::bigint AS count FROM "User";
SELECT 'before_sessions' AS label, COUNT(*)::bigint AS count FROM "UserSession";
SELECT 'before_connections' AS label, COUNT(*)::bigint AS count FROM "StravaConnection";
SELECT 'before_activities' AS label, COUNT(*)::bigint AS count FROM "StravaActivity";
SELECT 'before_snapshots' AS label, COUNT(*)::bigint AS count FROM "ExportSnapshot";

WITH canonical_user AS (
  SELECT sc."userId" AS id
  FROM "StravaConnection" sc
  WHERE sc."userId" IS NOT NULL
  ORDER BY sc."updatedAt" DESC
  LIMIT 1
),
empty_users AS (
  SELECT u.id
  FROM "User" u
  WHERE NOT EXISTS (SELECT 1 FROM "StravaConnection" sc WHERE sc."userId" = u.id)
    AND NOT EXISTS (SELECT 1 FROM "StravaActivity" sa WHERE sa."userId" = u.id)
    AND NOT EXISTS (SELECT 1 FROM "ExportSnapshot" es WHERE es."userId" = u.id)
),
moved_sessions AS (
  UPDATE "UserSession" us
  SET "userId" = cu.id,
      "updatedAt" = NOW()
  FROM canonical_user cu
  WHERE us."userId" IN (SELECT id FROM empty_users)
    AND us."userId" <> cu.id
  RETURNING us.id, us."sessionToken", us."userId"
),
deleted_users AS (
  DELETE FROM "User" u
  USING canonical_user cu
  WHERE u.id IN (SELECT id FROM empty_users)
    AND u.id <> cu.id
  RETURNING u.id
)
SELECT
  (SELECT COUNT(*) FROM moved_sessions)::bigint AS moved_session_count,
  (SELECT COUNT(*) FROM deleted_users)::bigint AS deleted_user_count,
  (SELECT id FROM canonical_user LIMIT 1) AS canonical_user_id;

-- Optional: remove expired sessions (uncomment if desired).
-- DELETE FROM "UserSession" WHERE "expiresAt" < NOW();

-- After-state overview
SELECT 'after_users' AS label, COUNT(*)::bigint AS count FROM "User";
SELECT 'after_sessions' AS label, COUNT(*)::bigint AS count FROM "UserSession";

COMMIT;

