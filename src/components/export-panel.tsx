"use client";

import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import type { ExportPayload } from "@/types/export";

const periodOptions = [
  { label: "7 Tage", value: 7 },
  { label: "14 Tage", value: 14 },
  { label: "30 Tage", value: 30 },
] as const;

function formatDate(dateIso: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateIso));
}

function formatDuration(seconds: number) {
  return `${Math.round(seconds / 60)} min`;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ connected }: { connected: boolean }) {
  const [data, setData] = useState<ExportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(7);

  async function handleExport() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/strava/export?days=${selectedDays}`);
      const payload = (await response.json()) as ExportPayload | { error?: string };

      if (!response.ok) {
        setError(payload && "error" in payload ? payload.error ?? "Export fehlgeschlagen." : "Export fehlgeschlagen.");
        return;
      }

      setData(payload as ExportPayload);
    } catch {
      setError("Export fehlgeschlagen. Bitte pruefe deine Verbindung.");
    } finally {
      setLoading(false);
    }
  }

  const jsonValue = data ? JSON.stringify(data, null, 2) : "";
  const gptSummary = data?.chatGptPrompt ?? "";
  const exportBaseName = data
    ? `strava-export-${data.rangeStart.slice(0, 10)}-to-${data.rangeEnd.slice(0, 10)}`
    : "strava-export";
  const jsonPreview = jsonValue
    ? `${data?.activityCount ?? 0} Aktivitaeten als strukturierter Export`
    : "Noch kein JSON-Export vorhanden";
  const gptPreview = gptSummary
    ? `${data?.activityCount ?? 0} Aktivitaeten als direkt nutzbarer GPT-Block`
    : "Noch kein ChatGPT-Export vorhanden";

  return (
    <section className="rounded-[2rem] border border-[color:var(--border)] bg-white/78 p-8 shadow-[0_18px_80px_rgba(29,27,22,0.08)]">
      <p className="text-sm uppercase tracking-[0.24em] text-black/55">Export</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight">
        Strava-Zeitraum fuer ChatGPT vorbereiten
      </h2>
      <p className="mt-4 text-sm leading-6 text-black/70">
        Fuer den MVP ziehen wir Aktivitaeten auf Aktivitaetslevel und erzeugen
        daraus JSON und einen direkt kopierbaren Analyse-Text.
      </p>
      <p className="mt-3 text-sm leading-6 text-black/58">
        Bei Kursen oder Indoor-Sessions ohne Bike- oder GPS-Kopplung behandeln
        wir fehlende Distanzdaten bewusst nicht als Fehler, sondern arbeiten mit
        Dauer, Herzfrequenz und Aktivitaetstyp.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-white px-4 py-2 text-sm text-black/70">
          Zeitraum
          <select
            className="bg-transparent font-medium outline-none"
            disabled={loading}
            onChange={(event) => setSelectedDays(Number(event.target.value))}
            value={selectedDays}
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!connected || loading}
          onClick={handleExport}
          type="button"
        >
          {loading ? "Export laeuft..." : `${selectedDays} Tage exportieren`}
        </button>
        {gptSummary ? <CopyButton value={gptSummary} /> : null}
        {jsonValue ? (
          <button
            className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-black/72 transition hover:bg-black/5"
            onClick={() =>
              downloadFile(`${exportBaseName}.json`, jsonValue, "application/json")
            }
            type="button"
          >
            JSON laden
          </button>
        ) : null}
        {gptSummary ? (
          <button
            className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-black/72 transition hover:bg-black/5"
            onClick={() =>
              downloadFile(`${exportBaseName}.txt`, gptSummary, "text/plain;charset=utf-8")
            }
            type="button"
          >
            TXT laden
          </button>
        ) : null}
      </div>

      {!connected ? (
        <p className="mt-4 text-sm text-black/58">
          Verbinde zuerst deinen Strava-Account.
        </p>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {data?.missingScopes?.includes("profile:read_all") ? (
        <div className="mt-5 rounded-3xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/8 p-4 text-sm text-[color:var(--accent)]">
          Fuer Athleten-Zonen und einige Profilwerte fehlt noch der Strava-Scope
          <span className="font-semibold"> profile:read_all</span>. Bitte
          verbinde Strava einmal neu.
        </div>
      ) : null}

      {data ? (
        <div className="mt-8 rounded-[1.5rem] border border-[color:var(--border)] bg-[#fffaf1] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-black/60">
                Aktivitaetsuebersicht
              </h3>
              <p className="mt-2 text-sm text-black/62">
                {data.activityCount} Aktivitaeten im Zeitraum {data.rangeLabel}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-black/42">
                Gewaehlter Export: {data.selectedDays} Tage
              </p>
              {data.athleteZones ? (
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-black/42">
                  Athleten-Zonen verfuegbar: HR {data.athleteZones.heartRateZones.length} ·
                  Power {data.athleteZones.powerZones.length}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-5 grid gap-4">
            {data.activities.map((activity) => (
              <article
                key={activity.id}
                className="rounded-[1.25rem] border border-[color:var(--border)] bg-white/75 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-black/84">
                      {activity.name}
                    </h4>
                    <p className="mt-1 text-sm text-black/58">
                      {activity.analysisLabel} · {formatDate(activity.startDate)}
                    </p>
                  </div>
                  <div className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/60">
                    {formatDuration(activity.movingTimeSeconds)}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-sm text-black/68">
                  {activity.hasDistanceData ? (
                    <span className="rounded-full bg-black/5 px-3 py-1">
                      {(activity.distanceMeters / 1000).toFixed(2)} km
                    </span>
                  ) : (
                    <span className="rounded-full bg-[color:var(--accent)]/10 px-3 py-1 text-[color:var(--accent)]">
                      Keine Distanzdaten, Fokus auf Dauer/Puls
                    </span>
                  )}
                  <span className="rounded-full bg-black/5 px-3 py-1">
                    {activity.type}
                  </span>
                  {activity.averageHeartrate ? (
                    <span className="rounded-full bg-black/5 px-3 py-1">
                      Avg HR {Math.round(activity.averageHeartrate)} bpm
                    </span>
                  ) : null}
                  {activity.maxHeartrate ? (
                    <span className="rounded-full bg-black/5 px-3 py-1">
                      Max HR {Math.round(activity.maxHeartrate)} bpm
                    </span>
                  ) : null}
                  {activity.averageWatts ? (
                    <span className="rounded-full bg-black/5 px-3 py-1">
                      Avg Power {Math.round(activity.averageWatts)} W
                    </span>
                  ) : null}
                  {activity.weightedAverageWatts ? (
                    <span className="rounded-full bg-black/5 px-3 py-1">
                      WAP {Math.round(activity.weightedAverageWatts)} W
                    </span>
                  ) : null}
                  {activity.zones.length > 0 ? (
                    <span className="rounded-full bg-black/5 px-3 py-1">
                      {activity.zones.length} Zonen-Datensaetze
                    </span>
                  ) : null}
                  {activity.elevationGainMeters > 0 ? (
                    <span className="rounded-full bg-black/5 px-3 py-1">
                      {activity.elevationGainMeters} hm
                    </span>
                  ) : null}
                </div>
                {activity.description ? (
                  <p className="mt-3 rounded-2xl bg-black/[0.035] px-3 py-2 text-sm leading-6 text-black/62">
                    Notiz: {activity.description}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <details className="group rounded-[1.5rem] border border-[color:var(--border)] bg-[#171512] p-5 text-[#f8f4ec]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/72">
                Fuer ChatGPT
              </h3>
              <p className="mt-2 text-sm text-white/52">{gptPreview}</p>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-white/52 transition group-open:rotate-180">
              ▼
            </span>
          </summary>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap border-t border-white/10 pt-4 text-xs leading-6 text-white/78">
            {gptSummary || "Noch kein Export erzeugt."}
          </pre>
        </details>
        <details className="group rounded-[1.5rem] border border-[color:var(--border)] bg-[#fffdf8] p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-black/60">
                JSON
              </h3>
              <p className="mt-2 text-sm text-black/46">{jsonPreview}</p>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-black/42 transition group-open:rotate-180">
              ▼
            </span>
          </summary>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap border-t border-black/8 pt-4 text-xs leading-6 text-black/70">
            {jsonValue || "Noch kein Export erzeugt."}
          </pre>
        </details>
      </div>
    </section>
  );
}
