import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toAppError } from "@/lib/route-errors";
import {
  exchangeCodeForWahooToken,
  fetchAuthenticatedWahooUser,
  upsertWahooConnection,
} from "@/lib/wahoo";

export async function GET(request: NextRequest) {
  let userId: string | null = null;

  try {
    userId = await getAuthenticatedAppUserId();
    if (!userId) {
      return NextResponse.redirect(new URL("/auth?next=/dashboard", request.url));
    }
  } catch (error) {
    const appError = toAppError(error, "Unable to bootstrap Wahoo callback session.");
    if (appError.code === "db_schema_missing") {
      return NextResponse.redirect(new URL("/dashboard?error=db_schema_missing", request.url));
    }

    logger.error("Failed to bootstrap Wahoo callback session.", error, {
      route: "/api/auth/wahoo/callback",
    });
    return NextResponse.redirect(new URL("/dashboard?error=wahoo_auth_setup_failed", request.url));
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("wahoo_oauth_state")?.value;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const scope = request.nextUrl.searchParams.get("scope") ?? undefined;

  cookieStore.delete("wahoo_oauth_state");

  const redirectWithSession = (url: URL) => NextResponse.redirect(url);

  if (error) {
    return redirectWithSession(new URL(`/dashboard?error=wahoo_${error}`, request.url));
  }

  if (!state || !storedState || state !== storedState) {
    return redirectWithSession(new URL("/dashboard?error=wahoo_invalid_state", request.url));
  }

  if (!code) {
    return redirectWithSession(new URL("/dashboard?error=wahoo_missing_code", request.url));
  }

  try {
    const token = await exchangeCodeForWahooToken(code);
    const user = await fetchAuthenticatedWahooUser(token.access_token);

    await upsertWahooConnection(
      {
        token,
        user,
        scope,
      },
      userId,
    );
  } catch (callbackError) {
    const message =
      callbackError instanceof Error ? callbackError.message : "Unknown OAuth callback error";
    logger.error("Wahoo callback failed.", callbackError, {
      route: "/api/auth/wahoo/callback",
      userId,
    });

    const isDatabaseWriteError = /sqlite|readonly|database|prisma/i.test(message);
    const errorCode = isDatabaseWriteError ? "db_write_failed" : "wahoo_oauth_failed";
    return redirectWithSession(new URL(`/dashboard?error=${errorCode}`, request.url));
  }

  return redirectWithSession(new URL("/dashboard?wahoo_connected=1", request.url));
}
