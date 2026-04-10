import { z } from "zod";

const envSchema = z.object({
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(12),
  STRAVA_CLIENT_ID: z.string().min(1),
  STRAVA_CLIENT_SECRET: z.string().min(1),
  STRAVA_REDIRECT_URI: z.string().url(),
});

export function getEnv() {
  return envSchema.parse({
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET,
    STRAVA_REDIRECT_URI: process.env.STRAVA_REDIRECT_URI,
  });
}
