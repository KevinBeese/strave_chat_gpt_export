import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { exchangeCodeForToken, upsertStravaConnection } from "@/lib/strava";
import { getOrCreateCurrentUserId } from "@/lib/user-session";

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await getOrCreateCurrentUserId();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown session bootstrap error";
    const isSchemaMissing = /P2021|table .* does not exist/i.test(message);
    if (isSchemaMissing) {
      return NextResponse.redirect(new URL("/dashboard?error=db_schema_missing", request.url));
    }

    return NextResponse.redirect(new URL("/dashboard?error=auth_setup_failed", request.url));
  }

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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OAuth callback error";
    console.error("Strava callback failed", {
      userId,
      message,
      databaseUrl: process.env.DATABASE_URL,
    });

    const isDatabaseWriteError = /sqlite|readonly|database|prisma/i.test(message);
    const errorCode = isDatabaseWriteError ? "db_write_failed" : "oauth_failed";
    const redirectUrl = new URL(`/dashboard?error=${errorCode}`, request.url);

    if (!isDatabaseWriteError) {
      const detailsHint = /invalid_client|invalid_grant|redirect_uri|code/i.exec(message)?.[0];
      if (detailsHint) {
        redirectUrl.searchParams.set("details", detailsHint);
      }
    }

    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(new URL("/dashboard?connected=1", request.url));
}
