import { NextRequest, NextResponse } from "next/server";

import {
  buildAndStoreExportPayload,
  syncAndLoadActivities,
} from "@/lib/strava";
import { getAuthenticatedAppUserId } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toApiErrorResponse } from "@/lib/route-errors";

const allowedDays = new Set([7, 14, 30]);

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedAppUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Bitte zuerst einloggen.", code: "unauthorized" },
      { status: 401 },
    );
  }
  const daysParam = request.nextUrl.searchParams.get("days") ?? "7";
  const days = Number(daysParam);

  if (!Number.isFinite(days) || !allowedDays.has(days)) {
    return NextResponse.json(
      { error: "days must be one of 7, 14 or 30" },
      { status: 400 },
    );
  }

  try {
    const { activities, athleteZones, grantedScopes, syncMeta } = await syncAndLoadActivities(
      days,
      userId,
    );
    if (syncMeta.partial) {
      logger.warn("Strava sync completed with partial enrichment.", {
        userId,
        detailsPartial: syncMeta.detailsPartial,
        zonesPartial: syncMeta.zonesPartial,
      });
    }
    const payload = await buildAndStoreExportPayload(
      activities,
      days,
      athleteZones,
      grantedScopes,
      userId,
    );
    return NextResponse.json(payload);
  } catch (error) {
    logger.error("Strava export API failed.", error, {
      route: "/api/strava/export",
      userId,
      days,
    });
    return toApiErrorResponse(error, "Unable to export Strava activities.");
  }
}
