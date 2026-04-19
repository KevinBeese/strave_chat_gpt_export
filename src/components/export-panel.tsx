"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import {
  SNAPSHOT_FORMULA_DEFAULT_INTENSITY,
  SNAPSHOT_FORMULA_WEIGHT_PROFILES,
  SNAPSHOT_TREND_CONFIDENCE_BANDS,
} from "@/lib/snapshot-config";
import type {
  ActivityZone,
  AthleteZoneRange,
  ExportPayload,
  MetricSource,
  NormalizedActivity,
  SnapshotSportFilter,
  ScopeRequirement,
} from "@/types/export";

const periodOptions = [
  { label: "7 Tage", value: 7 },
  { label: "14 Tage", value: 14 },
  { label: "30 Tage", value: 30 },
] as const;

const activityTypeOptions = [
  { label: "Alle", value: "" },
  { label: "Run", value: "Run" },
  { label: "Ride", value: "Ride" },
  { label: "Swim", value: "Swim" },
  { label: "Workout", value: "Workout" },
] as const;

const intensityOptions = [
  { label: "Alle", value: "" },
  { label: "Easy", value: "easy" },
  { label: "Moderate", value: "moderate" },
  { label: "Hard", value: "hard" },
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

function formatDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getTodayDateInputValue() {
  return formatDateInputValue(new Date());
}

function getDateInputValueDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return formatDateInputValue(date);
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMetricSourceLabel(source: MetricSource) {
  if (source === "provider") {
    return "Strava";
  }

  if (source === "derived") {
    return "Fallback";
  }

  return "Keine Quelle";
}

function FallbackMetricIcon() {
  return (
    <span
      aria-label="Fallback-Metrik, nicht direkt von Strava geliefert"
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-700"
      title="Fallback-Metrik, nicht direkt von Strava geliefert"
    >
      <svg
        aria-hidden="true"
        className="h-2.5 w-2.5"
        fill="none"
        viewBox="0 0 16 16"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M8 4.25V8.75" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
        <circle cx="8" cy="11.35" fill="currentColor" r="1" />
      </svg>
    </span>
  );
}

type TrendWindowDisplay = {
  valueLabel: string;
  confidenceLevel: "low" | "medium" | "high";
  confidenceLabel: string;
};

function getTrendConfidenceTone(level: TrendWindowDisplay["confidenceLevel"]) {
  if (level === "high") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (level === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function compactConfidenceLabel(label: string) {
  return label.replace("Trend Confidence: ", "");
}

function formatTrendWindow(
  days: number,
  delta: number | null,
  deltaPercent: number | null,
  confidenceLevel: TrendWindowDisplay["confidenceLevel"],
  confidenceLabel: string,
  unit = "",
): TrendWindowDisplay {
  if (delta === null) {
    return {
      valueLabel: `${days}d n/a`,
      confidenceLevel,
      confidenceLabel,
    };
  }

  const deltaLabel = formatSignedNumber(delta, unit);
  const percentLabel = deltaPercent === null ? "" : ` (${formatSignedPercent(deltaPercent)})`;
  return {
    valueLabel: `${days}d ${deltaLabel}${percentLabel}`,
    confidenceLevel,
    confidenceLabel,
  };
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

function getActivityZoneIntensity(activity: NormalizedActivity, type: "heartrate" | "power") {
  const zone = activity.zones.find((entry) => entry.type === type);
  if (!zone || zone.distributionBuckets.length === 0) {
    return null;
  }

  let totalSeconds = 0;
  let weightedSeconds = 0;

  zone.distributionBuckets.forEach((bucket, index) => {
    totalSeconds += bucket.time;
    weightedSeconds += bucket.time * (index + 1);
  });

  if (totalSeconds <= 0) {
    return null;
  }

  return weightedSeconds / (totalSeconds * zone.distributionBuckets.length);
}

function getActivityWeightProfile(activity: NormalizedActivity) {
  const normalizedType = activity.type.toLowerCase();
  const normalizedClassification = activity.classification.toLowerCase();

  if (normalizedType.includes("ride")) {
    return SNAPSHOT_FORMULA_WEIGHT_PROFILES.ride;
  }

  if (normalizedType.includes("run")) {
    return SNAPSHOT_FORMULA_WEIGHT_PROFILES.run;
  }

  if (
    normalizedType.includes("workout") ||
    normalizedType.includes("weighttraining") ||
    normalizedClassification.includes("workout") ||
    normalizedClassification.includes("strength") ||
    normalizedClassification.includes("functional")
  ) {
    return SNAPSHOT_FORMULA_WEIGHT_PROFILES.workout;
  }

  return SNAPSHOT_FORMULA_WEIGHT_PROFILES.default;
}

function getActivityIntensityRatio(activity: NormalizedActivity) {
  const heartRateIntensity = getActivityZoneIntensity(activity, "heartrate");
  const powerIntensity = getActivityZoneIntensity(activity, "power");
  const weightProfile = getActivityWeightProfile(activity);

  if (heartRateIntensity !== null && powerIntensity !== null) {
    return clamp(
      heartRateIntensity * weightProfile.hrWeight + powerIntensity * weightProfile.powerWeight,
      0,
      1,
    );
  }

  if (heartRateIntensity !== null) {
    return clamp(heartRateIntensity, 0, 1);
  }

  if (powerIntensity !== null) {
    return clamp(powerIntensity, 0, 1);
  }

  if (activity.averageHeartrate) {
    return clamp(activity.averageHeartrate / 180, 0, 1);
  }

  if (activity.averageWatts && activity.maxWatts) {
    return clamp(activity.averageWatts / activity.maxWatts, 0, 1);
  }

  return SNAPSHOT_FORMULA_DEFAULT_INTENSITY;
}

function getActivitySessionLoad(activity: NormalizedActivity) {
  const intensityPercent = getActivityIntensityRatio(activity) * 100;
  return (activity.movingTimeSeconds / 3600) * intensityPercent;
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
  fallback = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "accent";
  multiline?: boolean;
  fallback?: boolean;
}) {
  return (
    <div
      className={`min-h-[88px] rounded-2xl border px-4 py-3 ${
        tone === "accent"
          ? "border-[color:var(--accent)]/16 bg-[color:var(--accent)]/7"
          : "border-black/6 bg-black/[0.035]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-black/44">
          {label}
        </p>
        {fallback ? <FallbackMetricIcon /> : null}
      </div>
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
  trendWindows: TrendWindowDisplay[];
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
        <div className="mt-2">
          <p className="text-xs leading-5 text-black/58">Trend:</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {trendWindows.map((window) => (
              <div
                key={`${window.valueLabel}-${window.confidenceLabel}`}
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/90 px-2 py-1 text-[11px] leading-5 text-black/68"
              >
                <span>{window.valueLabel}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${getTrendConfidenceTone(
                    window.confidenceLevel,
                  )}`}
                >
                  {compactConfidenceLabel(window.confidenceLabel)}
                </span>
              </div>
            ))}
          </div>
        </div>
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
  const sessionLoad =
    Math.round((activity.resolvedMetrics.load.value ?? getActivitySessionLoad(activity)) * 10) / 10;
  const sessionIntensity =
    Math.round(
      (activity.resolvedMetrics.intensityPercent.value ?? getActivityIntensityRatio(activity) * 100) *
        10,
    ) / 10;
  const loadSource = activity.resolvedMetrics.load.source;
  const intensitySource = activity.resolvedMetrics.intensityPercent.source;
  const loadSourceLabel = getMetricSourceLabel(loadSource);
  const intensitySourceLabel = getMetricSourceLabel(intensitySource);
  const loadIsFallback = loadSource === "derived";
  const intensityIsFallback = intensitySource === "derived";
  const providerIf =
    activity.providerMetrics.intensityFactor !== null
      ? `${Math.round(activity.providerMetrics.intensityFactor * 1000) / 1000}`
      : null;
  const providerTss =
    activity.providerMetrics.tss !== null
      ? `${Math.round(activity.providerMetrics.tss * 10) / 10}`
      : null;
  const providerNp =
    activity.providerMetrics.normalizedPowerWatts !== null
      ? `${Math.round(activity.providerMetrics.normalizedPowerWatts)} W`
      : null;
  const providerVi =
    activity.providerMetrics.variabilityIndex !== null
      ? `${Math.round(activity.providerMetrics.variabilityIndex * 100) / 100}`
      : null;
  const avgCadence =
    activity.providerMetrics.averageCadence !== null
      ? `${Math.round(activity.providerMetrics.averageCadence)} rpm`
      : null;
  const maxCadence =
    activity.providerMetrics.maxCadence !== null
      ? `${Math.round(activity.providerMetrics.maxCadence)} rpm`
      : null;
  const avgTemp =
    activity.providerMetrics.averageTempC !== null
      ? `${Math.round(activity.providerMetrics.averageTempC * 10) / 10} C`
      : null;
  const minTemp =
    activity.providerMetrics.minTempC !== null
      ? `${Math.round(activity.providerMetrics.minTempC * 10) / 10} C`
      : null;
  const maxTemp =
    activity.providerMetrics.maxTempC !== null
      ? `${Math.round(activity.providerMetrics.maxTempC * 10) / 10} C`
      : null;

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
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-full border border-black/8 bg-[#fff7ec] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-black/56">
            {formatDuration(activity.movingTimeSeconds)}
          </div>
          <div className="rounded-xl border border-[color:var(--accent)]/18 bg-[color:var(--accent)]/8 px-3 py-2">
            <p className="text-sm font-semibold uppercase tracking-[0.06em] text-[color:var(--accent)]">
              SL {sessionLoad}
            </p>
            <div className="mt-0.5 flex items-center justify-center gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--accent)]/75">
                {loadSourceLabel}
              </p>
              {loadIsFallback ? <FallbackMetricIcon /> : null}
            </div>
          </div>
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
        <ActivityMetric
          fallback={intensityIsFallback}
          label={`Session Int. (${intensitySourceLabel})`}
          value={`${sessionIntensity} %`}
        />
        {providerTss ? <ActivityMetric label="TSS (Provider)" value={providerTss} /> : null}
        {providerIf ? <ActivityMetric label="IF (Provider)" value={providerIf} /> : null}
        {providerNp ? <ActivityMetric label="NP (Provider)" value={providerNp} /> : null}
        {providerVi ? <ActivityMetric label="VI (Provider)" value={providerVi} /> : null}
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
        {activity.calories !== null ? (
          <ActivityMetric label="Kalorien" value={`${Math.round(activity.calories)} kcal`} />
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
        {avgCadence ? <ActivityMetric label="Avg Kadenz" value={avgCadence} /> : null}
        {maxCadence ? <ActivityMetric label="Max Kadenz" value={maxCadence} /> : null}
        {avgTemp ? <ActivityMetric label="Temp Avg" value={avgTemp} /> : null}
        {minTemp ? <ActivityMetric label="Temp Min" value={minTemp} /> : null}
        {maxTemp ? <ActivityMetric label="Temp Max" value={maxTemp} /> : null}
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

export function ExportPanel({
  connected,
  autoStart = false,
  emphasizeOnboarding = false,
  refreshOnFirstSuccess = false,
}: {
  connected: boolean;
  autoStart?: boolean;
  emphasizeOnboarding?: boolean;
  refreshOnFirstSuccess?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<ExportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(7);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedActivityType, setSelectedActivityType] = useState("");
  const [selectedIntensityBucket, setSelectedIntensityBucket] = useState("");
  const [selectedSportFilter, setSelectedSportFilter] =
    useState<SnapshotSportFilter>("all");
  const hasAutoStarted = useRef(false);
  const hasRefreshedAfterSuccess = useRef(false);

  const applyPresetLast7Days = useCallback(() => {
    setSelectedDays(7);
    setDateFrom(getDateInputValueDaysAgo(6));
    setDateTo(getTodayDateInputValue());
  }, []);

  const applyPresetOnlyRuns = useCallback(() => {
    setSelectedActivityType("Run");
  }, []);

  const applyPresetHardSessions = useCallback(() => {
    setSelectedIntensityBucket("hard");
  }, []);

  const resetAllFilters = useCallback(() => {
    setSelectedDays(7);
    setDateFrom("");
    setDateTo("");
    setSelectedActivityType("");
    setSelectedIntensityBucket("");
  }, []);

  const handleExport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ days: String(selectedDays) });
      if (dateFrom) {
        params.set("date_from", dateFrom);
      }
      if (dateTo) {
        params.set("date_to", dateTo);
      }
      if (selectedActivityType) {
        params.set("activity_type", selectedActivityType);
      }
      if (selectedIntensityBucket) {
        params.set("intensity_bucket", selectedIntensityBucket);
      }
      const response = await fetch(`/api/strava/export?${params.toString()}`);
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

      if (refreshOnFirstSuccess && !hasRefreshedAfterSuccess.current) {
        hasRefreshedAfterSuccess.current = true;
        router.replace("/dashboard?onboarding_done=1");
        router.refresh();
      }
    } catch {
      setError("Export fehlgeschlagen. Bitte pruefe deine Verbindung.");
    } finally {
      setLoading(false);
    }
  }, [
    dateFrom,
    dateTo,
    refreshOnFirstSuccess,
    router,
    selectedActivityType,
    selectedDays,
    selectedIntensityBucket,
  ]);

  useEffect(() => {
    if (!connected || !autoStart || hasAutoStarted.current) {
      return;
    }

    hasAutoStarted.current = true;
    void handleExport();
  }, [autoStart, connected, handleExport]);

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
    <section
      className="rounded-[2rem] border border-[color:var(--border)] bg-white/78 p-8 shadow-[0_18px_80px_rgba(29,27,22,0.08)]"
      id="export-panel"
    >
      <p className="text-sm uppercase tracking-[0.14em] text-black/55">Export</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight">
        Strava-Zeitraum fuer ChatGPT vorbereiten
      </h2>
      <p className="mt-4 text-sm leading-6 text-black/70">
        Fuer den MVP ziehen wir Aktivitaeten auf Aktivitaetslevel und erzeugen daraus JSON und
        einen direkt kopierbaren Analyse-Text.
      </p>
      {emphasizeOnboarding ? (
        <div className="mt-4 rounded-2xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/8 p-4 text-sm text-black/72">
          Happy Path: Zeitraum auf 7 Tage lassen, Export starten, Analyse kopieren oder als Datei teilen.
        </div>
      ) : null}
      <p className="mt-3 text-sm leading-6 text-black/58">
        Provider-Metriken werden bevorzugt verwendet (z. B. TSS/IF/NP, falls vorhanden).
        Unsere Formel springt nur noch als Fallback ein und wird als Quelle markiert.
      </p>
      <p className="mt-2 text-xs leading-5 text-black/52">
        Das Symbol an einer Metrik bedeutet: dieser Wert kommt aus der Fallback-Berechnung und
        nicht direkt von Strava.
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
        <label className="flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-white px-4 py-2 text-sm text-black/70">
          Von
          <input
            className="bg-transparent font-medium outline-none"
            disabled={loading}
            onChange={(event) => setDateFrom(event.target.value)}
            type="date"
            value={dateFrom}
          />
        </label>
        <label className="flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-white px-4 py-2 text-sm text-black/70">
          Bis
          <input
            className="bg-transparent font-medium outline-none"
            disabled={loading}
            onChange={(event) => setDateTo(event.target.value)}
            type="date"
            value={dateTo}
          />
        </label>
        <label className="flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-white px-4 py-2 text-sm text-black/70">
          Typ
          <select
            className="bg-transparent font-medium outline-none"
            disabled={loading}
            onChange={(event) => setSelectedActivityType(event.target.value)}
            value={selectedActivityType}
          >
            {activityTypeOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-white px-4 py-2 text-sm text-black/70">
          Intensitaet
          <select
            className="bg-transparent font-medium outline-none"
            disabled={loading}
            onChange={(event) => setSelectedIntensityBucket(event.target.value)}
            value={selectedIntensityBucket}
          >
            {intensityOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
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
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--accent)] hover:bg-[color:var(--accent)]/14"
          disabled={loading}
          onClick={applyPresetLast7Days}
          type="button"
        >
          Letzte 7 Tage
        </button>
        <button
          className="rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--accent)] hover:bg-[color:var(--accent)]/14"
          disabled={loading}
          onClick={applyPresetOnlyRuns}
          type="button"
        >
          Nur Runs
        </button>
        <button
          className="rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--accent)] hover:bg-[color:var(--accent)]/14"
          disabled={loading}
          onClick={applyPresetHardSessions}
          type="button"
        >
          Harte Sessions
        </button>
        <button
          className="rounded-full border border-black/15 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-black/60 hover:bg-black/5"
          disabled={loading}
          onClick={resetAllFilters}
          type="button"
        >
          Filter zuruecksetzen
        </button>
      </div>
      {data?.appliedFilters &&
      (data.appliedFilters.dateFrom ||
        data.appliedFilters.dateTo ||
        data.appliedFilters.activityType ||
        data.appliedFilters.intensityBucket) ? (
        <p className="mt-3 text-xs leading-5 text-black/56">
          Aktive Filter: Zeitraum{" "}
          {data.appliedFilters.dateFrom ?? "offen"} bis {data.appliedFilters.dateTo ?? "offen"}
          {" · "}Typ {data.appliedFilters.activityType ?? "alle"}
          {" · "}Intensitaet {data.appliedFilters.intensityBucket ?? "alle"}
        </p>
      ) : null}
      {snapshotCompare ? (
        <div className="mt-8 max-w-3xl space-y-3">
          <div className="rounded-xl border border-black/8 bg-black/[0.03] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/46">
              Fallback-Formelprofile
            </p>
            <p className="mt-2 text-xs leading-5 text-black/56">
              Provider first: Wenn Strava/Device Metriken liefert, verwenden wir diese direkt.
              Die folgenden Profile gelten nur, wenn keine Providerwerte vorliegen.
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
        <div className="mt-5 rounded-2xl border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/8 p-4">
          <p className="text-sm font-semibold text-[color:var(--accent)]">Verbindung fehlt</p>
          <p className="mt-2 text-sm text-black/68">
            Verbinde zuerst deinen Strava-Account im Dashboard. Danach kannst du direkt den ersten
            7-Tage-Export erzeugen.
          </p>
          <Link
            className="mt-3 inline-flex rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-[color:var(--accent-foreground)]"
            href="/dashboard"
          >
            Strava verbinden
          </Link>
        </div>
      ) : null}

      {connected && !data && !error ? (
        <div className="mt-5 rounded-2xl border border-black/10 bg-white/85 p-4 text-sm text-black/68">
          <p className="font-semibold text-black/82">Bereit fuer den ersten Export</p>
          <p className="mt-2">
            Standard ist auf 7 Tage gesetzt. Klicke auf {selectedDays} Tage exportieren, um JSON und den
            GPT-Block zu erzeugen.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <button
            className="mt-3 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
            disabled={!connected || loading}
            onClick={handleExport}
            type="button"
          >
            Erneut versuchen
          </button>
        </div>
      ) : null}

      {data ? (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <p className="font-semibold">Export erfolgreich erstellt</p>
            <p className="mt-1">
              Dein {data.selectedDays}-Tage-Export ist bereit. Du kannst ihn kopieren, als JSON/TXT
              herunterladen oder in den Aktivitaeten weiterpruefen.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                className="rounded-full border border-emerald-300 bg-white px-4 py-2 font-medium text-emerald-700 hover:bg-emerald-100"
                href="/activities?range=7"
              >
                Export im Feed oeffnen
              </Link>
              {gptSummary ? <CopyButton value={gptSummary} /> : null}
            </div>
          </div>

          {data.activityCount === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">Keine Aktivitaeten im gewaehlten Zeitraum</p>
              <p className="mt-1">
                Es wurden im {data.selectedDays}-Tage-Fenster keine Einheiten gefunden. Probiere 14 oder
                30 Tage oder synchronisiere erneut.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-amber-300 bg-white px-4 py-2 font-medium text-amber-800 hover:bg-amber-100"
                  onClick={() => setSelectedDays(30)}
                  type="button"
                >
                  Zeitraum auf 30 Tage setzen
                </button>
                <Link
                  className="rounded-full border border-amber-300 bg-white px-4 py-2 font-medium text-amber-800 hover:bg-amber-100"
                  href="/dashboard"
                >
                  Zurueck zum Dashboard
                </Link>
              </div>
            </div>
          ) : null}

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
                  Fallback-Formel {snapshotCompare.formula.version}: Run HR{" "}
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
                              window.confidenceLevel,
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
                              window.confidenceLevel,
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
                                window.confidenceLevel,
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

            <details className="group rounded-[1.5rem] border border-[color:var(--border)] bg-white/88 p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-black/60">
                    Exporthistorie
                  </h3>
                  <p className="mt-2 text-sm text-black/52">
                    {data.snapshots.length} Snapshot{data.snapshots.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-black/42 transition group-open:rotate-180">
                  ▼
                </span>
              </summary>
              <div className="mt-4 space-y-3 border-t border-black/8 pt-4">
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
            </details>
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
