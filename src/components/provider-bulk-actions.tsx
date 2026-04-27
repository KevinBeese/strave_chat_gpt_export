"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Provider = "strava" | "wahoo";

export function ProviderBulkActions({
  stravaConnected,
  wahooConnected,
}: {
  stravaConnected: boolean;
  wahooConnected: boolean;
}) {
  const router = useRouter();
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isDisconnectingAll, setIsDisconnectingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectedProviders = useMemo(() => {
    const providers: Provider[] = [];

    if (stravaConnected) {
      providers.push("strava");
    }

    if (wahooConnected) {
      providers.push("wahoo");
    }

    return providers;
  }, [stravaConnected, wahooConnected]);

  const hasConnectedProviders = connectedProviders.length > 0;

  async function syncAll() {
    if (!hasConnectedProviders || isSyncingAll || isDisconnectingAll) {
      return;
    }

    setIsSyncingAll(true);
    setError(null);

    try {
      const results = await Promise.allSettled(
        connectedProviders.map((provider) =>
          fetch(`/api/${provider}/sync`, {
            method: "POST",
          }),
        ),
      );

      const failedProviders = results
        .map((result, index) => ({ result, provider: connectedProviders[index] }))
        .filter(({ result }) => result.status === "rejected" || !result.value.ok)
        .map(({ provider }) => provider);

      if (failedProviders.length > 0) {
        throw new Error(`Synchronisation fehlgeschlagen fuer: ${failedProviders.join(", ")}.`);
      }

      router.refresh();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Synchronisation fehlgeschlagen.");
    } finally {
      setIsSyncingAll(false);
    }
  }

  async function disconnectAll() {
    if (!hasConnectedProviders || isSyncingAll || isDisconnectingAll) {
      return;
    }

    setIsDisconnectingAll(true);
    setError(null);

    try {
      const response = await fetch("/api/providers/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providers: connectedProviders,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Verbindungen konnten nicht getrennt werden.");
      }

      router.refresh();
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Verbindungen konnten nicht getrennt werden.",
      );
    } finally {
      setIsDisconnectingAll(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex items-center rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-[color:var(--accent-foreground)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasConnectedProviders || isSyncingAll || isDisconnectingAll}
          onClick={syncAll}
          type="button"
        >
          {isSyncingAll ? "Synchronisiere alle..." : "Alle synchronisieren"}
        </button>
        <button
          className="inline-flex items-center rounded-full border border-[color:var(--border)] px-5 py-3 text-sm font-medium text-black/72 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasConnectedProviders || isSyncingAll || isDisconnectingAll}
          onClick={disconnectAll}
          type="button"
        >
          {isDisconnectingAll ? "Trenne alle..." : "Alle Verbindungen trennen"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
