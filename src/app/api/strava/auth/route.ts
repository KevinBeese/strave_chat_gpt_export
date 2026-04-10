import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";

export async function GET() {
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

  (await cookies()).set("strava_oauth_state", state, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
