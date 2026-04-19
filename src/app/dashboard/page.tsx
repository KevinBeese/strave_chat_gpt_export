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
import { getWeeklySummary } from "@/lib/weekly-summary";
import { getCurrentWahooProfile, getWahooConnectionStatus } from "@/lib/wahoo";

export const dynamic = "force-dynamic";

function getStatusMessage(searchParams: Record<string, string | string[] | undefined>) {
  const stravaConnected = searchParams.connected;
  const stravaDisconnected = searchParams.disconnected;
  const wahooConnected = searchParams.wahoo_connected;
  const wahooDisconnected = searchParams.wahoo_disconnected;
  const error = searchParams.error;

  if (stravaConnected === "1") {
    return {
      tone: "success" as const,
      text: "Strava wurde erfolgreich verbunden.",
    };
  }

  if (stravaDisconnected === "1") {
    return {
      tone: "neutral" as const,
      text: "Die Strava-Verbindung wurde entfernt.",
    };
  }

  if (wahooConnected === "1") {
    return {
      tone: "success" as const,
      text: "Wahoo wurde erfolgreich verbunden.",
    };
  }

  if (wahooDisconnected === "1") {
    return {
      tone: "neutral" as const,
      text: "Die Wahoo-Verbindung wurde entfernt.",
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
      wahoo_invalid_state: "Die Rueckkehr von Wahoo konnte nicht verifiziert werden.",
      wahoo_missing_code: "Wahoo hat keinen gueltigen OAuth-Code zurueckgegeben.",
      wahoo_invalid_scope:
        "Wahoo OAuth meldet ungueltige Scopes. Bitte pruefe WAHOO_OAUTH_SCOPES in den Environment-Variablen.",
      wahoo_oauth_failed: "Der Austausch des Wahoo-OAuth-Tokens ist fehlgeschlagen.",
      wahoo_auth_setup_failed: "Die Wahoo-Initialisierung ist fehlgeschlagen.",
      wahoo_disconnect_failed: "Die Wahoo-Verbindung konnte nicht getrennt werden.",
      unauthorized: "Bitte logge dich zuerst ein.",
    };

    return {
      tone: "error" as const,
      text: messages[error] ?? `OAuth hat mit einem Fehler geantwortet: ${error}`,
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

function formatDeltaLabel(value: number | null, suffix = "") {
  if (value === null) {
    return "n/a";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })}${suffix}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();
  await ensureAppUserExists(user.id, user.email);

  const [
    resolvedSearchParams,
    stravaConnection,
    wahooConnection,
    summary,
    weeklySummary,
    exportSnapshotCount,
    profile,
    athleteProfile,
    wahooProfile,
  ] = await Promise.all([
    searchParams,
    getConnectionStatus(user.id),
    getWahooConnectionStatus(user.id),
    getDashboardSummary(user.id),
    getWeeklySummary(user.id),
    prisma.exportSnapshot.count({ where: { userId: user.id } }),
    prisma.profile.findUnique({ where: { id: user.id }, select: { displayName: true } }),
    getCurrentAthleteProfile(user.id),
    getCurrentWahooProfile(user.id),
  ]);

  const statusMessage = getStatusMessage(resolvedSearchParams);
  const greetingName = profile?.displayName?.trim() || user.email || "Athlete";
  const hasActivities = summary.totalActivities > 0;
  const justConnected = resolvedSearchParams.connected === "1";
  const hasCompletedOnboarding = exportSnapshotCount > 0;
  const showOnboarding =
    resolvedSearchParams.onboarding === "1" || !hasCompletedOnboarding;
  const shouldFocusExport =
    resolvedSearchParams.focus === "export" || resolvedSearchParams.onboarding === "1" || justConnected;
  const onboardingJustCompleted = resolvedSearchParams.onboarding_done === "1";

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
          {onboardingJustCompleted ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Onboarding abgeschlossen</p>
                  <p className="mt-1">
                    Starker Start. Dein erster Export ist erstellt und dein Dashboard ist jetzt im normalen Modus.
                  </p>
                </div>
                <Link
                  className="rounded-full border border-emerald-300 bg-white px-4 py-2 font-medium text-emerald-700 hover:bg-emerald-100"
                  href="/dashboard"
                >
                  Hinweis ausblenden
                </Link>
              </div>
            </section>
          ) : null}

          <article className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.12em] text-black/55">Status</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Dein Dashboard</h1>
                <p className="mt-2 text-sm text-black/65">
                  Strava: {stravaConnection.connected ? "verbunden" : "nicht verbunden"} | Wahoo:{" "}
                  {wahooConnection.connected ? "verbunden" : "nicht verbunden"}
                </p>
              </div>
              <SyncButton disabled={!stravaConnection.connected} provider="strava" />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
                <p className="text-xs uppercase tracking-[0.08em] text-black/45">Strava</p>
                <p className="mt-2 text-sm font-medium text-black/80">
                  {stravaConnection.connected ? "Verbunden" : "Nicht verbunden"}
                </p>

                {stravaConnection.connected ? (
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
                        {athleteProfile?.displayName || stravaConnection.label || "Unbekannt"}
                      </p>
                      <p className="text-black/60">Athlete ID: {stravaConnection.athleteId ?? "-"}</p>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <ConnectButton
                    connected={stravaConnection.connected}
                    disabled={!stravaConnection.canStartOauth}
                    provider="strava"
                  />
                  {stravaConnection.connected ? <DisconnectButton provider="strava" /> : null}
                  <SyncButton disabled={!stravaConnection.connected} provider="strava" />
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
                <p className="text-xs uppercase tracking-[0.08em] text-black/45">Wahoo</p>
                <p className="mt-2 text-sm font-medium text-black/80">
                  {wahooConnection.connected ? "Verbunden" : "Nicht verbunden"}
                </p>

                {wahooConnection.connected ? (
                  <div className="mt-3 text-sm">
                    <p className="font-medium text-black/85">
                      {wahooProfile?.displayName || wahooConnection.label || "Unbekannt"}
                    </p>
                    <p className="text-black/60">Wahoo User ID: {wahooConnection.wahooUserId ?? "-"}</p>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <ConnectButton
                    connected={wahooConnection.connected}
                    disabled={!wahooConnection.canStartOauth}
                    provider="wahoo"
                  />
                  {wahooConnection.connected ? <DisconnectButton provider="wahoo" /> : null}
                  <SyncButton disabled={!wahooConnection.connected} provider="wahoo" />
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
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

            {justConnected ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                Strava ist verbunden. Wir setzen den Zeitraum auf 7 Tage und fuehren dich direkt zum ersten Export.
                <a className="ml-1 font-semibold underline" href="#export-panel">
                  Zum Export springen
                </a>
              </div>
            ) : null}
          </article>

          {showOnboarding ? (
            <section className="rounded-2xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/6 p-5">
              <p className="text-xs uppercase tracking-[0.08em] text-[color:var(--accent)]/75">First Run</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">In 3 Schritten zum ersten Export</h2>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  {
                    title: "1. Strava verbinden",
                    done: stravaConnection.connected,
                    text: "OAuth-Verbindung aktivieren, damit wir deine Aktivitaeten abrufen koennen.",
                  },
                  {
                    title: "2. Zeitraum waehlen",
                    done: stravaConnection.connected,
                    text: "Standard ist bereits auf 7 Tage gesetzt fuer den schnellsten Einstieg.",
                  },
                  {
                    title: "3. Export erstellen",
                    done: hasActivities,
                    text: "JSON + GPT-Block erzeugen und direkt kopieren oder herunterladen.",
                  },
                ].map((step) => (
                  <article key={step.title} className="rounded-2xl border border-black/10 bg-white/85 p-4">
                    <p className="text-sm font-semibold text-black/82">{step.title}</p>
                    <p className="mt-2 text-sm text-black/66">{step.text}</p>
                    <p
                      className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${
                        step.done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {step.done ? "Erledigt" : "Offen"}
                    </p>
                  </article>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {!stravaConnection.connected ? (
                  <ConnectButton
                    connected={stravaConnection.connected}
                    disabled={!stravaConnection.canStartOauth}
                    provider="strava"
                  />
                ) : null}
                {stravaConnection.connected ? (
                  <a
                    className="inline-flex items-center rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-[color:var(--accent-foreground)] transition hover:translate-y-[-1px]"
                    href="#export-panel"
                  >
                    Ersten 7-Tage-Export starten
                  </a>
                ) : null}
                {hasActivities ? (
                  <Link
                    className="inline-flex items-center rounded-full border border-[color:var(--border)] px-5 py-3 text-sm font-medium text-black/72 transition hover:bg-black/5"
                    href="/activities?range=7"
                  >
                    Export in Aktivitaeten ansehen
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}

          {stravaConnection.connected && !hasActivities ? (
            <section className="rounded-2xl border border-black/10 bg-white/85 p-5">
              <p className="text-sm font-semibold text-black/82">Noch keine Aktivitaeten gefunden</p>
              <p className="mt-2 text-sm text-black/66">
                Die Verbindung steht, aber im aktuellen Datenstand sind noch keine Einheiten verfuegbar.
                Starte zuerst einen 7-Tage-Export oder synchronisiere erneut.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  className="inline-flex items-center rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-[color:var(--accent-foreground)] transition hover:translate-y-[-1px]"
                  href="#export-panel"
                >
                  Zum Export
                </a>
                <SyncButton disabled={!stravaConnection.connected} provider="strava" />
              </div>
            </section>
          ) : null}

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
              <Link
                className="mt-3 inline-block text-sm font-medium text-[color:var(--accent)] hover:underline"
                href="/activities?range=7"
              >
                Details ansehen
              </Link>
            </article>
            <article className="rounded-2xl border border-black/10 bg-white/80 p-5">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Letzte 30 Tage</p>
              <p className="mt-2 text-sm text-black/72">{summary.last30Days.activities} Aktivitaeten</p>
              <p className="text-sm text-black/72">{formatDistance(summary.last30Days.distanceMeters)}</p>
              <p className="text-sm text-black/72">{formatDuration(summary.last30Days.movingTimeSeconds)}</p>
              <Link
                className="mt-3 inline-block text-sm font-medium text-[color:var(--accent)] hover:underline"
                href="/activities?range=30"
              >
                Details ansehen
              </Link>
            </article>
          </section>

          <section className="rounded-2xl border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/6 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-[color:var(--accent)]/75">
                  Aha Feature
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">Wochenzusammenfassung</h2>
                <p className="mt-2 text-sm text-black/70">
                  Zeitraum: {formatDate(weeklySummary.week_start)} bis {formatDate(weeklySummary.week_end)}
                </p>
              </div>
              <a
                className="inline-flex items-center rounded-full border border-[color:var(--accent)]/30 bg-white px-4 py-2 text-sm font-medium text-[color:var(--accent)] hover:bg-[color:var(--accent)]/10"
                href={`/api/export/weekly.md?weekStart=${weeklySummary.week_start}`}
              >
                Markdown exportieren
              </a>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <article className="rounded-xl border border-black/10 bg-white/90 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-black/45">Einheiten</p>
                <p className="mt-1 text-xl font-semibold">{weeklySummary.metrics.total_activities}</p>
              </article>
              <article className="rounded-xl border border-black/10 bg-white/90 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-black/45">Distanz</p>
                <p className="mt-1 text-xl font-semibold">{weeklySummary.metrics.total_distance_km} km</p>
              </article>
              <article className="rounded-xl border border-black/10 bg-white/90 p-3">
                <p className="text-xs uppercase tracking-[0.08em] text-black/45">Zeit</p>
                <p className="mt-1 text-xl font-semibold">{weeklySummary.metrics.total_moving_time_h} h</p>
              </article>
            </div>

            {weeklySummary.metrics.total_activities > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <article className="rounded-xl border border-black/10 bg-white/90 p-3 text-sm">
                  <p className="font-medium text-black/80">Highlights</p>
                  <p className="mt-2 text-black/70">
                    Top Typ: {weeklySummary.highlights.top_activity_type.type ?? "n/a"} (
                    {weeklySummary.highlights.top_activity_type.count})
                  </p>
                  <p className="text-black/70">
                    Laengste Einheit: {weeklySummary.highlights.longest_activity?.name ?? "n/a"}
                  </p>
                  <p className="text-black/70">
                    Haerteste Einheit: {weeklySummary.highlights.hardest_activity?.name ?? "n/a"}
                  </p>
                </article>

                <article className="rounded-xl border border-black/10 bg-white/90 p-3 text-sm">
                  <p className="font-medium text-black/80">Vergleich zur Vorwoche</p>
                  <p className="mt-2 text-black/70">
                    Einheiten: {formatDeltaLabel(weeklySummary.comparison.vs_previous_week.activities_delta_abs)}
                  </p>
                  <p className="text-black/70">
                    Distanz: {formatDeltaLabel(weeklySummary.comparison.vs_previous_week.distance_delta_km_abs, " km")} (
                    {formatDeltaLabel(weeklySummary.comparison.vs_previous_week.distance_delta_pct, " %")})
                  </p>
                  <p className="text-black/70">
                    Zeit: {formatDeltaLabel(weeklySummary.comparison.vs_previous_week.moving_time_delta_h_abs, " h")} (
                    {formatDeltaLabel(weeklySummary.comparison.vs_previous_week.moving_time_delta_pct, " %")})
                  </p>
                </article>
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-black/10 bg-white/90 p-3 text-sm text-black/65">
                Fuer diese Woche sind noch keine Aktivitaeten vorhanden.
              </p>
            )}

            <p className="mt-4 rounded-xl border border-black/10 bg-white/90 p-3 text-sm text-black/75">
              {weeklySummary.summary_text}
            </p>
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
                    {activity.provider} · {activity.type} - {formatDistance(activity.distanceMeters)}
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
          <ExportPanel
            autoStart={shouldFocusExport && stravaConnection.connected}
            hasLocalActivities={summary.totalActivities > 0}
            emphasizeOnboarding={showOnboarding}
            refreshOnFirstSuccess={!hasCompletedOnboarding}
          />
        </aside>
      </div>
    </main>
  );
}
