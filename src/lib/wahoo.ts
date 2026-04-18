import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

const WAHOO_API_BASE_URL = "https://api.wahooligan.com";
const WAHOO_OAUTH_URL = `${WAHOO_API_BASE_URL}/oauth/token`;
const TOKEN_REFRESH_WINDOW_MS = 30 * 1000;
const REQUEST_MAX_ATTEMPTS = 3;
const REQUEST_BASE_DELAY_MS = 500;
const WAHOO_ACTIVITY_ID_OFFSET = 4_000_000_000_000_000_000n;

type WahooTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  scope?: string;
};

type WahooUserResponse = {
  id: number;
  first?: string | null;
  last?: string | null;
  email?: string | null;
};

type WahooWorkoutSummary = {
  ascent_accum?: number | string | null;
  cadence_avg?: number | string | null;
  calories_accum?: number | string | null;
  distance_accum?: number | string | null;
  duration_active_accum?: number | string | null;
  duration_total_accum?: number | string | null;
  heart_rate_avg?: number | string | null;
  power_avg?: number | string | null;
  power_bike_np_last?: number | string | null;
  power_bike_tss_last?: number | string | null;
  speed_avg?: number | string | null;
  work_accum?: number | string | null;
};

type WahooWorkout = {
  id: number;
  starts?: string | null;
  minutes?: number | null;
  name?: string | null;
  workout_type_id?: number | null;
  updated_at?: string | null;
  workout_summary?: WahooWorkoutSummary | null;
};

type WahooWorkoutListResponse = {
  workouts: WahooWorkout[];
  total?: number;
  page?: number;
  per_page?: number;
};

type WahooConnectionUpsertInput = {
  token: WahooTokenResponse;
  user: WahooUserResponse;
  scope?: string;
};

type RequestRetryOptions = {
  silentOnExhaustedRetries?: boolean;
};

const refreshInFlightByUser = new Map<string, Promise<{ accessToken: string }>>();

function getWahooOauthConfig() {
  const clientId = process.env.WAHOO_CLIENT_ID;
  const clientSecret = process.env.WAHOO_CLIENT_SECRET;
  const redirectUri = process.env.WAHOO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Wahoo OAuth environment variables.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

export function canStartWahooOauth() {
  return Boolean(
    process.env.WAHOO_CLIENT_ID &&
      process.env.WAHOO_CLIENT_SECRET &&
      process.env.WAHOO_REDIRECT_URI,
  );
}

function parseGrantedScopes(scope: string | null | undefined) {
  return (scope ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getRetryDelayMs(attempt: number, baseDelayMs: number) {
  const exponential = baseDelayMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * Math.max(100, Math.floor(baseDelayMs / 2)));
  return Math.min(30_000, exponential + jitter);
}

async function requestWithRetry(url: string, init: RequestInit, options?: RequestRetryOptions) {
  const method = (init.method ?? "GET").toUpperCase();
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < REQUEST_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) {
        return response;
      }

      const retryableStatus = response.status === 429 || response.status >= 500;
      const isLastAttempt = attempt === REQUEST_MAX_ATTEMPTS - 1;

      if (!retryableStatus || isLastAttempt) {
        return response;
      }

      await sleep(getRetryDelayMs(attempt, REQUEST_BASE_DELAY_MS));
    } catch (error) {
      lastNetworkError = error;
      if (attempt === REQUEST_MAX_ATTEMPTS - 1) {
        break;
      }

      await sleep(getRetryDelayMs(attempt, REQUEST_BASE_DELAY_MS));
    }
  }

  if (!options?.silentOnExhaustedRetries) {
    const details = lastNetworkError instanceof Error ? lastNetworkError.message : "Unknown";
    throw new Error(`Wahoo ${method} request failed after retries: ${details}`);
  }

  return null;
}

function resolveTokenExpiry(expiresIn?: number) {
  const lifetimeSeconds = Number.isFinite(expiresIn) && (expiresIn ?? 0) > 0 ? expiresIn! : 2 * 60 * 60;
  return new Date(Date.now() + lifetimeSeconds * 1000);
}

