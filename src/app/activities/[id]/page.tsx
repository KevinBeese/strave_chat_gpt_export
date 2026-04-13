import Link from "next/link";
import { notFound } from "next/navigation";

import { AppNav } from "@/components/app-nav";
import { requireAppUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDistance(meters: number) {
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes} min`;
  }

  return `${hours} h ${minutes} min`;
}

function formatOptionalNumber(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(0)}${suffix}`;
}

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireAppUserId();
  const resolvedParams = await params;

  let activityId: bigint;
  try {
    activityId = BigInt(resolvedParams.id);
  } catch {
    notFound();
  }
  const activity = await prisma.activity.findFirst({
    where: {
      id: activityId,
      userId,
    },
  });

  if (!activity) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-sm font-medium text-[color:var(--accent)] hover:underline" href="/activities">
            &lt;- Zurueck zur Liste
          </Link>
          <p className="mt-3 text-sm uppercase tracking-[0.12em] text-black/55">Aktivitaetsdetails</p>
        </div>
        <AppNav current="activities" />
      </div>

      <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8">
        <h1 className="text-3xl font-semibold tracking-tight">{activity.name}</h1>
        <p className="mt-2 text-black/65">
          {activity.type} · {activity.classification} · {activity.analysisLabel}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Start</p>
            <p className="mt-1 text-base font-semibold">{formatDate(activity.startDate)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Distanz</p>
            <p className="mt-1 text-base font-semibold">{formatDistance(activity.distanceMeters)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Hoehenmeter</p>
            <p className="mt-1 text-base font-semibold">{Math.round(activity.elevationGainMeters)} m</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Moving Time</p>
            <p className="mt-1 text-base font-semibold">{formatDuration(activity.movingTimeSeconds)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Elapsed Time</p>
            <p className="mt-1 text-base font-semibold">{formatDuration(activity.elapsedTimeSeconds)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Speed avg / max</p>
            <p className="mt-1 text-base font-semibold">
              {activity.averageSpeed.toFixed(2)} / {activity.maxSpeed.toFixed(2)} m/s
            </p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Herzfrequenz avg / max</p>
            <p className="mt-1 text-base font-semibold">
              {formatOptionalNumber(activity.averageHeartrate, " bpm")} / {formatOptionalNumber(activity.maxHeartrate, " bpm")}
            </p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Leistung avg / max</p>
            <p className="mt-1 text-base font-semibold">
              {formatOptionalNumber(activity.averageWatts, " W")} / {formatOptionalNumber(activity.maxWatts, " W")}
            </p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">kJ / kcal</p>
            <p className="mt-1 text-base font-semibold">
              {formatOptionalNumber(activity.kilojoules)} / {formatOptionalNumber(activity.calories)}
            </p>
          </div>
        </div>

        {activity.description ? (
          <div className="mt-6 rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Beschreibung</p>
            <p className="mt-2 text-sm text-black/78">{activity.description}</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
