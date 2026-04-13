import { prisma } from "@/lib/prisma";

function parseScopes(scope: string | null | undefined) {
  return (scope ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function getConnectionStatus(userId: string) {
  try {
    const connection = await prisma.stravaConnection.findFirst({
      where: {
        userId,
      },
    });
    const grantedScopes = parseScopes(connection?.scope);

    return {
      connected: Boolean(connection),
      label: connection?.athleteName ?? connection?.athleteId ?? "Unbekannt",
      athleteId: connection?.athleteId ?? null,
      expiresAt: connection?.expiresAt.toISOString() ?? null,
      grantedScopes,
      hasProfileReadAll: grantedScopes.includes("profile:read_all"),
      canStartOauth: Boolean(
        process.env.STRAVA_CLIENT_ID &&
          process.env.STRAVA_CLIENT_SECRET &&
          process.env.STRAVA_REDIRECT_URI,
      ),
    };
  } catch {
    return {
      connected: false,
      label: "Unbekannt",
      athleteId: null,
      expiresAt: null,
      grantedScopes: [],
      hasProfileReadAll: false,
      canStartOauth: Boolean(
        process.env.STRAVA_CLIENT_ID &&
          process.env.STRAVA_CLIENT_SECRET &&
          process.env.STRAVA_REDIRECT_URI,
      ),
    };
  }
}
