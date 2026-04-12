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
      text: "Die Strava-Verbindung fuer diese Session wurde entfernt.",
    };
  }

  if (typeof error === "string") {
    const messages: Record<string, string> = {
      access_denied: "Die Strava-Freigabe wurde abgebrochen.",
      invalid_state: "Die Rueckkehr von Strava konnte nicht sicher verifiziert werden. Bitte versuche den Login erneut.",
      missing_code: "Strava hat keinen gueltigen OAuth-Code zurueckgegeben.",
      oauth_failed: "Der Austausch des Strava-OAuth-Tokens ist fehlgeschlagen.",
      auth_setup_failed: "Die Session oder Auth-Initialisierung ist fehlgeschlagen.",
      db_write_failed: "OAuth war erfolgreich, aber die Verbindung konnte nicht gespeichert werden. Pruefe auf Vercel die Datenbank-Konfiguration (SQLite-Dateipfade sind dort meist nicht beschreibbar).",
      db_schema_missing: "Die Datenbank ist erreichbar, aber das Prisma-Schema fehlt (P2021). Auf Vercel mit /tmp muss das Schema bei jedem Start neu erstellt werden; nutze besser Postgres.",
      disconnect_failed: "Die Verbindung konnte nicht getrennt werden.",
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
          <p className="text-sm uppercase tracking-[0.14em] text-black/55">
            Verbindung
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Strava-Verbindung verwalten
          </h1>
          <p className="mt-4 text-sm leading-6 text-black/72">
            Jede Browser-Session nutzt jetzt einen eigenen User-Kontext mit
            separater Strava-Verbindung. Nach der OAuth-Freigabe kannst du die
            letzten 7, 14 oder 30 Tage exportieren.
          </p>
          <div className="mt-6 rounded-3xl border border-[color:var(--border)] bg-white/85 p-5 shadow-[0_10px_30px_rgba(29,27,22,0.05)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-black/60">Status</p>
                <p className="mt-2 text-lg font-semibold">
                  {connection.connected ? "Mit Strava verbunden" : "Noch nicht verbunden"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${
                  connection.hasProfileReadAll
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {connection.hasProfileReadAll
                  ? "profile:read_all aktiv"
                  : "profile:read_all fehlt"}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-black/68">
              {connection.connected
                ? `Verbundener Athlet: ${connection.label}`
                : "Lege zuerst die Strava-Umgebungsvariablen an und verbinde dann deinen Account."}
            </p>
            {connection.athleteId ? (
              <p className="mt-2 text-xs uppercase tracking-[0.08em] text-black/42">
                Strava Athlete ID: {connection.athleteId}
              </p>
            ) : null}
            {expiresAt ? (
              <p className="mt-2 text-sm leading-6 text-black/58">
                Token gueltig bis: {expiresAt}
              </p>
            ) : null}
            {connection.grantedScopes.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-black/42">
                  OAuth-Scopes
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {connection.grantedScopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/62"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {!connection.hasProfileReadAll && connection.connected ? (
              <div className="mt-4 rounded-2xl border border-[color:var(--accent)]/18 bg-[color:var(--accent)]/8 p-4 text-sm leading-6 text-[color:var(--accent)]">
                <p className="font-semibold">Profilzonen werden aktuell nicht geladen.</p>
                <p className="mt-1">
                  Fuer Herzfrequenz- und Power-Bereiche bitte die Strava-Verbindung
                  einmal neu autorisieren, damit `athlete/zones` sauber genutzt werden kann.
                </p>
              </div>
            ) : null}
            {connection.hasProfileReadAll && connection.connected ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-700">
                `profile:read_all` ist gespeichert und wird beim Export fuer `athlete/zones`
                verwendet, sobald Strava Zonen zurueckliefert.
              </div>
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
