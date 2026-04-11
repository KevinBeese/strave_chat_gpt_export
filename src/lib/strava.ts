import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { createExportPayload } from "@/lib/export-format";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import {
  getTrendConfidence,
  SNAPSHOT_FORMULA_DEFAULT_INTENSITY,
  SNAPSHOT_FORMULA_DOCUMENTATION,
  SNAPSHOT_FORMULA_FALLBACK_ORDER,
  SNAPSHOT_FORMULA_VERSION,
  SNAPSHOT_FORMULA_WEIGHT_PROFILES,
  SNAPSHOT_TREND_WINDOWS,
  type SnapshotFormulaWeightProfileKey,
} from "@/lib/snapshot-config";
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

const STRAVA_API_BASE_URL = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token";
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 10 * 60 * 1000;

type RateLimitInfo = {
  limit: string | null;
  usage: string | null;
};

type RequestRetryOptions = {
  silentOnExhaustedRetries?: boolean;
};

export class StravaApiError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  isRateLimit: boolean;
  rateLimit: RateLimitInfo;

  constructor(
    message: string,
    status: number,
    options?: {
      retryAfterSeconds?: number | null;
      isRateLimit?: boolean;
      rateLimit?: RateLimitInfo;
    },
  ) {
    super(message);
    this.name = "StravaApiError";
    this.status = status;
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
    this.isRateLimit = options?.isRateLimit ?? false;
    this.rateLimit = options?.rateLimit ?? {
      limit: null,
      usage: null,
    };
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

function getRateLimitInfo(response: Response): RateLimitInfo {
  return {
    limit: response.headers.get("x-ratelimit-limit"),
    usage: response.headers.get("x-ratelimit-usage"),
  };
}

function parseRetryAfterSeconds(response: Response) {
  const header = response.headers.get("retry-after");
  if (!header) {
    return null;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }

  const at = Date.parse(header);
  if (!Number.isNaN(at)) {
    return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }

  return null;
}

function getRetryDelayMs(
  attempt: number,
  baseDelayMs: number,
  retryAfterSeconds: number | null,
) {
  if (retryAfterSeconds !== null) {
    return Math.max(baseDelayMs, retryAfterSeconds * 1000);
  }

  const exponential = baseDelayMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * Math.max(100, Math.floor(baseDelayMs / 2)));
  return Math.min(30_000, exponential + jitter);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestWithRetry(
  url: string,
  init: RequestInit,
  options?: RequestRetryOptions,
) {
  const env = getEnv();
  const maxAttempts = env.STRAVA_RETRY_MAX_ATTEMPTS;
  const baseDelayMs = env.STRAVA_RETRY_BASE_DELAY_MS;
  const method = (init.method ?? "GET").toUpperCase();

  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) {
        return response;
      }

      const status = response.status;
      const retryAfterSeconds = parseRetryAfterSeconds(response);
      const retryableStatus = status === 429 || status >= 500;
      const isLastAttempt = attempt === maxAttempts - 1;

      if (!retryableStatus || isLastAttempt) {
        return response;
      }

      const delayMs = getRetryDelayMs(attempt, baseDelayMs, retryAfterSeconds);
      await sleep(delayMs);
    } catch (error) {
      lastNetworkError = error;
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt) {
        break;
      }

      const delayMs = getRetryDelayMs(attempt, baseDelayMs, null);
      await sleep(delayMs);
    }
  }

  if (!options?.silentOnExhaustedRetries) {
    const networkMessage =
      lastNetworkError instanceof Error ? lastNetworkError.message : "Unknown network error";
    throw new Error(`Strava ${method} request failed after retries: ${networkMessage}`);
  }

  return null;
}

