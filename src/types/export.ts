export type NormalizedActivity = {
  id: number;
  name: string;
  type: string;
  startDate: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  elevationGainMeters: number;
  averageSpeed: number;
  maxSpeed: number;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  calories: number | null;
  description: string | null;
};

export type ExportPayload = {
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  rangeLabel: string;
  activityCount: number;
  activities: NormalizedActivity[];
  chatGptPrompt: string;
};
