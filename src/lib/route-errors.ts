import { NextResponse } from "next/server";

import { StravaApiError } from "@/lib/strava";

export class AppError extends Error {
  code: string;
  status: number;
  exposeMessage: boolean;
  retryAfterSeconds: number | null;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: string;
      status: number;
      exposeMessage?: boolean;
      retryAfterSeconds?: number | null;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, {
      cause: options.cause,
    });
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status;
    this.exposeMessage = options.exposeMessage ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.details = options.details;
  }
}

function isSchemaMissingError(message: string) {
  return /P2021|table .* does not exist/i.test(message);
}

export function toAppError(error: unknown, fallbackMessage: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof StravaApiError) {
    const retryAfterSeconds = error.retryAfterSeconds ?? 60;

    return new AppError(error.message, {
      code: error.isRateLimit ? "strava_rate_limit" : "strava_api_error",
      status: error.status === 429 ? 429 : 502,
      exposeMessage: true,
      retryAfterSeconds,
      details: {
        rateLimit: error.rateLimit,
      },
      cause: error,
    });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;

  if (isSchemaMissingError(message)) {
    return new AppError("Database schema is missing required tables.", {
      code: "db_schema_missing",
      status: 500,
      exposeMessage: false,
      cause: error,
    });
  }

  return new AppError(fallbackMessage, {
    code: "internal_error",
    status: 500,
    exposeMessage: false,
    cause: error,
  });
}

export function toApiErrorResponse(error: unknown, fallbackMessage: string) {
  const appError = toAppError(error, fallbackMessage);

  const payload: Record<string, unknown> = {
    error: appError.exposeMessage ? appError.message : fallbackMessage,
    code: appError.code,
  };

  if (appError.retryAfterSeconds !== null) {
    payload.retryAfterSeconds = appError.retryAfterSeconds;
  }

  if (appError.details) {
    Object.assign(payload, appError.details);
  }

  const headers: HeadersInit = {};
  if (appError.retryAfterSeconds !== null) {
    headers["Retry-After"] = String(appError.retryAfterSeconds);
  }

  return NextResponse.json(payload, {
    status: appError.status,
    headers,
  });
}
