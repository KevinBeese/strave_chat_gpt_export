import { NextRequest, NextResponse } from "next/server";

import { dedupeActivitiesAcrossProviders } from "@/lib/activity-dedupe";
import { getAuthenticatedAppUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedAppUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Bitte zuerst einloggen.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 30;

  const activities = await prisma.activity.findMany({
    where: { userId },
    orderBy: {
      startDate: "desc",
    },
    take: limit,
    select: {
      id: true,
      provider: true,
      providerActivityId: true,
      name: true,
      type: true,
      classification: true,
      startDate: true,
      distanceMeters: true,
      movingTimeSeconds: true,
      elapsedTimeSeconds: true,
    },
  });
  const mergedActivities = dedupeActivitiesAcrossProviders(activities);

  return NextResponse.json({
    activities: mergedActivities.map((activity) => ({
      id: Number(activity.id),
      provider: activity.mergedProviderLabel,
      providers: activity.providers,
      providerActivityId: activity.providerActivityId,
      name: activity.name,
      type: activity.type,
      classification: activity.classification,
      startDate: activity.startDate.toISOString(),
      distanceMeters: activity.distanceMeters,
      movingTimeSeconds: activity.movingTimeSeconds,
      elapsedTimeSeconds: activity.elapsedTimeSeconds,
    })),
  });
}
