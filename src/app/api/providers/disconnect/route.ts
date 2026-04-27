import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { disconnectStravaConnectionWithDeauthorize } from "@/lib/strava";
import { disconnectWahooConnectionWithDeauthorize } from "@/lib/wahoo";

type Provider = "strava" | "wahoo";

const validProviders: Provider[] = ["strava", "wahoo"];

export async function POST(request: Request) {
  const userId = await getAuthenticatedAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Bitte zuerst einloggen." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | { providers?: unknown }
    | null;

  const requestedProviders = Array.isArray(payload?.providers)
    ? payload.providers.filter((provider): provider is Provider =>
        typeof provider === "string" && validProviders.includes(provider as Provider),
      )
    : [];

  if (requestedProviders.length === 0) {
    return NextResponse.json({ error: "Keine gueltigen Provider ausgewaehlt." }, { status: 400 });
  }

  const disconnectTasks = requestedProviders.map(async (provider) => {
    if (provider === "strava") {
      await disconnectStravaConnectionWithDeauthorize(userId);
      return provider;
    }

    await disconnectWahooConnectionWithDeauthorize(userId);
    return provider;
  });

  const results = await Promise.allSettled(disconnectTasks);
  const failedProviders = results
    .map((result, index) => ({ result, provider: requestedProviders[index] }))
    .filter(({ result }) => result.status === "rejected")
    .map(({ provider }) => provider);

  if (failedProviders.length > 0) {
    logger.error(
      "Bulk disconnect failed.",
      new Error(`Failed providers: ${failedProviders.join(", ")}`),
      {
        route: "/api/providers/disconnect",
        userId,
        failedProviders,
      },
    );

    return NextResponse.json(
      {
        error: `Verbindungen konnten nicht getrennt werden fuer: ${failedProviders.join(", ")}.`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, disconnected: requestedProviders });
}
