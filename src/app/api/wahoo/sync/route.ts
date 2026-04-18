import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toApiErrorResponse } from "@/lib/route-errors";
import { syncWahooWorkoutsForUser } from "@/lib/wahoo";

export async function POST() {
  const userId = await getAuthenticatedAppUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Bitte zuerst einloggen.", code: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await syncWahooWorkoutsForUser(userId);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Wahoo sync API failed.", error, {
      route: "/api/wahoo/sync",
      userId,
    });
    return toApiErrorResponse(error, "Wahoo-Sync konnte nicht abgeschlossen werden.");
  }
}
