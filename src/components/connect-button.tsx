"use client";

export function ConnectButton({ disabled }: { disabled: boolean }) {
  return (
    <a
      aria-disabled={disabled}
      className="inline-flex items-center rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-[color:var(--accent-foreground)] transition hover:translate-y-[-1px] aria-disabled:pointer-events-none aria-disabled:opacity-40"
      href={disabled ? "#" : "/api/strava/auth"}
    >
      Mit Strava verbinden
    </a>
  );
}
