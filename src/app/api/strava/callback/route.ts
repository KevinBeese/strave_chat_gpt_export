import { NextRequest, NextResponse } from "next/server";

import { exchangeCodeForToken, upsertStravaConnection } from "@/lib/strava";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/dashboard?error=missing_code", request.url));
  }

  try {
    const token = await exchangeCodeForToken(code);
    await upsertStravaConnection(token);
  } catch {
    return NextResponse.redirect(new URL("/dashboard?error=oauth_failed", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard?connected=1", request.url));
}