export async function exchangeCodeForWahooToken(code: string) {
  const config = getWahooOauthConfig();
  const payload = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await requestWithRetry(WAHOO_OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  if (!response) {
    throw new Error("Unable to complete Wahoo OAuth exchange.");
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Wahoo OAuth token exchange failed (${response.status}): ${details || "No response body"}`,
    );
  }

  return (await response.json()) as WahooTokenResponse;
}

async function refreshWahooToken(refreshToken: string) {
  const config = getWahooOauthConfig();
  const payload = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await requestWithRetry(WAHOO_OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  if (!response) {
    throw new Error("Unable to refresh Wahoo token.");
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Wahoo OAuth token refresh failed (${response.status}): ${details || "No response body"}`,
    );
  }

  return (await response.json()) as WahooTokenResponse;
}

export async function fetchAuthenticatedWahooUser(accessToken: string) {
  const response = await requestWithRetry(`${WAHOO_API_BASE_URL}/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response) {
    throw new Error("Unable to load Wahoo user profile.");
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Wahoo user request failed (${response.status}): ${details || "No response body"}`);
  }

  return (await response.json()) as WahooUserResponse;
}

export async function upsertWahooConnection(input: WahooConnectionUpsertInput, userId: string) {
  const displayName = `${input.user.first ?? ""} ${input.user.last ?? ""}`.trim() || null;
  const scope = input.scope ?? input.token.scope;

  return prisma.wahooConnection.upsert({
    where: {
      userId,
    },
    update: {
      wahooUserId: String(input.user.id),
      displayName,
      email: input.user.email ?? null,
      accessToken: encryptToken(input.token.access_token),
      refreshToken: encryptToken(input.token.refresh_token),
      expiresAt: resolveTokenExpiry(input.token.expires_in),
      scope: scope ?? null,
    },
    create: {
      userId,
      wahooUserId: String(input.user.id),
      displayName,
      email: input.user.email ?? null,
      accessToken: encryptToken(input.token.access_token),
      refreshToken: encryptToken(input.token.refresh_token),
      expiresAt: resolveTokenExpiry(input.token.expires_in),
      scope: scope ?? null,
    },
  });
}

export async function disconnectWahooConnection(userId: string) {
  await prisma.wahooConnection.deleteMany({
    where: {
      userId,
    },
  });
}

async function deauthorizeWahooConnection(accessToken: string) {
  const response = await requestWithRetry(`${WAHOO_API_BASE_URL}/v1/permissions`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response) {
    throw new Error("Unable to deauthorize Wahoo connection.");
  }

  if (!response.ok) {
    if ([401, 403, 404].includes(response.status)) {
      // Token is already invalid or permissions are already removed.
      return;
    }

    const details = await response.text();
    throw new Error(
      `Wahoo deauthorize failed (${response.status}): ${details || "No response body"}`,
    );
  }
}

export async function disconnectWahooConnectionWithDeauthorize(userId: string) {
  const existingConnection = await prisma.wahooConnection.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!existingConnection) {
    return;
  }

  const { accessToken } = await getAccessTokenForApiCall(userId);
  await deauthorizeWahooConnection(accessToken);
  await disconnectWahooConnection(userId);
}

async function getCurrentConnection(userId: string) {
  const connection = await prisma.wahooConnection.findUnique({
    where: {
      userId,
    },
  });

  if (!connection) {
    throw new Error("No Wahoo connection found.");
  }

  return connection;
}

