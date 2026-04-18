import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toAppError } from "@/lib/route-errors";
import { disconnectWahooConnectionWithDeauthorize } from "@/lib/wahoo";

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedAppUserId();
    if (!userId) {
      return NextResponse.redirect(new URL("/auth?next=/dashboard", request.url), {
        status: 303,
      });
    }

    await disconnectWahooConnectionWithDeauthorize(userId);
    return NextResponse.redirect(new URL("/dashboard?wahoo_disconnected=1", request.url), {
      status: 303,
    });
  } catch (error) {
    const appError = toAppError(error, "Unable to disconnect Wahoo connection.");
    const errorCode = appError.code === "db_schema_missing" ? "db_schema_missing" : "wahoo_disconnect_failed";

    logger.error("Wahoo disconnect failed.", error, {
      route: "/api/wahoo/disconnect",
    });

    return NextResponse.redirect(new URL(`/dashboard?error=${errorCode}`, request.url), {
      status: 303,
    });
  }
}
