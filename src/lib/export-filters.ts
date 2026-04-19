import type { NormalizedActivity } from "@/types/export";

export type IntensityBucket = "easy" | "moderate" | "hard";

export type ExportFilters = {
  dateFrom: string | null;
  dateTo: string | null;
  activityType: string | null;
  intensityBucket: IntensityBucket | null;
};

const DEFAULT_MAX_HR = 190;

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDateOnly(value: string | null) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return startOfUtcDay(parsed);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function parseExportFilters(params: URLSearchParams): ExportFilters {
  const dateFrom = params.get("date_from");
  const dateTo = params.get("date_to");
  const activityType = params.get("activity_type");
  const intensityBucket = params.get("intensity_bucket");

  const normalizedIntensity =
    intensityBucket === "easy" || intensityBucket === "moderate" || intensityBucket === "hard"
      ? intensityBucket
      : null;

  return {
    dateFrom: parseDateOnly(dateFrom)?.toISOString().slice(0, 10) ?? null,
    dateTo: parseDateOnly(dateTo)?.toISOString().slice(0, 10) ?? null,
    activityType: activityType?.trim() ? activityType.trim() : null,
    intensityBucket: normalizedIntensity,
  };
}

export function resolveDaysForDateRange(baseDays: number, filters: ExportFilters) {
  if (!filters.dateFrom && !filters.dateTo) {
    return baseDays;
  }

  const today = startOfUtcDay(new Date());
  const dateTo = parseDateOnly(filters.dateTo) ?? today;
  const dateFrom = parseDateOnly(filters.dateFrom) ?? addDays(dateTo, -(baseDays - 1));

  const newest = dateTo > today ? today : dateTo;
  const oldest = dateFrom < today ? dateFrom : today;
  const diffDays = Math.ceil((today.getTime() - oldest.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  return Math.max(baseDays, diffDays, 1);
}

function getActivityIntensityScore(activity: NormalizedActivity) {
  const resolvedIntensity = activity.resolvedMetrics.intensityPercent.value;
  if (resolvedIntensity !== null && Number.isFinite(resolvedIntensity)) {
    return clamp(resolvedIntensity / 100, 0, 1);
  }

  if (activity.averageHeartrate) {
    const denominator = Math.max(activity.maxHeartrate ?? 0, DEFAULT_MAX_HR);
    return clamp(activity.averageHeartrate / denominator, 0, 1);
  }

  if (activity.averageWatts && activity.maxWatts && activity.maxWatts > 0) {
    return clamp(activity.averageWatts / activity.maxWatts, 0, 1);
  }

  return 0.45;
}

function toIntensityBucket(score: number): IntensityBucket {
  if (score < 0.55) {
    return "easy";
  }

  if (score < 0.75) {
    return "moderate";
  }

  return "hard";
}

export function filterActivitiesForExport(
  activities: NormalizedActivity[],
  filters: ExportFilters,
) {
  const fromDate = parseDateOnly(filters.dateFrom);
  const toDate = parseDateOnly(filters.dateTo);
  const toDateExclusive = toDate ? addDays(toDate, 1) : null;
  const normalizedType = filters.activityType?.toLowerCase() ?? null;

  return activities.filter((activity) => {
    const start = new Date(activity.startDate);

    if (fromDate && start < fromDate) {
      return false;
    }

    if (toDateExclusive && start >= toDateExclusive) {
      return false;
    }

    if (normalizedType && activity.type.toLowerCase() !== normalizedType) {
      return false;
    }

    if (filters.intensityBucket) {
      const bucket = toIntensityBucket(getActivityIntensityScore(activity));
      if (bucket !== filters.intensityBucket) {
        return false;
      }
    }

    return true;
  });
}
