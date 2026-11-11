import "server-only";
import { hostname } from "node:os";
import type Redis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import { takeSnapshot, type AccountSnapshot } from "./accounts";
import { readCgroup, serviceUsage, type CgroupRaw, type ServiceUsage } from "./cgroup";
import {
  averagePoints,
  downsample,
  hostPoint,
  readHost,
  type HostPoint,
  type HostRaw,
} from "./host";

/*
 * Penyimpanan metrik (v1.18, ADR-0010) di Redis: titik host 10 dtk × 1 jam dan 1 menit × 24 jam (daftar, terbaru
 * di depan), pembacaan mentah terakhir untuk laju, status antrean, dan pemakaian per layanan (hash, kedaluwarsa
 * menurut waktu titik). Ukuran total ± 0,5 MB.
 */
export const KEY = {
  last: "metrics:host:last",
  s10: "metrics:host:10s",
  m1: "metrics:host:1m",
  queue: "metrics:queue",
  svc: "metrics:svc",
  lock: "metrics:sampler:lock",
  /** Hash proses → { t, running: { userId: n } } (query berjalan per akun, T-qed9). */
  acctRun: "metrics:acct:run",
  /** Prefix ember per menit: hash userId → detik eksekusi query (kedaluwarsa 20 menit). */
  acctSec: "metrics:acct:sec:",
} as const;
/** Jendela "detik query" per akun (menit, termasuk menit berjalan). */
export const ACCOUNT_WINDOW_MIN = 15;
export const KEEP_10S = 360;
export const KEEP_1M = 1440;
/** Titik layanan lebih tua dari ini dianggap layanan mati/hilang. */
export const SERVICE_STALE_MS = 30_000;

export interface QueueStatus {
  t: number;
  waiting: number;
  active: number;
  /** null = jumlah worker tidak diketahui. */
  workers: number | null;
}

const parse = <T>(s: string | null): T | null => {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
};

/** Simpan titik 10 dtk; menit yang baru lewat dirata-rata menjadi titik 1 menit (sekali per menit). */
export async function pushHostPoint(r: Redis, p: HostPoint): Promise<void> {
  await r
    .multi()
    .lpush(KEY.s10, JSON.stringify(p))
    .ltrim(KEY.s10, 0, KEEP_10S - 1)
    .exec();
  const minute = Math.floor(p.t / 60_000) - 1;
  const newest = parse<HostPoint>(await r.lindex(KEY.m1, 0));
  if (newest && Math.floor(newest.t / 60_000) >= minute) return;
  const recent = (await r.lrange(KEY.s10, 0, 12))
    .map((s) => parse<HostPoint>(s))
    .filter((x): x is HostPoint => !!x && Math.floor(x.t / 60_000) === minute)
    .reverse();
  const avg = averagePoints(recent);
  if (!avg) return;
  await r
    .multi()
    .lpush(KEY.m1, JSON.stringify({ ...avg, t: minute * 60_000 }))
    .ltrim(KEY.m1, 0, KEEP_1M - 1)
    .exec();
}

/** Satu pembacaan /metrics → titik baru (laju dari pembacaan sebelumnya yang disimpan). */
export async function recordHostSample(
  r: Redis,
  text: string,
  now: number,
  mounts: readonly string[],
): Promise<HostPoint> {
  const raw = readHost(text, now, mounts);
  const prev = parse<HostRaw>(await r.get(KEY.last));
  // Sampel lama (> 2 menit, mis. app baru menyala lagi) tidak dipakai untuk laju: rata-rata menyesatkan.
  const usable = prev && now - prev.t > 0 && now - prev.t <= 120_000 ? prev : null;
  const point = hostPoint(usable, raw);
  await r.set(KEY.last, JSON.stringify(raw), "PX", 10 * 60_000);
  if (usable) await pushHostPoint(r, point);
  return point;
}

export async function saveQueueStatus(r: Redis, q: QueueStatus): Promise<void> {
  await r.set(KEY.queue, JSON.stringify(q), "PX", 60_000);
}

export interface ServiceRow extends ServiceUsage {
  service: string;
}

const svcState = globalThis as unknown as { metricsCgroupPrev?: CgroupRaw | null };

/** Simpan snapshot per akun proses ini: query berjalan (ditimpa) + detik eksekusi ke ember menit berjalan. */
export async function saveAccountSnapshot(
  r: Redis,
  proc: string,
  snap: AccountSnapshot,
  now: number,
): Promise<void> {
  const m = r.multi().hset(KEY.acctRun, proc, JSON.stringify({ t: now, running: snap.running }));
  const entries = Object.entries(snap.ms).filter(([, ms]) => ms > 0);
  if (entries.length) {
    const key = KEY.acctSec + Math.floor(now / 60_000);
    for (const [userId, ms] of entries) m.hincrbyfloat(key, userId, ms / 1000);
    m.pexpire(key, (ACCOUNT_WINDOW_MIN + 5) * 60_000);
  }
  await m.exec();
}

/**
 * Laporkan pemakaian proses ini (app/worker) tiap 10 dtk: container dari cgroup (bila terbaca) dan perkiraan
 * per akun (selalu). Redis gagal → hitungan periode ini hilang (perkiraan), proses tidak terganggu.
 */
