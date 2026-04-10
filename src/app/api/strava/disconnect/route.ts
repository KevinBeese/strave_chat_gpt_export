import { NextResponse } from "next/server";

import { disconnectStravaConnection } from "@/lib/strava";

export async function POST(request: Request) {
  await disconnectStravaConnection();
  return NextResponse.redirect(new URL("/dashboard?disconnected=1", request.url), {
    status: 303,
  });
}
