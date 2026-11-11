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
 * 10 dtk: kunci Redis (satu sampler walau app > 1 proses), catat antrean ingest + jumlah worker, baca /metrics
 * node_exporter lewat relay, simpan titik, dan laporkan pemakaian container app sendiri. Gagal → log warn sekali
 * (info saat pulih), dicoba lagi tick berikutnya; tidak pernah menghentikan app.
 */
export const SAMPLE_MS = 10_000;
const LOCK_MS = 15_000;
const FETCH_TIMEOUT_MS = 3_000;

const state = globalThis as unknown as {
  metricsSampler?: NodeJS.Timeout;
  /** Tick sebelumnya masih berjalan (fetch lambat) → tick ini dilewati, bukan sampel ganda. */
  metricsBusy?: boolean;
  /** Galat terakhir selama masih gagal; null = sehat. Log warn sekali per episode, info saat pulih. */
  metricsFailing?: string | null;
};
const token = randomBytes(8).toString("hex");

/** Perpanjang kunci hanya bila masih milik proses ini (atomik). */
const REFRESH_LOCK =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end';

async function holdLock(): Promise<boolean> {
  const r = await redisReady();
  if ((await r.set(KEY.lock, token, "PX", LOCK_MS, "NX")) === "OK") return true;
  return (await r.eval(REFRESH_LOCK, 1, KEY.lock, token, String(LOCK_MS))) === 1;
}

export async function sampleOnce(): Promise<void> {
  const url = env().METRICS_NODE_URL;
  if (!url || !(await holdLock())) return;
  const r = await redisReady();
  // Antrean + worker lebih dulu dan terpisah dari exporter: status pemroses (insiden worker mati) tetap
  // terbaca walau relay/exporter sedang bermasalah.
  const [counts, workers] = await Promise.all([
    withQueueTimeout(
      ingestQueue().getJobCounts("waiting", "prioritized", "active"),
      "jumlah antrean ingest",
    ).catch(() => null),
    ingestWorkerCount(),
  ]);
  if (counts) {
    await saveQueueStatus(r, {
      t: Date.now(),
      waiting: (counts.waiting ?? 0) + (counts.prioritized ?? 0),
      active: counts.active ?? 0,
      workers,
    });
  }
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`metrics HTTP ${res.status}`);
  const text = await res.text();
  const mounts = env()
    .METRICS_DISK_MOUNTS.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  // Waktu diambil setelah respons: latensi fetch tidak mengacaukan selang laju (rx/tx/disk sibuk).
  await recordHostSample(r, text, Date.now(), mounts);
}

function failed(e: unknown) {
  const err = e instanceof Error ? e.message : String(e);
  if (!state.metricsFailing) {
    logger.warn(
      { err },
      "sampel metrik gagal — kartu Server tidak diperbarui (runbook-deploy §29)",
    );
  }
  state.metricsFailing = err;
}

function recovered() {
  if (state.metricsFailing) logger.info("sampel metrik pulih");
  state.metricsFailing = null;
}

/** Dipanggil sekali dari instrumentation.register (app). */
export function startMetricsSampler(): void {
  if (state.metricsSampler) return;
  if (!env().METRICS_NODE_URL) {
    logger.info("monitor sumber daya mati: METRICS_NODE_URL kosong (runbook-deploy §29)");
  }
  const tick = () => {
    void reportService("app");
    if (state.metricsBusy) return;
    state.metricsBusy = true;
    sampleOnce()
      .then(recovered, failed)
      .finally(() => {
        state.metricsBusy = false;
      });
  };
  state.metricsSampler = setInterval(tick, SAMPLE_MS);
  state.metricsSampler.unref();
  tick();
}
