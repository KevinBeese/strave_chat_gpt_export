import { NextResponse } from "next/server";

import { disconnectStravaConnection } from "@/lib/strava";
import { getOrCreateCurrentUserId } from "@/lib/user-session";

export async function POST(request: Request) {
  const userId = await getOrCreateCurrentUserId();
  await disconnectStravaConnection(userId);
  return NextResponse.redirect(new URL("/dashboard?disconnected=1", request.url), {
    status: 303,
  });
}
