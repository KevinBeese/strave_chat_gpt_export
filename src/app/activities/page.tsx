import Link from "next/link";

import { requireAppUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDate(dateIso: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(new Date(dateIso));
}

function formatDistance(meters: number) {
  return `${(meters / 1000).toFixed(1)} km`;
}

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const userId = await requireAppUserId();
  const activities = await prisma.activity.findMany({
    where: { userId },
    orderBy: {
      startDate: "desc",
    },
    take: 250,
    select: {
      id: true,
      name: true,
      type: true,
      startDate: true,
      distanceMeters: true,
    },
  });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 md:px-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.12em] text-black/55">Aktivitaeten</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Alle Aktivitaeten</h1>
        </div>
        <Link
          className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/5"
          href="/dashboard"
        >
          Zurueck zum Dashboard
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-[color:var(--border)] bg-white/85">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/[0.04] text-black/60">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Typ</th>
              <th className="px-4 py-3 font-medium">Datum</th>
              <th className="px-4 py-3 font-medium">Distanz</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((activity) => (
              <tr key={activity.id.toString()} className="border-t border-black/5">
                <td className="px-4 py-3">
                  <Link
                    className="font-medium text-[color:var(--accent)] hover:underline"
                    href={`/activities/${activity.id.toString()}`}
                  >
                    {activity.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-black/70">{activity.type}</td>
                <td className="px-4 py-3 text-black/70">{formatDate(activity.startDate.toISOString())}</td>
                <td className="px-4 py-3 text-black/70">{formatDistance(activity.distanceMeters)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {activities.length === 0 ? (
          <p className="p-5 text-sm text-black/65">
            Noch keine Aktivitaeten vorhanden. Verbinde Strava und starte einen Sync.
          </p>
        ) : null}
      </div>
    </main>
  );
}
