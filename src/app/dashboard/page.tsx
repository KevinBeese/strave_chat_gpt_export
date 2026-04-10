import { ConnectButton } from "@/components/connect-button";
import { ExportPanel } from "@/components/export-panel";
import { getConnectionStatus } from "@/lib/connection-status";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const connection = await getConnectionStatus();

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
          </div>
          <div className="mt-6">
            <ConnectButton disabled={!connection.canStartOauth} />
          </div>
        </section>

        <ExportPanel connected={connection.connected} />
      </div>
    </main>
  );
}
