import Image from "next/image";
import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import { ConnectButton } from "@/components/connect-button";
import { DisconnectButton } from "@/components/disconnect-button";
import { ExportPanel } from "@/components/export-panel";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { SyncButton } from "@/components/sync-button";
import { ensureAppUserExists, requireAuthenticatedUser } from "@/lib/auth";
import { getConnectionStatus } from "@/lib/connection-status";
import { getDashboardSummary } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { getCurrentAthleteProfile } from "@/lib/strava";

export const dynamic = "force-dynamic";

function getStatusMessage(searchParams: Record<string, string | string[] | undefined>) {
  const connected = searchParams.connected;
  const disconnected = searchParams.disconnected;
  const error = searchParams.error;

  if (connected === "1") {
    return {
      tone: "success" as const,
      text: "Strava wurde erfolgreich verbunden.",
    };
  }

  if (disconnected === "1") {
    return {
      tone: "neutral" as const,
      text: "Die Strava-Verbindung wurde entfernt.",
    };
  }

  if (typeof error === "string") {
    const messages: Record<string, string> = {
      access_denied: "Die Strava-Freigabe wurde abgebrochen.",
      invalid_state: "Die Rueckkehr von Strava konnte nicht verifiziert werden.",
      missing_code: "Strava hat keinen gueltigen OAuth-Code zurueckgegeben.",
      oauth_failed: "Der Austausch des Strava-OAuth-Tokens ist fehlgeschlagen.",
      auth_setup_failed: "Die Session-Initialisierung ist fehlgeschlagen.",
      db_write_failed: "OAuth war erfolgreich, aber die Verbindung konnte nicht gespeichert werden.",
      db_schema_missing: "Prisma-Tabellen fehlen in der Datenbank.",
      disconnect_failed: "Die Verbindung konnte nicht getrennt werden.",
      unauthorized: "Bitte logge dich zuerst ein.",
    };

    return {
      tone: "error" as const,
      text: messages[error] ?? `Strava hat mit einem Fehler geantwortet: ${error}`,
    };
  }

  return null;
}

