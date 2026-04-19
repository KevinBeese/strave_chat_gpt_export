export type WeeklySummaryActivityTypeMetric = {
  type: string;
  count: number;
  distance_km: number;
  moving_time_h: number;
};

export type WeeklySummaryActivityHighlight = {
  id: string;
  name: string;
  type: string;
  date: string;
  distance_km: number;
  moving_time_min: number;
  avg_hr: number | null;
  elevation_gain_m: number | null;
};

export type WeeklySummaryHardestActivityHighlight = WeeklySummaryActivityHighlight & {
  hardness_score: number;
  hardness_reason: string;
};

export type WeeklySummaryResponse = {
  week_start: string;
  week_end: string;
  generated_at: string;
  metrics: {
    total_activities: number;
    total_distance_km: number;
    total_moving_time_h: number;
    total_elevation_gain_m: number;
    activities_by_type: WeeklySummaryActivityTypeMetric[];
  };
  comparison: {
    vs_previous_week: {
      activities_delta_abs: number;
      distance_delta_km_abs: number;
      distance_delta_pct: number | null;
      moving_time_delta_h_abs: number;
      moving_time_delta_pct: number | null;
    };
  };
  highlights: {
    longest_activity: WeeklySummaryActivityHighlight | null;
    hardest_activity: WeeklySummaryHardestActivityHighlight | null;
    top_activity_type: {
      type: string | null;
      count: number;
    };
  };
  summary_text: string;
};
