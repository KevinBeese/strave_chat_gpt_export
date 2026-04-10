import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { createExportPayload } from "@/lib/export-format";
import type { ActivityZone, AthleteZones, ExportPayload, NormalizedActivity } from "@/types/export";
import type {
  StravaActivity,
  StravaActivityZone,
  StravaAthleteZones,
  StravaTokenResponse,
  TokenUpsertInput,
} from "@/types/strava";

function assertOk(response: Response, message: string) {
  if (!response.ok) {
    throw new Error(message);
  }
}

function parseGrantedScopes(scope: string | null | undefined) {
  return (scope ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function classifyActivity(type: string, name: string) {
  const normalizedType = type.toLowerCase();
  const normalizedName = name.toLowerCase();

  if (normalizedName.includes("padel")) {
    return {
      classification: "Racketsport",
      analysisLabel: "Padel-Session",
    };
  }

  if (
    normalizedName.includes("beat 81 ride") ||
    normalizedName.includes("spinning") ||
    normalizedName.includes("indoor cycling")
  ) {
    return {
      classification: "Indoor Cycling",
      analysisLabel: "Indoor-Cycling-Kurs",
    };
  }

  if (
    normalizedName.includes("move it") ||
    normalizedName.includes("strength") ||
    normalizedName.includes("gym") ||
    normalizedName.includes("functional")
  ) {
    return {
      classification: "Functional Training",
      analysisLabel: "Kraft- oder Functional-Session",
    };
  }

  if (normalizedType === "ride") {
    return {
      classification: "Cycling",
      analysisLabel: "Radeinheit",
    };
  }

  if (normalizedType === "run") {
    return {
      classification: "Running",
      analysisLabel: "Laufeinheit",
    };
  }

  if (normalizedType === "workout") {
    return {
      classification: "Workout",
      analysisLabel: "Allgemeine Workout-Session",
    };
  }

  if (normalizedType === "weighttraining") {
    return {
      classification: "Strength Training",
      analysisLabel: "Krafttraining",
    };
  }

  if (normalizedType === "swim") {
    return {
      classification: "Swimming",
      analysisLabel: "Schwimmeinheit",
    };
  }

  return {
    classification: "Other",
    analysisLabel: type,
  };
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

export async function upsertStravaConnection(payload: TokenUpsertInput) {
  await prisma.stravaConnection.deleteMany({
    where: {
      athleteId: {
        not: String(payload.athlete.id),
      },
    },
  });

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

export async function disconnectStravaConnection() {
  await prisma.stravaConnection.deleteMany();
}

async function getCurrentConnection() {
  const connection = await prisma.stravaConnection.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!connection) {
    throw new Error("No Strava connection found.");
  }

  return connection;
}

async function getValidAccessToken() {
  const connection = await getCurrentConnection();
  const grantedScopes = parseGrantedScopes(connection.scope);

  if (connection.expiresAt.getTime() > Date.now() + 30_000) {
    return {
      accessToken: connection.accessToken,
      athleteId: connection.athleteId,
      grantedScopes,
    };
  }

  const refreshed = await refreshToken(connection.refreshToken);
  await upsertStravaConnection(refreshed);
  return {
    accessToken: refreshed.access_token,
    athleteId: String(refreshed.athlete.id),
    grantedScopes: parseGrantedScopes(refreshed.scope),
  };
}

function normalizeActivityZones(zones: StravaActivityZone[] | null): ActivityZone[] {
  if (!zones) {
    return [];
  }

  return zones.map((zone) => ({
    type: zone.type,
    sensorBased: Boolean(zone.sensor_based),
    points: zone.points ?? null,
    max: zone.max ?? null,
    customZones: Boolean(zone.custom_zones),
    score: zone.score ?? null,
    distributionBuckets: Array.isArray(zone.distribution_buckets)
      ? zone.distribution_buckets.map((bucket) => ({
          min: bucket.min,
          max: bucket.max,
          time: bucket.time,
        }))
      : [],
  }));
}

function normalizeAthleteZones(zones: StravaAthleteZones | null): AthleteZones | null {
  if (!zones) {
    return null;
  }

  return {
    heartRateZones: zones.heart_rate?.zones ?? [],
    powerZones: zones.power?.zones ?? [],
  };
}

async function fetchAthleteZones(accessToken: string, grantedScopes: string[]) {
  if (!grantedScopes.includes("profile:read_all")) {
    return null;
  }

  const response = await fetch("https://www.strava.com/api/v3/athlete/zones", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return normalizeAthleteZones((await response.json()) as StravaAthleteZones);
}

async function fetchActivityZones(accessToken: string, activityId: number) {
  const response = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/zones`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return [];
  }

  return normalizeActivityZones((await response.json()) as StravaActivityZone[]);
}

function normalizeActivity(activity: StravaActivity): NormalizedActivity {
  const hasDistanceData = activity.distance > 0;
  const type = activity.sport_type ?? activity.type;
  const classification = classifyActivity(type, activity.name);

  return {
    id: activity.id,
    name: activity.name,
    type,
    classification: classification.classification,
    analysisLabel: classification.analysisLabel,
    startDate: activity.start_date,
    hasDistanceData,
    distanceMeters: activity.distance,
    movingTimeSeconds: activity.moving_time,
    elapsedTimeSeconds: activity.elapsed_time,
    elevationGainMeters: activity.total_elevation_gain,
    averageSpeed: activity.average_speed,
    maxSpeed: activity.max_speed,
    averageHeartrate: activity.average_heartrate ?? null,
    maxHeartrate: activity.max_heartrate ?? null,
    averageWatts: activity.average_watts ?? null,
    weightedAverageWatts: activity.weighted_average_watts ?? null,
    maxWatts: activity.max_watts ?? null,
    kilojoules: activity.kilojoules ?? null,
    deviceWatts: activity.device_watts ?? null,
    calories: activity.calories ?? null,
    description: activity.description ?? null,
    zones: [],
  };
}

export async function getRecentActivities(days: number) {
  const { accessToken } = await getValidAccessToken();
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

async function upsertActivities(athleteId: string, activities: NormalizedActivity[]) {
  await Promise.all(
    activities.map((activity) =>
      prisma.stravaActivity.upsert({
        where: {
          stravaActivityId: BigInt(activity.id),
        },
        update: {
          athleteId,
          name: activity.name,
          type: activity.type,
          classification: activity.classification,
          analysisLabel: activity.analysisLabel,
          startDate: new Date(activity.startDate),
          hasDistanceData: activity.hasDistanceData,
          distanceMeters: activity.distanceMeters,
          movingTimeSeconds: activity.movingTimeSeconds,
          elapsedTimeSeconds: activity.elapsedTimeSeconds,
          elevationGainMeters: activity.elevationGainMeters,
          averageSpeed: activity.averageSpeed,
          maxSpeed: activity.maxSpeed,
          averageHeartrate: activity.averageHeartrate,
          maxHeartrate: activity.maxHeartrate,
          averageWatts: activity.averageWatts,
          weightedAverageWatts: activity.weightedAverageWatts
            ? Math.round(activity.weightedAverageWatts)
            : null,
          maxWatts: activity.maxWatts ? Math.round(activity.maxWatts) : null,
          kilojoules: activity.kilojoules,
          deviceWatts: activity.deviceWatts,
          calories: activity.calories,
          description: activity.description,
          zonesJson: JSON.stringify(activity.zones),
        },
        create: {
          stravaActivityId: BigInt(activity.id),
          athleteId,
          name: activity.name,
          type: activity.type,
          classification: activity.classification,
          analysisLabel: activity.analysisLabel,
          startDate: new Date(activity.startDate),
          hasDistanceData: activity.hasDistanceData,
          distanceMeters: activity.distanceMeters,
          movingTimeSeconds: activity.movingTimeSeconds,
          elapsedTimeSeconds: activity.elapsedTimeSeconds,
          elevationGainMeters: activity.elevationGainMeters,
          averageSpeed: activity.averageSpeed,
          maxSpeed: activity.maxSpeed,
          averageHeartrate: activity.averageHeartrate,
          maxHeartrate: activity.maxHeartrate,
          averageWatts: activity.averageWatts,
          weightedAverageWatts: activity.weightedAverageWatts
            ? Math.round(activity.weightedAverageWatts)
            : null,
          maxWatts: activity.maxWatts ? Math.round(activity.maxWatts) : null,
          kilojoules: activity.kilojoules,
          deviceWatts: activity.deviceWatts,
          calories: activity.calories,
          description: activity.description,
          zonesJson: JSON.stringify(activity.zones),
        },
      }),
    ),
  );
}

function fromStoredActivity(
  activity: Awaited<ReturnType<typeof prisma.stravaActivity.findMany>>[number],
): NormalizedActivity {
  return {
    id: Number(activity.stravaActivityId),
    name: activity.name,
    type: activity.type,
    classification: activity.classification,
    analysisLabel: activity.analysisLabel,
    startDate: activity.startDate.toISOString(),
    hasDistanceData: activity.hasDistanceData,
    distanceMeters: activity.distanceMeters,
    movingTimeSeconds: activity.movingTimeSeconds,
    elapsedTimeSeconds: activity.elapsedTimeSeconds,
    elevationGainMeters: activity.elevationGainMeters,
    averageSpeed: activity.averageSpeed,
    maxSpeed: activity.maxSpeed,
    averageHeartrate: activity.averageHeartrate,
    maxHeartrate: activity.maxHeartrate,
    averageWatts: activity.averageWatts,
    weightedAverageWatts: activity.weightedAverageWatts,
    maxWatts: activity.maxWatts,
    kilojoules: activity.kilojoules,
    deviceWatts: activity.deviceWatts,
    calories: activity.calories,
    description: activity.description,
    zones: activity.zonesJson ? (JSON.parse(activity.zonesJson) as ActivityZone[]) : [],
  };
}

export async function syncAndLoadActivities(days: number) {
  const { athleteId, accessToken, grantedScopes } = await getValidAccessToken();
  const recentActivities = await getRecentActivities(days);
  const enrichedActivities = await Promise.all(
    recentActivities.map(async (activity) => ({
      ...activity,
      zones: await fetchActivityZones(accessToken, activity.id),
    })),
  );
  await upsertActivities(athleteId, enrichedActivities);
  const athleteZones = await fetchAthleteZones(accessToken, grantedScopes);

  const afterDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const storedActivities = await prisma.stravaActivity.findMany({
    where: {
      athleteId,
      startDate: {
        gte: afterDate,
      },
    },
    orderBy: {
      startDate: "asc",
    },
  });

  return {
    activities: storedActivities.map(fromStoredActivity),
    athleteZones,
    grantedScopes,
  };
}

export function buildExportPayload(
  activities: NormalizedActivity[],
  days: number,
  athleteZones: AthleteZones | null,
  grantedScopes: string[],
): ExportPayload {
  const rangeEnd = new Date().toISOString();
  const rangeStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const requiredScopes = ["read", "activity:read_all", "profile:read_all"];
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));

  return createExportPayload(
    activities,
    rangeStart,
    rangeEnd,
    days,
    athleteZones,
    grantedScopes,
    missingScopes,
  );
}
