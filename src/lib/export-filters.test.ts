import { describe, expect, it } from "vitest";

import {
  filterActivitiesForExport,
  parseExportFilters,
  resolveDaysForDateRange,
} from "@/lib/export-filters";
import type { NormalizedActivity } from "@/types/export";

function makeActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    id: 1,
    name: "Session",
    type: "Run",
    classification: "Running",
    analysisLabel: "Laufeinheit",
    startDate: "2026-04-10T08:00:00.000Z",
    hasDistanceData: true,
    distanceMeters: 10000,
    movingTimeSeconds: 3600,
    elapsedTimeSeconds: 3600,
    elevationGainMeters: 100,
    averageSpeed: 2.8,
    maxSpeed: 4.2,
    averageHeartrate: 145,
    maxHeartrate: 185,
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
        value: 55,
        source: "derived",
        providerKey: null,
      },
      intensityPercent: {
        value: 60,
        source: "derived",
        providerKey: null,
      },
    },
    ...overrides,
  };
}

describe("parseExportFilters", () => {
  it("reads valid query params", () => {
    const params = new URLSearchParams({
      date_from: "2026-04-01",
      date_to: "2026-04-10",
      activity_type: "Run",
      intensity_bucket: "hard",
    });
    const parsed = parseExportFilters(params);

    expect(parsed).toEqual({
      dateFrom: "2026-04-01",
      dateTo: "2026-04-10",
      activityType: "Run",
      intensityBucket: "hard",
    });
  });

  it("drops invalid params", () => {
    const params = new URLSearchParams({
      date_from: "01.04.2026",
      intensity_bucket: "extreme",
    });
    const parsed = parseExportFilters(params);

    expect(parsed.dateFrom).toBeNull();
    expect(parsed.intensityBucket).toBeNull();
  });
});

describe("resolveDaysForDateRange", () => {
  it("expands fetch window when date_from is older than selected days", () => {
    const days = resolveDaysForDateRange(7, {
      dateFrom: "2026-03-01",
      dateTo: "2026-03-07",
      activityType: null,
      intensityBucket: null,
    });

    expect(days).toBeGreaterThanOrEqual(7);
  });
});

describe("filterActivitiesForExport", () => {
  const activities = [
    makeActivity({
      id: 1,
      type: "Run",
      startDate: "2026-04-08T08:00:00.000Z",
      resolvedMetrics: {
        load: { value: 40, source: "derived", providerKey: null },
        intensityPercent: { value: 50, source: "derived", providerKey: null },
      },
    }),
    makeActivity({
      id: 2,
      type: "Ride",
      startDate: "2026-04-09T08:00:00.000Z",
      resolvedMetrics: {
        load: { value: 60, source: "derived", providerKey: null },
        intensityPercent: { value: 68, source: "derived", providerKey: null },
      },
    }),
    makeActivity({
      id: 3,
      type: "Run",
      startDate: "2026-04-10T08:00:00.000Z",
      resolvedMetrics: {
        load: { value: 90, source: "derived", providerKey: null },
        intensityPercent: { value: 82, source: "derived", providerKey: null },
      },
    }),
  ];

  it("filters by date range, type and intensity", () => {
    const result = filterActivitiesForExport(activities, {
      dateFrom: "2026-04-09",
      dateTo: "2026-04-10",
      activityType: "Run",
      intensityBucket: "hard",
    });

    expect(result.map((entry) => entry.id)).toEqual([3]);
  });
});
