import { describe, expect, it } from "vitest";

import {
  __testables,
  buildWeeklySummaryFromActivities,
  renderWeeklySummaryMarkdown,
} from "@/lib/weekly-summary";

type WeeklyActivity = Parameters<typeof buildWeeklySummaryFromActivities>[0][number];

function makeActivity(overrides: Partial<WeeklyActivity> = {}): WeeklyActivity {
  return {
    id: 1n,
    provider: "strava",
    providers: ["strava"],
    mergedProviderLabel: "strava",
    duplicateIds: [1],
    name: "Test Session",
    type: "Run",
    startDate: new Date("2026-04-14T09:00:00.000Z"),
    distanceMeters: 10000,
    movingTimeSeconds: 3600,
    averageHeartrate: 150,
    maxHeartrate: 185,
    elevationGainMeters: 120,
    ...overrides,
  };
}

describe("buildWeeklySummaryFromActivities", () => {
  it("builds metrics, highlights and week-over-week deltas", () => {
    const currentWeek = [
      makeActivity({
        id: 11n,
        name: "Long Run",
        distanceMeters: 18000,
        movingTimeSeconds: 6000,
        averageHeartrate: 152,
      }),
      makeActivity({
        id: 12n,
        name: "Tempo",
        distanceMeters: 10000,
        movingTimeSeconds: 3400,
        averageHeartrate: 168,
      }),
    ];
    const previousWeek = [
      makeActivity({
        id: 21n,
        name: "Base Run",
        distanceMeters: 20000,
        movingTimeSeconds: 5000,
        averageHeartrate: 145,
      }),
    ];

    const summary = buildWeeklySummaryFromActivities(
      currentWeek,
      previousWeek,
      new Date("2026-04-13T00:00:00.000Z"),
    );

    expect(summary.metrics.total_activities).toBe(2);
    expect(summary.metrics.total_distance_km).toBe(28);
    expect(summary.comparison.vs_previous_week.distance_delta_km_abs).toBe(8);
    expect(summary.highlights.longest_activity?.name).toBe("Long Run");
    expect(summary.highlights.hardest_activity?.name).toBe("Long Run");
    expect(summary.summary_text).toContain("Du hattest 2 Einheiten");
  });

  it("falls back to duration for hardest activity when HR data is unavailable", () => {
    const currentWeek = [
      makeActivity({
        id: 31n,
        name: "Ride A",
        movingTimeSeconds: 2200,
        averageHeartrate: null,
        maxHeartrate: null,
      }),
      makeActivity({
        id: 32n,
        name: "Ride B",
        movingTimeSeconds: 4200,
        averageHeartrate: null,
        maxHeartrate: null,
      }),
    ];

    const summary = buildWeeklySummaryFromActivities(
      currentWeek,
      [],
      new Date("2026-04-13T00:00:00.000Z"),
    );

    expect(summary.highlights.hardest_activity?.name).toBe("Ride B");
    expect(summary.highlights.hardest_activity?.hardness_reason).toContain("Keine Herzfrequenzdaten");
  });
});

describe("weekly summary helpers", () => {
  it("computes monday week start and validates weekStart params", () => {
    const weekStart = __testables.getWeekStartUtcFromDate(new Date("2026-04-19T09:15:00.000Z"));
    expect(weekStart.toISOString()).toBe("2026-04-13T00:00:00.000Z");

    expect(__testables.parseWeekStartParam("2026-04-13")?.toISOString()).toBe(
      "2026-04-13T00:00:00.000Z",
    );
    expect(__testables.parseWeekStartParam("13-04-2026")).toBeNull();
  });

  it("renders markdown export with key sections", () => {
    const summary = buildWeeklySummaryFromActivities(
      [makeActivity({ id: 41n, name: "Test Long Run" })],
      [],
      new Date("2026-04-13T00:00:00.000Z"),
    );
    const markdown = renderWeeklySummaryMarkdown(summary);

    expect(markdown).toContain("# Wochenzusammenfassung");
    expect(markdown).toContain("## Kennzahlen");
    expect(markdown).toContain("## Highlights");
    expect(markdown).toContain("## Zusammenfassung");
  });
});
