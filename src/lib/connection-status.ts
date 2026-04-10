import { prisma } from "@/lib/prisma";

export async function getConnectionStatus() {
  try {
    const connection = await prisma.stravaConnection.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    return {
      connected: Boolean(connection),
      label: connection?.athleteName ?? connection?.athleteId ?? "Unbekannt",
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
      canStartOauth: Boolean(
        process.env.STRAVA_CLIENT_ID &&
          process.env.STRAVA_CLIENT_SECRET &&
          process.env.STRAVA_REDIRECT_URI,
      ),
    };
  }
}
