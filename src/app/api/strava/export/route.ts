import { NextRequest, NextResponse } from "next/server";

import {
  StravaApiError,
  buildAndStoreExportPayload,
  syncAndLoadActivities,
} from "@/lib/strava";

const allowedDays = new Set([7, 14, 30]);

export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get("days") ?? "7";
  const days = Number(daysParam);

  if (!Number.isFinite(days) || !allowedDays.has(days)) {
    return NextResponse.json(
      { error: "days must be one of 7, 14 or 30" },
      { status: 400 },
    );
  }

  try {
    const { activities, athleteZones, grantedScopes } = await syncAndLoadActivities(days);
    const payload = await buildAndStoreExportPayload(
      activities,
      days,
      athleteZones,
      grantedScopes,
    );
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof StravaApiError) {
      const retryAfter = error.retryAfterSeconds ?? 60;
      return NextResponse.json(
        {
          error: error.message,
          code: error.isRateLimit ? "strava_rate_limit" : "strava_api_error",
          retryAfterSeconds: retryAfter,
          rateLimit: error.rateLimit,
        },
        {
          status: error.status === 429 ? 429 : 502,
          headers: {
            "Retry-After": String(retryAfter),
          },
        },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unable to export Strava activities.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
