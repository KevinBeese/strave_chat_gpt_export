import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { createExportPayload } from "@/lib/export-format";
import type {
  ActivityZone,
  AthleteZones,
  ExportPayload,
  ExportSnapshotSummary,
  NormalizedActivity,
  SnapshotCompare,
  SnapshotCompareMetrics,
  SnapshotMetricDelta,
  SnapshotMetricTrend,
  SnapshotSportFilter,
} from "@/types/export";
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const HR_INTENSITY_WEIGHT = 0.7;
const POWER_INTENSITY_WEIGHT = 0.3;
const DEFAULT_INTENSITY = 0.45;
const FORMULA_VERSION = "v1";
const SNAPSHOT_TREND_WINDOWS = [7, 14, 30] as const;

function getZoneIntensity(activity: NormalizedActivity, type: "heartrate" | "power") {
  const zone = activity.zones.find((entry) => entry.type === type);
  if (!zone || zone.distributionBuckets.length === 0) {
    return null;
  }

  let totalSeconds = 0;
  let weightedSeconds = 0;

  zone.distributionBuckets.forEach((bucket, index) => {
    totalSeconds += bucket.time;
    weightedSeconds += bucket.time * (index + 1);
  });

  if (totalSeconds <= 0) {
    return null;
  }

  return weightedSeconds / (totalSeconds * zone.distributionBuckets.length);
}

function getActivityIntensity(activity: NormalizedActivity) {
  const heartRateIntensity = getZoneIntensity(activity, "heartrate");
  const powerIntensity = getZoneIntensity(activity, "power");

  if (heartRateIntensity !== null && powerIntensity !== null) {
    return clamp(
      heartRateIntensity * HR_INTENSITY_WEIGHT +
        powerIntensity * POWER_INTENSITY_WEIGHT,
      0,
      1,
    );
  }

  if (heartRateIntensity !== null) {
    return clamp(heartRateIntensity, 0, 1);
  }

  if (powerIntensity !== null) {
    return clamp(powerIntensity, 0, 1);
  }

  if (activity.averageHeartrate) {
    return clamp(activity.averageHeartrate / 180, 0, 1);
  }

  if (activity.averageWatts && activity.maxWatts) {
    return clamp(activity.averageWatts / activity.maxWatts, 0, 1);
  }

  return DEFAULT_INTENSITY;
}

type TrainingMetrics = {
  load: number;
  intensity: number;
  durationSeconds: number;
};

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}

function calculateTrainingMetrics(activities: NormalizedActivity[]): TrainingMetrics {
  const durationSeconds = activities.reduce(
    (sum, activity) => sum + activity.movingTimeSeconds,
    0,
  );

  if (durationSeconds <= 0) {
    return {
      load: 0,
      intensity: 0,
      durationSeconds: 0,
    };
  }

  const weightedIntensity = activities.reduce(
    (sum, activity) =>
      sum + getActivityIntensity(activity) * activity.movingTimeSeconds,
    0,
  );
  const intensity = (weightedIntensity / durationSeconds) * 100;
  const load = (durationSeconds / 3600) * intensity;

  return {
    load: roundMetric(load),
    intensity: roundMetric(intensity),
    durationSeconds,
  };
}

function buildMetricDelta(current: number, previous: number | null): SnapshotMetricDelta {
  if (previous === null) {
    return {
      current,
      previous: null,
      delta: null,
      deltaPercent: null,
    };
  }

  const delta = roundMetric(current - previous);
  const deltaPercent =
    previous === 0 ? null : roundMetric(((current - previous) / previous) * 100);

  return {
    current,
    previous,
    delta,
    deltaPercent,
  };
}

type SnapshotWithPayload = {
  summary: ExportSnapshotSummary;
  payload: StoredSnapshotPayload;
};

type SnapshotMetricHistoryPoint = {
  createdAt: Date;
  value: number;
};

function filterActivitiesBySport(
  activities: NormalizedActivity[],
  sportFilter: SnapshotSportFilter,
) {
  if (sportFilter === "all") {
    return activities;
  }

  return activities.filter((activity) => {
    const normalizedType = activity.type.toLowerCase();
    const normalizedClassification = activity.classification.toLowerCase();

    if (sportFilter === "ride") {
      return normalizedType.includes("ride");
    }

    if (sportFilter === "run") {
      return normalizedType.includes("run");
    }

    return (
      normalizedType.includes("workout") ||
      normalizedType.includes("weighttraining") ||
      normalizedClassification.includes("workout") ||
      normalizedClassification.includes("strength") ||
      normalizedClassification.includes("functional")
    );
  });
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return roundMetric(sum / values.length);
}

