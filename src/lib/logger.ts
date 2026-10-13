import pino from "pino";

/**
 * Kunci yang selalu diredaksi. Nilai filter (T-012): filters/dashboardFilters (body query widget),
 * values/value (isi filter), q (kata cari slicer), cross (cross-filter di status URL).
 */
export const SENSITIVE_KEYS = [
  "password",
  "passwordHash",
  "token",
  "secret",
  "filters",
  "dashboardFilters",
  "values",
  "value",
  "q",
  "cross",
  "cookie",
];

/** Jalur redaksi sampai kedalaman 4 (pino hanya mencocokkan wildcard satu level). */
export function redactPaths(): string[] {
  const paths: string[] = ["req.headers.authorization", "req.headers.cookie"];
  for (const key of SENSITIVE_KEYS) {
    paths.push(key, `*.${key}`, `*.*.${key}`, `*.*.*.${key}`, `req.body.${key}`);
  }
  return paths;
}

const LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];

/** Level dari env bila valid; selain itu default aman (zod di env.ts memberi pesan yang jelas). */
function resolveLevel(raw: string | undefined): string {
  if (raw && LEVELS.includes(raw)) return raw;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Logger terstruktur. Field sensitif diredaksi sejak awal agar body permintaan,
 * token, dan nilai filter tidak pernah masuk log (T-027).
 */
export const logger = pino({
  level: resolveLevel(process.env.LOG_LEVEL),
  redact: { paths: redactPaths(), censor: "[redacted]" },
  base: { service: "data-dashboard" },
});

export type Logger = typeof logger;
