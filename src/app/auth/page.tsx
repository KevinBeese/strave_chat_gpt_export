import { redirect } from "next/navigation";

import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getCurrentSupabaseUser } from "@/lib/auth";

function getAuthStatus(searchParams: Record<string, string | string[] | undefined>) {
  const error = searchParams.error;
  const reason = typeof searchParams.reason === "string" ? searchParams.reason : null;

  if (typeof error === "string") {
    const messages: Record<string, string> = {
      missing_credentials: "Bitte E-Mail und Passwort eingeben.",
      invalid_credentials: "Login fehlgeschlagen. Pruefe E-Mail und Passwort.",
      signup_failed: "Konto konnte nicht erstellt werden.",
      account_created_check_email:
        "Konto erstellt. Bitte bestaetige jetzt die E-Mail und logge dich danach ein.",
      account_created: "Konto erstellt und eingeloggt.",
      signout_failed: "Logout ist fehlgeschlagen. Bitte erneut versuchen.",
    };

    return {
      tone: error === "account_created" || error === "account_created_check_email" ? "success" : "error",
      text:
        error === "signup_failed" && reason
          ? `${messages[error] ?? "Authentifizierung fehlgeschlagen."} (${reason})`
          : (messages[error] ?? "Authentifizierung fehlgeschlagen."),
    };
  }

  if (searchParams.signed_out === "1") {
    return {
      tone: "neutral" as const,
      text: "Du wurdest ausgeloggt.",
    };
  }

  return null;
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentSupabaseUser();
  if (user) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;
  const status = getAuthStatus(resolvedSearchParams);
  const nextPath =
    typeof resolvedSearchParams.next === "string" && resolvedSearchParams.next.startsWith("/")
      ? resolvedSearchParams.next
      : "/dashboard";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10 md:px-10">
      <section className="grid w-full gap-6 rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-[0_18px_80px_rgba(29,27,22,0.08)] backdrop-blur lg:grid-cols-2 lg:p-10">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-black/55">Account</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
            Einloggen vor dem Strava-Export
          </h1>
          <p className="mt-4 text-sm leading-7 text-black/72 md:text-base">
            Erst mit deinem Konto anmelden, dann Strava verbinden und Exporte pro Nutzer getrennt
            speichern. So siehst du nach erneutem Login immer deine eigenen Daten.
          </p>
          {status ? (
            <div
              className={`mt-6 rounded-2xl border p-4 text-sm ${
                status.tone === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : status.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-black/10 bg-black/5 text-black/70"
              }`}
            >
              {status.text}
            </div>
          ) : null}
        </div>

        <div className="grid gap-5">
          <form
            action="/auth/sign-in"
            className="rounded-2xl border border-[color:var(--border)] bg-white/90 p-5"
            method="post"
          >
            <h2 className="text-lg font-semibold">Login</h2>
            <input name="next" type="hidden" value={nextPath} />
            <label className="mt-4 block text-sm font-medium text-black/70" htmlFor="sign-in-email">
              E-Mail
            </label>
            <input
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
              id="sign-in-email"
              name="email"
              required
              type="email"
            />
            <label className="mt-3 block text-sm font-medium text-black/70" htmlFor="sign-in-password">
              Passwort
            </label>
            <input
              autoComplete="current-password"
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
              id="sign-in-password"
              minLength={6}
              name="password"
              required
              type="password"
            />
            <PendingSubmitButton
              className="mt-5 inline-flex items-center rounded-full bg-[color:var(--accent)] px-5 py-2.5 text-sm font-medium text-[color:var(--accent-foreground)]"
              idleLabel="Einloggen"
              pendingLabel="Logge ein..."
            />
          </form>

          <form
            action="/auth/sign-up"
            className="rounded-2xl border border-[color:var(--border)] bg-white/90 p-5"
            method="post"
          >
            <h2 className="text-lg font-semibold">Konto erstellen</h2>
            <input name="next" type="hidden" value={nextPath} />
            <label className="mt-4 block text-sm font-medium text-black/70" htmlFor="sign-up-email">
              E-Mail
            </label>
            <input
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
              id="sign-up-email"
              name="email"
              required
              type="email"
            />
            <label className="mt-3 block text-sm font-medium text-black/70" htmlFor="sign-up-password">
              Passwort (min. 6)
            </label>
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
              id="sign-up-password"
              minLength={6}
              name="password"
              required
              type="password"
            />
            <PendingSubmitButton
              className="mt-5 inline-flex items-center rounded-full border border-[color:var(--border)] px-5 py-2.5 text-sm font-medium text-black/78"
              idleLabel="Konto anlegen"
              pendingLabel="Erstelle Konto..."
            />
          </form>
        </div>
      </section>
    </main>
  );
}