function buildMetricTrend(history: SnapshotMetricHistoryPoint[]): SnapshotMetricTrend {
  const rollingAverage3 = average(history.slice(0, 3).map((point) => point.value));
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const windows = SNAPSHOT_TREND_WINDOWS.map((days) => {
    const currentWindowStart = now - days * dayMs;
    const previousWindowStart = now - days * 2 * dayMs;

    const currentValues = history
      .filter((point) => point.createdAt.getTime() >= currentWindowStart)
      .map((point) => point.value);
    const previousValues = history
      .filter((point) => {
        const createdAt = point.createdAt.getTime();
        return createdAt >= previousWindowStart && createdAt < currentWindowStart;
      })
      .map((point) => point.value);

    const current = average(currentValues) ?? 0;
    const previous = average(previousValues);
    const delta = previous === null ? null : roundMetric(current - previous);
    const deltaPercent =
      previous === null || previous === 0
        ? null
        : roundMetric(((current - previous) / previous) * 100);

    return {
      days,
      sampleSize: currentValues.length,
      current,
      previous,
      delta,
      deltaPercent,
    };
  });

  return {
    rollingAverage3,
    windows,
  };
}

function buildCompareMetrics(
  activities: NormalizedActivity[],
  previous: SnapshotWithPayload | null,
  snapshotHistory: SnapshotWithPayload[],
  sportFilter: SnapshotSportFilter,
): SnapshotCompareMetrics {
  const filteredCurrentActivities = filterActivitiesBySport(activities, sportFilter);
  const filteredPreviousActivities = previous
    ? filterActivitiesBySport(previous.payload.activities, sportFilter)
    : [];

  const currentMetrics = calculateTrainingMetrics(filteredCurrentActivities);
  const previousMetrics =
    filteredPreviousActivities.length > 0
      ? calculateTrainingMetrics(filteredPreviousActivities)
      : null;

  const now = new Date();
  const historyMetrics = [
    {
      createdAt: now,
      metrics: currentMetrics,
    },
    ...snapshotHistory.map((snapshot) => ({
      createdAt: new Date(snapshot.summary.createdAt),
      metrics: calculateTrainingMetrics(
        filterActivitiesBySport(snapshot.payload.activities, sportFilter),
      ),
    })),
  ];

  const loadHistory = historyMetrics.map((entry) => ({
    createdAt: entry.createdAt,
    value: entry.metrics.load,
  }));
  const intensityHistory = historyMetrics.map((entry) => ({
    createdAt: entry.createdAt,
    value: entry.metrics.intensity,
  }));
  const durationHistory = historyMetrics.map((entry) => ({
    createdAt: entry.createdAt,
    value: entry.metrics.durationSeconds,
  }));

  return {
    previousSnapshot: previous?.summary ?? null,
    sampleSize: filteredCurrentActivities.length,
    load: buildMetricDelta(currentMetrics.load, previousMetrics?.load ?? null),
    intensity: buildMetricDelta(
      currentMetrics.intensity,
      previousMetrics?.intensity ?? null,
    ),
    durationSeconds: buildMetricDelta(
      currentMetrics.durationSeconds,
      previousMetrics?.durationSeconds ?? null,
    ),
    trends: {
      load: buildMetricTrend(loadHistory),
      intensity: buildMetricTrend(intensityHistory),
      durationSeconds: buildMetricTrend(durationHistory),
    },
  };
}

