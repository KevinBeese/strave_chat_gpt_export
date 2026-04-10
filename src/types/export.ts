export type ActivityZoneRange = {
  min: number;
  max: number;
  time: number;
};

export type ActivityZone = {
  type: string;
  sensorBased: boolean;
  points: number | null;
  max: number | null;
  customZones: boolean;
  score: number | null;
  distributionBuckets: ActivityZoneRange[];
};

export type AthleteZoneRange = {
  min: number;
  max: number;
};

export type AthleteZones = {
  heartRateZones: AthleteZoneRange[];
  powerZones: AthleteZoneRange[];
};

export type NormalizedActivity = {
  id: number;
  name: string;
  type: string;
  classification: string;
  analysisLabel: string;
  startDate: string;
  hasDistanceData: boolean;
  distanceMeters: number;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  elevationGainMeters: number;
  averageSpeed: number;
  maxSpeed: number;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageWatts: number | null;
  weightedAverageWatts: number | null;
  maxWatts: number | null;
  kilojoules: number | null;
  deviceWatts: boolean | null;
  calories: number | null;
  description: string | null;
  zones: ActivityZone[];
};

export type ExportPayload = {
  generatedAt: string;
  selectedDays: number;
  grantedScopes: string[];
  missingScopes: string[];
  athleteZones: AthleteZones | null;
  rangeStart: string;
  rangeEnd: string;
  rangeLabel: string;
  activityCount: number;
  activities: NormalizedActivity[];
  chatGptPrompt: string;
};
