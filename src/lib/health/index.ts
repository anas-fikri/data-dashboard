import { logger } from "@/lib/logger";
import { versionInfo, type VersionInfo } from "@/lib/version";

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

const cached = new Map<string, { at: number; report: HealthReport }>();
const inflight = new Map<string, Promise<HealthReport>>();

/** Laporan dengan cache 5 detik per kelompok pemeriksaan (key) dan de-duplikasi permintaan bersamaan. */
export async function cachedHealthReport(
  checks: HealthCheck[],
  now = Date.now(),
  key = "infra",
): Promise<HealthReport> {
  const hit = cached.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.report;
  let running = inflight.get(key);
  if (!running) {
    running = runHealthChecks(checks)
      .then((report) => {
        cached.set(key, { at: Date.now(), report });
        return report;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, running);
  }
  return running;
}

/** Tampilan publik: hanya status keseluruhan, tanpa nama layanan internal (T-027). */
export interface PublicHealth {
  status: HealthStatus;
  checkedAt: string;
}

/** Detail admin: laporan lengkap + versi aplikasi dan commit pendek (T-066). */
export type AdminHealth = HealthReport & VersionInfo;

/**
 * Admin melihat laporan lengkap beserta versi; selain itu hanya status (tanpa nama/latensi layanan dan
 * tanpa versi/commit: sidik jari rilis tidak dibuka ke publik, rencana G-7 R11).
 */
export function publicView(
  report: HealthReport,
  isAdmin: boolean,
  version: VersionInfo = versionInfo(),
): AdminHealth | PublicHealth {
  if (isAdmin) return { ...report, version: version.version, commit: version.commit };
  return { status: report.status, checkedAt: report.checkedAt };
}

export function isDetailed(view: AdminHealth | PublicHealth): view is AdminHealth {
  return "items" in view;
}

function round(n: number): number {
  return Math.round(n);
}
