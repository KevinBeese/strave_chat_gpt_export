import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { syncActivitiesForUser } from "@/lib/strava";

export async function POST() {
  const userId = await getAuthenticatedAppUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Bitte zuerst einloggen.", code: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await syncActivitiesForUser(userId);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Strava-Sync konnte nicht abgeschlossen werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
