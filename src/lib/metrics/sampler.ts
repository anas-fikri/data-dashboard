import "server-only";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ingestQueue, withQueueTimeout } from "@/lib/queue/connection";
import { ingestWorkerCount } from "@/lib/queue/versions";
import { redisReady } from "@/lib/redis";
import { KEY, recordHostSample, reportService, saveQueueStatus } from "./store";

/*
 * Sampler metrik (v1.18, ADR-0010) di proses app — bukan worker, karena worker termasuk yang dipantau. Tiap
 * 10 dtk: kunci Redis (satu sampler walau app > 1 proses), baca /metrics node_exporter lewat relay, simpan titik,
 * catat antrean ingest + jumlah worker, dan laporkan pemakaian container app sendiri. Gagal → log debug, dicoba lagi
 * tick berikutnya; tidak pernah menghentikan app.
 */
export const SAMPLE_MS = 10_000;
const LOCK_MS = 15_000;
const FETCH_TIMEOUT_MS = 3_000;

const state = globalThis as unknown as { metricsSampler?: NodeJS.Timeout };
const token = randomBytes(8).toString("hex");

async function holdLock(): Promise<boolean> {
  const r = await redisReady();
  if ((await r.set(KEY.lock, token, "PX", LOCK_MS, "NX")) === "OK") return true;
  if ((await r.get(KEY.lock)) !== token) return false;
  await r.pexpire(KEY.lock, LOCK_MS);
  return true;
}

export async function sampleOnce(now = Date.now()): Promise<void> {
  const url = env().METRICS_NODE_URL;
  if (!url || !(await holdLock())) return;
  const r = await redisReady();
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`metrics HTTP ${res.status}`);
  const mounts = env()
    .METRICS_DISK_MOUNTS.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  await recordHostSample(r, await res.text(), now, mounts);
  const [counts, workers] = await Promise.all([
    withQueueTimeout(
      ingestQueue().getJobCounts("waiting", "prioritized", "active"),
      "jumlah antrean ingest",
    ).catch(() => null),
    ingestWorkerCount(),
  ]);
  if (counts) {
    await saveQueueStatus(r, {
      t: now,
      waiting: (counts.waiting ?? 0) + (counts.prioritized ?? 0),
      active: counts.active ?? 0,
      workers,
    });
  }
}

/** Dipanggil sekali dari instrumentation.register (app). */
export function startMetricsSampler(): void {
  if (state.metricsSampler) return;
  const tick = () => {
    void reportService("app");
    sampleOnce().catch((e: unknown) =>
      logger.debug({ err: e instanceof Error ? e.message : String(e) }, "sampel metrik gagal"),
    );
  };
  state.metricsSampler = setInterval(tick, SAMPLE_MS);
  state.metricsSampler.unref();
  tick();
}
