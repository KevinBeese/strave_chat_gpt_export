"use client";

import { useState } from "react";

export function ConnectButton({
  disabled,
  connected,
  provider = "strava",
}: {
  disabled: boolean;
  connected: boolean;
  provider?: "strava" | "wahoo";
}) {
  const [isLoading, setIsLoading] = useState(false);
  const isDisabled = disabled || isLoading;
  const providerLabel = provider === "wahoo" ? "Wahoo" : "Strava";

  return (
    <button
      className="inline-flex items-center rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-[color:var(--accent-foreground)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40"
      disabled={isDisabled}
      onClick={() => {
        if (isDisabled) {
          return;
        }
        setIsLoading(true);
        window.location.assign(`/api/${provider}/connect`);
      }}
      type="button"
    >
      {isLoading
        ? `Verbinde mit ${providerLabel}...`
        : connected
          ? `${providerLabel}-Verbindung erneuern`
          : `Mit ${providerLabel} verbinden`}
    </button>
  );
}
