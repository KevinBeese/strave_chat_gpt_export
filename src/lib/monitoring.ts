import * as Sentry from "@sentry/nextjs";

let sentryInitialized = false;

function toFiniteInRange(value: string | undefined, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.min(max, Math.max(min, parsed));
}

function ensureSentryInitialized() {
  if (sentryInitialized) {
    return;
  }

  sentryInitialized = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: toFiniteInRange(process.env.SENTRY_TRACES_SAMPLE_RATE, 0, 1) ?? 0,
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  ensureSentryInitialized();

  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

export function captureMessage(message: string, context?: Record<string, unknown>) {
  ensureSentryInitialized();

  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.captureMessage(message, {
    level: "warning",
    extra: context,
  });
}
