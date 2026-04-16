import { describe, expect, it } from "vitest";

import { dedupeActivitiesAcrossProviders } from "@/lib/activity-dedupe";

describe("dedupeActivitiesAcrossProviders", () => {
  it("merges duplicates from Strava and Wahoo with same core metrics", () => {
    const result = dedupeActivitiesAcrossProviders([
      {
        id: 100n,
        provider: "strava",
        name: "Morning Ride",
        type: "Ride",
        startDate: new Date("2026-04-16T05:04:00.000Z"),
        distanceMeters: 40200,
        movingTimeSeconds: 3620,
      },
      {
        id: 4_000_000_000_000_000_001n,
        provider: "wahoo",
        name: "Morning Ride",
        type: "Ride",
        startDate: new Date("2026-04-16T05:06:00.000Z"),
        distanceMeters: 40190,
        movingTimeSeconds: 3610,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].providers).toEqual(["strava", "wahoo"]);
    expect(result[0].duplicateIds).toHaveLength(2);
  });

  it("treats 2-hour shifted timestamps as duplicates when other metrics match", () => {
    const result = dedupeActivitiesAcrossProviders([
      {
        id: 101n,
        provider: "strava",
        name: "Intervals",
        type: "Ride",
        startDate: new Date("2026-04-16T05:04:00.000Z"),
        distanceMeters: 25000,
        movingTimeSeconds: 3000,
      },
      {
        id: 4_000_000_000_000_000_002n,
        provider: "wahoo",
        name: "Intervals",
        type: "Ride",
        startDate: new Date("2026-04-16T07:04:00.000Z"),
        distanceMeters: 25020,
        movingTimeSeconds: 3010,
      },
    ]);

    expect(result).toHaveLength(1);
  });

  it("does not merge different workouts", () => {
    const result = dedupeActivitiesAcrossProviders([
      {
        id: 102n,
        provider: "strava",
        name: "Lunch Run",
        type: "Run",
        startDate: new Date("2026-04-16T10:00:00.000Z"),
        distanceMeters: 7000,
        movingTimeSeconds: 2100,
      },
      {
        id: 4_000_000_000_000_000_003n,
        provider: "wahoo",
        name: "Evening Run",
        type: "Run",
        startDate: new Date("2026-04-16T16:00:00.000Z"),
        distanceMeters: 7050,
        movingTimeSeconds: 2120,
      },
    ]);

    expect(result).toHaveLength(2);
  });
});
