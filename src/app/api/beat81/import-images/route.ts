import { NextResponse } from "next/server";

import { importBeat81ReportForUser } from "@/lib/beat81";
import { extractTextFromImages } from "@/lib/beat81-ocr";
import { getAuthenticatedAppUserId } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toApiErrorResponse } from "@/lib/route-errors";

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024;

function toOptionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toOptionalNumber(value: FormDataEntryValue | null) {
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toFileList(files: FormDataEntryValue[]) {
  return files.filter((entry): entry is File => entry instanceof File);
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
    const formData = await request.formData();
    const screenshots = toFileList(formData.getAll("screenshots"));

    if (screenshots.length === 0) {
      return NextResponse.json({ error: "Mindestens ein Screenshot ist erforderlich." }, { status: 400 });
    }

    if (screenshots.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Bitte maximal ${MAX_FILES} Screenshots auf einmal hochladen.` },
        { status: 400 },
      );
    }

    for (const file of screenshots) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `Datei ${file.name} ist zu groß. Maximal 12 MB pro Bild.` },
          { status: 400 },
        );
      }
    }

    const extractedText = await extractTextFromImages(screenshots);
    if (!extractedText) {
      return NextResponse.json(
        { error: "Kein lesbarer Text auf den Screenshots gefunden." },
        { status: 400 },
      );
    }

    const result = await importBeat81ReportForUser(userId, {
      rawText: extractedText,
      sessionName: toOptionalString(formData.get("sessionName")),
      startDateIso: toOptionalString(formData.get("startDateIso")),
      durationMinutes: toOptionalNumber(formData.get("durationMinutes")),
      athleteWeightKg: toOptionalNumber(formData.get("athleteWeightKg")),
      athleteHeightCm: toOptionalNumber(formData.get("athleteHeightCm")),
      athleteMaxHr: toOptionalNumber(formData.get("athleteMaxHr")),
      timezone: toOptionalString(formData.get("timezone")) ?? "Europe/Berlin",
    });

    return NextResponse.json({
      ...result,
      ocr: {
        files: screenshots.map((file) => ({ name: file.name, size: file.size })),
        extractedTextPreview: extractedText.slice(0, 1200),
      },
    });
  } catch (error) {
    logger.error("Beat81 OCR import API failed.", error, {
      route: "/api/beat81/import-images",
      userId,
    });

    return toApiErrorResponse(error, "Beat81 Screenshot-Import konnte nicht abgeschlossen werden.");
  }
}
