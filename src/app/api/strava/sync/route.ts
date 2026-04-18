import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toApiErrorResponse } from "@/lib/route-errors";
import { syncActivitiesForUser } from "@/lib/strava";

export async function POST() {
  const userId = await getAuthenticatedAppUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Bitte zuerst einloggen.", code: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await syncActivitiesForUser(userId);
    if (result.partial) {
      logger.warn("Strava activity sync completed partially.", {
        userId,
        partialReason: result.partialReason,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Strava sync API failed.", error, {
      route: "/api/strava/sync",
      userId,
    });
    return toApiErrorResponse(error, "Strava-Sync konnte nicht abgeschlossen werden.");
  }
}
