import "server-only";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { Queue } from "bullmq";
import {
  exportQueue,
  ingestQueue,
  pdfQueue,
  recastQueue,
  withQueueTimeout,
} from "@/lib/queue/connection";
import { ingestWorkerCount } from "@/lib/queue/versions";
import { redisReady } from "@/lib/redis";
import { KEY, recordHostSample, reportService, saveQueueStatus, type JobKind } from "./store";

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

/** true = sampel diambil; false = dilewati (monitor mati atau kunci dipegang proses lain). */
export async function sampleOnce(): Promise<boolean> {
  const url = env().METRICS_NODE_URL;
  if (!url || !(await holdLock())) return false;
  const r = await redisReady();
  // Antrean + worker lebih dulu dan terpisah dari exporter: status pemroses (insiden worker mati) tetap
  // terbaca walau relay/exporter sedang bermasalah.
  const count = (q: Pick<Queue, "getJobCounts">, what: string) =>
    withQueueTimeout(q.getJobCounts("waiting", "prioritized", "delayed", "active"), what).catch(
      () => null,
    );
  const [counts, recast, exp, pdf, workers] = await Promise.all([
    count(ingestQueue(), "jumlah antrean ingest"),
    // recastQueue() dan mappingQueue() = antrean BullMQ yang sama ("recast"): dihitung sekali (review H1).
    count(recastQueue(), "jumlah antrean recast"),
    count(exportQueue(), "jumlah antrean ekspor"),
    count(pdfQueue(), "jumlah antrean PDF"),
    ingestWorkerCount(),
  ]);
  const waitingOf = (c: Record<string, number>) =>
    (c.waiting ?? 0) + (c.prioritized ?? 0) + (c.delayed ?? 0);
  // Semua proses latar per jenis (v1.21): kartu Server menampilkan apa yang sedang dikerjakan server.
  const jobs: Partial<Record<JobKind, { active: number; waiting: number }>> = {};
  for (const [kind, list] of [
    ["upload", [counts]],
    ["schema", [recast]],
    ["export", [exp, pdf]],
  ] as const) {
    const known = list.filter((c): c is Record<string, number> => !!c);
    if (!known.length) continue;
    jobs[kind] = {
      active: known.reduce((n, c) => n + (c.active ?? 0), 0),
      waiting: known.reduce((n, c) => n + waitingOf(c), 0),
    };
  }
  // Disimpan walau hitungan ingest timeout (T-zjwh): jumlah worker (status pemroses) tetap terbaca.
  await saveQueueStatus(r, {
    t: Date.now(),
    waiting: counts ? (counts.waiting ?? 0) + (counts.prioritized ?? 0) : null,
    active: counts ? (counts.active ?? 0) : null,
    workers,
    jobs,
  });
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
  return true;
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
      // Dilewati (kunci milik proses lain) bukan tanda pulih.
      .then((sampled) => sampled && recovered(), failed)
      .finally(() => {
        state.metricsBusy = false;
      });
  };
  state.metricsSampler = setInterval(tick, SAMPLE_MS);
  state.metricsSampler.unref();
  tick();
}
