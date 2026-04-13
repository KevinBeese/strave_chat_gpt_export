"use client";

import { useState } from "react";

export function ConnectButton({
  disabled,
  connected,
}: {
  disabled: boolean;
  connected: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const isDisabled = disabled || isLoading;

  return (
    <button
      className="inline-flex items-center rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-[color:var(--accent-foreground)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40"
      disabled={isDisabled}
      onClick={() => {
        if (isDisabled) {
          return;
        }
        setIsLoading(true);
        window.location.assign("/api/strava/connect");
      }}
      type="button"
    >
      {isLoading
        ? "Verbinde mit Strava..."
        : connected
          ? "Strava-Verbindung erneuern"
          : "Mit Strava verbinden"}
    </button>
  );
}
