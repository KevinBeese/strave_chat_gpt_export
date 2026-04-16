const START_TIME_TOLERANCE_SECONDS = 10 * 60;
const START_TIME_OFFSET_TOLERANCE_SECONDS = 10 * 60;
const TIMEZONE_OFFSET_HOURS = [1, 2, 3];
const MOVING_TIME_TOLERANCE_SECONDS = 3 * 60;
const DISTANCE_TOLERANCE_METERS = 300;
const DISTANCE_TOLERANCE_PERCENT = 0.03;
const MAX_GROUP_WINDOW_SECONDS = 4 * 60 * 60;

export type MergeableActivity = {
  id: number | bigint;
  provider: string;
  startDate: Date;
  type: string;
  name: string;
  distanceMeters: number;
  movingTimeSeconds: number;
};

export type MergedActivityMeta = {
  providers: string[];
  mergedProviderLabel: string;
  duplicateIds: number[];
};

function normalizeType(type: string) {
  return type.trim().toLowerCase();
}

function toNumericId(id: number | bigint) {
  return typeof id === "bigint" ? Number(id) : id;
}

function getDistanceToleranceMeters(a: MergeableActivity, b: MergeableActivity) {
  const maxDistance = Math.max(a.distanceMeters, b.distanceMeters, 1);
  return Math.max(DISTANCE_TOLERANCE_METERS, maxDistance * DISTANCE_TOLERANCE_PERCENT);
}

function hasCloseStartTime(a: MergeableActivity, b: MergeableActivity) {
  const diffSeconds = Math.abs((a.startDate.getTime() - b.startDate.getTime()) / 1000);

  if (diffSeconds <= START_TIME_TOLERANCE_SECONDS) {
    return true;
  }

  return TIMEZONE_OFFSET_HOURS.some(
    (hours) =>
      Math.abs(diffSeconds - hours * 3600) <= START_TIME_OFFSET_TOLERANCE_SECONDS,
  );
}

function arePotentialDuplicates(a: MergeableActivity, b: MergeableActivity) {
  if (a.provider === b.provider) {
    return false;
  }

  if (normalizeType(a.type) !== normalizeType(b.type)) {
    return false;
  }

  const durationDiff = Math.abs(a.movingTimeSeconds - b.movingTimeSeconds);
  if (durationDiff > MOVING_TIME_TOLERANCE_SECONDS) {
    return false;
  }

  const distanceDiff = Math.abs(a.distanceMeters - b.distanceMeters);
  if (distanceDiff > getDistanceToleranceMeters(a, b)) {
    return false;
  }

  return hasCloseStartTime(a, b);
}

function pickPrimaryActivity<T extends MergeableActivity>(activities: T[]) {
  const score = (activity: T) => {
    let value = 0;

    for (const key of Object.keys(activity) as Array<keyof T>) {
      const field = activity[key];
      if (field !== null && field !== undefined) {
        value += 1;
      }
    }

    return value;
  };

  return [...activities].sort((a, b) => score(b) - score(a))[0];
}

function mergeValueIfMissing<T extends Record<string, unknown>>(
  target: T,
  source: T,
  key: keyof T,
) {
  const current = target[key];

  if (current === null || current === undefined || current === "") {
    target[key] = source[key];
  }
}

function mergeActivities<T extends MergeableActivity>(group: T[]) {
  const primary = { ...pickPrimaryActivity(group) } as T;

  for (const activity of group) {
    for (const key of Object.keys(primary) as Array<keyof T>) {
      mergeValueIfMissing(primary as T & Record<string, unknown>, activity as T & Record<string, unknown>, key);
    }
  }

  const providers = [...new Set(group.map((activity) => activity.provider))].sort();
  const duplicateIds = group.map((activity) => toNumericId(activity.id));

  return {
    ...primary,
    providers,
    mergedProviderLabel: providers.join(" + "),
    duplicateIds,
  } satisfies T & MergedActivityMeta;
}

export function dedupeActivitiesAcrossProviders<T extends MergeableActivity>(activities: T[]) {
  if (activities.length <= 1) {
    return activities.map((activity) => ({
      ...activity,
      providers: [activity.provider],
      mergedProviderLabel: activity.provider,
      duplicateIds: [toNumericId(activity.id)],
    }));
  }

  const sorted = [...activities].sort(
    (a, b) => b.startDate.getTime() - a.startDate.getTime(),
  );

  const visited = new Set<number>();
  const groups: T[][] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    if (visited.has(index)) {
      continue;
    }

    visited.add(index);
    const group = [sorted[index]];

    for (let candidateIndex = index + 1; candidateIndex < sorted.length; candidateIndex += 1) {
      if (visited.has(candidateIndex)) {
        continue;
      }

      const candidate = sorted[candidateIndex];
      const timeDeltaSeconds =
        Math.abs((sorted[index].startDate.getTime() - candidate.startDate.getTime()) / 1000);

      if (timeDeltaSeconds > MAX_GROUP_WINDOW_SECONDS) {
        break;
      }

      if (group.some((entry) => arePotentialDuplicates(entry, candidate))) {
        visited.add(candidateIndex);
        group.push(candidate);
      }
    }

    groups.push(group);
  }

  return groups
    .map((group) => mergeActivities(group))
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
}
