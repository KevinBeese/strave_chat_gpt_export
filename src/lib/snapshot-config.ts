export const SNAPSHOT_FORMULA_DEFAULT_INTENSITY = 0.45;
export const SNAPSHOT_FORMULA_VERSION = "v2";
export const SNAPSHOT_TREND_WINDOWS = [7, 14, 30] as const;

export const SNAPSHOT_FORMULA_WEIGHT_PROFILES = {
  default: {
    hrWeight: 0.6,
    powerWeight: 0.4,
    description: "Default/Balanced fuer gemischte oder nicht eindeutig zugeordnete Aktivitaeten.",
  },
  run: {
    hrWeight: 0.75,
    powerWeight: 0.25,
    description: "Run HR-lastiger, da Puls fuer Laufsteuerung meist stabiler verfuegbar ist.",
  },
  ride: {
    hrWeight: 0.35,
    powerWeight: 0.65,
    description: "Ride Power-lastiger, da Leistung auf dem Rad die Belastung direkter abbildet.",
  },
  workout: {
    hrWeight: 0.8,
    powerWeight: 0.2,
    description: "Workout klar HR-lastig; Power ist hier oft nicht verfuegbar oder wenig robust.",
  },
} as const;

export type SnapshotFormulaWeightProfileKey =
  keyof typeof SNAPSHOT_FORMULA_WEIGHT_PROFILES;

export const SNAPSHOT_FORMULA_FALLBACK_ORDER = [
  "Zone-basiert (HR/Power)",
  "Nur HR",
  "Nur Power",
  "Durchschnittspuls/180",
  "Durchschnittsleistung/Maximalleistung",
  "Fixer Default",
] as const;

export const SNAPSHOT_FORMULA_DOCUMENTATION = [
  "v2 nutzt sportartspezifische Gewichte fuer die HR/Power-Kombination.",
  "Bei Filter = All wird je Aktivitaet automatisch das passende Sportprofil verwendet.",
  "Falls nur HR oder nur Power verfuegbar ist, wird dieser Kanal direkt verwendet.",
] as const;

export const SNAPSHOT_TREND_CONFIDENCE_BANDS = [
  {
    level: "high",
    minSampleSize: 6,
    label: "High",
  },
  {
    level: "medium",
    minSampleSize: 3,
    label: "Medium",
  },
  {
    level: "low",
    minSampleSize: 0,
    label: "Low",
  },
] as const;

export function getTrendConfidence(sampleSize: number) {
  const matchedBand =
    SNAPSHOT_TREND_CONFIDENCE_BANDS.find((band) => sampleSize >= band.minSampleSize) ??
    SNAPSHOT_TREND_CONFIDENCE_BANDS[SNAPSHOT_TREND_CONFIDENCE_BANDS.length - 1];

  return {
    level: matchedBand.level,
    label: `Trend Confidence: ${matchedBand.label} (n=${sampleSize})`,
  };
}
