import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toAppError } from "@/lib/route-errors";
import { disconnectStravaConnectionWithDeauthorize } from "@/lib/strava";

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedAppUserId();
    if (!userId) {
      return NextResponse.redirect(new URL("/auth?next=/dashboard", request.url), {
        status: 303,
      });
    }

    await disconnectStravaConnectionWithDeauthorize(userId);
    return NextResponse.redirect(new URL("/dashboard?disconnected=1", request.url), {
      status: 303,
    });
  } catch (error) {
    const appError = toAppError(error, "Unable to disconnect Strava connection.");
    const errorCode = appError.code === "db_schema_missing" ? "db_schema_missing" : "disconnect_failed";

    logger.error("Strava disconnect failed.", error, {
      route: "/api/strava/disconnect",
    });

    return NextResponse.redirect(new URL(`/dashboard?error=${errorCode}`, request.url), {
      status: 303,
    });
  }
}