async function decryptConnectionTokens(connection: Awaited<ReturnType<typeof getCurrentConnection>>) {
  const accessToken = decryptToken(connection.accessToken);
  const refreshToken = decryptToken(connection.refreshToken);

  if (!accessToken.wasEncrypted || !refreshToken.wasEncrypted) {
    await prisma.wahooConnection.update({
      where: {
        id: connection.id,
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

async function refreshWahooTokenForApiCall(userId: string) {
  const existingRefresh = refreshInFlightByUser.get(userId);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = (async () => {
    const latestConnection = await getCurrentConnection(userId);
    const latestDecrypted = await decryptConnectionTokens(latestConnection);

    if (latestConnection.expiresAt.getTime() > Date.now() + TOKEN_REFRESH_WINDOW_MS) {
      return {
        accessToken: latestDecrypted.accessToken,
      };
    }

    const refreshedToken = await refreshWahooToken(latestDecrypted.refreshToken);
    const refreshedUser = await fetchAuthenticatedWahooUser(refreshedToken.access_token);

    await upsertWahooConnection(
      {
        token: refreshedToken,
        user: refreshedUser,
        scope: refreshedToken.scope ?? latestConnection.scope ?? undefined,
      },
      userId,
    );

    return {
      accessToken: refreshedToken.access_token,
    };
  })();

  refreshInFlightByUser.set(userId, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    refreshInFlightByUser.delete(userId);
  }
}

async function getAccessTokenForApiCall(userId: string) {
  const connection = await getCurrentConnection(userId);
  const decrypted = await decryptConnectionTokens(connection);

  if (connection.expiresAt.getTime() > Date.now() + TOKEN_REFRESH_WINDOW_MS) {
    return {
      accessToken: decrypted.accessToken,
    };
  }

  return refreshWahooTokenForApiCall(userId);
}

export async function fetchWahooApi<T>(
  path: string,
  options: {
    userId: string;
    method?: string;
    body?: BodyInit | null;
    headers?: Record<string, string>;
    allowUnauthorizedRetry?: boolean;
    silentUnauthorized?: boolean;
  },
) {
  const tokenInfo = await getAccessTokenForApiCall(options.userId);
  const response = await requestWithRetry(
    `${WAHOO_API_BASE_URL}${path}`,
    {
      method: options.method,
      body: options.body,
      headers: {
        Authorization: `Bearer ${tokenInfo.accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      cache: "no-store",
    },
    {
      silentOnExhaustedRetries: options.silentUnauthorized,
    },
  );

  if (!response) {
    return null;
  }

  if (response.status === 401 && options.allowUnauthorizedRetry !== false) {
    const refreshed = await refreshWahooTokenForApiCall(options.userId);
    return fetchWahooApi<T>(path, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        Authorization: `Bearer ${refreshed.accessToken}`,
      },
      allowUnauthorizedRetry: false,
      // Let the recursive call manage authorization header shape.
    });
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Wahoo API request failed (${response.status}): ${details || "No response body"}`);
  }

  return (await response.json()) as T;
}

export async function getCurrentWahooProfile(userId: string) {
  try {
    const user = await fetchWahooApi<WahooUserResponse>("/v1/user", {
      userId,
      allowUnauthorizedRetry: false,
      silentUnauthorized: true,
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      displayName: `${user.first ?? ""} ${user.last ?? ""}`.trim() || null,
      email: user.email ?? null,
    };
  } catch {
    return null;
  }
}

export async function getWahooConnectionStatus(userId: string) {
  try {
    const connection = await prisma.wahooConnection.findUnique({
      where: {
        userId,
      },
    });

    const grantedScopes = parseGrantedScopes(connection?.scope);

    return {
      connected: Boolean(connection),
      label: connection?.displayName ?? connection?.email ?? connection?.wahooUserId ?? "Unbekannt",
      wahooUserId: connection?.wahooUserId ?? null,
      expiresAt: connection?.expiresAt.toISOString() ?? null,
      grantedScopes,
      canStartOauth: canStartWahooOauth(),
    };
  } catch {
    return {
      connected: false,
      label: "Unbekannt",
      wahooUserId: null,
      expiresAt: null,
      grantedScopes: [],
      canStartOauth: canStartWahooOauth(),
    };
  }
}

function parseNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseWorkoutStartDate(workout: WahooWorkout) {
  const starts = workout.starts ? new Date(workout.starts) : null;
  if (starts && !Number.isNaN(starts.getTime())) {
    return starts;
  }

  const updatedAt = workout.updated_at ? new Date(workout.updated_at) : null;
  if (updatedAt && !Number.isNaN(updatedAt.getTime())) {
    return updatedAt;
  }

  return new Date();
}

function mapWorkoutType(workoutTypeId: number | null | undefined) {
  const typeId = workoutTypeId ?? -1;

  if (typeId === 0 || (typeId >= 11 && typeId <= 17)) {
    return {
      type: "Ride",
      classification: "Cycling",
      analysisLabel: "Radeinheit",
    };
  }

  if ([1, 3, 4, 5].includes(typeId)) {
    return {
      type: "Run",
      classification: "Running",
      analysisLabel: "Laufeinheit",
    };
  }

  if (typeId >= 6 && typeId <= 10) {
    return {
      type: "Walk",
      classification: "Walking",
      analysisLabel: "Walking/Hiking",
    };
  }

  return {
    type: "Workout",
    classification: "Workout",
    analysisLabel: "Wahoo Workout",
  };
}

function toInternalWahooActivityId(workoutId: number) {
  return WAHOO_ACTIVITY_ID_OFFSET + BigInt(Math.max(0, Math.trunc(workoutId)));
}

function toRawJson(entry: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(entry)) as Prisma.InputJsonValue;
}

function normalizeWahooWorkout(workout: WahooWorkout, athleteId: string) {
  const summary = workout.workout_summary ?? {};
  const mappedType = mapWorkoutType(workout.workout_type_id);
  const startDate = parseWorkoutStartDate(workout);
  const distanceMeters = Math.max(0, parseNumeric(summary.distance_accum) ?? 0);
  const movingTimeSeconds = Math.max(
    0,
    parseNumeric(summary.duration_active_accum) ??
      (parseNumeric(workout.minutes) !== null ? Math.round((parseNumeric(workout.minutes) ?? 0) * 60) : 0),
  );
  const elapsedTimeSeconds = Math.max(
    movingTimeSeconds,
    parseNumeric(summary.duration_total_accum) ?? movingTimeSeconds,
  );
  const averageSpeed =
    parseNumeric(summary.speed_avg) ??
    (movingTimeSeconds > 0 ? distanceMeters / movingTimeSeconds : 0);
  const np = parseNumeric(summary.power_bike_np_last);
  const powerAvg = parseNumeric(summary.power_avg);
  const workJoules = parseNumeric(summary.work_accum);
  const cadenceAvg = parseNumeric(summary.cadence_avg);
  const tss = parseNumeric(summary.power_bike_tss_last);

  return {
    providerActivityId: String(workout.id),
    id: toInternalWahooActivityId(workout.id),
    athleteId,
    name: (workout.name ?? "").trim() || "Wahoo Workout",
    type: mappedType.type,
    classification: mappedType.classification,
    analysisLabel: mappedType.analysisLabel,
    startDate,
    hasDistanceData: distanceMeters > 0,
    distanceMeters,
    movingTimeSeconds,
    elapsedTimeSeconds,
    elevationGainMeters: Math.max(0, parseNumeric(summary.ascent_accum) ?? 0),
    averageSpeed: Math.max(0, averageSpeed),
    maxSpeed: Math.max(0, averageSpeed),
    averageHeartrate: parseNumeric(summary.heart_rate_avg),
    maxHeartrate: null as number | null,
    averageWatts: powerAvg,
    weightedAverageWatts: np,
    maxWatts: null as number | null,
    kilojoules: workJoules !== null ? workJoules / 1000 : null,
    deviceWatts: powerAvg !== null || np !== null,
    calories: parseNumeric(summary.calories_accum),
    providerMetrics: {
      tss,
      intensityFactor: null,
      normalizedPowerWatts: np,
      variabilityIndex:
        np !== null && powerAvg !== null && powerAvg > 0 ? np / powerAvg : null,
      averageCadence: cadenceAvg,
      maxCadence: null,
      averageTempC: null,
      minTempC: null,
      maxTempC: null,
    },
  };
}

async function fetchWahooWorkoutsPaginated({
  userId,
  pageSize = 100,
  maxPages = 200,
  afterDate,
}: {
  userId: string;
  pageSize?: number;
  maxPages?: number;
  afterDate?: Date;
}) {
  const workouts: WahooWorkout[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const chunk = await fetchWahooApi<WahooWorkoutListResponse>(
      `/v1/workouts?page=${page}&per_page=${pageSize}`,
      {
        userId,
        allowUnauthorizedRetry: true,
      },
    );

    const pageWorkouts = chunk?.workouts ?? [];
    if (pageWorkouts.length === 0) {
      break;
    }

    let shouldStop = false;
    for (const workout of pageWorkouts) {
      if (!afterDate) {
        workouts.push(workout);
        continue;
      }

      const startsAt = parseWorkoutStartDate(workout);
      if (startsAt > afterDate) {
        workouts.push(workout);
      } else {
        shouldStop = true;
      }
    }

    if (shouldStop || pageWorkouts.length < pageSize) {
      break;
    }
  }

  return workouts;
}

export async function syncWahooWorkoutsForUser(userId: string) {
  const connection = await getCurrentConnection(userId);
  const athleteId = connection.wahooUserId;

  const latestStored = await prisma.activity.findFirst({
    where: {
      userId,
      provider: "wahoo",
      athleteId,
    },
    orderBy: {
      startDate: "desc",
    },
    select: {
      startDate: true,
    },
  });

  const fetchedWorkouts = await fetchWahooWorkoutsPaginated({
    userId,
    afterDate: latestStored?.startDate,
  });

  for (const workout of fetchedWorkouts) {
    const normalized = normalizeWahooWorkout(workout, athleteId);
    await prisma.activity.upsert({
      where: {
        userId_provider_providerActivityId: {
          userId,
          provider: "wahoo",
          providerActivityId: normalized.providerActivityId,
        },
      },
      update: {
        userId,
        provider: "wahoo",
        providerActivityId: normalized.providerActivityId,
        athleteId: normalized.athleteId,
        name: normalized.name,
        type: normalized.type,
        distance: normalized.distanceMeters,
        movingTime: normalized.movingTimeSeconds,
        elapsedTime: normalized.elapsedTimeSeconds,
        timezone: null,
        rawJson: toRawJson(workout),
        classification: normalized.classification,
        analysisLabel: normalized.analysisLabel,
        startDate: normalized.startDate,
        hasDistanceData: normalized.hasDistanceData,
        distanceMeters: normalized.distanceMeters,
        movingTimeSeconds: normalized.movingTimeSeconds,
        elapsedTimeSeconds: normalized.elapsedTimeSeconds,
        elevationGainMeters: normalized.elevationGainMeters,
        averageSpeed: normalized.averageSpeed,
        maxSpeed: normalized.maxSpeed,
        averageHeartrate: normalized.averageHeartrate,
        maxHeartrate: normalized.maxHeartrate,
        averageWatts: normalized.averageWatts,
        weightedAverageWatts:
          normalized.weightedAverageWatts !== null
            ? Math.round(normalized.weightedAverageWatts)
            : null,
        maxWatts: normalized.maxWatts,
        kilojoules: normalized.kilojoules,
        deviceWatts: normalized.deviceWatts,
        calories: normalized.calories,
        description: null,
        zonesJson: "[]",
        providerMetricsJson: JSON.stringify(normalized.providerMetrics),
      },
      create: {
        id: normalized.id,
        userId,
        provider: "wahoo",
        providerActivityId: normalized.providerActivityId,
        athleteId: normalized.athleteId,
        name: normalized.name,
        type: normalized.type,
        distance: normalized.distanceMeters,
        movingTime: normalized.movingTimeSeconds,
        elapsedTime: normalized.elapsedTimeSeconds,
        timezone: null,
        rawJson: toRawJson(workout),
        classification: normalized.classification,
        analysisLabel: normalized.analysisLabel,
        startDate: normalized.startDate,
        hasDistanceData: normalized.hasDistanceData,
        distanceMeters: normalized.distanceMeters,
        movingTimeSeconds: normalized.movingTimeSeconds,
        elapsedTimeSeconds: normalized.elapsedTimeSeconds,
        elevationGainMeters: normalized.elevationGainMeters,
        averageSpeed: normalized.averageSpeed,
        maxSpeed: normalized.maxSpeed,
        averageHeartrate: normalized.averageHeartrate,
        maxHeartrate: normalized.maxHeartrate,
        averageWatts: normalized.averageWatts,
        weightedAverageWatts:
          normalized.weightedAverageWatts !== null
            ? Math.round(normalized.weightedAverageWatts)
            : null,
        maxWatts: normalized.maxWatts,
        kilojoules: normalized.kilojoules,
        deviceWatts: normalized.deviceWatts,
        calories: normalized.calories,
        description: null,
        zonesJson: "[]",
        providerMetricsJson: JSON.stringify(normalized.providerMetrics),
      },
    });
  }

  const totalInDb = await prisma.activity.count({
    where: {
      userId,
      provider: "wahoo",
      athleteId,
    },
  });

  return {
    mode: latestStored ? ("incremental" as const) : ("initial" as const),
    fetchedCount: fetchedWorkouts.length,
    upsertedCount: fetchedWorkouts.length,
    totalInDb,
    partial: false,
    partialReason: null,
  };
}
