import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

function getSinceDate(days: number) {
  return new Date(Date.now() - days * DAY_MS);
}

function toNumber(value: number | bigint | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return value;
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
  recentActivities: Array<{
    id: number;
    name: string;
    type: string;
    startDate: string;
    distanceMeters: number;
    movingTimeSeconds: number;
  }>;
};

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const since7Days = getSinceDate(7);
  const since30Days = getSinceDate(30);

  const [allStats, stats7Days, stats30Days, groupedTypes, recentActivities] =
    await Promise.all([
      prisma.activity.aggregate({
        where: { userId },
        _count: { _all: true },
        _sum: {
          distanceMeters: true,
          movingTimeSeconds: true,
        },
        _max: {
          startDate: true,
        },
      }),
      prisma.activity.aggregate({
        where: {
          userId,
          startDate: {
            gte: since7Days,
          },
        },
        _count: { _all: true },
        _sum: {
          distanceMeters: true,
          movingTimeSeconds: true,
        },
      }),
      prisma.activity.aggregate({
        where: {
          userId,
          startDate: {
            gte: since30Days,
          },
        },
        _count: { _all: true },
        _sum: {
          distanceMeters: true,
          movingTimeSeconds: true,
        },
      }),
      prisma.activity.groupBy({
        by: ["type"],
        where: { userId },
        _count: {
          _all: true,
        },
        orderBy: {
          _count: {
            type: "desc",
          },
        },
      }),
      prisma.activity.findMany({
        where: { userId },
        orderBy: {
          startDate: "desc",
        },
        take: 10,
        select: {
          id: true,
          name: true,
          type: true,
          startDate: true,
          distanceMeters: true,
          movingTimeSeconds: true,
        },
      }),
    ]);

  const totalActivities = allStats._count._all;

  return {
    totalActivities,
    totalDistanceMeters: toNumber(allStats._sum.distanceMeters),
    totalMovingTimeSeconds: toNumber(allStats._sum.movingTimeSeconds),
    lastActivityDate: allStats._max.startDate?.toISOString() ?? null,
    last7Days: {
      activities: stats7Days._count._all,
      distanceMeters: toNumber(stats7Days._sum.distanceMeters),
      movingTimeSeconds: toNumber(stats7Days._sum.movingTimeSeconds),
    },
    last30Days: {
      activities: stats30Days._count._all,
      distanceMeters: toNumber(stats30Days._sum.distanceMeters),
      movingTimeSeconds: toNumber(stats30Days._sum.movingTimeSeconds),
    },
    sportBreakdown: groupedTypes.map((entry) => {
      const count = entry._count._all;
      return {
        type: entry.type,
        count,
        percentage: totalActivities > 0 ? (count / totalActivities) * 100 : 0,
      };
    }),
    recentActivities: recentActivities.map((activity) => ({
      id: Number(activity.id),
      name: activity.name,
      type: activity.type,
      startDate: activity.startDate.toISOString(),
      distanceMeters: activity.distanceMeters,
      movingTimeSeconds: activity.movingTimeSeconds,
    })),
  };
}
