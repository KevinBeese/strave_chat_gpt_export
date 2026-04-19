import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toApiErrorResponse } from "@/lib/route-errors";
import { getWeeklySummary } from "@/lib/weekly-summary";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedAppUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Bitte zuerst einloggen.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const weekStart = request.nextUrl.searchParams.get("weekStart");

  try {
    const summary = await getWeeklySummary(userId, weekStart);
    return NextResponse.json(summary);
  } catch (error) {
    logger.error("Weekly summary API failed.", error, {
      route: "/api/summary/weekly",
      userId,
      weekStart,
    });
    return toApiErrorResponse(error, "Unable to generate weekly summary.");
  }
}