export async function reportService(service: string, now = Date.now()): Promise<void> {
  // Hitungan per akun selalu dikosongkan (memori tidak menumpuk); monitor mati → tidak menulis apa pun.
  const snap = takeSnapshot(now);
  if (!env().METRICS_NODE_URL) return;
  const cur = await readCgroup(undefined, now);
  const usage = cur ? serviceUsage(svcState.metricsCgroupPrev ?? null, cur) : null;
  if (cur) svcState.metricsCgroupPrev = cur;
  const proc = `${service}:${hostname()}`;
  try {
    const r = await redisReady();
    // TTL hash ikut diperbarui: field container lama (deploy baru = hostname baru) tidak tertinggal selamanya.
    if (usage) {
      await r
        .multi()
        .hset(KEY.svc, proc, JSON.stringify(usage))
        .pexpire(KEY.svc, 10 * 60_000)
        .exec();
    }
    await saveAccountSnapshot(r, proc, snap, now);
  } catch (e) {
    logger.debug(
      { err: e instanceof Error ? e.message : String(e) },
      "lapor pemakaian layanan gagal",
    );
  }
}

export interface MetricsView {
  /** false = sampler mati/tidak ada titik baru (relay/exporter belum terpasang atau gagal). */
  available: boolean;
  latest: HostPoint | null;
  series: HostPoint[];
  queue: QueueStatus | null;
}

const fresh = (t: number | undefined, now: number, ms: number) =>
  typeof t === "number" && now - t <= ms;

/** Ringkasan untuk semua user login: titik terakhir + 1 jam (≤ 60 titik) + antrean. */
export async function readSummary(r: Redis, now = Date.now()): Promise<MetricsView> {
  const pts = (await r.lrange(KEY.s10, 0, KEEP_10S - 1))
    .map((s) => parse<HostPoint>(s))
    .filter((x): x is HostPoint => !!x && now - x.t <= 3_600_000)
    .reverse();
  const latest = pts[pts.length - 1] ?? null;
  const queue = parse<QueueStatus>(await r.get(KEY.queue));
  return {
    available: !!latest && fresh(latest.t, now, 60_000),
    latest,
    series: downsample(pts, 60),
    queue: queue && fresh(queue.t, now, 60_000) ? queue : null,
  };
}

/** Admin: + 24 jam (≤ 288 titik), per layanan (titik segar saja; entri basi dibuang). */
export async function readAdmin(
  r: Redis,
  now = Date.now(),
): Promise<MetricsView & { day: HostPoint[]; services: ServiceRow[] }> {
  const summary = await readSummary(r, now);
  const day = (await r.lrange(KEY.m1, 0, KEEP_1M - 1))
    .map((s) => parse<HostPoint>(s))
    .filter((x): x is HostPoint => !!x && now - x.t <= 86_400_000)
    .reverse();
  const all = await r.hgetall(KEY.svc);
  const services: ServiceRow[] = [];
  const stale: string[] = [];
  for (const [field, v] of Object.entries(all)) {
    const u = parse<ServiceUsage>(v);
    if (!u || !fresh(u.t, now, SERVICE_STALE_MS)) {
      if (!u || now - u.t > 10 * 60_000) stale.push(field);
      continue;
    }
    services.push({ ...u, service: field.split(":")[0] ?? "?" });
  }
  if (stale.length) await r.hdel(KEY.svc, ...stale);
  services.sort((a, b) => a.service.localeCompare(b.service) || b.mem - a.mem);
  return { ...summary, day: downsample(day, 288), services };
}

export interface AccountActivity {
  running: number;
  /** Detik eksekusi query dalam ACCOUNT_WINDOW_MIN menit terakhir. */
  seconds: number;
}

/** Aktivitas query per akun: query berjalan (laporan proses segar ≤ 30 dtk) + detik 15 menit terakhir. */
export async function readAccountActivity(
  r: Redis,
  now = Date.now(),
): Promise<Map<string, AccountActivity>> {
  const out = new Map<string, AccountActivity>();
  const get = (id: string) =>
    out.get(id) ?? (out.set(id, { running: 0, seconds: 0 }), out.get(id)!);
  const procs = await r.hgetall(KEY.acctRun);
  const stale: string[] = [];
  for (const [field, v] of Object.entries(procs)) {
    const snap = parse<{ t: number; running: Record<string, number> }>(v);
    if (!snap || !fresh(snap.t, now, SERVICE_STALE_MS)) {
      if (!snap || now - snap.t > 10 * 60_000) stale.push(field);
      continue;
    }
    for (const [id, n] of Object.entries(snap.running)) if (n > 0) get(id).running += n;
  }
  if (stale.length) await r.hdel(KEY.acctRun, ...stale);
  const minute = Math.floor(now / 60_000);
  const buckets = await Promise.all(
    Array.from({ length: ACCOUNT_WINDOW_MIN }, (_, i) => r.hgetall(KEY.acctSec + (minute - i))),
  );
  for (const b of buckets) {
    for (const [id, sec] of Object.entries(b)) {
      const v = Number(sec);
      if (Number.isFinite(v) && v > 0) get(id).seconds += v;
    }
  }
  return out;
}
