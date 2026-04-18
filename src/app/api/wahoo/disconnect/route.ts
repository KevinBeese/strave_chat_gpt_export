import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { disconnectWahooConnectionWithDeauthorize } from "@/lib/wahoo";

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedAppUserId();
    if (!userId) {
      return NextResponse.redirect(new URL("/auth?next=/dashboard", request.url), {
        status: 303,
      });
    }

    await disconnectWahooConnectionWithDeauthorize(userId);
    return NextResponse.redirect(new URL("/dashboard?wahoo_disconnected=1", request.url), {
      status: 303,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown disconnect error";
    const isSchemaMissing = /P2021|table .* does not exist/i.test(message);
    const errorCode = isSchemaMissing ? "db_schema_missing" : "wahoo_disconnect_failed";

    return NextResponse.redirect(new URL(`/dashboard?error=${errorCode}`, request.url), {
      status: 303,
    });
  }
}
