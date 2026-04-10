"use client";

import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import type { ExportPayload } from "@/types/export";

export function ExportPanel({ connected }: { connected: boolean }) {
  const [data, setData] = useState<ExportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/strava/export?days=7");
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

  return (
    <section className="rounded-[2rem] border border-[color:var(--border)] bg-white/78 p-8 shadow-[0_18px_80px_rgba(29,27,22,0.08)]">
      <p className="text-sm uppercase tracking-[0.24em] text-black/55">Export</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight">
        Letzte 7 Tage fuer ChatGPT vorbereiten
      </h2>
      <p className="mt-4 text-sm leading-6 text-black/70">
        Fuer den MVP ziehen wir Aktivitaeten auf Aktivitaetslevel und erzeugen
        daraus JSON und einen direkt kopierbaren Analyse-Text.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!connected || loading}
          onClick={handleExport}
          type="button"
        >
          {loading ? "Export laeuft..." : "Letzte 7 Tage exportieren"}
        </button>
        {gptSummary ? <CopyButton value={gptSummary} /> : null}
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

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[#171512] p-5 text-[#f8f4ec]">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/72">
              Fuer ChatGPT
            </h3>
          </div>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-white/78">
            {gptSummary || "Noch kein Export erzeugt."}
          </pre>
        </div>
        <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[#fffdf8] p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-black/60">
            JSON
          </h3>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-black/70">
            {jsonValue || "Noch kein Export erzeugt."}
          </pre>
        </div>
      </div>
    </section>
  );
}
