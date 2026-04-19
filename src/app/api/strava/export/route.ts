import { NextRequest, NextResponse } from "next/server";

import {
  buildAndStoreExportPayload,
  loadStoredActivitiesForExport,
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
const allowedSources = new Set(["sync", "local"]);

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
  const requestedSource = request.nextUrl.searchParams.get("source") ?? "sync";
  const source = requestedSource.toLowerCase();

  if (!allowedSources.has(source)) {
    return NextResponse.json(
      { error: "source must be one of sync or local" },
      { status: 400 },
    );
  }

  try {
    const { activities, athleteZones, grantedScopes, syncMeta } =
      source === "local"
        ? await loadStoredActivitiesForExport(effectiveDays, userId)
        : await syncAndLoadActivities(effectiveDays, userId);
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
      source,
      filters,
    });
    return toApiErrorResponse(error, "Unable to export Strava activities.");
  }
}
