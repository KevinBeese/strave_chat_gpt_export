"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";

type ImportResponse = {
  imported?: {
    id: string;
    providerActivityId: string;
    startDate: string;
    name: string;
    calories: number | null;
    movingTimeSeconds: number;
  };
  ocr?: {
    files: Array<{ name: string; size: number }>;
    extractedTextPreview: string;
  };
  error?: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toOptionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function Beat81ImportPanel() {
  const [rawText, setRawText] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [startDateIso, setStartDateIso] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [athleteWeightKg, setAthleteWeightKg] = useState("81");
  const [athleteHeightCm, setAthleteHeightCm] = useState("180");
  const [athleteMaxHr, setAthleteMaxHr] = useState("186");
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<ImportResponse["imported"] | null>(null);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);

  const hasScreenshots = screenshots.length > 0;
  const selectedScreenshotLabel = useMemo(() => {
    if (screenshots.length === 0) {
      return "Keine Screenshots ausgewaehlt";
    }
    if (screenshots.length === 1) {
      return `1 Screenshot: ${screenshots[0].name}`;
    }
    return `${screenshots.length} Screenshots ausgewaehlt`;
  }, [screenshots]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);
    setLastImport(null);
    setOcrPreview(null);

    try {
      let response: Response;

      if (hasScreenshots) {
        const formData = new FormData();
        for (const file of screenshots) {
          formData.append("screenshots", file);
        }

        formData.append("sessionName", sessionName);
        formData.append("startDateIso", startDateIso);
        formData.append("durationMinutes", durationMinutes);
        formData.append("athleteWeightKg", athleteWeightKg);
        formData.append("athleteHeightCm", athleteHeightCm);
        formData.append("athleteMaxHr", athleteMaxHr);
        formData.append("timezone", "Europe/Berlin");

        response = await fetch("/api/beat81/import-images", {
          method: "POST",
          body: formData,
        });
      } else {
        if (!toOptionalValue(rawText)) {
          throw new Error("Bitte Text einfuegen oder Screenshots waehlen.");
        }

        response = await fetch("/api/beat81/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rawText,
            sessionName: toOptionalValue(sessionName),
            startDateIso: toOptionalValue(startDateIso),
            durationMinutes: toOptionalValue(durationMinutes),
            athleteWeightKg: toOptionalValue(athleteWeightKg),
            athleteHeightCm: toOptionalValue(athleteHeightCm),
            athleteMaxHr: toOptionalValue(athleteMaxHr),
            timezone: "Europe/Berlin",
          }),
        });
      }

      const payload = (await response.json()) as ImportResponse;
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "Import fehlgeschlagen.");
      }

      if (payload.imported) {
        setLastImport(payload.imported);
      }

      if (payload.ocr?.extractedTextPreview) {
        setOcrPreview(payload.ocr.extractedTextPreview);
      }

      setStatusMessage(
        hasScreenshots
          ? "Beat81 Screenshots erfolgreich ausgelesen und importiert."
          : "Beat81 Session erfolgreich importiert.",
      );
      setRawText("");
      setSessionName("");
      setStartDateIso("");
      setDurationMinutes("");
      setScreenshots([]);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Import fehlgeschlagen.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white/80 p-5">
      <p className="text-xs uppercase tracking-[0.08em] text-black/45">Manual Import</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">Beat81 Import</h2>
      <p className="mt-2 text-sm text-black/70">
        Du kannst entweder den Share-Text einfuegen oder Screenshots hochladen. Bei Screenshots liest OCR
        die Werte aus und mappt sie in dein Aktivitaetsmodell.
      </p>

      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3">
          <p className="text-sm font-medium text-black/80">Screenshots (optional)</p>
          <input
            accept="image/png,image/jpeg,image/webp"
            className="mt-2 block w-full text-sm text-black/75"
            multiple
            onChange={(event) => setScreenshots(Array.from(event.target.files ?? []))}
            type="file"
          />
          <p className="mt-2 text-xs text-black/55">{selectedScreenshotLabel}</p>
        </div>

        <textarea
          className="h-36 w-full rounded-xl border border-black/12 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
          onChange={(event) => setRawText(event.target.value)}
          placeholder="Optional: Beat81 Ergebnistext hier einfuegen..."
          value={rawText}
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-xl border border-black/12 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
            onChange={(event) => setSessionName(event.target.value)}
            placeholder="Session Name (optional)"
            value={sessionName}
          />
          <input
            className="rounded-xl border border-black/12 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
            onChange={(event) => setStartDateIso(event.target.value)}
            placeholder="Startzeit ISO optional (z.B. 2026-04-17T07:15:00+02:00)"
            value={startDateIso}
          />
          <input
            className="rounded-xl border border-black/12 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
            onChange={(event) => setDurationMinutes(event.target.value)}
            placeholder="Dauer in Minuten (optional)"
            value={durationMinutes}
          />
          <input
            className="rounded-xl border border-black/12 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
            onChange={(event) => setAthleteMaxHr(event.target.value)}
            placeholder="Max HF"
            value={athleteMaxHr}
          />
          <input
            className="rounded-xl border border-black/12 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
            onChange={(event) => setAthleteHeightCm(event.target.value)}
            placeholder="Koerpergroesse (cm)"
            value={athleteHeightCm}
          />
          <input
            className="rounded-xl border border-black/12 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
            onChange={(event) => setAthleteWeightKg(event.target.value)}
            placeholder="Gewicht (kg)"
            value={athleteWeightKg}
          />
        </div>

        <button
          className="inline-flex items-center rounded-full bg-[color:var(--accent)] px-5 py-2.5 text-sm font-medium text-[color:var(--accent-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting
            ? "Import laeuft..."
            : hasScreenshots
              ? "Screenshots auslesen & importieren"
              : "Beat81 importieren"}
        </button>
      </form>

      {statusMessage ? <p className="mt-3 text-sm text-black/75">{statusMessage}</p> : null}

      {lastImport ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p className="font-medium">{lastImport.name}</p>
          <p className="mt-1">
            Start: {formatDateTime(lastImport.startDate)} · Dauer: {Math.round(lastImport.movingTimeSeconds / 60)} min
            {typeof lastImport.calories === "number" ? ` · ${Math.round(lastImport.calories)} kcal` : ""}
          </p>
        </div>
      ) : null}

      {ocrPreview ? (
        <details className="mt-3 rounded-xl border border-black/10 bg-white p-3 text-xs text-black/70">
          <summary className="cursor-pointer font-medium">OCR Vorschau anzeigen</summary>
          <pre className="mt-2 whitespace-pre-wrap">{ocrPreview}</pre>
        </details>
      ) : null}
    </section>
  );
}
