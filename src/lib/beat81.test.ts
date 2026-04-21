import { describe, expect, it } from "vitest";

import { parseBeat81Report } from "@/lib/beat81";

describe("parseBeat81Report", () => {
  it("extracts key fields from a shared Beat81 summary", () => {
    const parsed = parseBeat81Report({
      rawText: `
Strength Endurance (Strength Double Set) mit Mike
Freitag, 17. April, 07:15
121 Punkte gesamt = 76 Sweat + 45 Recovery
536 Kalorien gesamt = 429 Workout + 107 Nachbrenneffekt
2 min x 4 = 8
9 min x 3 = 27
12 min x 2 = 24
17 min x 1 = 17
100% = 186 Personal Max Heart Rate 178 Achieved Heart Rate
`,
      athleteHeightCm: 180,
      athleteWeightKg: 81,
    });

    expect(parsed.name).toContain("Strength Endurance");
    expect(parsed.durationMinutes).toBe(40);
    expect(parsed.caloriesTotal).toBe(536);
    expect(parsed.caloriesWorkout).toBe(429);
    expect(parsed.caloriesAfterburn).toBe(107);
    expect(parsed.beatPointsTotal).toBe(121);
    expect(parsed.sweatPoints).toBe(76);
    expect(parsed.recoveryPoints).toBe(45);
    expect(parsed.personalMaxHeartRate).toBe(186);
    expect(parsed.achievedHeartRate).toBe(178);
    expect(parsed.athleteHeightCm).toBe(180);
    expect(parsed.athleteWeightKg).toBe(81);
    expect(parsed.providerActivityId.startsWith("beat81:")).toBe(true);
  });
});
