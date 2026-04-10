import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { createExportPayload } from "@/lib/export-format";
import type { ExportPayload, NormalizedActivity } from "@/types/export";
import type {
  StravaActivity,
  StravaTokenResponse,
  TokenUpsertPayload,
} from "@/types/strava";

function assertOk(response: Response, message: string) {
  if (!response.ok) {
    throw new Error(message);
  }
}

export async function exchangeCodeForToken(code: string) {
  const env = getEnv();
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  assertOk(response, "Unable to complete Strava OAuth exchange.");

  return (await response.json()) as StravaTokenResponse;
}

export async function refreshToken(refreshToken: string) {
  const env = getEnv();
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  assertOk(response, "Unable to refresh Strava token.");

  return (await response.json()) as StravaTokenResponse;
}

export async function upsertStravaConnection(payload: TokenUpsertPayload) {
  return prisma.stravaConnection.upsert({
    where: {
      athleteId: String(payload.athlete.id),
    },
    update: {
      athleteName: `${payload.athlete.firstname} ${payload.athlete.lastname}`.trim(),
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: new Date(payload.expires_at * 1000),
      scope: payload.scope,
    },
    create: {
      athleteId: String(payload.athlete.id),
      athleteName: `${payload.athlete.firstname} ${payload.athlete.lastname}`.trim(),
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: new Date(payload.expires_at * 1000),
      scope: payload.scope,
    },
  });
}

async function getValidAccessToken() {
  const connection = await prisma.stravaConnection.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!connection) {
    throw new Error("No Strava connection found.");
  }

  if (connection.expiresAt.getTime() > Date.now() + 30_000) {
    return connection.accessToken;
  }

  const refreshed = await refreshToken(connection.refreshToken);
  await upsertStravaConnection(refreshed);
  return refreshed.access_token;
}

function normalizeActivity(activity: StravaActivity): NormalizedActivity {
  return {
    id: activity.id,
    name: activity.name,
    type: activity.sport_type ?? activity.type,
    startDate: activity.start_date,
    distanceMeters: activity.distance,
    movingTimeSeconds: activity.moving_time,
    elapsedTimeSeconds: activity.elapsed_time,
    elevationGainMeters: activity.total_elevation_gain,
    averageSpeed: activity.average_speed,
    maxSpeed: activity.max_speed,
    averageHeartrate: activity.average_heartrate ?? null,
    maxHeartrate: activity.max_heartrate ?? null,
    calories: activity.calories ?? null,
    description: activity.description ?? null,
  };
}

export async function getRecentActivities(days: number) {
  const accessToken = await getValidAccessToken();
  const after = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);

  const response = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  assertOk(response, "Unable to fetch recent Strava activities.");

  const activities = (await response.json()) as StravaActivity[];
  return activities.map(normalizeActivity);
}

export function buildExportPayload(
  activities: NormalizedActivity[],
  days: number,
): ExportPayload {
  const rangeEnd = new Date().toISOString();
  const rangeStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return createExportPayload(activities, rangeStart, rangeEnd);
}