function formatDistance(meters: number) {
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes} min`;
  }

  return `${hours} h ${minutes} min`;
}

function formatDate(dateIso: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(new Date(dateIso));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();
  await ensureAppUserExists(user.id, user.email);

  const [resolvedSearchParams, connection, summary, profile, athleteProfile] = await Promise.all([
    searchParams,
    getConnectionStatus(user.id),
    getDashboardSummary(user.id),
    prisma.profile.findUnique({ where: { id: user.id }, select: { displayName: true } }),
    getCurrentAthleteProfile(user.id),
  ]);

  const statusMessage = getStatusMessage(resolvedSearchParams);
  const greetingName = profile?.displayName?.trim() || user.email || "Athlete";

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-black/65">Hallo {greetingName}</p>
          <p className="text-xs text-black/55">Supabase Account: {user.email ?? "unbekannt"}</p>
        </div>
        <AppNav current="dashboard" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="space-y-6">
          <article className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.12em] text-black/55">Status</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Dein Dashboard</h1>
                <p className="mt-2 text-sm text-black/70">
                  {connection.connected ? "Strava verbunden" : "Strava nicht verbunden"}
                </p>
              </div>
              <SyncButton disabled={!connection.connected} />
            </div>

            {connection.connected ? (
              <div className="mt-5 rounded-2xl border border-black/10 bg-white/80 p-4">
                <p className="text-xs uppercase tracking-[0.08em] text-black/45">Verbundener Strava Account</p>
                <div className="mt-3 flex items-center gap-3">
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
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <ConnectButton connected={connection.connected} disabled={!connection.canStartOauth} />
              {connection.connected ? <DisconnectButton /> : null}
              <form action="/auth/sign-out" method="post">
                <PendingSubmitButton
                  className="rounded-full border border-[color:var(--border)] px-5 py-3 text-sm font-medium text-black/72 transition hover:bg-black/5"
                  idleLabel="Ausloggen"
                  pendingLabel="Logge aus..."
                />
              </form>
            </div>

            {statusMessage ? (
              <div
                className={`mt-5 rounded-2xl border p-4 text-sm ${
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
          </article>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Aktivitaeten gesamt</p>
              <p className="mt-2 text-2xl font-semibold">{summary.totalActivities}</p>
            </article>
            <article className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Gesamtstrecke</p>
              <p className="mt-2 text-2xl font-semibold">{formatDistance(summary.totalDistanceMeters)}</p>
            </article>
            <article className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Gesamtzeit</p>
              <p className="mt-2 text-2xl font-semibold">{formatDuration(summary.totalMovingTimeSeconds)}</p>
            </article>
            <article className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Letzte Aktivitaet</p>
              <p className="mt-2 text-lg font-semibold">
                {summary.lastActivityDate ? formatDate(summary.lastActivityDate) : "-"}
              </p>
            </article>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-black/10 bg-white/80 p-5">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Letzte 7 Tage</p>
              <p className="mt-2 text-sm text-black/72">{summary.last7Days.activities} Aktivitaeten</p>
              <p className="text-sm text-black/72">{formatDistance(summary.last7Days.distanceMeters)}</p>
              <p className="text-sm text-black/72">{formatDuration(summary.last7Days.movingTimeSeconds)}</p>
              <Link className="mt-3 inline-block text-sm font-medium text-[color:var(--accent)] hover:underline" href="/activities?range=7">
                Details ansehen
              </Link>
            </article>
            <article className="rounded-2xl border border-black/10 bg-white/80 p-5">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Letzte 30 Tage</p>
              <p className="mt-2 text-sm text-black/72">{summary.last30Days.activities} Aktivitaeten</p>
              <p className="text-sm text-black/72">{formatDistance(summary.last30Days.distanceMeters)}</p>
              <p className="text-sm text-black/72">{formatDuration(summary.last30Days.movingTimeSeconds)}</p>
              <Link className="mt-3 inline-block text-sm font-medium text-[color:var(--accent)] hover:underline" href="/activities?range=30">
                Details ansehen
              </Link>
            </article>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white/80 p-5">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Sportarten</p>
            <div className="mt-3 grid gap-2">
              {summary.sportBreakdown.slice(0, 6).map((sport) => (
                <div key={sport.type} className="flex items-center justify-between text-sm">
                  <span>{sport.type}</span>
                  <span className="text-black/70">{Math.round(sport.percentage)}%</span>
                </div>
              ))}
              {summary.sportBreakdown.length === 0 ? (
                <p className="text-sm text-black/60">Noch keine Daten vorhanden.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-black/10 bg-white/80 p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Letzte Aktivitaeten</p>
              <Link className="text-sm font-medium text-[color:var(--accent)] hover:underline" href="/activities">
                Alle anzeigen
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {summary.recentActivities.slice(0, 8).map((activity) => (
                <Link
                  key={activity.id}
                  className="flex items-center justify-between rounded-xl border border-black/8 bg-white/85 px-3 py-2 text-sm hover:bg-black/[0.03]"
                  href={`/activities/${activity.id}`}
                >
                  <span className="truncate pr-3">{activity.name}</span>
                  <span className="whitespace-nowrap text-black/65">
                    {activity.type} - {formatDistance(activity.distanceMeters)}
                  </span>
                </Link>
              ))}
              {summary.recentActivities.length === 0 ? (
                <p className="text-sm text-black/60">Noch keine Aktivitaeten vorhanden.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/6 p-5">
            <p className="text-sm font-semibold text-[color:var(--accent)]">Naechste Schritte</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <Link className="rounded-full border border-[color:var(--accent)]/30 px-3 py-1" href="/activities?range=7">
                Letzte 7 Tage analysieren
              </Link>
              <Link className="rounded-full border border-[color:var(--accent)]/30 px-3 py-1" href="/settings">
                Profil & Verbindungen anpassen
              </Link>
            </div>
          </section>
        </section>

        <aside className="space-y-6">
          <ExportPanel connected={connection.connected} />
        </aside>
      </div>
    </main>
  );
}
