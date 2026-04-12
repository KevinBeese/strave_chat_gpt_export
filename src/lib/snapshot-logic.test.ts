import { describe, expect, it } from "vitest";
import { getTrendConfidence } from "@/lib/snapshot-config";
import { __testables } from "@/lib/strava";
import type { ActivityZone, NormalizedActivity } from "@/types/export";

function makeZone(type: "heartrate" | "power", times: number[]): ActivityZone {
  return {
    type,
    sensorBased: true,
    points: null,
    max: null,
    customZones: false,
    score: null,
    distributionBuckets: times.map((time, index) => ({
      min: index * 10,
      max: (index + 1) * 10,
      time,
    })),
  };
}

function makeActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    id: 1,
    name: "Base Activity",
    type: "Run",
    classification: "Running",
    analysisLabel: "Laufeinheit",
    startDate: "2026-01-01T00:00:00.000Z",
    hasDistanceData: true,
    distanceMeters: 10000,
    movingTimeSeconds: 3600,
    elapsedTimeSeconds: 3600,
    elevationGainMeters: 0,
    averageSpeed: 2.77,
    maxSpeed: 3.5,
    averageHeartrate: null,
    maxHeartrate: null,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    kilojoules: null,
    deviceWatts: null,
    calories: null,
    description: null,
    zones: [],
    providerMetrics: {
      tss: null,
      intensityFactor: null,
      normalizedPowerWatts: null,
      variabilityIndex: null,
      averageCadence: null,
      maxCadence: null,
      averageTempC: null,
      minTempC: null,
      maxTempC: null,
    },
    resolvedMetrics: {
      load: {
        value: null,
        source: "unavailable",
        providerKey: null,
      },
      intensityPercent: {
        value: null,
        source: "unavailable",
        providerKey: null,
      },
    },
    ...overrides,
  };
}

describe("v2 weighting", () => {
  it("uses ride profile weights when HR and power zones are both present", () => {
    const activity = makeActivity({
      type: "Ride",
      classification: "Cycling",
      zones: [
        makeZone("heartrate", [100, 0, 0, 0, 0]),
        makeZone("power", [0, 0, 0, 0, 100]),
      ],
    });

    const intensity = __testables.getActivityIntensity(activity);

    expect(intensity).toBe(0.72);
  });

  it("uses run profile weights when HR and power zones are both present", () => {
    const activity = makeActivity({
      type: "Run",
      classification: "Running",
      zones: [
        makeZone("heartrate", [100, 0, 0, 0, 0]),
        makeZone("power", [0, 0, 0, 0, 100]),
      ],
    });

    const intensity = __testables.getActivityIntensity(activity);

    expect(intensity).toBe(0.4);
  });

  it("falls back to HR-only intensity when no power zone is available", () => {
    const activity = makeActivity({
      zones: [makeZone("heartrate", [100, 0, 0, 0, 0])],
    });

    const intensity = __testables.getActivityIntensity(activity);

    expect(intensity).toBe(0.2);
  });

  it("falls back to power-only intensity when no HR zone is available", () => {
    const activity = makeActivity({
      zones: [makeZone("power", [0, 0, 0, 0, 100])],
    });

    const intensity = __testables.getActivityIntensity(activity);

    expect(intensity).toBe(1);
  });

  it("uses default intensity when neither zones nor averages exist", () => {
    const activity = makeActivity();

    const intensity = __testables.getActivityIntensity(activity);

    expect(intensity).toBe(0.45);
  });

  it("clamps average HR fallback to max intensity 1", () => {
    const activity = makeActivity({
      averageHeartrate: 220,
    });

    const intensity = __testables.getActivityIntensity(activity);

    expect(intensity).toBe(1);
  });
});

describe("load calculation", () => {
  it("calculates weighted intensity and load from activity durations", () => {
    const activities = [
      makeActivity({
        id: 1,
        movingTimeSeconds: 3600,
        averageHeartrate: 90,
      }),
      makeActivity({
        id: 2,
        movingTimeSeconds: 1800,
        averageHeartrate: 180,
      }),
    ];

    const metrics = __testables.calculateTrainingMetrics(activities);

    expect(metrics.durationSeconds).toBe(5400);
    expect(metrics.intensity).toBe(66.67);
    expect(metrics.load).toBe(100);
  });

  it("returns zero metrics when total duration is zero", () => {
    const metrics = __testables.calculateTrainingMetrics([
      makeActivity({ movingTimeSeconds: 0, averageHeartrate: 150 }),
      makeActivity({ id: 2, movingTimeSeconds: 0, averageHeartrate: 130 }),
    ]);

    expect(metrics).toEqual({
      load: 0,
      intensity: 0,
      durationSeconds: 0,
    });
  });
});

describe("sport filters", () => {
  const activities = [
    makeActivity({
      id: 1,
      type: "Ride",
      classification: "Cycling",
    }),
    makeActivity({
      id: 2,
      type: "Run",
      classification: "Running",
    }),
    makeActivity({
      id: 3,
      type: "Workout",
      classification: "Functional Training",
    }),
    makeActivity({
      id: 4,
      type: "WeightTraining",
      classification: "Strength Training",
    }),
  ];

  it("keeps all activities for filter all", () => {
    expect(__testables.filterActivitiesBySport(activities, "all")).toHaveLength(4);
  });

  it("keeps only rides for filter ride", () => {
    const filtered = __testables.filterActivitiesBySport(activities, "ride");
    expect(filtered.map((activity) => activity.id)).toEqual([1]);
  });

  it("keeps only runs for filter run", () => {
    const filtered = __testables.filterActivitiesBySport(activities, "run");
    expect(filtered.map((activity) => activity.id)).toEqual([2]);
  });

  it("keeps workout and strength sessions for filter workout", () => {
    const filtered = __testables.filterActivitiesBySport(activities, "workout");
    expect(filtered.map((activity) => activity.id)).toEqual([3, 4]);
  });
});

describe("confidence bands", () => {
  it("maps sample size to low/medium/high confidence bands", () => {
    expect(getTrendConfidence(0)).toEqual({
      level: "low",
      label: "Trend Confidence: Low (n=0)",
    });
    expect(getTrendConfidence(3)).toEqual({
      level: "medium",
      label: "Trend Confidence: Medium (n=3)",
    });
    expect(getTrendConfidence(6)).toEqual({
      level: "high",
      label: "Trend Confidence: High (n=6)",
    });
  });

  it("applies confidence bands inside trend windows", () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const history = [10, 20, 30, 40, 50, 60].map((value, index) => ({
      createdAt: new Date(now - index * dayMs),
      value,
    }));

    const trend = __testables.buildMetricTrend(history);
    const window7 = trend.windows.find((entry) => entry.days === 7);

    expect(window7).toBeDefined();
    expect(window7?.sampleSize).toBe(6);
    expect(window7?.confidenceLevel).toBe("high");
    expect(window7?.confidenceLabel).toBe("Trend Confidence: High (n=6)");
  });
});
