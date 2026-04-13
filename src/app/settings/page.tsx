import Image from "next/image";
import { AppNav } from "@/components/app-nav";
import { ConnectButton } from "@/components/connect-button";
import { DisconnectButton } from "@/components/disconnect-button";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getConnectionStatus } from "@/lib/connection-status";
import { prisma } from "@/lib/prisma";
import { getCurrentAthleteProfile } from "@/lib/strava";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();
  const resolvedSearchParams = await searchParams;

  const [connection, profile, athleteProfile] = await Promise.all([
    getConnectionStatus(user.id),
    prisma.profile.findUnique({ where: { id: user.id }, select: { displayName: true } }),
    getCurrentAthleteProfile(user.id),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 md:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.12em] text-black/55">Einstellungen</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Account & Strava</h1>
        </div>
        <AppNav current="settings" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
          <p className="text-xs uppercase tracking-[0.08em] text-black/45">Supabase Account</p>
          <p className="mt-3 text-sm text-black/70">E-Mail: {user.email ?? "unbekannt"}</p>

          <form action="/settings/profile" className="mt-4 space-y-3" method="post">
            <label className="block text-sm font-medium text-black/75" htmlFor="displayName">
              Anzeigename
            </label>
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
              defaultValue={profile?.displayName ?? ""}
              id="displayName"
              maxLength={80}
              name="displayName"
              placeholder="z. B. Kevin"
              type="text"
            />
            <button
              className="rounded-full bg-[color:var(--accent)] px-5 py-2 text-sm font-medium text-[color:var(--accent-foreground)]"
              type="submit"
            >
              Profil speichern
            </button>
          </form>

          {resolvedSearchParams.profile_updated === "1" ? (
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              Profil wurde gespeichert.
            </p>
          ) : null}
        </section>

        <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
          <p className="text-xs uppercase tracking-[0.08em] text-black/45">Strava Verbindung</p>
          <p className="mt-3 text-sm font-medium text-black/80">
            {connection.connected ? "Verbunden" : "Nicht verbunden"}
          </p>

          {connection.connected ? (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-black/10 bg-white/85 p-3">
              {athleteProfile?.avatarUrl ? (
                <Image
                  alt="Strava Profilbild"
                  className="h-12 w-12 rounded-full border border-black/10 object-cover"
                  height={48}
                  src={athleteProfile.avatarUrl}
                  width={48}
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-black/5 text-xs text-black/55">
                  N/A
                </div>
              )}
              <div className="text-sm">
                <p className="font-medium text-black/85">
                  {athleteProfile?.displayName || connection.label || "Unbekannt"}
                </p>
                <p className="text-black/60">Athlete ID: {connection.athleteId ?? "-"}</p>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <ConnectButton connected={connection.connected} disabled={!connection.canStartOauth} />
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
      </div>
    </main>
  );
}
