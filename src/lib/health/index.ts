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

/** Pesan error yang aman ditampilkan: tanpa URL koneksi, tanpa kredensial. */
export function safeMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/gi, "[url]")
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
        return {
          name: c.name,
          status: "fail",
          detail: safeMessage(e),
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

function round(n: number): number {
  return Math.round(n);
}
