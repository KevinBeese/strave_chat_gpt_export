import Link from "next/link";

const features = [
  {
    title: "Strava Connect",
    description:
      "Melde dich einmal mit Strava an und halte deinen Zugriff lokal auf deinem Rechner.",
    symbol: "01",
  },
  {
    title: "7-Tage-Export",
    description:
      "Ziehe deine Aktivitaeten der letzten sieben Tage und normalisiere sie in ein stabiles Format.",
    symbol: "02",
  },
  {
    title: "ChatGPT-Ready",
    description:
      "Erzeuge JSON und einen direkt kopierbaren Analyse-Block fuer dein GPT.",
    symbol: "03",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 md:px-10">
      <section className="rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-[0_18px_80px_rgba(29,27,22,0.08)] backdrop-blur md:p-12">
        <p className="text-sm uppercase tracking-[0.24em] text-black/55">
          Local MVP
        </p>
        <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
              Strava-Exporte fuer ChatGPT, gebaut als schlankes Next.js-Tool.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-black/72 md:text-lg">
              Dieses Projekt startet bewusst klein: Strava verbinden,
              Aktivitaeten der letzten 7 Tage abrufen und in ein Format bringen,
              das du direkt in ChatGPT oder dein Custom GPT geben kannst.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent)] px-5 py-3 text-sm font-medium text-[color:var(--accent-foreground)] transition hover:translate-y-[-1px]"
                href="/dashboard"
              >
                Zum Dashboard
                <span aria-hidden="true">-&gt;</span>
              </Link>
              <a
                className="inline-flex items-center rounded-full border border-[color:var(--border)] px-5 py-3 text-sm font-medium text-black/78"
                href="https://developers.strava.com/docs/authentication/"
                rel="noreferrer"
                target="_blank"
              >
                Strava OAuth Docs
              </a>
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-white/75 p-6">
            <p className="text-sm font-medium text-black/55">Technischer Stack</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-black/72">
              <li>Next.js App Router</li>
              <li>TypeScript fuer Frontend und Backend</li>
              <li>SQLite + Prisma fuer lokale Speicherung</li>
              <li>zod fuer Runtime-Validierung</li>
              <li>Tailwind CSS fuer schnelles UI</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-5 md:grid-cols-3">
        {features.map(({ title, description, symbol }) => (
          <article
            key={title}
            className="rounded-[1.75rem] border border-[color:var(--border)] bg-white/72 p-6 shadow-[0_8px_30px_rgba(29,27,22,0.05)]"
          >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--accent)]/12 text-sm font-semibold text-[color:var(--accent)]">
              {symbol}
            </div>
            <h2 className="mt-4 text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-black/70">{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
