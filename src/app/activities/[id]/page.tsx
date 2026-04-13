import Link from "next/link";
import { notFound } from "next/navigation";

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
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10 md:px-10">
      <Link
        className="text-sm font-medium text-[color:var(--accent)] hover:underline"
        href="/activities"
      >
        &lt;- Zurueck zur Liste
      </Link>

      <section className="mt-4 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8">
        <h1 className="text-3xl font-semibold tracking-tight">{activity.name}</h1>
        <p className="mt-2 text-black/65">{activity.type}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Start</p>
            <p className="mt-1 text-base font-semibold">{formatDate(activity.startDate)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Distanz</p>
            <p className="mt-1 text-base font-semibold">{formatDistance(activity.distanceMeters)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Moving Time</p>
            <p className="mt-1 text-base font-semibold">{formatDuration(activity.movingTimeSeconds)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Elapsed Time</p>
            <p className="mt-1 text-base font-semibold">{formatDuration(activity.elapsedTimeSeconds)}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
