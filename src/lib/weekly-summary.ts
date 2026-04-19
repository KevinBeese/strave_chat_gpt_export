import { dedupeActivitiesAcrossProviders } from "@/lib/activity-dedupe";
import { prisma } from "@/lib/prisma";
import type { WeeklySummaryResponse } from "@/types/weekly-summary";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FALLBACK_MAX_HR = 190;

type WeeklyActivityRow = {
  id: bigint;
  provider: string;
  name: string;
  type: string;
  startDate: Date;
  distanceMeters: number;
  movingTimeSeconds: number;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  elevationGainMeters: number;
};

type DedupedWeeklyActivity = ReturnType<
  typeof dedupeActivitiesAcrossProviders<WeeklyActivityRow>
>[number];

function roundTo(value: number, precision = 2) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function toSafeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function getWeekStartUtcFromDate(reference: Date) {
  const dayStart = startOfUtcDay(reference);
  const weekDay = dayStart.getUTCDay();
  const offsetToMonday = (weekDay + 6) % 7;
  return addDays(dayStart, -offsetToMonday);
}

function parseWeekStartParam(weekStart?: string | null) {
  if (!weekStart) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return null;
  }

  const parsed = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return startOfUtcDay(parsed);
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date) {
  return date.toISOString();
}

function buildHighlights(activities: DedupedWeeklyActivity[]) {
  if (activities.length === 0) {
    return {
      longest_activity: null,
      hardest_activity: null,
      top_activity_type: {
        type: null,
        count: 0,
      },
    } satisfies WeeklySummaryResponse["highlights"];
  }

  const byType = new Map<string, number>();
  for (const activity of activities) {
    byType.set(activity.type, (byType.get(activity.type) ?? 0) + 1);
  }

  const topTypeEntry = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];

  const longestActivity = [...activities].sort((a, b) => {
    const distanceDiff = toSafeNumber(b.distanceMeters) - toSafeNumber(a.distanceMeters);
    if (distanceDiff !== 0) {
      return distanceDiff;
    }

    return toSafeNumber(b.movingTimeSeconds) - toSafeNumber(a.movingTimeSeconds);
  })[0];

  const maxKnownHr = Math.max(
    DEFAULT_FALLBACK_MAX_HR,
    ...activities.map((activity) => toSafeNumber(activity.maxHeartrate)),
  );

  const hardestCandidates = activities
    .filter((activity) => toSafeNumber(activity.averageHeartrate) > 0)
    .map((activity) => {
      const movingTimeMin = toSafeNumber(activity.movingTimeSeconds) / 60;
      const relativeIntensity = Math.min(toSafeNumber(activity.averageHeartrate) / maxKnownHr, 1.5);
      return {
        activity,
        score: movingTimeMin * relativeIntensity,
      };
    })
    .sort((a, b) => b.score - a.score);

  const hardestByHr = hardestCandidates[0];
  const fallbackHardest = [...activities].sort(
    (a, b) => toSafeNumber(b.movingTimeSeconds) - toSafeNumber(a.movingTimeSeconds),
  )[0];
  const hardestActivity = hardestByHr?.activity ?? fallbackHardest;

  const toActivityHighlight = (activity: DedupedWeeklyActivity) => ({
    id: activity.id.toString(),
    name: activity.name,
    type: activity.type,
    date: formatDateTime(activity.startDate),
    distance_km: roundTo(toSafeNumber(activity.distanceMeters) / 1000, 2),
    moving_time_min: roundTo(toSafeNumber(activity.movingTimeSeconds) / 60, 0),
    avg_hr: activity.averageHeartrate,
    elevation_gain_m: activity.elevationGainMeters ?? null,
  });

  return {
    longest_activity: toActivityHighlight(longestActivity),
    hardest_activity: {
      ...toActivityHighlight(hardestActivity),
      hardness_score: roundTo(
        hardestByHr?.score ?? toSafeNumber(hardestActivity.movingTimeSeconds) / 60,
        1,
      ),
      hardness_reason: hardestByHr
        ? "Hohe relative Herzfrequenz bei substanzieller Dauer."
        : "Keine Herzfrequenzdaten vorhanden, daher nach Dauer bewertet.",
    },
    top_activity_type: {
      type: topTypeEntry?.[0] ?? null,
      count: topTypeEntry?.[1] ?? 0,
    },
  } satisfies WeeklySummaryResponse["highlights"];
}

function formatPercentDelta(current: number, previous: number) {
  if (previous <= 0) {
    return null;
  }

  return roundTo(((current - previous) / previous) * 100, 2);
}

