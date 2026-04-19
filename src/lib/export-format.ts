import type {
  ActivityZone,
  AthleteZones,
  ExportPayload,
  SnapshotCompare,
  ExportSnapshotSummary,
  NormalizedActivity,
  ScopeRequirement,
} from "@/types/export";

function formatDistance(distanceMeters: number) {
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

function formatZoneDuration(seconds: number) {
  if (seconds < 60) {
    return `0:${String(seconds).padStart(2, "0")} min`;
  }

  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

function formatDate(dateIso: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateIso));
}

function formatHeartRate(value: number | null) {
  if (!value) {
    return null;
  }

  return `${Math.round(value)} bpm`;
}

function formatPower(value: number | null) {
  if (!value) {
    return null;
  }

  return `${Math.round(value)} W`;
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

function formatZoneBuckets(zones: ActivityZone[], type: "heartrate" | "power") {
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
    .join(", ");
}

function formatAthleteZoneRanges(title: string, ranges: { min: number; max: number }[]) {
  if (ranges.length === 0) {
    return null;
  }

  const formatted = ranges
    .map((range, index) => `Z${index + 1} ${formatOpenEndedRange(range.min, range.max)}`)
    .join(" · ");

  return `${title}: ${formatted}`;
}

function buildScopeRequirements(grantedScopes: string[], requiredScopes: string[]): ScopeRequirement[] {
  return requiredScopes.map((scope) => ({
    scope,
    granted: grantedScopes.includes(scope),
    required: true,
  }));
}

function getActivityContext(activity: NormalizedActivity) {
  if (activity.hasDistanceData) {
    return `Distanz: ${formatDistance(activity.distanceMeters)}`;
  }

  const heartRate = formatHeartRate(activity.averageHeartrate);

  if (heartRate) {
    return `${activity.analysisLabel} ohne Distanzdaten, Fokus auf Dauer und Puls (${heartRate})`;
  }

  return `${activity.analysisLabel} ohne Distanzdaten, Fokus auf Dauer`;
}

function toPromptLine(activity: NormalizedActivity, index: number) {
  const heartRateZones = formatZoneBuckets(activity.zones, "heartrate");
  const powerZones = formatZoneBuckets(activity.zones, "power");
  const averagePower = formatPower(activity.averageWatts);
  const weightedPower = formatPower(activity.weightedAverageWatts);
  const maxPower = formatPower(activity.maxWatts);
  const loadValue = activity.resolvedMetrics.load.value;
  const intensityValue = activity.resolvedMetrics.intensityPercent.value;
  const loadSource = activity.resolvedMetrics.load.source;
  const intensitySource = activity.resolvedMetrics.intensityPercent.source;
  const lines = [
    `${index + 1}. ${activity.name}`,
    `- Trainingsart: ${activity.analysisLabel}`,
    `- Strava-Typ: ${activity.type}`,
    `- Datum: ${formatDate(activity.startDate)}`,
    `- Bewegungszeit: ${formatDuration(activity.movingTimeSeconds)}`,
  ];

  const context = getActivityContext(activity);
  if (!activity.hasDistanceData) {
    lines.push(`- Kontext: ${context}`);
  }

  if (activity.hasDistanceData) {
    lines.push(`- Distanz: ${formatDistance(activity.distanceMeters)}`);
  }

  if (activity.elevationGainMeters > 0) {
    lines.push(`- Hoehenmeter: ${activity.elevationGainMeters} m`);
  }

  if (activity.averageHeartrate) {
    lines.push(`- Durchschnittspuls: ${Math.round(activity.averageHeartrate)}`);
  }

  if (activity.maxHeartrate) {
    lines.push(`- Maxpuls: ${Math.round(activity.maxHeartrate)}`);
  }

  if (averagePower) {
    lines.push(`- Durchschnittsleistung: ${averagePower}`);
  }

  if (weightedPower) {
    lines.push(`- Weighted Avg Power: ${weightedPower}`);
  }

  if (maxPower) {
    lines.push(`- Maximalleistung: ${maxPower}`);
  }

  if (loadValue !== null) {
    lines.push(
      `- Session Load: ${Math.round(loadValue * 10) / 10} (${loadSource === "provider" ? "Provider" : "Fallback"})`,
    );
  }

  if (intensityValue !== null) {
    lines.push(
      `- Intensitaet: ${Math.round(intensityValue * 10) / 10} % (${intensitySource === "provider" ? "Provider" : "Fallback"})`,
    );
  }

  if (activity.providerMetrics.tss !== null) {
    lines.push(`- Provider-TSS: ${Math.round(activity.providerMetrics.tss * 10) / 10}`);
  }

  if (activity.providerMetrics.intensityFactor !== null) {
    lines.push(
      `- Provider-IF: ${Math.round(activity.providerMetrics.intensityFactor * 1000) / 1000}`,
    );
  }

  if (activity.providerMetrics.normalizedPowerWatts !== null) {
    lines.push(`- Provider-NP: ${Math.round(activity.providerMetrics.normalizedPowerWatts)} W`);
  }

  if (activity.providerMetrics.variabilityIndex !== null) {
    lines.push(
      `- Provider-VI: ${Math.round(activity.providerMetrics.variabilityIndex * 100) / 100}`,
    );
  }

  if (activity.calories !== null) {
    lines.push(`- Kalorien: ${Math.round(activity.calories)} kcal`);
  }

  if (heartRateZones) {
    lines.push(`- Herzfrequenzzonen: ${heartRateZones}`);
  }

  if (powerZones) {
    lines.push(`- Power-Zonen: ${powerZones}`);
  }

  if (activity.deviceWatts !== null) {
    lines.push(
      `- Powerquelle: ${activity.deviceWatts ? "geraetebasiert / Outdoor-Messung" : "von Strava geschaetzt"}`,
    );
  }

  if (activity.description) {
    lines.push(`- Wichtige Beschreibung aus Strava: ${activity.description}`);
  }

  return lines.join("\n");
}

export function buildChatGptPrompt(
  activities: NormalizedActivity[],
  rangeLabel: string,
  selectedDays: number,
  athleteZones: AthleteZones | null,
  missingScopes: string[],
) {
  const header = [
    `Hier sind meine Strava-Aktivitaeten der letzten ${selectedDays} Tage.`,
    "Bitte analysiere Trainingsumfang, Belastung, Intensitaetsverteilung, Power-Muster und auffaellige Muster.",
    "Wenn bei Aktivitaeten keine Distanzdaten vorhanden sind, bewerte sie bitte ueber Dauer, Herzfrequenz und Aktivitaetstyp statt ueber Kilometer oder Pace.",
    "Nutze dafuer bevorzugt die Trainingsart und Kontextbeschreibung statt nur den rohen Strava-Typ.",
    "Wenn Profil-Zonen, Power-Zonen oder Beschreibungen vorhanden sind, behandle sie als wichtigen Kontext und nenne Inkonsistenzen explizit.",
    "",
    `Zeitraum: ${rangeLabel}`,
    `Anzahl Aktivitaeten: ${activities.length}`,
    "",
  ];

  if (athleteZones) {
    const hrZones = formatAthleteZoneRanges(
      "Meine Herzfrequenzzonen",
      athleteZones.heartRateZones,
    );
    const powerZoneLines = formatAthleteZoneRanges(
      "Meine Power-Zonen",
      athleteZones.powerZones,
    );

    if (hrZones) {
      header.push(hrZones);
    }

    if (powerZoneLines) {
      header.push(powerZoneLines);
    }

    if (hrZones || powerZoneLines) {
      header.push("");
    }
  }

  if (missingScopes.includes("profile:read_all")) {
    header.push(
      "Hinweis: Profil-Zonen fehlen noch, weil die Strava-Verbindung ohne den Scope profile:read_all autorisiert wurde.",
      "",
    );
  }

  return [...header, ...activities.map(toPromptLine)].join("\n");
}

export function createExportPayload(
  activities: NormalizedActivity[],
  rangeStart: string,
  rangeEnd: string,
  selectedDays: number,
  appliedFilters: ExportPayload["appliedFilters"],
  athleteZones: AthleteZones | null,
  grantedScopes: string[],
  requiredScopes: string[],
  missingScopes: string[],
  snapshots: ExportSnapshotSummary[],
  snapshotCompare: SnapshotCompare,
): ExportPayload {
  const rangeLabel = `${formatDate(rangeStart)} bis ${formatDate(rangeEnd)}`;

  return {
    generatedAt: new Date().toISOString(),
    selectedDays,
    appliedFilters,
    grantedScopes,
    missingScopes,
    athleteZones,
    rangeStart,
    rangeEnd,
    rangeLabel,
    activityCount: activities.length,
    activities,
    chatGptPrompt: buildChatGptPrompt(
      activities,
      rangeLabel,
      selectedDays,
      athleteZones,
      missingScopes,
    ),
    requiredScopes: buildScopeRequirements(grantedScopes, requiredScopes),
    snapshots,
    snapshotCompare,
  };
}
