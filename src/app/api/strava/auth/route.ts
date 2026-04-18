import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { toAppError } from "@/lib/route-errors";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedAppUserId();
    if (!userId) {
      return NextResponse.redirect(new URL("/auth?next=/dashboard", request.url));
    }

    const env = getEnv();
    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: env.STRAVA_CLIENT_ID,
      redirect_uri: env.STRAVA_REDIRECT_URI,
      response_type: "code",
      approval_prompt: "auto",
      scope: "read,activity:read_all,profile:read_all",
      state,
    });

    const response = NextResponse.redirect(
      `https://www.strava.com/oauth/authorize?${params.toString()}`,
    );

    response.cookies.set("strava_oauth_state", state, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    const appError = toAppError(error, "Unable to initialize Strava auth route.");
    if (appError.code === "db_schema_missing") {
      return NextResponse.redirect(new URL("/dashboard?error=db_schema_missing", request.url));
    }

    logger.error("Failed to initialize Strava auth route.", error, {
      route: "/api/strava/auth",
    });
    return NextResponse.redirect(new URL("/dashboard?error=auth_setup_failed", request.url));
  }
}
