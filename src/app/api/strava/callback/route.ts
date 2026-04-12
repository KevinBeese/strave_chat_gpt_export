import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { exchangeCodeForToken, upsertStravaConnection } from "@/lib/strava";
import { getOrCreateCurrentUserId } from "@/lib/user-session";

export async function GET(request: NextRequest) {
  const userId = await getOrCreateCurrentUserId();
  const cookieStore = await cookies();
  const storedState = cookieStore.get("strava_oauth_state")?.value;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const scope = request.nextUrl.searchParams.get("scope") ?? undefined;

  cookieStore.delete("strava_oauth_state");

  if (error) {
    return NextResponse.redirect(new URL(`/dashboard?error=${error}`, request.url));
  }

  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/dashboard?error=invalid_state", request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/dashboard?error=missing_code", request.url));
  }

  try {
    const token = await exchangeCodeForToken(code);
    await upsertStravaConnection({
      ...token,
      scope: token.scope ?? scope,
    }, userId);
  } catch {
    return NextResponse.redirect(new URL("/dashboard?error=oauth_failed", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard?connected=1", request.url));
}
