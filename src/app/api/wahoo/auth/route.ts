import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { canStartWahooOauth } from "@/lib/wahoo";

const WAHOO_OAUTH_AUTHORIZE_URL = "https://api.wahooligan.com/oauth/authorize";

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedAppUserId();
    if (!userId) {
      return NextResponse.redirect(new URL("/auth?next=/dashboard", request.url));
    }

    if (!canStartWahooOauth()) {
      return NextResponse.redirect(new URL("/dashboard?error=wahoo_auth_setup_failed", request.url));
    }

    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: process.env.WAHOO_CLIENT_ID!,
      redirect_uri: process.env.WAHOO_REDIRECT_URI!,
      response_type: "code",
      scope: "user_read workouts_read email",
      state,
    });

    const response = NextResponse.redirect(`${WAHOO_OAUTH_AUTHORIZE_URL}?${params.toString()}`);

    response.cookies.set("wahoo_oauth_state", state, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown auth setup error";
    const isSchemaMissing = /P2021|table .* does not exist/i.test(message);
    if (isSchemaMissing) {
      return NextResponse.redirect(new URL("/dashboard?error=db_schema_missing", request.url));
    }

    console.error("Failed to initialize Wahoo auth route", error);
    return NextResponse.redirect(new URL("/dashboard?error=wahoo_auth_setup_failed", request.url));
  }
}
