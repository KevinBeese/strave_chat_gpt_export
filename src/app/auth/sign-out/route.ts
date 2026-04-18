import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { disconnectStravaConnectionWithDeauthorize } from "@/lib/strava";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { disconnectWahooConnectionWithDeauthorize } from "@/lib/wahoo";

export async function POST(request: Request) {
  const userId = await getAuthenticatedAppUserId();
  if (userId) {
    try {
      await Promise.all([
        disconnectStravaConnectionWithDeauthorize(userId),
        disconnectWahooConnectionWithDeauthorize(userId),
      ]);
    } catch {
      return NextResponse.redirect(new URL("/auth?error=signout_disconnect_failed", request.url), {
        status: 303,
      });
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return NextResponse.redirect(new URL("/auth?error=signout_failed", request.url), {
      status: 303,
    });
  }

  return NextResponse.redirect(new URL("/auth?signed_out=1", request.url), { status: 303 });
}
