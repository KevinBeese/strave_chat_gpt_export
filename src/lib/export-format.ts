import type { ActivityZone, AthleteZones, ExportPayload, NormalizedActivity } from "@/types/export";

function formatDistance(distanceMeters: number) {
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number) {
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
    .map((bucket, index) => `Z${index + 1}: ${formatDuration(bucket.time)}`)
    .join(", ");
}

function formatAthleteZoneRanges(title: string, ranges: { min: number; max: number }[]) {
  if (ranges.length === 0) {
    return null;
  }

  const formatted = ranges
    .map((range, index) => `Z${index + 1} ${range.min}-${range.max}`)
    .join(" · ");

  return `${title}: ${formatted}`;
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

  if (activity.averageWatts) {
    lines.push(`- Durchschnittsleistung: ${Math.round(activity.averageWatts)} W`);
  }

  if (activity.weightedAverageWatts) {
    lines.push(`- Weighted Avg Power: ${Math.round(activity.weightedAverageWatts)} W`);
  }

  if (activity.maxWatts) {
    lines.push(`- Maximalleistung: ${Math.round(activity.maxWatts)} W`);
  }

  if (activity.kilojoules) {
    lines.push(`- Arbeit: ${Math.round(activity.kilojoules)} kJ`);
  }

  const heartRateZones = formatZoneBuckets(activity.zones, "heartrate");
  if (heartRateZones) {
    lines.push(`- Herzfrequenzzonen: ${heartRateZones}`);
  }

  const powerZones = formatZoneBuckets(activity.zones, "power");
  if (powerZones) {
    lines.push(`- Power-Zonen: ${powerZones}`);
  }

  if (activity.description) {
    lines.push(`- Notiz: ${activity.description}`);
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
    "Bitte analysiere Trainingsumfang, Belastung, Intensitaetsverteilung und auffaellige Muster.",
    "Wenn bei Aktivitaeten keine Distanzdaten vorhanden sind, bewerte sie bitte ueber Dauer, Herzfrequenz und Aktivitaetstyp statt ueber Kilometer oder Pace.",
    "Nutze dafuer bevorzugt die Trainingsart und Kontextbeschreibung statt nur den rohen Strava-Typ.",
    "Wenn eine Notiz vorhanden ist, beziehe sie als zusaetzlichen Kontext in die Analyse ein.",
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
  athleteZones: AthleteZones | null,
  grantedScopes: string[],
  missingScopes: string[],
): ExportPayload {
  const rangeLabel = `${formatDate(rangeStart)} bis ${formatDate(rangeEnd)}`;

  return {
    generatedAt: new Date().toISOString(),
    selectedDays,
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
  };
}
