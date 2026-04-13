import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
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
    const message = error instanceof Error ? error.message : "Unknown session bootstrap error";
    const isSchemaMissing = /P2021|table .* does not exist/i.test(message);
    if (isSchemaMissing) {
      return NextResponse.redirect(new URL("/dashboard?error=db_schema_missing", request.url));
    }

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
    console.error("Wahoo callback failed", {
      userId,
      message,
      databaseUrl: process.env.DATABASE_URL,
    });

    const isDatabaseWriteError = /sqlite|readonly|database|prisma/i.test(message);
    const errorCode = isDatabaseWriteError ? "db_write_failed" : "wahoo_oauth_failed";
    return redirectWithSession(new URL(`/dashboard?error=${errorCode}`, request.url));
  }

  return redirectWithSession(new URL("/dashboard?wahoo_connected=1", request.url));
}
