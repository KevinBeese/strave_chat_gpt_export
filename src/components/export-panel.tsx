"use client";

import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { SNAPSHOT_TREND_CONFIDENCE_BANDS } from "@/lib/snapshot-config";
import type {
  ActivityZone,
  AthleteZoneRange,
  ExportPayload,
  NormalizedActivity,
  SnapshotSportFilter,
  ScopeRequirement,
} from "@/types/export";

const periodOptions = [
  { label: "7 Tage", value: 7 },
  { label: "14 Tage", value: 14 },
  { label: "30 Tage", value: 30 },
] as const;

const snapshotSportFilterOptions: { label: string; value: SnapshotSportFilter }[] = [
  { label: "All", value: "all" },
  { label: "Ride", value: "ride" },
  { label: "Run", value: "run" },
  { label: "Workout", value: "workout" },
];

function formatDate(dateIso: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateIso));
}

function formatDateTime(dateIso: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateIso));
}

function formatDuration(seconds: number) {
  return `${Math.round(seconds / 60)} min`;
}

function formatDurationCompact(seconds: number) {
  const roundedMinutes = Math.round(seconds / 60);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (hours <= 0) {
    return `${minutes} min`;
  }

  return `${hours} h ${minutes} min`;
}

function formatPercentage(value: number, total: number) {
  if (total <= 0) {
    return "0 %";
  }

  return `${Math.round((value / total) * 100)} %`;
}

function formatZoneDuration(seconds: number) {
  if (seconds < 60) {
    return `0:${String(seconds).padStart(2, "0")} min`;
  }

  return `${Math.round(seconds / 60)} min`;
}

function formatPower(value: number | null) {
  if (!value) {
    return null;
  }

  return `${Math.round(value)} W`;
}

function formatSignedNumber(value: number, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value * 100) / 100}${suffix}`;
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value * 10) / 10} %`;
}

function formatTrendWindow(
  days: number,
  delta: number | null,
  deltaPercent: number | null,
  confidenceLabel: string,
  unit = "",
) {
  if (delta === null) {
    return `${days}d n/a · ${confidenceLabel}`;
  }

  const deltaLabel = formatSignedNumber(delta, unit);
  const percentLabel = deltaPercent === null ? "" : ` (${formatSignedPercent(deltaPercent)})`;
  return `${days}d ${deltaLabel}${percentLabel} · ${confidenceLabel}`;
}

function formatOpenEndedRange(min: number, max: number) {
  if (max < 0) {
    return `${min}+`;
  }

  return `${min}-${max}`;
}

function getPowerZoneLabel(min: number, max: number) {
  const rangeLabel = max === 0 ? "0 W" : `${formatOpenEndedRange(min, max)} W`;

  if (max < 0) {
    return `Sprint (${rangeLabel})`;
  }

  if (max === 0) {
    return `Coasting (${rangeLabel})`;
  }

  if (max < 100) {
    return `Very Easy (${rangeLabel})`;
  }

  if (max < 150) {
    return `Endurance (${rangeLabel})`;
  }

  if (max < 200) {
    return `Tempo (${rangeLabel})`;
  }

  if (max < 250) {
    return `Threshold (${rangeLabel})`;
  }

  if (max < 300) {
    return `VO2 (${rangeLabel})`;
  }

  if (max < 400) {
    return `Anaerobic (${rangeLabel})`;
  }

  return `Sprint (${rangeLabel})`;
}

function formatZoneRangeLabel(range: AthleteZoneRange, index: number) {
  return `Z${index + 1} ${formatOpenEndedRange(range.min, range.max)}`;
}

