import Link from "next/link";
import { Prisma } from "@prisma/client";

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
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function toFiniteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDate(value: string | undefined, endOfDay = false) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }

  return parsed;
}

function parseRangeDays(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.min(parsed, 3650);
}

export const dynamic = "force-dynamic";

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireAppUserId();
  const resolvedSearchParams = await searchParams;

  const rangeDays = parseRangeDays(
    typeof resolvedSearchParams.range === "string" ? resolvedSearchParams.range : undefined,
  );
  const selectedType =
    typeof resolvedSearchParams.type === "string" && resolvedSearchParams.type !== "all"
      ? resolvedSearchParams.type
      : null;
  const query =
    typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q.trim().slice(0, 80) : "";

  const fromDate = parseDate(
    typeof resolvedSearchParams.from === "string" ? resolvedSearchParams.from : undefined,
  );
  const toDate = parseDate(
    typeof resolvedSearchParams.to === "string" ? resolvedSearchParams.to : undefined,
    true,
  );

  const startDateFilter: Prisma.DateTimeFilter = {};

  const renderNow = new Date();
  if (rangeDays) {
    startDateFilter.gte = new Date(renderNow.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  }

  if (fromDate) {
    startDateFilter.gte = fromDate;
  }

  if (toDate) {
    startDateFilter.lte = toDate;
  }

  const where: Prisma.ActivityWhereInput = {
    userId,
    ...(selectedType ? { type: selectedType } : {}),
    ...(query
      ? {
          OR: [
            {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              classification: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              analysisLabel: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
    ...(Object.keys(startDateFilter).length > 0 ? { startDate: startDateFilter } : {}),
  };

  const [activities, typeOptions] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: {
        startDate: "desc",
      },
      take: 400,
      select: {
        id: true,
        name: true,
        type: true,
        classification: true,
        analysisLabel: true,
        startDate: true,
        distanceMeters: true,
        movingTimeSeconds: true,
        elevationGainMeters: true,
        averageHeartrate: true,
        maxHeartrate: true,
        averageWatts: true,
        maxWatts: true,
        calories: true,
      },
    }),
    prisma.activity.groupBy({
      by: ["type"],
      where: { userId },
      orderBy: {
        type: "asc",
      },
    }),
  ]);

  const activeFilterCount = [rangeDays || fromDate || toDate, selectedType, query].filter(Boolean).length;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.12em] text-black/55">Aktivitaeten</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Alle Aktivitaeten</h1>
          <p className="mt-2 text-sm text-black/65">
            {activities.length} Treffer {activeFilterCount > 0 ? `(mit ${activeFilterCount} Filtern)` : ""}
          </p>
        </div>
        <AppNav current="activities" />
      </div>

      <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
        <form className="grid gap-3 md:grid-cols-6" method="get">
          <input
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2 md:col-span-2"
            defaultValue={query}
            name="q"
            placeholder="Suche (Name, Label, Klassifikation)"
            type="search"
          />

          <select
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
            defaultValue={selectedType ?? "all"}
            name="type"
          >
            <option value="all">Alle Sportarten</option>
            {typeOptions.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.type}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
            defaultValue={rangeDays ? String(rangeDays) : "custom"}
            name="range"
          >
            <option value="custom">Eigener Zeitraum</option>
            <option value="7">Letzte 7 Tage</option>
            <option value="30">Letzte 30 Tage</option>
            <option value="90">Letzte 90 Tage</option>
            <option value="365">Letzte 365 Tage</option>
          </select>

          <input
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
            defaultValue={typeof resolvedSearchParams.from === "string" ? resolvedSearchParams.from : ""}
            name="from"
            type="date"
          />

          <input
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none ring-[color:var(--accent)] focus:ring-2"
            defaultValue={typeof resolvedSearchParams.to === "string" ? resolvedSearchParams.to : ""}
            name="to"
            type="date"
          />

          <div className="md:col-span-6 flex flex-wrap gap-2">
            <button
              className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-[color:var(--accent-foreground)]"
              type="submit"
            >
              Filter anwenden
            </button>
            <Link
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/5"
              href="/activities"
            >
              Filter zuruecksetzen
            </Link>
          </div>
        </form>
      </section>

      <section className="mt-6 space-y-3">
        {activities.map((activity) => (
          <Link
            key={activity.id.toString()}
            className="block rounded-2xl border border-black/10 bg-white/85 p-4 transition hover:border-black/25 hover:bg-white"
            href={`/activities/${activity.id.toString()}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold tracking-tight">{activity.name}</p>
                <p className="text-sm text-black/65">{activity.type}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.08em] text-black/45">
                  {activity.classification} · {activity.analysisLabel}
                </p>
              </div>
              <div className="text-right text-sm text-black/70">
                <p>{formatDate(activity.startDate)}</p>
                <p>{formatDistance(activity.distanceMeters)}</p>
                <p>{formatDuration(activity.movingTimeSeconds)}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-sm text-black/72 md:grid-cols-4">
              <p>Hoehenmeter: {Math.round(activity.elevationGainMeters)} m</p>
              {toFiniteNumber(activity.averageHeartrate) !== null ||
              toFiniteNumber(activity.maxHeartrate) !== null ? (
                <p>
                  HF avg/max: {toFiniteNumber(activity.averageHeartrate)?.toFixed(0) ?? "-"}/
                  {toFiniteNumber(activity.maxHeartrate)?.toFixed(0) ?? "-"}
                </p>
              ) : null}
              {toFiniteNumber(activity.averageWatts) !== null ||
              toFiniteNumber(activity.maxWatts) !== null ? (
                <p>
                  Leistung avg/max: {toFiniteNumber(activity.averageWatts)?.toFixed(0) ?? "-"}/
                  {toFiniteNumber(activity.maxWatts)?.toFixed(0) ?? "-"} W
                </p>
              ) : null}
              {toFiniteNumber(activity.calories) !== null ? (
                <p>Kalorien: {toFiniteNumber(activity.calories)?.toFixed(0)} kcal</p>
              ) : null}
            </div>
          </Link>
        ))}

        {activities.length === 0 ? (
          <p className="rounded-2xl border border-black/10 bg-white/85 p-5 text-sm text-black/65">
            Keine Aktivitaeten fuer den ausgewaehlten Filter gefunden.
          </p>
        ) : null}
      </section>
    </main>
  );
}
