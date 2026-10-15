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

/** Path token render PDF (T-018) di teks apa pun: /render/<token> → /render/[redacted]. */
const RENDER_PATH = /\/render\/[^/?#\s"'`<>]+/g;
const SCRUB_DEPTH = 3;

/**
 * Redaksi path token render di NILAI string (url, path, pesan galat), sampai kedalaman 3 — redaksi
 * pino berbasis kunci tidak menangkapnya (T-018 D15). Objek/array baru hanya dibuat bila ada yang
 * berubah; nilai selain string/objek polos/array dibiarkan.
 */
export function scrubRenderPaths(value: unknown, depth = SCRUB_DEPTH): unknown {
  if (typeof value === "string") {
    return value.includes("/render/") ? value.replace(RENDER_PATH, "/render/[redacted]") : value;
  }
  if (depth <= 0 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const s = scrubRenderPaths(v, depth - 1);
      if (s !== v) changed = true;
      return s;
    });
    return changed ? out : value;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return value;
  let out: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(value)) {
    const s = scrubRenderPaths(v, depth - 1);
    if (s !== v) (out ??= { ...(value as Record<string, unknown>) })[k] = s;
  }
  return out ?? value;
}

const LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];

/** Level dari env bila valid; selain itu default aman (zod di env.ts memberi pesan yang jelas). */
function resolveLevel(raw: string | undefined): string {
  if (raw && LEVELS.includes(raw)) return raw;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Opsi pino bersama (logger + uji): redaksi kunci sensitif, dan path token render di nilai string
 * objek log (formatters.log) maupun di pesan (hooks.logMethod).
 */
export function loggerOptions(level?: string): pino.LoggerOptions {
  return {
    level: resolveLevel(level),
    redact: { paths: redactPaths(), censor: "[redacted]" },
    base: { service: "data-dashboard" },
    formatters: {
      log: (obj) => scrubRenderPaths(obj) as Record<string, unknown>,
    },
    hooks: {
      logMethod(args, method) {
        method.apply(
          this,
          args.map((a) => (typeof a === "string" ? scrubRenderPaths(a) : a)) as typeof args,
        );
      },
    },
  };
}

/**
 * Logger terstruktur. Field sensitif diredaksi sejak awal agar body permintaan,
 * token, dan nilai filter tidak pernah masuk log (T-027).
 */
export const logger = pino(loggerOptions(process.env.LOG_LEVEL));

export type Logger = typeof logger;