function formatDeltaText(value: number, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })}${suffix}`;
}

function toWeeklySummaryText(summary: WeeklySummaryResponse) {
  const activities = summary.metrics.total_activities;
  if (activities <= 0) {
    return "In dieser Woche wurden noch keine Aktivitaeten synchronisiert.";
  }

  const topType = summary.highlights.top_activity_type.type ?? "Unbekannt";
  const hardestName = summary.highlights.hardest_activity?.name ?? "n/a";
  const distancePct = summary.comparison.vs_previous_week.distance_delta_pct;
  const timePct = summary.comparison.vs_previous_week.moving_time_delta_pct;
  const distancePctText =
    distancePct === null ? "n/a" : formatDeltaText(distancePct, " %");
  const timePctText = timePct === null ? "n/a" : formatDeltaText(timePct, " %");

  return [
    `Du hattest ${activities} Einheiten mit ${summary.metrics.total_distance_km.toLocaleString("de-DE")} km und ${summary.metrics.total_moving_time_h.toLocaleString("de-DE")} Stunden Gesamtzeit.`,
    `${topType} war mit ${summary.highlights.top_activity_type.count} Sessions dein dominanter Aktivitaetstyp.`,
    `Die haerteste Einheit war "${hardestName}".`,
    `Im Vergleich zur Vorwoche sind Distanz (${distancePctText}) und Zeit (${timePctText}) verlaufen.`,
    "Insgesamt zeigt die Woche eine stabile Trainingskontinuitaet.",
  ].join(" ");
}

function buildWeeklyMetrics(activities: DedupedWeeklyActivity[]) {
  const totalActivities = activities.length;
  const totalDistanceMeters = activities.reduce(
    (sum, activity) => sum + toSafeNumber(activity.distanceMeters),
    0,
  );
  const totalMovingTimeSeconds = activities.reduce(
    (sum, activity) => sum + toSafeNumber(activity.movingTimeSeconds),
    0,
  );
  const totalElevationGainMeters = activities.reduce(
    (sum, activity) => sum + toSafeNumber(activity.elevationGainMeters),
    0,
  );

  const byTypeMap = new Map<string, { count: number; distanceMeters: number; movingTimeSeconds: number }>();
  for (const activity of activities) {
    const current = byTypeMap.get(activity.type) ?? {
      count: 0,
      distanceMeters: 0,
      movingTimeSeconds: 0,
    };
    current.count += 1;
    current.distanceMeters += toSafeNumber(activity.distanceMeters);
    current.movingTimeSeconds += toSafeNumber(activity.movingTimeSeconds);
    byTypeMap.set(activity.type, current);
  }

  const activitiesByType = [...byTypeMap.entries()]
    .map(([type, value]) => ({
      type,
      count: value.count,
      distance_km: roundTo(value.distanceMeters / 1000, 2),
      moving_time_h: roundTo(value.movingTimeSeconds / 3600, 2),
    }))
    .sort((a, b) => b.count - a.count || b.distance_km - a.distance_km);

  return {
    total_activities: totalActivities,
    total_distance_km: roundTo(totalDistanceMeters / 1000, 2),
    total_moving_time_h: roundTo(totalMovingTimeSeconds / 3600, 2),
    total_elevation_gain_m: roundTo(totalElevationGainMeters, 0),
    activities_by_type: activitiesByType,
  };
}

export function buildWeeklySummaryFromActivities(
  currentWeekActivities: DedupedWeeklyActivity[],
  previousWeekActivities: DedupedWeeklyActivity[],
  weekStart: Date,
): WeeklySummaryResponse {
  const metrics = buildWeeklyMetrics(currentWeekActivities);
  const previousMetrics = buildWeeklyMetrics(previousWeekActivities);
  const distanceDelta = roundTo(
    metrics.total_distance_km - previousMetrics.total_distance_km,
    2,
  );
  const movingTimeDelta = roundTo(
    metrics.total_moving_time_h - previousMetrics.total_moving_time_h,
    2,
  );

  const summary: WeeklySummaryResponse = {
    week_start: formatDateOnly(weekStart),
    week_end: formatDateOnly(addDays(weekStart, 6)),
    generated_at: new Date().toISOString(),
    metrics,
    comparison: {
      vs_previous_week: {
        activities_delta_abs: metrics.total_activities - previousMetrics.total_activities,
        distance_delta_km_abs: distanceDelta,
        distance_delta_pct: formatPercentDelta(
          metrics.total_distance_km,
          previousMetrics.total_distance_km,
        ),
        moving_time_delta_h_abs: movingTimeDelta,
        moving_time_delta_pct: formatPercentDelta(
          metrics.total_moving_time_h,
          previousMetrics.total_moving_time_h,
        ),
      },
    },
    highlights: buildHighlights(currentWeekActivities),
    summary_text: "",
  };

  summary.summary_text = toWeeklySummaryText(summary);
  return summary;
}

function buildWeekWindows(weekStart: Date) {
  const currentWeekStart = startOfUtcDay(weekStart);
  const currentWeekEndExclusive = addDays(currentWeekStart, 7);
  const previousWeekStart = addDays(currentWeekStart, -7);
  const previousWeekEndExclusive = currentWeekStart;

  return {
    currentWeekStart,
    currentWeekEndExclusive,
    previousWeekStart,
    previousWeekEndExclusive,
  };
}

export async function getWeeklySummary(
  userId: string,
  weekStartParam?: string | null,
) {
  const parsedWeekStart = parseWeekStartParam(weekStartParam);
  const weekStart = parsedWeekStart ?? getWeekStartUtcFromDate(new Date());
  const windows = buildWeekWindows(weekStart);

  const rawActivities = await prisma.activity.findMany({
    where: {
      userId,
      startDate: {
        gte: windows.previousWeekStart,
        lt: windows.currentWeekEndExclusive,
      },
    },
    orderBy: {
      startDate: "desc",
    },
    select: {
      id: true,
      provider: true,
      name: true,
      type: true,
      startDate: true,
      distanceMeters: true,
      movingTimeSeconds: true,
      averageHeartrate: true,
      maxHeartrate: true,
      elevationGainMeters: true,
    },
  });

  const dedupedActivities = dedupeActivitiesAcrossProviders(rawActivities);
  const currentWeekActivities = dedupedActivities.filter(
    (activity) =>
      activity.startDate >= windows.currentWeekStart &&
      activity.startDate < windows.currentWeekEndExclusive,
  );
  const previousWeekActivities = dedupedActivities.filter(
    (activity) =>
      activity.startDate >= windows.previousWeekStart &&
      activity.startDate < windows.previousWeekEndExclusive,
  );

  return buildWeeklySummaryFromActivities(
    currentWeekActivities,
    previousWeekActivities,
    windows.currentWeekStart,
  );
}

export function renderWeeklySummaryMarkdown(summary: WeeklySummaryResponse) {
  const lines: string[] = [];
  lines.push(`# Wochenzusammenfassung (${summary.week_start} bis ${summary.week_end})`);
  lines.push("");
  lines.push(`Generiert am: ${summary.generated_at}`);
  lines.push("");
  lines.push("## Kennzahlen");
  lines.push(`- Aktivitaeten: ${summary.metrics.total_activities}`);
  lines.push(`- Distanz: ${summary.metrics.total_distance_km} km`);
  lines.push(`- Zeit: ${summary.metrics.total_moving_time_h} h`);
  lines.push(`- Hoehenmeter: ${summary.metrics.total_elevation_gain_m} m`);
  lines.push("");
  lines.push("## Highlights");
  lines.push(
    `- Top Aktivitaetstyp: ${summary.highlights.top_activity_type.type ?? "n/a"} (${summary.highlights.top_activity_type.count})`,
  );
  lines.push(
    `- Laengste Einheit: ${summary.highlights.longest_activity?.name ?? "n/a"} (${summary.highlights.longest_activity?.distance_km ?? 0} km)`,
  );
  lines.push(
    `- Haerteste Einheit: ${summary.highlights.hardest_activity?.name ?? "n/a"} (Score ${summary.highlights.hardest_activity?.hardness_score ?? 0})`,
  );
  lines.push("");
  lines.push("## Vergleich zur Vorwoche");
  lines.push(
    `- Einheiten Delta: ${summary.comparison.vs_previous_week.activities_delta_abs}`,
  );
  lines.push(
    `- Distanz Delta: ${summary.comparison.vs_previous_week.distance_delta_km_abs} km (${summary.comparison.vs_previous_week.distance_delta_pct ?? "n/a"} %)`,
  );
  lines.push(
    `- Zeit Delta: ${summary.comparison.vs_previous_week.moving_time_delta_h_abs} h (${summary.comparison.vs_previous_week.moving_time_delta_pct ?? "n/a"} %)`,
  );
  lines.push("");
  lines.push("## Zusammenfassung");
  lines.push(summary.summary_text);
  lines.push("");
  lines.push("## Aktivitaeten nach Typ");

  if (summary.metrics.activities_by_type.length === 0) {
    lines.push("- Keine Aktivitaeten in dieser Woche.");
  } else {
    for (const entry of summary.metrics.activities_by_type) {
      lines.push(
        `- ${entry.type}: ${entry.count} Einheiten, ${entry.distance_km} km, ${entry.moving_time_h} h`,
      );
    }
  }

  return lines.join("\n");
}

export const __testables = {
  getWeekStartUtcFromDate,
  parseWeekStartParam,
  buildWeeklyMetrics,
  buildHighlights,
  toWeeklySummaryText,
};
