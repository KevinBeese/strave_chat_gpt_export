import { NextRequest, NextResponse } from "next/server";

import {
  buildAndStoreExportPayload,
  syncAndLoadActivities,
} from "@/lib/strava";
import { getAuthenticatedAppUserId } from "@/lib/auth";
import {
  filterActivitiesForExport,
  parseExportFilters,
  resolveDaysForDateRange,
} from "@/lib/export-filters";
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

  const filters = parseExportFilters(request.nextUrl.searchParams);
  const effectiveDays = resolveDaysForDateRange(days, filters);

  try {
    const { activities, athleteZones, grantedScopes, syncMeta } = await syncAndLoadActivities(
      effectiveDays,
      userId,
    );
    if (syncMeta.partial) {
      logger.warn("Strava sync completed with partial enrichment.", {
        userId,
        detailsPartial: syncMeta.detailsPartial,
        zonesPartial: syncMeta.zonesPartial,
      });
    }
    const filteredActivities = filterActivitiesForExport(activities, filters);
    const payload = await buildAndStoreExportPayload(
      filteredActivities,
      days,
      filters,
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
      effectiveDays,
      filters,
    });
    return toApiErrorResponse(error, "Unable to export Strava activities.");
  }
}
