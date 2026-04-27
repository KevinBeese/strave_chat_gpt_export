import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_SAMPLE_USER_ID = "11111111-1111-4111-8111-111111111111";
const SAMPLE_ATHLETE_ID = "sample-athlete-001";

function isoDaysAgo(daysAgo, hour, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildZones(movingTimeSeconds, hasPower = false) {
  const z1 = Math.round(movingTimeSeconds * 0.18);
  const z2 = Math.round(movingTimeSeconds * 0.26);
  const z3 = Math.round(movingTimeSeconds * 0.23);
  const z4 = Math.round(movingTimeSeconds * 0.18);
  const z5 = movingTimeSeconds - z1 - z2 - z3 - z4;

  const heartrate = {
    type: "heartrate",
    sensorBased: true,
    points: 0,
    distributionBuckets: [
      { min: 95, max: 120, time: z1 },
      { min: 121, max: 142, time: z2 },
      { min: 143, max: 157, time: z3 },
      { min: 158, max: 173, time: z4 },
      { min: 174, max: -1, time: z5 },
    ],
  };

  if (!hasPower) {
    return [heartrate];
  }

  const p1 = Math.round(movingTimeSeconds * 0.2);
  const p2 = Math.round(movingTimeSeconds * 0.28);
  const p3 = Math.round(movingTimeSeconds * 0.24);
  const p4 = Math.round(movingTimeSeconds * 0.18);
  const p5 = movingTimeSeconds - p1 - p2 - p3 - p4;

  const power = {
    type: "power",
    sensorBased: true,
    points: 0,
    distributionBuckets: [
      { min: 0, max: 120, time: p1 },
      { min: 121, max: 180, time: p2 },
      { min: 181, max: 230, time: p3 },
      { min: 231, max: 290, time: p4 },
      { min: 291, max: -1, time: p5 },
    ],
  };

  return [heartrate, power];
}

function createActivity(baseId, index, template, targetUserId) {
  const id = baseId + BigInt(index + 1);
  const averageSpeed = round(template.distanceMeters / template.movingTimeSeconds, 3);
  const maxSpeed = round(averageSpeed * template.maxSpeedFactor, 3);
  const zones = buildZones(template.movingTimeSeconds, template.deviceWatts === true);
  const providerMetrics = {
    tss: template.tss,
    intensityFactor: template.intensityFactor,
    normalizedPowerWatts: template.normalizedPowerWatts,
    variabilityIndex: template.variabilityIndex,
    estimatedLoad: template.estimatedLoad,
    estimatedIntensityPercent: template.estimatedIntensityPercent,
    source: "sample-seed",
  };

  return {
    id,
    userId: targetUserId,
    provider: "strava",
    providerActivityId: `sample-${index + 1}`,
    athleteId: SAMPLE_ATHLETE_ID,
    name: template.name,
    type: template.type,
    distance: template.distanceMeters,
    movingTime: template.movingTimeSeconds,
    elapsedTime: template.elapsedTimeSeconds,
    timezone: "Europe/Berlin",
    rawJson: {
      id: Number(id),
      sport_type: template.type,
      trainer: template.trainer,
      commute: false,
      manual: false,
      private: false,
      average_cadence: template.averageCadence,
      max_cadence: template.maxCadence,
      average_temp: template.averageTemp,
      min_temp: template.minTemp,
      max_temp: template.maxTemp,
      calories: template.calories,
      relative_effort: template.relativeEffort,
      suffer_score: template.sufferScore,
      kudos_count: template.kudosCount,
      comment_count: template.commentCount,
      achievement_count: template.achievementCount,
      perceived_exertion: template.rpe,
      notes: template.description,
    },
    classification: template.classification,
    analysisLabel: template.analysisLabel,
    startDate: template.startDate,
    hasDistanceData: template.hasDistanceData,
    distanceMeters: template.distanceMeters,
    movingTimeSeconds: template.movingTimeSeconds,
    elapsedTimeSeconds: template.elapsedTimeSeconds,
    elevationGainMeters: template.elevationGainMeters,
    averageSpeed,
    maxSpeed,
    averageHeartrate: template.averageHeartrate,
    maxHeartrate: template.maxHeartrate,
    averageWatts: template.averageWatts,
    weightedAverageWatts: template.weightedAverageWatts,
    maxWatts: template.maxWatts,
    kilojoules: template.kilojoules,
    deviceWatts: template.deviceWatts,
    calories: template.calories,
    description: template.description,
    zonesJson: JSON.stringify(zones),
    providerMetricsJson: JSON.stringify(providerMetrics),
  };
}

const templates = [
  {
    type: "Run",
    classification: "Running",
    analysisLabel: "Laufeinheit",
    name: "Morgendlicher Dauerlauf im Park",
    startDate: isoDaysAgo(2, 6, 30),
    hasDistanceData: true,
    distanceMeters: 10200,
    movingTimeSeconds: 3160,
    elapsedTimeSeconds: 3360,
    elevationGainMeters: 86,
    averageHeartrate: 151,
    maxHeartrate: 176,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    kilojoules: 640,
    deviceWatts: false,
    calories: 712,
    tss: 64,
    intensityFactor: 0.78,
    normalizedPowerWatts: null,
    variabilityIndex: null,
    estimatedLoad: 63.8,
    estimatedIntensityPercent: 77.5,
    trainer: false,
    averageCadence: 86,
    maxCadence: 96,
    averageTemp: 11,
    minTemp: 8,
    maxTemp: 14,
    relativeEffort: 71,
    sufferScore: 72,
    kudosCount: 9,
    commentCount: 1,
    achievementCount: 2,
    rpe: 6,
    maxSpeedFactor: 1.53,
    description:
      "Lockerer Grundlagenlauf mit 3 kurzen Steigerungen am Ende. Fokus auf gleichmaessige Atmung.",
  },
  {
    type: "Run",
    classification: "Running",
    analysisLabel: "Laufeinheit",
    name: "Intervalltraining 6x800m",
    startDate: isoDaysAgo(8, 18, 20),
    hasDistanceData: true,
    distanceMeters: 11900,
    movingTimeSeconds: 3440,
    elapsedTimeSeconds: 3920,
    elevationGainMeters: 54,
    averageHeartrate: 166,
    maxHeartrate: 188,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    kilojoules: 755,
    deviceWatts: false,
    calories: 840,
    tss: 86,
    intensityFactor: 0.9,
    normalizedPowerWatts: null,
    variabilityIndex: null,
    estimatedLoad: 87.4,
    estimatedIntensityPercent: 89.7,
    trainer: false,
    averageCadence: 90,
    maxCadence: 103,
    averageTemp: 14,
    minTemp: 12,
    maxTemp: 17,
    relativeEffort: 95,
    sufferScore: 99,
    kudosCount: 14,
    commentCount: 3,
    achievementCount: 5,
    rpe: 8,
    maxSpeedFactor: 1.84,
    description:
      "6x800m @ 5k Pace mit 2 Minuten Trabpause. Gute Belastungsverteilung, letzte Wiederholung kontrolliert.",
  },
  {
    type: "Ride",
    classification: "Cycling",
    analysisLabel: "Radeinheit",
    name: "Grundlagenfahrt flach mit Kadenz-Fokus",
    startDate: isoDaysAgo(1, 7, 45),
    hasDistanceData: true,
    distanceMeters: 48500,
    movingTimeSeconds: 6020,
    elapsedTimeSeconds: 6500,
    elevationGainMeters: 320,
    averageHeartrate: 145,
    maxHeartrate: 170,
    averageWatts: 184,
    weightedAverageWatts: 196,
    maxWatts: 622,
    kilojoules: 1240,
    deviceWatts: true,
    calories: 1320,
    tss: 88,
    intensityFactor: 0.76,
    normalizedPowerWatts: 196,
    variabilityIndex: 1.07,
    estimatedLoad: 88.3,
    estimatedIntensityPercent: 75.9,
    trainer: false,
    averageCadence: 89,
    maxCadence: 118,
    averageTemp: 13,
    minTemp: 10,
    maxTemp: 16,
    relativeEffort: 79,
    sufferScore: 82,
    kudosCount: 11,
    commentCount: 1,
    achievementCount: 1,
    rpe: 6,
    maxSpeedFactor: 1.71,
    description:
      "Saubere Zone-2-Ausfahrt, hohe Trittfrequenz in den letzten 40 Minuten. Wetter ruhig, gute Aeroposition.",
  },
  {
    type: "Ride",
    classification: "Cycling",
    analysisLabel: "Radeinheit",
    name: "VO2max Blocks am Berg",
    startDate: isoDaysAgo(10, 16, 10),
    hasDistanceData: true,
    distanceMeters: 61200,
    movingTimeSeconds: 7420,
    elapsedTimeSeconds: 8160,
    elevationGainMeters: 910,
    averageHeartrate: 159,
    maxHeartrate: 184,
    averageWatts: 228,
    weightedAverageWatts: 254,
    maxWatts: 890,
    kilojoules: 1690,
    deviceWatts: true,
    calories: 1780,
    tss: 126,
    intensityFactor: 0.88,
    normalizedPowerWatts: 254,
    variabilityIndex: 1.11,
    estimatedLoad: 126.2,
    estimatedIntensityPercent: 87.6,
    trainer: false,
    averageCadence: 85,
    maxCadence: 124,
    averageTemp: 15,
    minTemp: 11,
    maxTemp: 19,
    relativeEffort: 112,
    sufferScore: 117,
    kudosCount: 24,
    commentCount: 4,
    achievementCount: 6,
    rpe: 9,
    maxSpeedFactor: 2.06,
    description:
      "4x6 min VO2max bergauf mit 6 min locker dazwischen. NP deutlich ueber FTP, aber gute Erholung in den Pausen.",
  },
  {
    type: "Swim",
    classification: "Swimming",
    analysisLabel: "Schwimmeinheit",
    name: "Technik + Ausdauer im 25m-Becken",
    startDate: isoDaysAgo(3, 12, 0),
    hasDistanceData: true,
    distanceMeters: 2400,
    movingTimeSeconds: 3180,
    elapsedTimeSeconds: 3600,
    elevationGainMeters: 0,
    averageHeartrate: 136,
    maxHeartrate: 158,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    kilojoules: 410,
    deviceWatts: null,
    calories: 520,
    tss: 44,
    intensityFactor: 0.67,
    normalizedPowerWatts: null,
    variabilityIndex: null,
    estimatedLoad: 43.5,
    estimatedIntensityPercent: 66.8,
    trainer: true,
    averageCadence: null,
    maxCadence: null,
    averageTemp: 27,
    minTemp: 26,
    maxTemp: 28,
    relativeEffort: 53,
    sufferScore: 51,
    kudosCount: 6,
    commentCount: 0,
    achievementCount: 0,
    rpe: 5,
    maxSpeedFactor: 1.34,
    description:
      "400m einschwimmen, 8x100m Technik mit Pull-Buoy, danach 6x200m locker-progressiv.",
  },
  {
    type: "Swim",
    classification: "Swimming",
    analysisLabel: "Schwimmeinheit",
    name: "Schwellen-Set 12x100m",
    startDate: isoDaysAgo(11, 6, 50),
    hasDistanceData: true,
    distanceMeters: 3100,
    movingTimeSeconds: 4020,
    elapsedTimeSeconds: 4500,
    elevationGainMeters: 0,
    averageHeartrate: 149,
    maxHeartrate: 169,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    kilojoules: 560,
    deviceWatts: null,
    calories: 670,
    tss: 61,
    intensityFactor: 0.79,
    normalizedPowerWatts: null,
    variabilityIndex: null,
    estimatedLoad: 60.9,
    estimatedIntensityPercent: 78.6,
    trainer: true,
    averageCadence: null,
    maxCadence: null,
    averageTemp: 27,
    minTemp: 26,
    maxTemp: 28,
    relativeEffort: 69,
    sufferScore: 70,
    kudosCount: 8,
    commentCount: 1,
    achievementCount: 1,
    rpe: 7,
    maxSpeedFactor: 1.42,
    description:
      "Hauptset 12x100m an der Schwelle mit 20s Pause, Fokus auf Zuglaenge und stabile Wasserlage.",
  },
  {
    type: "Workout",
    classification: "Functional Training",
    analysisLabel: "Kraft- oder Functional-Session",
    name: "Functional Circuit Full Body",
    startDate: isoDaysAgo(4, 18, 30),
    hasDistanceData: false,
    distanceMeters: 0,
    movingTimeSeconds: 3120,
    elapsedTimeSeconds: 3480,
    elevationGainMeters: 0,
    averageHeartrate: 142,
    maxHeartrate: 176,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    kilojoules: 430,
    deviceWatts: null,
    calories: 485,
    tss: 46,
    intensityFactor: 0.72,
    normalizedPowerWatts: null,
    variabilityIndex: null,
    estimatedLoad: 45.7,
    estimatedIntensityPercent: 71.9,
    trainer: true,
    averageCadence: null,
    maxCadence: null,
    averageTemp: 21,
    minTemp: 20,
    maxTemp: 23,
    relativeEffort: 58,
    sufferScore: 56,
    kudosCount: 4,
    commentCount: 0,
    achievementCount: 0,
    rpe: 7,
    maxSpeedFactor: 1.1,
    description:
      "5 Runden aus Kettlebell Swing, Burpees, Row-Erg, Split Squats und Plank. Keine Distanzmetrik, aber hohe neuromuskulaere Last.",
  },
  {
    type: "Workout",
    classification: "Functional Training",
    analysisLabel: "Kraft- oder Functional-Session",
    name: "HIIT Session 40/20",
    startDate: isoDaysAgo(9, 19, 15),
    hasDistanceData: false,
    distanceMeters: 0,
    movingTimeSeconds: 2700,
    elapsedTimeSeconds: 3060,
    elevationGainMeters: 0,
    averageHeartrate: 154,
    maxHeartrate: 186,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    kilojoules: 455,
    deviceWatts: null,
    calories: 512,
    tss: 55,
    intensityFactor: 0.81,
    normalizedPowerWatts: null,
    variabilityIndex: null,
    estimatedLoad: 54.8,
    estimatedIntensityPercent: 81.1,
    trainer: true,
    averageCadence: null,
    maxCadence: null,
    averageTemp: 22,
    minTemp: 21,
    maxTemp: 24,
    relativeEffort: 73,
    sufferScore: 75,
    kudosCount: 7,
    commentCount: 1,
    achievementCount: 0,
    rpe: 8,
    maxSpeedFactor: 1.15,
    description:
      "Intervallzirkel 40s Arbeit / 20s Pause mit Fokus auf Anaerobik und Core-Stabilitaet.",
  },
  {
    type: "WeightTraining",
    classification: "Strength Training",
    analysisLabel: "Krafttraining",
    name: "Unterkoerper Kraftblock (Squat/Deadlift)",
    startDate: isoDaysAgo(5, 17, 40),
    hasDistanceData: false,
    distanceMeters: 0,
    movingTimeSeconds: 4020,
    elapsedTimeSeconds: 4560,
    elevationGainMeters: 0,
    averageHeartrate: 128,
    maxHeartrate: 158,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    kilojoules: 390,
    deviceWatts: null,
    calories: 445,
    tss: 39,
    intensityFactor: 0.62,
    normalizedPowerWatts: null,
    variabilityIndex: null,
    estimatedLoad: 38.6,
    estimatedIntensityPercent: 61.8,
    trainer: true,
    averageCadence: null,
    maxCadence: null,
    averageTemp: 22,
    minTemp: 20,
    maxTemp: 24,
    relativeEffort: 47,
    sufferScore: 44,
    kudosCount: 3,
    commentCount: 0,
    achievementCount: 0,
    rpe: 7,
    maxSpeedFactor: 1.05,
    description:
      "Schweres Krafttraining: Back Squat 5x5, Deadlift 5x3, Accessory fuer posterior chain.",
  },
  {
    type: "WeightTraining",
    classification: "Strength Training",
    analysisLabel: "Krafttraining",
    name: "Oberkoerper Push/Pull Progression",
    startDate: isoDaysAgo(12, 18, 5),
    hasDistanceData: false,
    distanceMeters: 0,
    movingTimeSeconds: 3540,
    elapsedTimeSeconds: 4020,
    elevationGainMeters: 0,
    averageHeartrate: 121,
    maxHeartrate: 149,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    kilojoules: 340,
    deviceWatts: null,
    calories: 398,
    tss: 34,
    intensityFactor: 0.58,
    normalizedPowerWatts: null,
    variabilityIndex: null,
    estimatedLoad: 33.9,
    estimatedIntensityPercent: 57.6,
    trainer: true,
    averageCadence: null,
    maxCadence: null,
    averageTemp: 22,
    minTemp: 20,
    maxTemp: 24,
    relativeEffort: 39,
    sufferScore: 38,
    kudosCount: 2,
    commentCount: 0,
    achievementCount: 0,
    rpe: 6,
    maxSpeedFactor: 1.04,
    description:
      "Bankdruecken, Klimmzuege, Rudern und Schulterdruecken mit Progressionsschema und sauberer Technik.",
  },
  {
    type: "Walk",
    classification: "Walking",
    analysisLabel: "Walking/Hiking",
    name: "Aktive Erholung - 8km Spaziergang",
    startDate: isoDaysAgo(6, 8, 15),
    hasDistanceData: true,
    distanceMeters: 8100,
    movingTimeSeconds: 4720,
    elapsedTimeSeconds: 5010,
    elevationGainMeters: 92,
    averageHeartrate: 108,
    maxHeartrate: 131,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    kilojoules: 250,
    deviceWatts: null,
    calories: 312,
    tss: 20,
    intensityFactor: 0.41,
    normalizedPowerWatts: null,
    variabilityIndex: null,
    estimatedLoad: 19.7,
    estimatedIntensityPercent: 41.2,
    trainer: false,
    averageCadence: 78,
    maxCadence: 98,
    averageTemp: 12,
    minTemp: 10,
    maxTemp: 14,
    relativeEffort: 18,
    sufferScore: 16,
    kudosCount: 1,
    commentCount: 0,
    achievementCount: 0,
    rpe: 3,
    maxSpeedFactor: 1.32,
    description:
      "Locker gehen zur Regeneration nach intensivem Tag. Fokus: niedrige Intensitaet, viel Bewegung.",
  },
  {
    type: "Walk",
    classification: "Walking",
    analysisLabel: "Walking/Hiking",
    name: "Hiking Runde mit moderaten Anstiegen",
    startDate: isoDaysAgo(13, 9, 10),
    hasDistanceData: true,
    distanceMeters: 12300,
    movingTimeSeconds: 7420,
    elapsedTimeSeconds: 8110,
    elevationGainMeters: 420,
    averageHeartrate: 124,
    maxHeartrate: 152,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    kilojoules: 420,
    deviceWatts: null,
    calories: 560,
    tss: 33,
    intensityFactor: 0.53,
    normalizedPowerWatts: null,
    variabilityIndex: null,
    estimatedLoad: 33.2,
    estimatedIntensityPercent: 52.9,
    trainer: false,
    averageCadence: 80,
    maxCadence: 103,
    averageTemp: 9,
    minTemp: 6,
    maxTemp: 12,
    relativeEffort: 34,
    sufferScore: 31,
    kudosCount: 5,
    commentCount: 0,
    achievementCount: 1,
    rpe: 5,
    maxSpeedFactor: 1.44,
    description:
      "Laengere Hiking-Einheit mit gleichmaessigem Tempo und hohem Zeitanteil in niedriger Intensitaet.",
  },
];

function parseUserIdArg(argv) {
  const userIdArg = argv.find((arg) => arg.startsWith("--user-id="));
  if (userIdArg) {
    return userIdArg.slice("--user-id=".length);
  }

  const userIdIndex = argv.indexOf("--user-id");
  if (userIdIndex >= 0 && argv[userIdIndex + 1]) {
    return argv[userIdIndex + 1];
  }

  return null;
}

async function main() {
  const cliUserId = parseUserIdArg(process.argv.slice(2));
  const targetUserId = cliUserId ?? process.env.SEED_USER_ID ?? DEFAULT_SAMPLE_USER_ID;
  const baseId = BigInt(Date.now()) * 1000n;
  const activities = templates.map((template, index) =>
    createActivity(baseId, index, template, targetUserId),
  );

  const existingProfile = await prisma.profile.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
    },
  });

  if (!existingProfile) {
    await prisma.profile.create({
      data: {
        id: targetUserId,
        email:
          targetUserId === DEFAULT_SAMPLE_USER_ID
            ? "sample.dev@strava-export.local"
            : `seed.${targetUserId.slice(0, 8)}@strava-export.local`,
        displayName: "Sample Dev Athlete",
        role: "USER",
      },
    });
  }

  await prisma.activity.deleteMany({
    where: {
      userId: targetUserId,
      provider: "strava",
      providerActivityId: {
        startsWith: "sample-",
      },
    },
  });

  await prisma.activity.createMany({
    data: activities,
  });

  const grouped = await prisma.activity.groupBy({
    by: ["type"],
    where: {
      userId: targetUserId,
      provider: "strava",
      providerActivityId: {
        startsWith: "sample-",
      },
    },
    _count: {
      _all: true,
    },
    orderBy: {
      type: "asc",
    },
  });

  console.log("Seed completed.");
  console.log(`User: ${targetUserId}`);
  console.log(`Inserted: ${activities.length} activities`);
  for (const entry of grouped) {
    console.log(`- ${entry.type}: ${entry._count._all}`);
  }
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
