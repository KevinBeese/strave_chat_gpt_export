import type { ExportPayload, NormalizedActivity } from "@/types/export";

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

function toPromptLine(activity: NormalizedActivity, index: number) {
  const lines = [
    `${index + 1}. ${activity.name}`,
    `- Typ: ${activity.type}`,
    `- Datum: ${formatDate(activity.startDate)}`,
    `- Distanz: ${formatDistance(activity.distanceMeters)}`,
    `- Bewegungszeit: ${formatDuration(activity.movingTimeSeconds)}`,
    `- Hoehenmeter: ${activity.elevationGainMeters} m`,
  ];

  if (activity.averageHeartrate) {
    lines.push(`- Durchschnittspuls: ${Math.round(activity.averageHeartrate)}`);
  }

  if (activity.maxHeartrate) {
    lines.push(`- Maxpuls: ${Math.round(activity.maxHeartrate)}`);
  }

  if (activity.description) {
    lines.push(`- Notiz: ${activity.description}`);
  }

  return lines.join("\n");
}

export function buildChatGptPrompt(
  activities: NormalizedActivity[],
  rangeLabel: string,
) {
  const header = [
    "Hier sind meine Strava-Aktivitaeten der letzten 7 Tage.",
    "Bitte analysiere Trainingsumfang, Belastung, Intensitaetsverteilung und auffaellige Muster.",
    "",
    `Zeitraum: ${rangeLabel}`,
    `Anzahl Aktivitaeten: ${activities.length}`,
    "",
  ];

  return [...header, ...activities.map(toPromptLine)].join("\n");
}

export function createExportPayload(
  activities: NormalizedActivity[],
  rangeStart: string,
  rangeEnd: string,
): ExportPayload {
  const rangeLabel = `${formatDate(rangeStart)} bis ${formatDate(rangeEnd)}`;

  return {
    generatedAt: new Date().toISOString(),
    rangeStart,
    rangeEnd,
    rangeLabel,
    activityCount: activities.length,
    activities,
    chatGptPrompt: buildChatGptPrompt(activities, rangeLabel),
  };
}
