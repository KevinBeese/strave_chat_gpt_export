import { captureException, captureMessage } from "@/lib/monitoring";

type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function safeErrorPayload(error: Error) {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function write(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ?? {}),
  };

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

export const logger = {
  info(message: string, context?: LogContext) {
    write("info", message, context);
  },

  warn(message: string, context?: LogContext) {
    write("warn", message, context);
    captureMessage(message, context);
  },

  error(message: string, error: unknown, context?: LogContext) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    write("error", message, {
      ...(context ?? {}),
      error: safeErrorPayload(normalizedError),
    });
    captureException(normalizedError, context);
  },
};
