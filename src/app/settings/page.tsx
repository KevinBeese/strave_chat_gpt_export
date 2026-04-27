import type { UserRole } from "@prisma/client";
import Image from "next/image";

import { AppNav } from "@/components/app-nav";
import { Beat81ImportPanel } from "@/components/beat81-import-panel";
import { ConnectButton } from "@/components/connect-button";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { DisconnectButton } from "@/components/disconnect-button";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getConnectionStatus } from "@/lib/connection-status";
import { prisma } from "@/lib/prisma";
import { getCurrentAthleteProfile } from "@/lib/strava";
import { getCurrentWahooProfile, getWahooConnectionStatus } from "@/lib/wahoo";

export const dynamic = "force-dynamic";

const roleLabel: Record<UserRole, string> = {
  USER: "User",
  SUBADMIN: "Subadmin",
  SUPERADMIN: "Superadmin",
};

function readStringParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return typeof value === "string" ? value : "";
}

function getErrorMessage(error: string) {
  const messages: Record<string, string> = {
    missing_admin_code: "Bitte gib einen Admin-Code ein.",
    invalid_admin_code: "Der Admin-Code ist ungueltig.",
    admin_code_revoked: "Dieser Admin-Code wurde widerrufen.",
    admin_code_expired: "Dieser Admin-Code ist abgelaufen.",
    admin_code_used_up: "Dieser Admin-Code wurde bereits vollstaendig genutzt.",
    admin_code_unavailable: "Der Admin-Code ist nicht mehr verfuegbar.",
    bootstrap_code_disabled: "Bootstrap-Code ist deaktiviert, da bereits ein Superadmin existiert.",
    admin_code_failed: "Admin-Code konnte nicht verarbeitet werden.",
    admin_only: "Diese Aktion ist nur fuer Superadmins erlaubt.",
    missing_target_user: "Ziel-User fuer die Aktion fehlt.",
    user_not_found: "Der ausgewaehlte User wurde nicht gefunden.",
    cannot_delete_superadmin: "Ein anderer Superadmin kann hier nicht geloescht werden.",
    account_delete_failed: "Konto konnte nicht geloescht werden. Bitte erneut versuchen.",
  };

  return messages[error] ?? "";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuthenticatedUser();
  const resolvedSearchParams = await searchParams;

  const [stravaConnection, wahooConnection, profile, athleteProfile, wahooProfile] = await Promise.all([
    getConnectionStatus(user.id),
    getWahooConnectionStatus(user.id),
    prisma.profile.findUnique({
      where: {
        id: user.id,
      },
      select: {
        displayName: true,
        role: true,
      },
    }),
    getCurrentAthleteProfile(user.id),
    getCurrentWahooProfile(user.id),
  ]);

  const currentRole = profile?.role ?? "USER";
  const isSuperadmin = currentRole === "SUPERADMIN";

  const [adminUsers, recentInviteCodes] = isSuperadmin
    ? await Promise.all([
        prisma.profile.findMany({
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            createdAt: true,
          },
        }),
        prisma.adminInviteCode.findMany({
          where: {
            createdByUserId: user.id,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 6,
          select: {
            id: true,
            targetRole: true,
            maxUses: true,
            usedCount: true,
            expiresAt: true,
            revokedAt: true,
            createdAt: true,
          },
        }),
      ])
    : [[], []];

  const error = readStringParam(resolvedSearchParams, "error");
  const errorMessage = getErrorMessage(error);
  const roleUpgraded = readStringParam(resolvedSearchParams, "role_upgraded");
  const newAdminCode = readStringParam(resolvedSearchParams, "new_admin_code");
  const newAdminRole = readStringParam(resolvedSearchParams, "new_admin_role");
  const newAdminMaxUses = readStringParam(resolvedSearchParams, "new_admin_max_uses");
  const accountDeleted = readStringParam(resolvedSearchParams, "account_deleted") === "1";

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.12em] text-black/55">Einstellungen</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Account & Verbindungen</h1>
        </div>
        <AppNav current="settings" />
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      {roleUpgraded ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Rolle erfolgreich aktualisiert: {roleUpgraded}
        </p>
      ) : null}

      {accountDeleted ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Konto wurde erfolgreich geloescht.
        </p>
      ) : null}

      {newAdminCode ? (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          <p className="font-medium">Neuer Invite-Code erstellt</p>
          <p className="mt-1">
            Rolle: {newAdminRole || "SUBADMIN"} | Max Uses: {newAdminMaxUses || "1"}
          </p>
          <p className="mt-2 rounded-lg border border-sky-300 bg-white px-3 py-2 font-mono text-base tracking-[0.12em]">
            {newAdminCode}
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
          <p className="text-xs uppercase tracking-[0.08em] text-black/45">Supabase Account</p>
          <p className="mt-3 text-sm text-black/70">E-Mail: {user.email ?? "unbekannt"}</p>
          <p className="mt-2 text-sm text-black/70">
            Rolle: <span className="font-semibold">{roleLabel[currentRole]}</span>
          </p>

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

          <form action="/settings/redeem-role-code" className="mt-6 space-y-3" method="post">
            <label className="block text-sm font-medium text-black/75" htmlFor="adminCode">
              Admin-Code einloesen
            </label>
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 font-mono text-sm uppercase tracking-[0.1em] outline-none ring-[color:var(--accent)] focus:ring-2"
              id="adminCode"
              maxLength={64}
              name="adminCode"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              type="text"
            />
            <button
              className="rounded-full border border-[color:var(--border)] px-5 py-2 text-sm font-medium text-black/75 transition hover:bg-black/5"
              type="submit"
            >
              Code einloesen
            </button>
          </form>

          {resolvedSearchParams.profile_updated === "1" ? (
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              Profil wurde gespeichert.
            </p>
          ) : null}
        </section>

        <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
          <p className="text-xs uppercase tracking-[0.08em] text-black/45">Provider Verbindungen</p>

          <div className="mt-3 grid gap-4">
            <div className="rounded-2xl border border-black/10 bg-white/85 p-4">
              <p className="text-sm font-semibold text-black/80">Strava</p>
              <p className="mt-1 text-sm text-black/72">
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
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 bg-white/85 p-4">
              <p className="text-sm font-semibold text-black/80">Wahoo</p>
              <p className="mt-1 text-sm text-black/72">
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
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <form action="/auth/sign-out" method="post">
              <button
                className="rounded-full border border-[color:var(--border)] px-5 py-3 text-sm font-medium text-black/72 transition hover:bg-black/5"
                type="submit"
              >
                Ausloggen
              </button>
            </form>

            {isSuperadmin ? (
              <DeleteAccountButton
                confirmText="Moechtest du dein eigenes Konto wirklich loeschen? Damit wird auch dein Superadmin-Account entfernt."
                idleLabel="Eigenes Konto loeschen"
                pendingLabel="Konto wird geloescht..."
                targetUserId={user.id}
              />
            ) : null}
          </div>
        </section>
      </div>

      <section
        className="mt-5 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6"
        id="beat81-import"
      >
        <p className="text-xs uppercase tracking-[0.08em] text-black/45">Import</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Beat81 (manuell)</h2>
        <p className="mt-2 text-sm text-black/70">
          Optionaler Bereich fuer Text- oder Screenshot-Import von Beat81 Sessions.
        </p>

        <details className="mt-4 rounded-2xl border border-black/10 bg-white/85 p-4">
          <summary className="cursor-pointer text-sm font-medium text-black/80">
            Beat81 Import einblenden
          </summary>
          <div className="mt-4">
            <Beat81ImportPanel />
          </div>
        </details>
      </section>

      {isSuperadmin ? (
        <section className="mt-5 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
          <p className="text-xs uppercase tracking-[0.08em] text-black/45">Superadmin Bereich</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Admin-Codes & Nutzerverwaltung</h2>

          <form action="/api/admin/invite-codes/create" className="mt-4 grid gap-3 md:grid-cols-4" method="post">
            <label className="text-sm text-black/70" htmlFor="targetRole">
              Zielrolle
              <select
                className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
                defaultValue="SUBADMIN"
                id="targetRole"
                name="targetRole"
              >
                <option value="SUBADMIN">Subadmin</option>
                <option value="SUPERADMIN">Superadmin</option>
              </select>
            </label>

            <label className="text-sm text-black/70" htmlFor="maxUses">
              Max Uses
              <input
                className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
                defaultValue={1}
                id="maxUses"
                max={100}
                min={1}
                name="maxUses"
                type="number"
              />
            </label>

            <label className="text-sm text-black/70" htmlFor="expiresInHours">
              Gueltig (Stunden)
              <input
                className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
                defaultValue={24}
                id="expiresInHours"
                max={720}
                min={1}
                name="expiresInHours"
                type="number"
              />
            </label>

            <div className="flex items-end">
              <button
                className="w-full rounded-full bg-[color:var(--accent)] px-5 py-2.5 text-sm font-medium text-[color:var(--accent-foreground)]"
                type="submit"
              >
                Invite-Code erstellen
              </button>
            </div>
          </form>

          <div className="mt-6">
            <p className="text-sm font-semibold text-black/80">Zuletzt erstellte Codes</p>
            <div className="mt-2 space-y-2">
              {recentInviteCodes.length === 0 ? (
                <p className="rounded-xl border border-black/10 bg-white/80 p-3 text-sm text-black/60">
                  Noch keine Codes erstellt.
                </p>
              ) : (
                recentInviteCodes.map((code) => (
                  <div
                    className="rounded-xl border border-black/10 bg-white/85 p-3 text-sm text-black/70"
                    key={code.id}
                  >
                    Rolle: {roleLabel[code.targetRole]} | Uses: {code.usedCount}/{code.maxUses} |{" "}
                    {code.revokedAt
                      ? "Widerrufen"
                      : code.expiresAt
                        ? `Ablauf: ${code.expiresAt.toLocaleString("de-DE")}`
                        : "Kein Ablauf"}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-black/80">Nutzer</p>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-black/10 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-black/5 text-left text-black/65">
                  <tr>
                    <th className="px-3 py-2 font-medium">E-Mail</th>
                    <th className="px-3 py-2 font-medium">Rolle</th>
                    <th className="px-3 py-2 font-medium">Seit</th>
                    <th className="px-3 py-2 font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((adminUser) => (
                    <tr className="border-t border-black/10" key={adminUser.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-black/80">{adminUser.email || "unbekannt"}</p>
                        <p className="text-xs text-black/55">{adminUser.id}</p>
                      </td>
                      <td className="px-3 py-2 text-black/70">{roleLabel[adminUser.role]}</td>
                      <td className="px-3 py-2 text-black/70">
                        {adminUser.createdAt.toLocaleDateString("de-DE")}
                      </td>
                      <td className="px-3 py-2">
                        {adminUser.role === "SUPERADMIN" && adminUser.id !== user.id ? (
                          <span className="text-xs text-black/45">Nicht loeschbar</span>
                        ) : (
                          <DeleteAccountButton
                            confirmText={`Soll das Konto ${adminUser.email || adminUser.id} wirklich geloescht werden?`}
                            idleLabel={adminUser.id === user.id ? "Eigenes Konto loeschen" : "Konto loeschen"}
                            pendingLabel="Loesche..."
                            targetUserId={adminUser.id}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
