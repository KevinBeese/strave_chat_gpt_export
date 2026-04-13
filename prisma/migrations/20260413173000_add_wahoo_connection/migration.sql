CREATE TABLE "WahooConnection" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "wahooUserId" TEXT NOT NULL,
  "displayName" TEXT,
  "email" TEXT,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "scope" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WahooConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WahooConnection_userId_key" ON "WahooConnection"("userId");

ALTER TABLE "WahooConnection"
ADD CONSTRAINT "WahooConnection_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "Profile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