export async function exchangeCodeForToken(code: string) {
  const env = getEnv();
  const response = await requestWithRetry(STRAVA_OAUTH_URL, {
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

  if (!response) {
    throw new Error("Unable to complete Strava OAuth exchange.");
  }

  return (await response.json()) as StravaTokenResponse;
}

export async function refreshToken(refreshToken: string) {
  const env = getEnv();
  const response = await requestWithRetry(STRAVA_OAUTH_URL, {
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

  if (!response) {
    throw new Error("Unable to refresh Strava token.");
  }

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
      accessToken: encryptToken(payload.access_token),
      refreshToken: encryptToken(payload.refresh_token),
      expiresAt: new Date(payload.expires_at * 1000),
      scope: payload.scope,
    },
    create: {
      athleteId: String(payload.athlete.id),
      athleteName: `${payload.athlete.firstname} ${payload.athlete.lastname}`.trim(),
      accessToken: encryptToken(payload.access_token),
      refreshToken: encryptToken(payload.refresh_token),
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

async function decryptConnectionTokens(
  connection: Awaited<ReturnType<typeof getCurrentConnection>>,
) {
  const accessToken = decryptToken(connection.accessToken);
  const refreshToken = decryptToken(connection.refreshToken);

  if (!accessToken.wasEncrypted || !refreshToken.wasEncrypted) {
    await prisma.stravaConnection.update({
      where: {
        athleteId: connection.athleteId,
      },
      data: {
        accessToken: encryptToken(accessToken.token),
        refreshToken: encryptToken(refreshToken.token),
      },
    });
  }

  return {
    accessToken: accessToken.token,
    refreshToken: refreshToken.token,
  };
}

async function getValidAccessToken() {
  const connection = await getCurrentConnection();
  const decrypted = await decryptConnectionTokens(connection);
  const grantedScopes = parseGrantedScopes(connection.scope);

  if (connection.expiresAt.getTime() > Date.now() + TOKEN_REFRESH_SAFETY_WINDOW_MS) {
    return {
      accessToken: decrypted.accessToken,
      athleteId: connection.athleteId,
      grantedScopes,
    };
  }

  const refreshed = await refreshToken(decrypted.refreshToken);
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

async function fetchStravaApi<T>(
  path: string,
  options?: {
    accessToken?: string;
    allowUnauthorizedRetry?: boolean;
    silentUnauthorized?: boolean;
  },
) {
  const tokenInfo = options?.accessToken
    ? {
        accessToken: options.accessToken,
      }
    : await getValidAccessToken();

  const response = await requestWithRetry(
    `${STRAVA_API_BASE_URL}${path}`,
    {
      headers: {
        Authorization: `Bearer ${tokenInfo.accessToken}`,
      },
      cache: "no-store",
    },
    {
      silentOnExhaustedRetries: options?.silentUnauthorized,
    },
  );

  if (!response) {
    return null;
  }

  if (response.status === 401 && options?.allowUnauthorizedRetry !== false) {
    const connection = await getCurrentConnection();
    const decrypted = await decryptConnectionTokens(connection);
    const refreshed = await refreshToken(decrypted.refreshToken);
    await upsertStravaConnection(refreshed);
    return fetchStravaApi<T>(path, {
      accessToken: refreshed.access_token,
      allowUnauthorizedRetry: false,
      silentUnauthorized: options?.silentUnauthorized,
    });
  }

  if (!response.ok) {
    const rateLimit = getRateLimitInfo(response);
    throw new StravaApiError(`Strava API request failed (${response.status}).`, response.status, {
      retryAfterSeconds: parseRetryAfterSeconds(response),
      isRateLimit: response.status === 429,
      rateLimit,
    });
  }

  return (await response.json()) as T;
}

async function fetchAthleteZones(accessToken: string, grantedScopes: string[]) {
  if (!grantedScopes.includes("profile:read_all")) {
    return null;
  }

  try {
    const zones = await fetchStravaApi<StravaAthleteZones>("/athlete/zones", {
      accessToken,
      silentUnauthorized: true,
    });

    if (!zones) {
      return null;
    }

    return normalizeAthleteZones(zones);
  } catch (error) {
    if (error instanceof StravaApiError) {
      if (error.isRateLimit || error.status === 403 || error.status === 404) {
        return null;
      }
    }
    throw error;
  }
}

async function fetchActivityZones(accessToken: string, activityId: number) {
  try {
    const zones = await fetchStravaApi<StravaActivityZone[]>(
      `/activities/${activityId}/zones`,
      {
        accessToken,
        silentUnauthorized: true,
      },
    );

    if (!zones) {
      return [];
    }

    return normalizeActivityZones(zones);
  } catch (error) {
    if (error instanceof StravaApiError && (error.status === 403 || error.status === 404)) {
      return [];
    }
    throw error;
  }
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
  const after = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  const activities = await fetchStravaApi<StravaActivity[]>(
    `/athlete/activities?after=${after}&per_page=100`,
    {
      allowUnauthorizedRetry: true,
    },
  );
  if (!activities) {
    throw new Error("Unable to fetch recent Strava activities.");
  }
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

function inferFormulaWeightProfile(activity: NormalizedActivity): SnapshotFormulaWeightProfileKey {
  const normalizedType = activity.type.toLowerCase();
  const normalizedClassification = activity.classification.toLowerCase();

  if (normalizedType.includes("ride")) {
    return "ride";
  }

  if (normalizedType.includes("run")) {
    return "run";
  }

  if (
    normalizedType.includes("workout") ||
    normalizedType.includes("weighttraining") ||
    normalizedClassification.includes("workout") ||
    normalizedClassification.includes("strength") ||
    normalizedClassification.includes("functional")
  ) {
    return "workout";
  }

  return "default";
}

function getActivityIntensity(activity: NormalizedActivity) {
  const heartRateIntensity = getZoneIntensity(activity, "heartrate");
  const powerIntensity = getZoneIntensity(activity, "power");
  const weightProfile = SNAPSHOT_FORMULA_WEIGHT_PROFILES[inferFormulaWeightProfile(activity)];

  if (heartRateIntensity !== null && powerIntensity !== null) {
    return clamp(
      heartRateIntensity * weightProfile.hrWeight + powerIntensity * weightProfile.powerWeight,
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

  return SNAPSHOT_FORMULA_DEFAULT_INTENSITY;
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
    const sampleSize = currentValues.length;
    const confidence = getTrendConfidence(sampleSize);
    const previous = average(previousValues);
    const delta = previous === null ? null : roundMetric(current - previous);
    const deltaPercent =
      previous === null || previous === 0
        ? null
        : roundMetric(((current - previous) / previous) * 100);

    return {
      days,
      sampleSize,
      confidenceLevel: confidence.level,
      confidenceLabel: confidence.label,
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
      version: SNAPSHOT_FORMULA_VERSION,
      defaultIntensity: SNAPSHOT_FORMULA_DEFAULT_INTENSITY,
      weightProfiles: SNAPSHOT_FORMULA_WEIGHT_PROFILES,
      fallbackOrder: [...SNAPSHOT_FORMULA_FALLBACK_ORDER],
      documentation: [...SNAPSHOT_FORMULA_DOCUMENTATION],
    },
    bySport: {
      all: buildCompareMetrics(activities, previous, snapshotHistory, "all"),
      ride: buildCompareMetrics(activities, previous, snapshotHistory, "ride"),
      run: buildCompareMetrics(activities, previous, snapshotHistory, "run"),
      workout: buildCompareMetrics(activities, previous, snapshotHistory, "workout"),
    },
  };
}

async function enrichActivitiesWithZones(
  activities: NormalizedActivity[],
  accessToken: string,
) {
  const concurrency = 4;
  const enriched = [...activities];
  let cursor = 0;
  let stopReason: "rate_limit" | null = null;

  async function worker() {
    while (cursor < enriched.length && stopReason === null) {
      const index = cursor;
      cursor += 1;

      try {
        const zones = await fetchActivityZones(accessToken, enriched[index].id);
        enriched[index] = {
          ...enriched[index],
          zones,
        };
      } catch (error) {
        if (error instanceof StravaApiError && error.isRateLimit) {
          stopReason = "rate_limit";
          break;
        }
        throw error;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, enriched.length) }, () => worker()),
  );

  return {
    activities: enriched,
    partial: stopReason !== null,
  };
}

export async function syncAndLoadActivities(days: number) {
  const { athleteId, accessToken, grantedScopes } = await getValidAccessToken();
  const recentActivities = await getRecentActivities(days);
  const { activities: enrichedActivities } = await enrichActivitiesWithZones(
    recentActivities,
    accessToken,
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

export const __testables = {
  inferFormulaWeightProfile,
  getActivityIntensity,
  calculateTrainingMetrics,
  buildMetricTrend,
  filterActivitiesBySport,
};
