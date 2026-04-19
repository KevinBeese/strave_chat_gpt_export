import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const BEAT81_ACTIVITY_ID_OFFSET = 5_000_000_000_000_000_000n;
const BEAT81_ACTIVITY_ID_MOD = 3_000_000_000_000_000_000n;
const DEFAULT_DURATION_MINUTES = 45;
const DEFAULT_TIMEZONE = "Europe/Berlin";

const GERMAN_MONTHS: Record<string, number> = {
  januar: 1,
  februar: 2,
  maerz: 3,
  märz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

export type Beat81ImportInput = {
  rawText: string;
  sessionName?: string | null;
  startDateIso?: string | null;
  durationMinutes?: number | null;
  athleteWeightKg?: number | null;
  athleteHeightCm?: number | null;
  athleteMaxHr?: number | null;
  timezone?: string | null;
};

export type ParsedBeat81Report = {
  providerActivityId: string;
  name: string;
  startDate: Date;
  durationMinutes: number;
  caloriesTotal: number | null;
  caloriesWorkout: number | null;
  caloriesAfterburn: number | null;
  beatPointsTotal: number | null;
  sweatPoints: number | null;
  recoveryPoints: number | null;
  achievedHeartRate: number | null;
  personalMaxHeartRate: number | null;
  athleteWeightKg: number | null;
  athleteHeightCm: number | null;
  timezone: string;
};

function toRawJson(entry: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(entry)) as Prisma.InputJsonValue;
}

