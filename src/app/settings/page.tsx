import Link from "next/link";

import { ConnectButton } from "@/components/connect-button";
import { DisconnectButton } from "@/components/disconnect-button";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getConnectionStatus } from "@/lib/connection-status";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireAuthenticatedUser();
  const connection = await getConnectionStatus(user.id);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10 md:px-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.12em] text-black/55">Einstellungen</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Account & Strava</h1>
        </div>
        <Link
          className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/5"
          href="/dashboard"
        >
          Zum Dashboard
        </Link>
      </div>

      <section className="mt-6 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8">
        <p className="text-sm text-black/70">
          Eingeloggt als <span className="font-semibold">{user.email ?? user.id}</span>
        </p>
        <p className="mt-4 text-base font-semibold">
          {connection.connected ? "Strava verbunden" : "Strava nicht verbunden"}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ConnectButton
            connected={connection.connected}
            disabled={!connection.canStartOauth}
          />
          {connection.connected ? <DisconnectButton /> : null}
          <form action="/auth/sign-out" method="post">
            <button
              className="rounded-full border border-[color:var(--border)] px-5 py-3 text-sm font-medium text-black/72 transition hover:bg-black/5"
              type="submit"
            >
              Ausloggen
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
