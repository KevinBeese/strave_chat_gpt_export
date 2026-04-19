import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toApiErrorResponse } from "@/lib/route-errors";
import { getWeeklySummary, renderWeeklySummaryMarkdown } from "@/lib/weekly-summary";

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
    const markdown = renderWeeklySummaryMarkdown(summary);
    const filename = `weekly-summary-${summary.week_start}.md`;

    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error("Weekly markdown export failed.", error, {
      route: "/api/export/weekly.md",
      userId,
      weekStart,
    });
    return toApiErrorResponse(error, "Unable to export weekly summary markdown.");
  }
}
