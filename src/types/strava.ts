export type StravaTokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
  };
  scope?: string;
};

export type TokenUpsertPayload = StravaTokenResponse;
export type TokenUpsertInput = TokenUpsertPayload & {
  scope?: string;
};

export type StravaTimedZoneRange = {
  min: number;
  max: number;
  time: number;
};

export type StravaActivityZone = {
  type: "heartrate" | "power" | string;
  sensor_based?: boolean;
  points?: number;
  custom_zones?: boolean;
  max?: number;
  score?: number;
  distribution_buckets?: StravaTimedZoneRange[] | string;
};

export type StravaZoneRange = {
  min: number;
  max: number;
};

export type StravaAthleteZones = {
  heart_rate?: {
    zones: StravaZoneRange[];
  };
  power?: {
    zones: StravaZoneRange[];
  };
};

export type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  kilojoules?: number;
  device_watts?: boolean;
  calories?: number;
  description?: string;
  average_temp?: number;
  max_temp?: number;
  min_temp?: number;
  average_cadence?: number;
  max_cadence?: number;
  suffer_score?: number;
  relative_effort?: number;
  // Provider-/Device-seitige Zusatzmetriken (nicht immer vorhanden)
  tss?: number;
  if?: number;
  np?: number;
  vi?: number;
  intensity_factor?: number;
  normalized_power?: number;
  variability_index?: number;
};
