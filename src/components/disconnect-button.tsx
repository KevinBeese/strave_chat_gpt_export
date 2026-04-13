import { PendingSubmitButton } from "@/components/pending-submit-button";

export function DisconnectButton({
  provider = "strava",
}: {
  provider?: "strava" | "wahoo";
}) {
  return (
    <form action={`/api/${provider}/disconnect`} method="post">
      <PendingSubmitButton
        className="rounded-full border border-[color:var(--border)] px-5 py-3 text-sm font-medium text-black/72 transition hover:bg-black/5"
        idleLabel="Verbindung trennen"
        pendingLabel="Trenne Verbindung..."
      />
    </form>
  );
}
