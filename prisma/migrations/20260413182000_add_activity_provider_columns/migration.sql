ALTER TABLE "Activity"
ADD COLUMN "provider" TEXT,
ADD COLUMN "providerActivityId" TEXT;

UPDATE "Activity"
SET
  "provider" = 'strava',
  "providerActivityId" = "id"::text
WHERE "provider" IS NULL OR "providerActivityId" IS NULL;

ALTER TABLE "Activity"
ALTER COLUMN "provider" SET NOT NULL,
ALTER COLUMN "provider" SET DEFAULT 'strava',
ALTER COLUMN "providerActivityId" SET NOT NULL;

CREATE INDEX "Activity_userId_provider_startDate_idx"
ON "Activity"("userId", "provider", "startDate");

CREATE UNIQUE INDEX "Activity_userId_provider_providerActivityId_key"
ON "Activity"("userId", "provider", "providerActivityId");
