import pino from "pino";

/**
 * Logger terstruktur. Field sensitif diredaksi sejak awal agar
 * body permintaan, token, dan nilai filter tidak pernah masuk log (T-027).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.secret",
      "*.filters",
    ],
    censor: "[redacted]",
  },
  base: { service: "data-dashboard" },
});

export type Logger = typeof logger;
