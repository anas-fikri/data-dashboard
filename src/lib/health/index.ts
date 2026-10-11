import { logger } from "@/lib/logger";

export type HealthStatus = "ok" | "fail";

export interface HealthItem {
  name: string;
  status: HealthStatus;
  /** Pesan singkat yang bisa ditindak; tidak pernah memuat secret. */
  detail: string;
  latencyMs: number;
}

export interface HealthReport {
  status: HealthStatus;
  checkedAt: string;
  items: HealthItem[];
}

export type HealthCheck = { name: string; run: () => Promise<string> };

const DEFAULT_TIMEOUT_MS = 3000;
/** Laporan di-cache singkat agar polling/monitoring tidak menjadi amplifikasi ke layanan backend. */
const CACHE_TTL_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number, name: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${name}: timeout ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * Pesan error yang aman ditampilkan: tanpa URL koneksi, host:port, kredensial,
 * atau nama pengguna yang biasa disisipkan driver (Prisma/ioredis).
 */
export function safeMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"`]+/gi, "[url]")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, "[host]")
    .replace(/\[?(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\]?:\d{2,5}\b/gi, "[host]")
    .replace(/\b(ENOTFOUND|EAI_AGAIN)\s+\S+/g, "$1 [host]")
    .replace(/\buser=\S+/gi, "user=[redacted]")
    .replace(/\b(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)+):\d{2,5}\b/gi, "[host]")
    .replace(/`[^`]*`/g, "[redacted]")
    .split("\n")[0]!
    .slice(0, 160);
}

/** Menjalankan semua pemeriksaan secara paralel; satu gagal tidak menghentikan yang lain. */
export async function runHealthChecks(
  checks: HealthCheck[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HealthReport> {
  const items = await Promise.all(
    checks.map(async (c): Promise<HealthItem> => {
      const started = performance.now();
      try {
        const detail = await withTimeout(c.run(), timeoutMs, c.name);
        return {
          name: c.name,
          status: "ok",
          detail,
          latencyMs: round(performance.now() - started),
        };
      } catch (e) {
        const detail = safeMessage(e);
        logger.warn({ check: c.name, detail }, "health check gagal");
        return {
          name: c.name,
          status: "fail",
          detail,
          latencyMs: round(performance.now() - started),
        };
      }
    }),
  );
  return {
    status: items.every((i) => i.status === "ok") ? "ok" : "fail",
    checkedAt: new Date().toISOString(),
    items,
  };
}

let cachedReport: { at: number; report: HealthReport } | undefined;
let inflight: Promise<HealthReport> | undefined;

/** Laporan dengan cache 5 detik dan de-duplikasi permintaan bersamaan. */
export async function cachedHealthReport(
  checks: HealthCheck[],
  now = Date.now(),
): Promise<HealthReport> {
  if (cachedReport && now - cachedReport.at < CACHE_TTL_MS) return cachedReport.report;
  if (!inflight) {
    inflight = runHealthChecks(checks)
      .then((report) => {
        cachedReport = { at: Date.now(), report };
        return report;
      })
      .finally(() => {
        inflight = undefined;
      });
  }
  return inflight;
}

/** Tampilan publik: hanya status keseluruhan, tanpa nama layanan internal (T-027). */
export interface PublicHealth {
  status: HealthStatus;
  checkedAt: string;
}

/** Admin melihat laporan lengkap; selain itu hanya status (tanpa nama/latensi layanan). */
export function publicView(report: HealthReport, isAdmin: boolean): HealthReport | PublicHealth {
  if (isAdmin) return report;
  return { status: report.status, checkedAt: report.checkedAt };
}

export function isDetailed(view: HealthReport | PublicHealth): view is HealthReport {
  return "items" in view;
}

function round(n: number): number {
  return Math.round(n);
}