function summarizeZoneDistribution(
  zones: ActivityZone[],
  type: "heartrate" | "power",
) {
  const zone = zones.find((entry) => entry.type === type);

  if (!zone || zone.distributionBuckets.length === 0) {
    return null;
  }

  const activeBuckets = zone.distributionBuckets.filter((bucket) => bucket.time > 0);

  if (activeBuckets.length === 0) {
    return null;
  }

  return activeBuckets
    .map((bucket, index) => {
      if (type === "power") {
        return `${getPowerZoneLabel(bucket.min, bucket.max)}: ${formatZoneDuration(bucket.time)}`;
      }

      return `Z${index + 1}: ${formatZoneDuration(bucket.time)}`;
    })
    .join(" · ");
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type InsightKpi = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

type EnvironmentKind = "indoor" | "outdoor" | "unknown";

function inferActivityEnvironment(activity: NormalizedActivity): EnvironmentKind {
  const indoorTypes = new Set([
    "virtualride",
    "virtualrun",
    "workout",
    "weighttraining",
    "yoga",
    "crossfit",
    "stairstepper",
    "elliptical",
    "rowing",
    "inlineskate",
  ]);
  const outdoorTypes = new Set([
    "ride",
    "run",
    "walk",
    "hike",
    "trailrun",
    "swim",
    "gravelride",
    "ebikeride",
    "mountainbikeride",
    "nordicski",
    "backcountryski",
  ]);

  const normalizedType = activity.type.toLowerCase();
  const normalizedName = activity.name.toLowerCase();
  const normalizedLabel = activity.analysisLabel.toLowerCase();

  if (
    normalizedType.includes("virtual") ||
    normalizedLabel.includes("indoor") ||
    normalizedName.includes("trainer") ||
    normalizedName.includes("spinning")
  ) {
    return "indoor";
  }

  if (indoorTypes.has(normalizedType)) {
    return "indoor";
  }

  if (activity.classification === "Indoor Cycling") {
    return "indoor";
  }

  if (
    outdoorTypes.has(normalizedType) ||
    normalizedName.includes("outdoor") ||
    activity.elevationGainMeters > 0
  ) {
    return "outdoor";
  }

  if (!activity.hasDistanceData) {
    return "indoor";
  }

  return "unknown";
}

function resolveThreshold(
  athleteZones: ExportPayload["athleteZones"],
  activities: NormalizedActivity[],
) {
  const hrThresholdFromProfile = athleteZones?.heartRateZones[3]?.min ?? null;
  if (hrThresholdFromProfile) {
    let seconds = 0;

    for (const activity of activities) {
      const heartRateZone = activity.zones.find((zone) => zone.type === "heartrate");
      if (!heartRateZone) {
        continue;
      }

      heartRateZone.distributionBuckets.forEach((bucket) => {
        if (bucket.max < 0 || bucket.min >= hrThresholdFromProfile) {
          seconds += bucket.time;
        }
      });
    }

    return {
      seconds,
      sourceLabel: `Basis Profil-HR-Schwelle ab ${hrThresholdFromProfile} bpm`,
    };
  }

  const powerThresholdFromProfile = athleteZones?.powerZones[3]?.min ?? null;
  if (powerThresholdFromProfile) {
    let seconds = 0;

    for (const activity of activities) {
      const powerZone = activity.zones.find((zone) => zone.type === "power");
      if (!powerZone) {
        continue;
      }

      powerZone.distributionBuckets.forEach((bucket) => {
        if (bucket.max < 0 || bucket.min >= powerThresholdFromProfile) {
          seconds += bucket.time;
        }
      });
    }

    return {
      seconds,
      sourceLabel: `Basis Profil-Power-Schwelle ab ${powerThresholdFromProfile} W`,
    };
  }

  let hrFallbackSeconds = 0;
  let powerFallbackSeconds = 0;

  for (const activity of activities) {
    const heartRateZone = activity.zones.find((zone) => zone.type === "heartrate");
    if (heartRateZone) {
      heartRateZone.distributionBuckets.forEach((bucket, index) => {
        if (index >= 3) {
          hrFallbackSeconds += bucket.time;
        }
      });
    }

    const powerZone = activity.zones.find((zone) => zone.type === "power");
    if (powerZone) {
      powerZone.distributionBuckets.forEach((bucket, index) => {
        if (index >= 3) {
          powerFallbackSeconds += bucket.time;
        }
      });
    }
  }

  if (hrFallbackSeconds > 0) {
    return {
      seconds: hrFallbackSeconds,
      sourceLabel: "Fallback auf HR Z4-5 (ohne Profil-Schwelle)",
    };
  }

  return {
    seconds: powerFallbackSeconds,
    sourceLabel:
      powerFallbackSeconds > 0
        ? "Fallback auf Power Z4+ (ohne Profil-Schwelle)"
        : "Keine Schwellenzeit im Export gefunden",
  };
}

function buildInsightKpis(
  activities: NormalizedActivity[],
  athleteZones: ExportPayload["athleteZones"],
): InsightKpi[] {
  if (activities.length === 0) {
    return [];
  }

  let totalHrZoneSeconds = 0;
  let hrZone3To5Seconds = 0;
  let indoorCount = 0;
  let outdoorCount = 0;
  let unknownCount = 0;
  let sessionsWithoutDistance = 0;
  let longestSession: NormalizedActivity | null = null;

  for (const activity of activities) {
    const heartRateZone = activity.zones.find((zone) => zone.type === "heartrate");
    if (heartRateZone) {
      heartRateZone.distributionBuckets.forEach((bucket, index) => {
        totalHrZoneSeconds += bucket.time;
        if (index >= 2 && index <= 4) {
          hrZone3To5Seconds += bucket.time;
        }
      });
    }

    const environment = inferActivityEnvironment(activity);
    if (environment === "indoor") {
      indoorCount += 1;
    } else if (environment === "outdoor") {
      outdoorCount += 1;
    } else {
      unknownCount += 1;
    }

    if (!activity.hasDistanceData) {
      sessionsWithoutDistance += 1;
    }

    if (!longestSession || activity.movingTimeSeconds > longestSession.movingTimeSeconds) {
      longestSession = activity;
    }
  }

  const threshold = resolveThreshold(athleteZones, activities);

  const insights: InsightKpi[] = [
    {
      id: "z3-5-share",
      label: "Anteil Z3-5",
      value: formatPercentage(hrZone3To5Seconds, totalHrZoneSeconds),
      detail: `${formatZoneDuration(hrZone3To5Seconds)} von ${formatZoneDuration(totalHrZoneSeconds)} HR-Zonenzeit`,
    },
    {
      id: "threshold-minutes",
      label: "Minuten > Schwelle",
      value: formatZoneDuration(threshold.seconds),
      detail: threshold.sourceLabel,
    },
    {
      id: "indoor-vs-outdoor",
      label: "Indoor vs Outdoor",
      value: `${indoorCount} : ${outdoorCount}`,
      detail:
        unknownCount > 0
          ? `${formatPercentage(indoorCount, activities.length)} Indoor-Anteil · ${unknownCount} unklar`
          : `${formatPercentage(indoorCount, activities.length)} Indoor-Anteil`,
    },
    {
      id: "without-distance",
      label: "Sessions ohne Distanz",
      value: String(sessionsWithoutDistance),
      detail: `${formatPercentage(sessionsWithoutDistance, activities.length)} aller Sessions`,
    },
  ];

  if (longestSession) {
    insights.push({
      id: "longest-session",
      label: "Laengste Einheit",
      value: formatDuration(longestSession.movingTimeSeconds),
      detail: `${longestSession.name} · ${formatDate(longestSession.startDate)}`,
    });
  }

  return insights;
}

function ScopeBadge({ requirement }: { requirement: ScopeRequirement }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
        requirement.granted
          ? "bg-emerald-100 text-emerald-700"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      {requirement.scope}
    </span>
  );
}

