import Link from "next/link";
import { notFound } from "next/navigation";

import { AppNav } from "@/components/app-nav";
import { requireAppUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ActivityProviderMetrics = {
  tss: number | null;
  intensityFactor: number | null;
  normalizedPowerWatts: number | null;
  variabilityIndex: number | null;
  averageCadence: number | null;
  maxCadence: number | null;
  averageTempC: number | null;
  minTempC: number | null;
  maxTempC: number | null;
};

const FALLBACK_TIME_ZONE = "Europe/Berlin";

function formatDate(date: Date, timeZone?: string | null) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZone ?? FALLBACK_TIME_ZONE,
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

function parseProviderMetrics(value: string | null): ActivityProviderMetrics | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as ActivityProviderMetrics;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumberFromRaw(raw: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function readStringFromRaw(raw: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function readBooleanFromRaw(raw: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
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

  const providerMetrics = parseProviderMetrics(activity.providerMetricsJson);
  const rawActivity = isRecord(activity.rawJson) ? activity.rawJson : null;
  const calories =
    typeof activity.calories === "number" && Number.isFinite(activity.calories)
      ? activity.calories
      : rawActivity
        ? readNumberFromRaw(rawActivity, "calories")
        : null;
  const providerNp =
    providerMetrics && providerMetrics.normalizedPowerWatts !== null
      ? providerMetrics.normalizedPowerWatts
      : null;
  const providerTss =
    providerMetrics && providerMetrics.tss !== null ? providerMetrics.tss : null;
  const providerIf =
    providerMetrics && providerMetrics.intensityFactor !== null
      ? providerMetrics.intensityFactor
      : null;
  const providerVi =
    providerMetrics && providerMetrics.variabilityIndex !== null
      ? providerMetrics.variabilityIndex
      : null;
  const averageCadence =
    providerMetrics && providerMetrics.averageCadence !== null
      ? providerMetrics.averageCadence
      : rawActivity
        ? readNumberFromRaw(rawActivity, "average_cadence")
        : null;
  const maxCadence =
    providerMetrics && providerMetrics.maxCadence !== null
      ? providerMetrics.maxCadence
      : rawActivity
        ? readNumberFromRaw(rawActivity, "max_cadence")
        : null;
  const averageTemp =
    providerMetrics && providerMetrics.averageTempC !== null
      ? providerMetrics.averageTempC
      : rawActivity
        ? readNumberFromRaw(rawActivity, "average_temp")
        : null;
  const minTemp =
    providerMetrics && providerMetrics.minTempC !== null
      ? providerMetrics.minTempC
      : rawActivity
        ? readNumberFromRaw(rawActivity, "min_temp")
        : null;
  const maxTemp =
    providerMetrics && providerMetrics.maxTempC !== null
      ? providerMetrics.maxTempC
      : rawActivity
        ? readNumberFromRaw(rawActivity, "max_temp")
        : null;
  const relativeEffort = rawActivity ? readNumberFromRaw(rawActivity, "relative_effort") : null;
  const sufferScore = rawActivity ? readNumberFromRaw(rawActivity, "suffer_score") : null;
  const kudosCount = rawActivity ? readNumberFromRaw(rawActivity, "kudos_count") : null;
  const commentCount = rawActivity ? readNumberFromRaw(rawActivity, "comment_count") : null;
  const achievementCount = rawActivity
    ? readNumberFromRaw(rawActivity, "achievement_count")
    : null;
  const sportType = rawActivity ? readStringFromRaw(rawActivity, "sport_type") : null;
  const trainer = rawActivity ? readBooleanFromRaw(rawActivity, "trainer") : null;
  const commute = rawActivity ? readBooleanFromRaw(rawActivity, "commute") : null;
  const manual = rawActivity ? readBooleanFromRaw(rawActivity, "manual") : null;
  const privateActivity = rawActivity ? readBooleanFromRaw(rawActivity, "private") : null;

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
          {activity.provider} · {activity.type} · {activity.classification} · {activity.analysisLabel}
        </p>
        <p className="mt-1 text-sm text-black/55">
          Provider Activity ID: {activity.providerActivityId}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Start</p>
            <p className="mt-1 text-base font-semibold">
              {formatDate(activity.startDate, activity.timezone)}
            </p>
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
          {activity.averageWatts !== null || activity.maxWatts !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Leistung avg / max</p>
              <p className="mt-1 text-base font-semibold">
                {formatOptionalNumber(activity.averageWatts, " W")} / {formatOptionalNumber(activity.maxWatts, " W")}
              </p>
            </div>
          ) : null}
          <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-black/45">Kalorien</p>
            <p className="mt-1 text-base font-semibold">
              {calories !== null ? `${Math.round(calories)} kcal` : "-"}
            </p>
          </div>
          {providerNp !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">NP (Provider)</p>
              <p className="mt-1 text-base font-semibold">{Math.round(providerNp)} W</p>
            </div>
          ) : null}
          {providerTss !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">TSS (Provider)</p>
              <p className="mt-1 text-base font-semibold">
                {Math.round(providerTss * 10) / 10}
              </p>
            </div>
          ) : null}
          {providerIf !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">IF (Provider)</p>
              <p className="mt-1 text-base font-semibold">
                {Math.round(providerIf * 1000) / 1000}
              </p>
            </div>
          ) : null}
          {providerVi !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">VI (Provider)</p>
              <p className="mt-1 text-base font-semibold">
                {Math.round(providerVi * 100) / 100}
              </p>
            </div>
          ) : null}
          {averageCadence !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Kadenz avg</p>
              <p className="mt-1 text-base font-semibold">{Math.round(averageCadence)} rpm</p>
            </div>
          ) : null}
          {maxCadence !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Kadenz max</p>
              <p className="mt-1 text-base font-semibold">{Math.round(maxCadence)} rpm</p>
            </div>
          ) : null}
          {averageTemp !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Temperatur avg</p>
              <p className="mt-1 text-base font-semibold">
                {Math.round(averageTemp * 10) / 10} C
              </p>
            </div>
          ) : null}
          {minTemp !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Temperatur min</p>
              <p className="mt-1 text-base font-semibold">
                {Math.round(minTemp * 10) / 10} C
              </p>
            </div>
          ) : null}
          {maxTemp !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Temperatur max</p>
              <p className="mt-1 text-base font-semibold">
                {Math.round(maxTemp * 10) / 10} C
              </p>
            </div>
          ) : null}
          {relativeEffort !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Relative Effort</p>
              <p className="mt-1 text-base font-semibold">{Math.round(relativeEffort)}</p>
            </div>
          ) : null}
          {sufferScore !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Suffer Score</p>
              <p className="mt-1 text-base font-semibold">{Math.round(sufferScore)}</p>
            </div>
          ) : null}
          {kudosCount !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Kudos</p>
              <p className="mt-1 text-base font-semibold">{Math.round(kudosCount)}</p>
            </div>
          ) : null}
          {commentCount !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Kommentare</p>
              <p className="mt-1 text-base font-semibold">{Math.round(commentCount)}</p>
            </div>
          ) : null}
          {achievementCount !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Achievements</p>
              <p className="mt-1 text-base font-semibold">{Math.round(achievementCount)}</p>
            </div>
          ) : null}
          {activity.deviceWatts !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Powerquelle</p>
              <p className="mt-1 text-base font-semibold">
                {activity.deviceWatts ? "geraetebasiert" : "von Strava geschaetzt"}
              </p>
            </div>
          ) : null}
          {sportType ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Sport Typ (Raw)</p>
              <p className="mt-1 text-base font-semibold">{sportType}</p>
            </div>
          ) : null}
          {activity.timezone ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Timezone</p>
              <p className="mt-1 text-base font-semibold">{activity.timezone}</p>
            </div>
          ) : null}
          {trainer !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Trainer</p>
              <p className="mt-1 text-base font-semibold">{trainer ? "Ja" : "Nein"}</p>
            </div>
          ) : null}
          {commute !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Pendeln</p>
              <p className="mt-1 text-base font-semibold">{commute ? "Ja" : "Nein"}</p>
            </div>
          ) : null}
          {manual !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Manuell erfasst</p>
              <p className="mt-1 text-base font-semibold">{manual ? "Ja" : "Nein"}</p>
            </div>
          ) : null}
          {privateActivity !== null ? (
            <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-black/45">Privat</p>
              <p className="mt-1 text-base font-semibold">{privateActivity ? "Ja" : "Nein"}</p>
            </div>
          ) : null}
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
