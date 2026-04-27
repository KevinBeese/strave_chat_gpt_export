import { dedupeActivitiesAcrossProviders } from "@/lib/activity-dedupe";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

function getSinceDate(days: number) {
  return new Date(Date.now() - days * DAY_MS);
}

function toFiniteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export type DashboardSummary = {
  totalActivities: number;
  totalDistanceMeters: number;
  totalMovingTimeSeconds: number;
  lastActivityDate: string | null;
  last7Days: {
    activities: number;
    distanceMeters: number;
    movingTimeSeconds: number;
  };
  last30Days: {
    activities: number;
    distanceMeters: number;
    movingTimeSeconds: number;
  };
  sportBreakdown: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  distanceByPrimarySport: {
    rideMeters: number;
    runMeters: number;
    swimMeters: number;
  };
  recentActivities: Array<{
    id: number;
    provider: string;
    providers: string[];
    name: string;
    type: string;
    startDate: string;
    distanceMeters: number;
    movingTimeSeconds: number;
  }>;
};

type DashboardActivityRow = {
  id: bigint;
  provider: string;
  name: string;
  type: string;
  startDate: Date;
  distanceMeters: number;
  movingTimeSeconds: number;
};

type DedupedDashboardActivity =
  ReturnType<typeof dedupeActivitiesAcrossProviders<DashboardActivityRow>>[number];

function summarizeWindow(
  activities: DedupedDashboardActivity[],
  since: Date,
) {
  const filtered = activities.filter((activity) => activity.startDate >= since);

  return {
    activities: filtered.length,
    distanceMeters: filtered.reduce((sum, activity) => sum + toFiniteNumber(activity.distanceMeters), 0),
    movingTimeSeconds: filtered.reduce(
      (sum, activity) => sum + Math.max(0, activity.movingTimeSeconds),
      0,
    ),
  };
}

function getPrimarySportType(type: string) {
  const normalizedType = type.toLowerCase();

  if (normalizedType.includes("ride") || normalizedType.includes("cycling")) {
    return "ride" as const;
  }

  if (normalizedType.includes("run") || normalizedType.includes("walk")) {
    return "run" as const;
  }

  if (normalizedType.includes("swim")) {
    return "swim" as const;
  }

  return null;
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const since7Days = getSinceDate(7);
  const since30Days = getSinceDate(30);

  const activities = await prisma.activity.findMany({
    where: { userId },
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
    },
  });

  const deduped = dedupeActivitiesAcrossProviders(activities);
  const totalActivities = deduped.length;
  const totalDistanceMeters = deduped.reduce(
    (sum, activity) => sum + toFiniteNumber(activity.distanceMeters),
    0,
  );
  const totalMovingTimeSeconds = deduped.reduce(
    (sum, activity) => sum + Math.max(0, activity.movingTimeSeconds),
    0,
  );

  const groupedTypesMap = new Map<string, number>();
  for (const activity of deduped) {
    groupedTypesMap.set(activity.type, (groupedTypesMap.get(activity.type) ?? 0) + 1);
  }

  const sportBreakdown = [...groupedTypesMap.entries()]
    .map(([type, count]) => ({
      type,
      count,
      percentage: totalActivities > 0 ? (count / totalActivities) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const distanceByPrimarySport = deduped.reduce(
    (totals, activity) => {
      const primarySportType = getPrimarySportType(activity.type);
      const distanceMeters = toFiniteNumber(activity.distanceMeters);

      if (primarySportType === "ride") {
        totals.rideMeters += distanceMeters;
      } else if (primarySportType === "run") {
        totals.runMeters += distanceMeters;
      } else if (primarySportType === "swim") {
        totals.swimMeters += distanceMeters;
      }

      return totals;
    },
    {
      rideMeters: 0,
      runMeters: 0,
      swimMeters: 0,
    },
  );

  return {
    totalActivities,
    totalDistanceMeters,
    totalMovingTimeSeconds,
    lastActivityDate: deduped[0]?.startDate.toISOString() ?? null,
    last7Days: summarizeWindow(deduped, since7Days),
    last30Days: summarizeWindow(deduped, since30Days),
    sportBreakdown,
    distanceByPrimarySport,
    recentActivities: deduped.slice(0, 10).map((activity) => ({
      id: Number(activity.id),
      provider: activity.mergedProviderLabel,
      providers: activity.providers,
      name: activity.name,
      type: activity.type,
      startDate: activity.startDate.toISOString(),
      distanceMeters: activity.distanceMeters,
      movingTimeSeconds: activity.movingTimeSeconds,
    })),
  };
}