function buildSnapshotCompare(
  activities: NormalizedActivity[],
  previous: SnapshotWithPayload | null,
  snapshotHistory: SnapshotWithPayload[],
): SnapshotCompare {
  return {
    formula: {
      version: FORMULA_VERSION,
      hrWeight: HR_INTENSITY_WEIGHT,
      powerWeight: POWER_INTENSITY_WEIGHT,
      defaultIntensity: DEFAULT_INTENSITY,
      fallbackOrder: [
        "Zone-basiert (HR/Power)",
        "Nur HR",
        "Nur Power",
        "Durchschnittspuls/180",
        "Durchschnittsleistung/Maximalleistung",
        "Fixer Default",
      ],
    },
    bySport: {
      all: buildCompareMetrics(activities, previous, snapshotHistory, "all"),
      ride: buildCompareMetrics(activities, previous, snapshotHistory, "ride"),
      run: buildCompareMetrics(activities, previous, snapshotHistory, "run"),
      workout: buildCompareMetrics(activities, previous, snapshotHistory, "workout"),
    },
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

type StoredSnapshotPayload = Pick<
  ExportPayload,
  "selectedDays" | "activityCount" | "rangeLabel" | "athleteZones" | "activities"
>;

function parseStoredSnapshotPayload(
  snapshot: Awaited<ReturnType<typeof prisma.exportSnapshot.findMany>>[number],
) {
  try {
    return JSON.parse(snapshot.activityJson) as StoredSnapshotPayload;
  } catch {
    return null;
  }
}

function toSnapshotSummary(
  snapshot: Awaited<ReturnType<typeof prisma.exportSnapshot.findMany>>[number],
): ExportSnapshotSummary | null {
  const payload = parseStoredSnapshotPayload(snapshot);
  if (!payload) {
    return null;
  }

  return {
    id: snapshot.id,
    createdAt: snapshot.createdAt.toISOString(),
    selectedDays: payload.selectedDays,
    activityCount: payload.activityCount,
    rangeLabel: payload.rangeLabel,
    hasAthleteZones: Boolean(payload.athleteZones),
    hasPowerData: payload.activities.some(
      (activity) =>
        activity.averageWatts !== null ||
        activity.weightedAverageWatts !== null ||
        activity.maxWatts !== null,
    ),
  };
}

async function loadRecentSnapshotsWithPayload(limit = 40) {
  const snapshots = await prisma.exportSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return snapshots.reduce<SnapshotWithPayload[]>((entries, snapshot) => {
    const payload = parseStoredSnapshotPayload(snapshot);
    const summary = toSnapshotSummary(snapshot);
    if (!payload || !summary) {
      return entries;
    }

    entries.push({
      summary,
      payload,
    });
    return entries;
  }, []);
}

async function saveExportSnapshot(payload: ExportPayload) {
  const snapshot = await prisma.exportSnapshot.create({
    data: {
      rangeStart: new Date(payload.rangeStart),
      rangeEnd: new Date(payload.rangeEnd),
      activityJson: JSON.stringify(payload),
    },
  });

  return {
    id: snapshot.id,
    createdAt: snapshot.createdAt.toISOString(),
    selectedDays: payload.selectedDays,
    activityCount: payload.activityCount,
    rangeLabel: payload.rangeLabel,
    hasAthleteZones: Boolean(payload.athleteZones),
    hasPowerData: payload.activities.some(
      (activity) =>
        activity.averageWatts !== null ||
        activity.weightedAverageWatts !== null ||
        activity.maxWatts !== null,
    ),
  } satisfies ExportSnapshotSummary;
}

export function buildExportPayload(
  activities: NormalizedActivity[],
  days: number,
  athleteZones: AthleteZones | null,
  grantedScopes: string[],
  snapshots: ExportSnapshotSummary[],
  snapshotCompare: SnapshotCompare,
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
    requiredScopes,
    missingScopes,
    snapshots,
    snapshotCompare,
  );
}

export async function buildAndStoreExportPayload(
  activities: NormalizedActivity[],
  days: number,
  athleteZones: AthleteZones | null,
  grantedScopes: string[],
) {
  const recentSnapshotsWithPayload = await loadRecentSnapshotsWithPayload();
  const previousSnapshots = recentSnapshotsWithPayload.map((entry) => entry.summary).slice(0, 6);
  const latestSnapshotForCompare = recentSnapshotsWithPayload[0] ?? null;
  const snapshotCompare = buildSnapshotCompare(
    activities,
    latestSnapshotForCompare,
    recentSnapshotsWithPayload,
  );
  const payload = buildExportPayload(
    activities,
    days,
    athleteZones,
    grantedScopes,
    previousSnapshots,
    snapshotCompare,
  );

  const latestSnapshot = await saveExportSnapshot(payload);

  return {
    ...payload,
    snapshots: [latestSnapshot, ...previousSnapshots].slice(0, 6),
  } satisfies ExportPayload;
}
