import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";

export async function GET() {
  const env = getEnv();
  const params = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID,
    redirect_uri: env.STRAVA_REDIRECT_URI,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
  });

  return NextResponse.redirect(
    `https://www.strava.com/oauth/authorize?${params.toString()}`,
  );
}
