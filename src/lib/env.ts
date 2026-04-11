import { z } from "zod";

const envSchema = z.object({
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(12),
  STRAVA_CLIENT_ID: z.string().min(1),
  STRAVA_CLIENT_SECRET: z.string().min(1),
  STRAVA_REDIRECT_URI: z.string().url(),
  STRAVA_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(8).default(4),
  STRAVA_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(100).max(30_000).default(500),
});

export function getEnv() {
  return envSchema.parse({
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET,
    STRAVA_REDIRECT_URI: process.env.STRAVA_REDIRECT_URI,
    STRAVA_RETRY_MAX_ATTEMPTS: process.env.STRAVA_RETRY_MAX_ATTEMPTS,
    STRAVA_RETRY_BASE_DELAY_MS: process.env.STRAVA_RETRY_BASE_DELAY_MS,
  });
}
