"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton({
  disabled,
  provider = "strava",
}: {
  disabled: boolean;
  provider?: "strava" | "wahoo";
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerLabel = provider === "wahoo" ? "Wahoo" : "Strava";

  async function handleClick() {
    if (disabled || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/${provider}/sync`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Synchronisation fehlgeschlagen.");
      }

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Synchronisation fehlgeschlagen.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <button
        className="inline-flex items-center rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-[color:var(--accent-foreground)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || isLoading}
        onClick={handleClick}
        type="button"
      >
        {isLoading ? `Synchronisiert ${providerLabel}...` : `${providerLabel} synchronisieren`}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
