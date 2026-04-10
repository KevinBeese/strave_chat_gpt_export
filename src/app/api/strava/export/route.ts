import { NextRequest, NextResponse } from "next/server";

import { buildExportPayload, getRecentActivities } from "@/lib/strava";

export async function GET(request: NextRequest) {
  const daysParam = request.nextUrl.searchParams.get("days") ?? "7";
  const days = Number(daysParam);

  if (!Number.isFinite(days) || days <= 0 || days > 30) {
    return NextResponse.json(
      { error: "days must be a number between 1 and 30" },
      { status: 400 },
    );
  }

  try {
    const activities = await getRecentActivities(days);
    const payload = buildExportPayload(activities, days);
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to export Strava activities.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
