import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { importBeat81ReportForUser } from "@/lib/beat81";
import { logger } from "@/lib/logger";
import { toApiErrorResponse } from "@/lib/route-errors";

type Beat81ImportRequestBody = {
  rawText?: unknown;
  sessionName?: unknown;
  startDateIso?: unknown;
  durationMinutes?: unknown;
  athleteWeightKg?: unknown;
  athleteHeightCm?: unknown;
  athleteMaxHr?: unknown;
  timezone?: unknown;
};

function toOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedAppUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Bitte zuerst einloggen.", code: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as Beat81ImportRequestBody;
    const rawText = toOptionalString(body.rawText);

    if (!rawText) {
      return NextResponse.json(
        { error: "rawText ist erforderlich." },
        { status: 400 },
      );
    }

    const result = await importBeat81ReportForUser(userId, {
      rawText,
      sessionName: toOptionalString(body.sessionName),
      startDateIso: toOptionalString(body.startDateIso),
      durationMinutes: toOptionalNumber(body.durationMinutes),
      athleteWeightKg: toOptionalNumber(body.athleteWeightKg),
      athleteHeightCm: toOptionalNumber(body.athleteHeightCm),
      athleteMaxHr: toOptionalNumber(body.athleteMaxHr),
      timezone: toOptionalString(body.timezone),
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Beat81 import API failed.", error, {
      route: "/api/beat81/import",
      userId,
    });

    return toApiErrorResponse(error, "Beat81 Import konnte nicht abgeschlossen werden.");
  }
}
