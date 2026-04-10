import { ConnectButton } from "@/components/connect-button";
import { DisconnectButton } from "@/components/disconnect-button";
import { ExportPanel } from "@/components/export-panel";
import { getConnectionStatus } from "@/lib/connection-status";

export const dynamic = "force-dynamic";

function getStatusMessage(searchParams: Record<string, string | string[] | undefined>) {
  const connected = searchParams.connected;
  const disconnected = searchParams.disconnected;
  const error = searchParams.error;

  if (connected === "1") {
    return {
      tone: "success" as const,
      text: "Strava wurde erfolgreich verbunden. Du kannst jetzt den 7-Tage-Export starten.",
    };
  }

  if (disconnected === "1") {
    return {
      tone: "neutral" as const,
      text: "Die lokale Strava-Verbindung wurde entfernt.",
    };
  }

  if (typeof error === "string") {
    const messages: Record<string, string> = {
      access_denied: "Die Strava-Freigabe wurde abgebrochen.",
      invalid_state: "Die Rueckkehr von Strava konnte nicht sicher verifiziert werden. Bitte versuche den Login erneut.",
      missing_code: "Strava hat keinen gueltigen OAuth-Code zurueckgegeben.",
      oauth_failed: "Der Austausch des Strava-OAuth-Tokens ist fehlgeschlagen.",
    };

    return {
      tone: "error" as const,
      text: messages[error] ?? `Strava hat mit einem Fehler geantwortet: ${error}`,
    };
  }

  return null;
}

function formatExpiry(expiresAt: string | null) {
  if (!expiresAt) {
    return null;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(expiresAt));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const connection = await getConnectionStatus();
  const statusMessage = getStatusMessage(resolvedSearchParams);
  const expiresAt = formatExpiry(connection.expiresAt);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 md:px-10">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-[0_18px_80px_rgba(29,27,22,0.08)] backdrop-blur">
          <p className="text-sm uppercase tracking-[0.24em] text-black/55">
            Verbindung
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Strava-Verbindung verwalten
          </h1>
          <p className="mt-4 text-sm leading-6 text-black/72">
            Im MVP speichern wir genau einen lokalen Strava-Zugang. Sobald die
            OAuth-Daten hinterlegt sind, kannst du von hier die letzten 7 Tage
            exportieren.
          </p>
          <div className="mt-6 rounded-3xl border border-[color:var(--border)] bg-white/80 p-5">
            <p className="text-sm font-medium text-black/60">Status</p>
            <p className="mt-2 text-lg font-semibold">
              {connection.connected ? "Mit Strava verbunden" : "Noch nicht verbunden"}
            </p>
            <p className="mt-2 text-sm leading-6 text-black/68">
              {connection.connected
                ? `Verbundener Athlet: ${connection.label}`
                : "Lege zuerst die Strava-Umgebungsvariablen an und verbinde dann deinen Account."}
            </p>
            {connection.athleteId ? (
              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-black/42">
                Strava Athlete ID: {connection.athleteId}
              </p>
            ) : null}
            {expiresAt ? (
              <p className="mt-2 text-sm leading-6 text-black/58">
                Token gueltig bis: {expiresAt}
              </p>
            ) : null}
            {connection.grantedScopes.length > 0 ? (
              <p className="mt-2 text-sm leading-6 text-black/58">
                Scopes: {connection.grantedScopes.join(", ")}
              </p>
            ) : null}
            {!connection.hasProfileReadAll && connection.connected ? (
              <p className="mt-2 text-sm leading-6 text-[color:var(--accent)]">
                Fuer Profil-Zonen wie Herzfrequenz- und Power-Bereiche bitte die
                Strava-Verbindung einmal neu autorisieren.
              </p>
            ) : null}
          </div>
          {statusMessage ? (
            <div
              className={`mt-6 rounded-3xl border p-4 text-sm ${
                statusMessage.tone === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : statusMessage.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-black/10 bg-black/5 text-black/70"
              }`}
            >
              {statusMessage.text}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <ConnectButton
              connected={connection.connected}
              disabled={!connection.canStartOauth}
            />
            {connection.connected ? <DisconnectButton /> : null}
          </div>
        </section>

        <ExportPanel connected={connection.connected} />
      </div>
    </main>
  );
}