function ActivityMetric({
  label,
  value,
  tone = "neutral",
  multiline = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "accent";
  multiline?: boolean;
}) {
  return (
    <div
      className={`min-h-[88px] rounded-2xl border px-4 py-3 ${
        tone === "accent"
          ? "border-[color:var(--accent)]/16 bg-[color:var(--accent)]/7"
          : "border-black/6 bg-black/[0.035]"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-black/44">
        {label}
      </p>
      <p
        className={`mt-2 font-semibold text-black/78 ${
          multiline ? "text-[1.03rem] leading-6" : "text-[1.12rem] leading-6"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ZoneBox({
  title,
  summary,
  emptyLabel,
}: {
  title: string;
  summary: string | null;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-black/6 bg-black/[0.03] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-black/42">
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-black/66">{summary ?? emptyLabel}</p>
    </div>
  );
}

function InsightCard({ insight }: { insight: InsightKpi }) {
  return (
    <article className="rounded-2xl border border-[color:var(--accent)]/16 bg-[linear-gradient(155deg,rgba(252,76,2,0.12),rgba(252,76,2,0.03))] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--accent)]/80">
        {insight.label}
      </p>
      <p className="mt-2 text-xl font-semibold text-black/82">{insight.value}</p>
      <p className="mt-2 text-xs leading-5 text-black/62">{insight.detail}</p>
    </article>
  );
}

function SnapshotDeltaCard({
  label,
  currentValue,
  previousValue,
  deltaValue,
  deltaPercent,
  trendValue,
  trendWindows,
}: {
  label: string;
  currentValue: string;
  previousValue: string | null;
  deltaValue: string | null;
  deltaPercent: string | null;
  trendValue: string | null;
  trendWindows: string[];
}) {
  return (
    <article className="rounded-2xl border border-black/8 bg-black/[0.03] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/44">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-black/82">{currentValue}</p>
      <p className="mt-2 text-xs leading-5 text-black/58">
        {previousValue ? `Vorher: ${previousValue}` : "Kein vorheriger Snapshot"}
      </p>
      {deltaValue ? (
        <p className="mt-2 text-xs font-medium leading-5 text-black/68">
          Delta: {deltaValue}
          {deltaPercent ? ` (${deltaPercent})` : ""}
        </p>
      ) : null}
      {trendValue ? (
        <p className="mt-2 text-xs leading-5 text-black/62">3-Snapshot-Mittel: {trendValue}</p>
      ) : null}
      {trendWindows.length > 0 ? (
        <p className="mt-2 text-xs leading-5 text-black/58">
          Trend: {trendWindows.join(" · ")}
        </p>
      ) : null}
    </article>
  );
}

function ActivityCard({ activity }: { activity: NormalizedActivity }) {
  const heartRateZoneSummary = summarizeZoneDistribution(activity.zones, "heartrate");
  const powerZoneSummary = summarizeZoneDistribution(activity.zones, "power");
  const averagePower = formatPower(activity.averageWatts);
  const weightedPower = formatPower(activity.weightedAverageWatts);
  const maxPower = formatPower(activity.maxWatts);

  return (
    <article className="rounded-[1.5rem] border border-[color:var(--border)] bg-white/90 p-5 shadow-[0_10px_36px_rgba(29,27,22,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[color:var(--accent)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--accent)]">
              {activity.classification}
            </span>
            <span className="rounded-full bg-black/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-black/52">
              {activity.type}
            </span>
          </div>
          <h4 className="mt-3 text-lg font-semibold text-black/84">{activity.name}</h4>
          <p className="mt-1 text-sm text-black/56">
            {activity.analysisLabel} · {formatDate(activity.startDate)}
          </p>
        </div>
        <div className="rounded-full border border-black/8 bg-[#fff7ec] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-black/56">
          {formatDuration(activity.movingTimeSeconds)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))]">
        {activity.hasDistanceData ? (
          <ActivityMetric
            label="Distanz"
            value={`${(activity.distanceMeters / 1000).toFixed(2)} km`}
          />
        ) : (
          <ActivityMetric
            label="Kontext"
            tone="accent"
            value="Keine Distanzdaten, Fokus auf Dauer/Puls"
            multiline
          />
        )}
        <ActivityMetric label="Bewegungszeit" value={formatDuration(activity.movingTimeSeconds)} />
        {activity.averageHeartrate ? (
          <ActivityMetric
            label="Oe Puls"
            value={`${Math.round(activity.averageHeartrate)} bpm`}
          />
        ) : null}
        {activity.maxHeartrate ? (
          <ActivityMetric label="Max Puls" value={`${Math.round(activity.maxHeartrate)} bpm`} />
        ) : null}
        {averagePower ? <ActivityMetric label="Avg Power" value={averagePower} /> : null}
        {weightedPower ? <ActivityMetric label="Weighted Power" value={weightedPower} /> : null}
        {maxPower ? <ActivityMetric label="Max Power" value={maxPower} /> : null}
        {activity.kilojoules ? (
          <ActivityMetric label="Arbeit" value={`${Math.round(activity.kilojoules)} kJ`} />
        ) : null}
        {activity.elevationGainMeters > 0 ? (
          <ActivityMetric label="Hoehenmeter" value={`${activity.elevationGainMeters} hm`} />
        ) : null}
        {activity.deviceWatts !== null ? (
          <ActivityMetric
            label="Powerquelle"
            value={activity.deviceWatts ? "geraetebasiert" : "von Strava geschaetzt"}
          />
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ZoneBox
          title="Herzfrequenzzonen"
          summary={heartRateZoneSummary}
          emptyLabel="Keine Zeitverteilung fuer HR-Zonen vorhanden."
        />
        <ZoneBox
          title="Power-Zonen"
          summary={powerZoneSummary}
          emptyLabel="Keine Zeitverteilung fuer Power-Zonen vorhanden."
        />
      </div>

      {activity.description ? (
        <div className="mt-4 rounded-[1.25rem] border border-[color:var(--accent)]/14 bg-[linear-gradient(135deg,rgba(252,76,2,0.08),rgba(252,76,2,0.02))] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--accent)]">
            Beschreibung aus Strava
          </p>
          <p className="mt-2 text-sm leading-6 text-black/74">{activity.description}</p>
        </div>
      ) : null}
    </article>
  );
}

export function ExportPanel({ connected }: { connected: boolean }) {
  const [data, setData] = useState<ExportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(7);
  const [selectedSportFilter, setSelectedSportFilter] =
    useState<SnapshotSportFilter>("all");

  async function handleExport() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/strava/export?days=${selectedDays}`);
      const payload = (await response.json()) as ExportPayload | { error?: string };

      if (!response.ok) {
        setError(
          payload && "error" in payload
            ? payload.error ?? "Export fehlgeschlagen."
            : "Export fehlgeschlagen.",
        );
        return;
      }

      setData(payload as ExportPayload);
    } catch {
      setError("Export fehlgeschlagen. Bitte pruefe deine Verbindung.");
    } finally {
      setLoading(false);
    }
  }

  const jsonValue = data ? JSON.stringify(data, null, 2) : "";
  const gptSummary = data?.chatGptPrompt ?? "";
  const exportBaseName = data
    ? `strava-export-${data.rangeStart.slice(0, 10)}-to-${data.rangeEnd.slice(0, 10)}`
    : "strava-export";
  const jsonPreview = jsonValue
    ? `${data?.activityCount ?? 0} Aktivitaeten als strukturierter Export`
    : "Noch kein JSON-Export vorhanden";
  const gptPreview = gptSummary
    ? `${data?.activityCount ?? 0} Aktivitaeten als direkt nutzbarer GPT-Block`
    : "Noch kein ChatGPT-Export vorhanden";
  const hasPowerData = Boolean(
    data?.activities.some(
      (activity) =>
        activity.averageWatts !== null ||
        activity.weightedAverageWatts !== null ||
        activity.maxWatts !== null,
    ),
  );
  const descriptionsCount =
    data?.activities.filter((activity) => Boolean(activity.description)).length ?? 0;
  const insightKpis = data ? buildInsightKpis(data.activities, data.athleteZones) : [];
  const snapshotCompare = data?.snapshotCompare ?? null;
  const snapshotCompareForSport = snapshotCompare
    ? snapshotCompare.bySport[selectedSportFilter]
    : null;
  const selectedSnapshotSportLabel =
    snapshotSportFilterOptions.find((option) => option.value === selectedSportFilter)
      ?.label ?? "All";

  return (
    <section className="rounded-[2rem] border border-[color:var(--border)] bg-white/78 p-8 shadow-[0_18px_80px_rgba(29,27,22,0.08)]">
      <p className="text-sm uppercase tracking-[0.14em] text-black/55">Export</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight">
        Strava-Zeitraum fuer ChatGPT vorbereiten
      </h2>
      <p className="mt-4 text-sm leading-6 text-black/70">
        Fuer den MVP ziehen wir Aktivitaeten auf Aktivitaetslevel und erzeugen
        daraus JSON und einen direkt kopierbaren Analyse-Text.
      </p>
      <p className="mt-3 text-sm leading-6 text-black/58">
        Zonen, Power, Scope-Status und Strava-Beschreibungen werden jetzt direkt
        in der Uebersicht sichtbar gemacht, damit du den Export schneller prüfen kannst.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-white px-4 py-2 text-sm text-black/70">
          Zeitraum
          <select
            className="bg-transparent font-medium outline-none"
            disabled={loading}
            onChange={(event) => setSelectedDays(Number(event.target.value))}
            value={selectedDays}
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!connected || loading}
          onClick={handleExport}
          type="button"
        >
          {loading ? "Export laeuft..." : `${selectedDays} Tage exportieren`}
        </button>
        {gptSummary ? <CopyButton value={gptSummary} /> : null}
        {jsonValue ? (
          <button
            className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-black/72 transition hover:bg-black/5"
            onClick={() =>
              downloadFile(`${exportBaseName}.json`, jsonValue, "application/json")
            }
            type="button"
          >
            JSON laden
          </button>
        ) : null}
        {gptSummary ? (
          <button
            className="rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-black/72 transition hover:bg-black/5"
            onClick={() =>
              downloadFile(`${exportBaseName}.txt`, gptSummary, "text/plain;charset=utf-8")
            }
            type="button"
          >
            TXT laden
          </button>
        ) : null}
      </div>
      {snapshotCompare ? (
        <div className="mt-8 max-w-3xl space-y-3">
          <div className="rounded-xl border border-black/8 bg-black/[0.03] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/46">
              Legende Formel-Profile
            </p>
            <p className="mt-2 text-xs leading-5 text-black/62">
              Run: HR {Math.round(snapshotCompare.formula.weightProfiles.run.hrWeight * 100)}% /
              Power {Math.round(snapshotCompare.formula.weightProfiles.run.powerWeight * 100)}%
              {" · "}
              {snapshotCompare.formula.weightProfiles.run.description}
            </p>
            <p className="mt-1 text-xs leading-5 text-black/62">
              Ride: HR {Math.round(snapshotCompare.formula.weightProfiles.ride.hrWeight * 100)}% /
              Power {Math.round(snapshotCompare.formula.weightProfiles.ride.powerWeight * 100)}%
              {" · "}
              {snapshotCompare.formula.weightProfiles.ride.description}
            </p>
            <p className="mt-1 text-xs leading-5 text-black/62">
              Workout: HR {Math.round(snapshotCompare.formula.weightProfiles.workout.hrWeight * 100)}
              % / Power{" "}
              {Math.round(snapshotCompare.formula.weightProfiles.workout.powerWeight * 100)}%
              {" · "}
              {snapshotCompare.formula.weightProfiles.workout.description}
            </p>
            <p className="mt-1 text-xs leading-5 text-black/62">
              Default: HR {Math.round(snapshotCompare.formula.weightProfiles.default.hrWeight * 100)}
              % / Power{" "}
              {Math.round(snapshotCompare.formula.weightProfiles.default.powerWeight * 100)}%{" "}
              {" · "}
              {snapshotCompare.formula.weightProfiles.default.description}
            </p>
          </div>
          <div className="rounded-xl border border-black/8 bg-black/[0.03] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/46">
              Legende Trend Confidence
            </p>
            <div className="mt-2 space-y-1">
              {SNAPSHOT_TREND_CONFIDENCE_BANDS.map((band, index) => {
                const maxBand = SNAPSHOT_TREND_CONFIDENCE_BANDS[index - 1];
                const rangeLabel = maxBand
                  ? `n=${band.minSampleSize}-${maxBand.minSampleSize - 1}`
                  : `n>=${band.minSampleSize}`;

                return (
                  <p key={band.level} className="text-xs leading-5 text-black/62">
                    {band.label}: {rangeLabel}
                  </p>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-5 text-black/56">
              Zeigt die Belastbarkeit der 7d/14d/30d-Trends auf Basis von `sampleSize`.
            </p>
          </div>
        </div>
      ) : null}

      {!connected ? (
        <p className="mt-4 text-sm text-black/58">
          Verbinde zuerst deinen Strava-Account.
        </p>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {data ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[#fffaf1] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-black/60">
                    Aktivitaetsuebersicht
                  </h3>
                  <p className="mt-2 text-sm text-black/62">
                    {data.activityCount} Aktivitaeten im Zeitraum {data.rangeLabel}
                  </p>
                </div>
                <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-black/52">
                  {data.selectedDays} Tage
                </span>
              </div>

              <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(8.6rem,1fr))]">
                <ActivityMetric label="Aktivitaeten" value={String(data.activityCount)} />
                <ActivityMetric
                  label="Beschreibungen"
                  value={`${descriptionsCount} Eintraege`}
                  tone={descriptionsCount > 0 ? "accent" : "neutral"}
                />
                <ActivityMetric
                  label="Powerdaten"
                  value={hasPowerData ? "Ja" : "Noch nicht"}
                  tone={hasPowerData ? "accent" : "neutral"}
                />
                <ActivityMetric
                  label="Profilzonen"
                  value={data.athleteZones ? "Verfuegbar" : "Nicht verfuegbar"}
                  tone={data.athleteZones ? "accent" : "neutral"}
                />
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-white/88 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-black/60">
                Scope-Status
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.requiredScopes.map((requirement) => (
                  <ScopeBadge key={requirement.scope} requirement={requirement} />
                ))}
              </div>
              {data.missingScopes.includes("profile:read_all") ? (
                <div className="mt-4 rounded-2xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/8 p-4 text-sm leading-6 text-[color:var(--accent)]">
                  `profile:read_all` fehlt noch. Dadurch bleiben `athlete/zones` und Profilzonen
                  im Export leer, obwohl die restlichen Aktivitaetsdaten bereits funktionieren.
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-700">
                  Alle MVP-relevanten Scopes sind aktiv. `athlete/zones` kann genutzt werden,
                  wenn Strava fuer den Account Zonen zurueckgibt.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            {snapshotCompare ? (
              <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-white/88 p-5 xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-black/60">
                      Snapshot-Compare
                    </h3>
                    <p className="mt-2 text-sm text-black/58">
                      Vorher/Nachher, 7d/14d/30d Trends und 3-Snapshot-Mittel.
                    </p>
                  </div>
                  <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-black/52">
                    {snapshotCompareForSport?.previousSnapshot
                      ? `Vergleich zu ${formatDateTime(snapshotCompareForSport.previousSnapshot.createdAt)}`
                      : "Erster Snapshot"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {snapshotSportFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                        selectedSportFilter === option.value
                          ? "bg-[color:var(--accent)] text-white"
                          : "bg-black/6 text-black/62 hover:bg-black/10"
                      }`}
                      onClick={() => setSelectedSportFilter(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-black/56">
                  Filter: {selectedSnapshotSportLabel} · Sessions im aktuellen Snapshot:{" "}
                  {snapshotCompareForSport?.sampleSize ?? 0}
                </p>
                <p className="mt-1 text-xs text-black/52">
                  Formel {snapshotCompare.formula.version}: Run HR{" "}
                  {Math.round(snapshotCompare.formula.weightProfiles.run.hrWeight * 100)}% /
                  Power {Math.round(snapshotCompare.formula.weightProfiles.run.powerWeight * 100)}
                  % · Ride HR {Math.round(snapshotCompare.formula.weightProfiles.ride.hrWeight * 100)}
                  % / Power {Math.round(snapshotCompare.formula.weightProfiles.ride.powerWeight * 100)}
                  % · Default-Intensitaet{" "}
                  {Math.round(snapshotCompare.formula.defaultIntensity * 100)}%
                </p>
                <p className="mt-1 text-xs text-black/48">
                  {snapshotCompare.formula.documentation.join(" ")}
                </p>
                <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
                  <SnapshotDeltaCard
                    label="Load"
                    currentValue={String(snapshotCompareForSport?.load.current ?? 0)}
                    previousValue={
                      snapshotCompareForSport?.load.previous === null ||
                      !snapshotCompareForSport
                        ? null
                        : String(snapshotCompareForSport.load.previous)
                    }
                    deltaValue={
                      snapshotCompareForSport?.load.delta === null ||
                      !snapshotCompareForSport
                        ? null
                        : formatSignedNumber(snapshotCompareForSport.load.delta)
                    }
                    deltaPercent={
                      snapshotCompareForSport?.load.deltaPercent === null ||
                      !snapshotCompareForSport
                        ? null
                        : formatSignedPercent(snapshotCompareForSport.load.deltaPercent)
                    }
                    trendValue={
                      snapshotCompareForSport?.trends.load.rollingAverage3 === null ||
                      !snapshotCompareForSport
                        ? null
                        : String(snapshotCompareForSport.trends.load.rollingAverage3)
                    }
                    trendWindows={
                      snapshotCompareForSport
                        ? snapshotCompareForSport.trends.load.windows.map((window) =>
                            formatTrendWindow(
                              window.days,
                              window.delta,
                              window.deltaPercent,
                              window.confidenceLabel,
                            ),
                          )
                        : []
                    }
                  />
                  <SnapshotDeltaCard
                    label="Intensitaet"
                    currentValue={`${snapshotCompareForSport?.intensity.current ?? 0} %`}
                    previousValue={
                      snapshotCompareForSport?.intensity.previous === null ||
                      !snapshotCompareForSport
                        ? null
                        : `${snapshotCompareForSport.intensity.previous} %`
                    }
                    deltaValue={
                      snapshotCompareForSport?.intensity.delta === null ||
                      !snapshotCompareForSport
                        ? null
                        : formatSignedNumber(snapshotCompareForSport.intensity.delta, " pp")
                    }
                    deltaPercent={
                      snapshotCompareForSport?.intensity.deltaPercent === null ||
                      !snapshotCompareForSport
                        ? null
                        : formatSignedPercent(snapshotCompareForSport.intensity.deltaPercent)
                    }
                    trendValue={
                      snapshotCompareForSport?.trends.intensity.rollingAverage3 === null ||
                      !snapshotCompareForSport
                        ? null
                        : `${snapshotCompareForSport.trends.intensity.rollingAverage3} %`
                    }
                    trendWindows={
                      snapshotCompareForSport
                        ? snapshotCompareForSport.trends.intensity.windows.map((window) =>
                            formatTrendWindow(
                              window.days,
                              window.delta,
                              window.deltaPercent,
                              window.confidenceLabel,
                              " pp",
                            ),
                          )
                        : []
                    }
                  />
                  <SnapshotDeltaCard
                    label="Dauer"
                    currentValue={formatDurationCompact(
                      snapshotCompareForSport?.durationSeconds.current ?? 0,
                    )}
                    previousValue={
                      snapshotCompareForSport?.durationSeconds.previous === null ||
                      !snapshotCompareForSport
                        ? null
                        : formatDurationCompact(snapshotCompareForSport.durationSeconds.previous)
                    }
                    deltaValue={
                      snapshotCompareForSport?.durationSeconds.delta === null ||
                      !snapshotCompareForSport
                        ? null
                        : formatSignedNumber(
                            Math.round(snapshotCompareForSport.durationSeconds.delta / 60),
                            " min",
                          )
                    }
                    deltaPercent={
                      snapshotCompareForSport?.durationSeconds.deltaPercent === null ||
                      !snapshotCompareForSport
                        ? null
                        : formatSignedPercent(
                            snapshotCompareForSport.durationSeconds.deltaPercent,
                          )
                    }
                    trendValue={
                      snapshotCompareForSport?.trends.durationSeconds.rollingAverage3 ===
                        null || !snapshotCompareForSport
                        ? null
                        : formatDurationCompact(
                            snapshotCompareForSport.trends.durationSeconds.rollingAverage3,
                          )
                    }
                    trendWindows={
                      snapshotCompareForSport
                        ? snapshotCompareForSport.trends.durationSeconds.windows.map(
                            (window) =>
                              formatTrendWindow(
                                window.days,
                                window.delta === null ? null : Math.round(window.delta / 60),
                                window.deltaPercent,
                                window.confidenceLabel,
                                " min",
                              ),
                          )
                        : []
                    }
                  />
                </div>
              </div>
            ) : null}

            <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-white/88 p-5 xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-black/60">
                    Insight-Layer
                  </h3>
                  <p className="mt-2 text-sm text-black/58">
                    Kompakte KPI-Zusammenfassung direkt aus dem aktuellen Export.
                  </p>
                </div>
                <span className="rounded-full bg-[color:var(--accent)]/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--accent)]">
                  {insightKpis.length} KPIs
                </span>
              </div>
              <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
                {insightKpis.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[#fffdf8] p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-black/60">
                Athleten-Zonen
              </h3>
              {data.athleteZones ? (
                <div className="mt-4 grid gap-4">
                  <div className="rounded-2xl border border-black/6 bg-black/[0.03] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-black/42">
                      Herzfrequenz
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/70">
                      {data.athleteZones.heartRateZones.length > 0
                        ? data.athleteZones.heartRateZones
                            .map(formatZoneRangeLabel)
                            .join(" · ")
                        : "Keine HR-Zonen von Strava erhalten."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-black/6 bg-black/[0.03] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-black/42">
                      Power
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/70">
                      {data.athleteZones.powerZones.length > 0
                        ? data.athleteZones.powerZones
                            .map(formatZoneRangeLabel)
                            .join(" · ")
                        : "Keine Power-Zonen von Strava erhalten."}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-black/58">
                  Noch keine Athleten-Zonen im Export. Das liegt meist an fehlendem
                  `profile:read_all` oder daran, dass Strava fuer diesen Account keine Zonen liefert.
                </p>
              )}
            </div>

            <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-white/88 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-black/60">
                Exporthistorie
              </h3>
              <div className="mt-4 space-y-3">
                {data.snapshots.length > 0 ? (
                  data.snapshots.map((snapshot, index) => (
                    <div
                      key={`${snapshot.id}-${snapshot.createdAt}`}
                      className="rounded-2xl border border-black/6 bg-black/[0.03] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-black/74">
                          {index === 0 ? "Aktueller Export" : "Vorheriger Snapshot"}
                        </p>
                        <span className="text-xs font-medium text-black/42">
                          {formatDateTime(snapshot.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-black/62">
                        {snapshot.activityCount} Aktivitaeten · {snapshot.rangeLabel}
                      </p>
                      <p className="mt-2 text-xs font-medium text-black/46">
                        {snapshot.selectedDays} Tage ·{" "}
                        {snapshot.hasAthleteZones ? "Athleten-Zonen sichtbar" : "Keine Athleten-Zonen"} ·{" "}
                        {snapshot.hasPowerData ? "Power vorhanden" : "Keine Power-Felder"}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-black/58">Noch keine Snapshots vorhanden.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {data.activities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <details className="group rounded-[1.5rem] border border-[color:var(--border)] bg-[#171512] p-5 text-[#f8f4ec]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-white/72">
                Fuer ChatGPT
              </h3>
              <p className="mt-2 text-sm text-white/52">{gptPreview}</p>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.1em] text-white/52 transition group-open:rotate-180">
              ▼
            </span>
          </summary>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap border-t border-white/10 pt-4 text-xs leading-6 text-white/78">
            {gptSummary || "Noch kein Export erzeugt."}
          </pre>
        </details>
        <details className="group rounded-[1.5rem] border border-[color:var(--border)] bg-[#fffdf8] p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-black/60">
                JSON
              </h3>
              <p className="mt-2 text-sm text-black/46">{jsonPreview}</p>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.1em] text-black/42 transition group-open:rotate-180">
              ▼
            </span>
          </summary>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap border-t border-black/8 pt-4 text-xs leading-6 text-black/70">
            {jsonValue || "Noch kein Export erzeugt."}
          </pre>
        </details>
      </div>
    </section>
  );
}