function normalizeText(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function findLabeledNumber(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = escapeRegex(label);
    const labelFirst = new RegExp(`${escaped}\\s*[:=]?\\s*([0-9]+(?:[.,][0-9]+)?)`, "i");
    const valueFirst = new RegExp(`([0-9]+(?:[.,][0-9]+)?)\\s*(?:kcal\\s*)?${escaped}`, "i");

    const matchA = text.match(valueFirst);
    if (matchA?.[1]) {
      const parsed = parseNumber(matchA[1]);
      if (parsed !== null) {
        return parsed;
      }
    }

    const matchB = text.match(labelFirst);
    if (matchB?.[1]) {
      const parsed = parseNumber(matchB[1]);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  return null;
}

function parseDurationMinutesFromZoneLines(text: string) {
  const matches = text.matchAll(/([0-9]+(?:[.,][0-9]+)?)\s*min\s*x\s*[1-5]/gi);
  let total = 0;

  for (const match of matches) {
    const parsed = parseNumber(match[1]);
    if (parsed !== null && parsed > 0) {
      total += parsed;
    }
  }

  if (total > 0 && total < 400) {
    return Math.round(total);
  }

  return null;
}

function parseSessionName(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates = lines.filter((line) => {
    const lower = line.toLowerCase();
    if (lower.includes("ergebnisse") || lower.includes("beat points")) {
      return false;
    }
    if (lower.includes("kalorien") || lower.includes("herzfrequenz")) {
      return false;
    }
    return /[a-zA-ZäöüÄÖÜ]/.test(line);
  });

  return candidates[0] ?? "BEAT81 Workout";
}

function parseGermanDateTime(text: string) {
  const match = text.match(
    /(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\s*,?\s*(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)(?:\s*,?\s*(\d{4}))?\s*,?\s*(\d{1,2}):(\d{2})/i,
  );

  if (!match) {
    return null;
  }

  const day = Number(match[2]);
  const monthLabel = match[3]?.toLowerCase() ?? "";
  const month = GERMAN_MONTHS[monthLabel];
  const yearRaw = match[4] ? Number(match[4]) : null;
  const hour = Number(match[5]);
  const minute = Number(match[6]);

  if (!month) {
    return null;
  }

  const now = new Date();
  let year = yearRaw ?? now.getFullYear();
  let date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (!yearRaw && date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    year -= 1;
    date = new Date(year, month - 1, day, hour, minute, 0, 0);
  }

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function toProviderActivityId(name: string, startDate: Date, text: string) {
  const payload = `${name}|${startDate.toISOString()}|${text}`;
  const digest = createHash("sha256").update(payload).digest("hex");
  return `beat81:${digest.slice(0, 24)}`;
}

function toInternalBeat81ActivityId(providerActivityId: string) {
  const digest = createHash("sha256").update(providerActivityId).digest("hex");
  const hashValue = BigInt(`0x${digest.slice(0, 16)}`);
  return BEAT81_ACTIVITY_ID_OFFSET + (hashValue % BEAT81_ACTIVITY_ID_MOD);
}

function toFinitePositiveInt(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

export function parseBeat81Report(input: Beat81ImportInput): ParsedBeat81Report {
  const text = normalizeText(input.rawText);
  if (!text) {
    throw new Error("Der BEAT81-Text ist leer.");
  }

  const name = input.sessionName?.trim() || parseSessionName(input.rawText);

  const startDateFromInput = input.startDateIso ? new Date(input.startDateIso) : null;
  const parsedDate =
    startDateFromInput && !Number.isNaN(startDateFromInput.getTime())
      ? startDateFromInput
      : parseGermanDateTime(input.rawText);
  const startDate = parsedDate ?? new Date();

  const durationFromText = parseDurationMinutesFromZoneLines(text);
  const durationMinutes =
    toFinitePositiveInt(input.durationMinutes) ?? durationFromText ?? DEFAULT_DURATION_MINUTES;

  const caloriesTotal = findLabeledNumber(text, [
    "Kalorien gesamt",
    "Kalorien total",
    "Verbrannte Kalorien",
  ]);
  const caloriesWorkout = findLabeledNumber(text, ["Workout"]);
  const caloriesAfterburn = findLabeledNumber(text, ["Nachbrenneffekt"]);

  const beatPointsTotal = findLabeledNumber(text, ["Punkte gesamt", "Beat Points"]);
  const sweatPoints = findLabeledNumber(text, ["Sweat Points", "Sweat"]);
  const recoveryPoints = findLabeledNumber(text, ["Recovery Points", "Recovery"]);

  const achievedHeartRate = findLabeledNumber(text, [
    "Achieved Heart Rate",
    "Erreichte Herzfrequenz",
  ]);
  const personalMaxHeartRate =
    findLabeledNumber(text, ["Personal Max Heart Rate", "Max Heart Rate", "Persoenliche Max HF"]) ??
    toFinitePositiveInt(input.athleteMaxHr);

  const providerActivityId = toProviderActivityId(name, startDate, text);

  return {
    providerActivityId,
    name,
    startDate,
    durationMinutes,
    caloriesTotal,
    caloriesWorkout,
    caloriesAfterburn,
    beatPointsTotal,
    sweatPoints,
    recoveryPoints,
    achievedHeartRate,
    personalMaxHeartRate,
    athleteWeightKg: toFinitePositiveInt(input.athleteWeightKg),
    athleteHeightCm: toFinitePositiveInt(input.athleteHeightCm),
    timezone: input.timezone?.trim() || DEFAULT_TIMEZONE,
  };
}

export async function importBeat81ReportForUser(userId: string, input: Beat81ImportInput) {
  const parsed = parseBeat81Report(input);
  const movingTimeSeconds = parsed.durationMinutes * 60;
  const calories =
    parsed.caloriesTotal ??
    (parsed.caloriesWorkout !== null || parsed.caloriesAfterburn !== null
      ? (parsed.caloriesWorkout ?? 0) + (parsed.caloriesAfterburn ?? 0)
      : null);

  const providerMetrics = {
    tss: null,
    intensityFactor: null,
    normalizedPowerWatts: null,
    variabilityIndex: null,
    averageCadence: null,
    maxCadence: null,
    averageTempC: null,
    minTempC: null,
    maxTempC: null,
  };

  const rawJson = {
    source: "beat81",
    parsedFromText: true,
    beatPoints: {
      total: parsed.beatPointsTotal,
      sweat: parsed.sweatPoints,
      recovery: parsed.recoveryPoints,
    },
    calories: calories,
    caloriesWorkout: parsed.caloriesWorkout,
    caloriesAfterburn: parsed.caloriesAfterburn,
    achievedHeartRate: parsed.achievedHeartRate,
    personalMaxHeartRate: parsed.personalMaxHeartRate,
    athleteWeightKg: parsed.athleteWeightKg,
    athleteHeightCm: parsed.athleteHeightCm,
    durationMinutes: parsed.durationMinutes,
    originalText: input.rawText,
  };

  const upserted = await prisma.activity.upsert({
    where: {
      userId_provider_providerActivityId: {
        userId,
        provider: "beat81",
        providerActivityId: parsed.providerActivityId,
      },
    },
    update: {
      userId,
      provider: "beat81",
      providerActivityId: parsed.providerActivityId,
      athleteId: userId,
      name: parsed.name,
      type: "Workout",
      distance: 0,
      movingTime: movingTimeSeconds,
      elapsedTime: movingTimeSeconds,
      timezone: parsed.timezone,
      rawJson: toRawJson(rawJson),
      classification: "Functional Training",
      analysisLabel: "BEAT81 Session",
      startDate: parsed.startDate,
      hasDistanceData: false,
      distanceMeters: 0,
      movingTimeSeconds,
      elapsedTimeSeconds: movingTimeSeconds,
      elevationGainMeters: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      averageHeartrate: null,
      maxHeartrate: parsed.achievedHeartRate,
      averageWatts: null,
      weightedAverageWatts: null,
      maxWatts: null,
      kilojoules: null,
      deviceWatts: false,
      calories,
      description: null,
      zonesJson: "[]",
      providerMetricsJson: JSON.stringify(providerMetrics),
    },
    create: {
      id: toInternalBeat81ActivityId(parsed.providerActivityId),
      userId,
      provider: "beat81",
      providerActivityId: parsed.providerActivityId,
      athleteId: userId,
      name: parsed.name,
      type: "Workout",
      distance: 0,
      movingTime: movingTimeSeconds,
      elapsedTime: movingTimeSeconds,
      timezone: parsed.timezone,
      rawJson: toRawJson(rawJson),
      classification: "Functional Training",
      analysisLabel: "BEAT81 Session",
      startDate: parsed.startDate,
      hasDistanceData: false,
      distanceMeters: 0,
      movingTimeSeconds,
      elapsedTimeSeconds: movingTimeSeconds,
      elevationGainMeters: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      averageHeartrate: null,
      maxHeartrate: parsed.achievedHeartRate,
      averageWatts: null,
      weightedAverageWatts: null,
      maxWatts: null,
      kilojoules: null,
      deviceWatts: false,
      calories,
      description: null,
      zonesJson: "[]",
      providerMetricsJson: JSON.stringify(providerMetrics),
    },
    select: {
      id: true,
      providerActivityId: true,
      startDate: true,
      name: true,
      calories: true,
      movingTimeSeconds: true,
    },
  });

  return {
    imported: {
      id: upserted.id.toString(),
      providerActivityId: upserted.providerActivityId,
      startDate: upserted.startDate.toISOString(),
      name: upserted.name,
      calories: upserted.calories,
      movingTimeSeconds: upserted.movingTimeSeconds,
    },
    parsed,
  };
}
