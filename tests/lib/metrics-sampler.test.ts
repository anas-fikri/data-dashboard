import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Sampler metrik (v1.18, review T-ee46 L9/M6): satu pemegang kunci, kunci hanya diperpanjang pemiliknya, status
 * antrean + worker tetap tersimpan walau exporter gagal, dan monitor mati (URL kosong) tidak menyentuh apa pun.
 */
const env = { METRICS_NODE_URL: "http://relay:19100/metrics" as string | undefined };
const store = new Map<string, string>();
const lists = new Map<string, string[]>();
const list = (k: string) => lists.get(k) ?? (lists.set(k, []), lists.get(k)!);
const redis = {
  set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
    if (args.includes("NX") && store.has(k)) return null;
    store.set(k, v);
    return "OK";
  }),
  get: async (k: string) => store.get(k) ?? null,
  eval: vi.fn(async (_s: string, _n: number, k: string, token: string) =>
    store.get(k) === token ? 1 : 0,
  ),
  lindex: async (k: string, i: number) => list(k)[i] ?? null,
  lrange: async (k: string, a: number, b: number) => list(k).slice(a, b + 1),
  multi() {
    const ops: (() => void)[] = [];
    const m = {
      lpush: (k: string, v: string) => (ops.push(() => list(k).unshift(v)), m),
      ltrim: (k: string, a: number, b: number) => (
        ops.push(() => lists.set(k, list(k).slice(a, b + 1))),
        m
      ),
      exec: async () => ops.forEach((f) => f()),
    };
    return m;
  },
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: () => ({ ...env, METRICS_DISK_MOUNTS: "/,/data" }),
}));
vi.mock("@/lib/redis", () => ({ redisReady: async () => redis }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
const counts = (c: Record<string, number>) => () => ({ getJobCounts: async () => c });
vi.mock("@/lib/queue/connection", () => ({
  ingestQueue: counts({ waiting: 2, prioritized: 1, active: 1 }),
  recastQueue: counts({ waiting: 0, active: 1 }),
  mappingQueue: () => ({
    getJobCounts: async () => {
      throw new Error("timeout");
    },
  }),
  exportQueue: counts({ waiting: 1, delayed: 1, active: 0 }),
  pdfQueue: counts({ active: 2 }),
  withQueueTimeout: <T>(p: Promise<T>) => p,
}));
vi.mock("@/lib/queue/versions", () => ({ ingestWorkerCount: async () => 0 }));

const { sampleOnce } = await import("@/lib/metrics/sampler");
const { KEY } = await import("@/lib/metrics/store");

const A = readFileSync("tests/fixtures/node-exporter/ne1.prom", "utf8");

beforeEach(() => {
  store.clear();
  lists.clear();
  env.METRICS_NODE_URL = "http://relay:19100/metrics";
  vi.unstubAllGlobals();
});

describe("sampleOnce", () => {
  it("exporter gagal → antrean + worker mati tetap tersimpan, galat dilempar", async () => {
    vi.stubGlobal("fetch", async () => new Response("down", { status: 502 }));
    await expect(sampleOnce()).rejects.toThrow(/502/);
    const q = JSON.parse(store.get(KEY.queue)!);
    expect(q).toMatchObject({ waiting: 3, active: 1, workers: 0 });
    // v1.21: semua proses latar per jenis; antrean yang gagal dibaca dilewati, bukan menggagalkan sampel.
    expect(q.jobs).toEqual({
      upload: { active: 1, waiting: 3 },
      schema: { active: 1, waiting: 0 },
      export: { active: 2, waiting: 2 },
    });
  });

  it("berhasil → pembacaan mentah disimpan; kunci dipegang proses ini dan diperpanjang atomik", async () => {
    vi.stubGlobal("fetch", async () => new Response(A));
    expect(await sampleOnce()).toBe(true);
    expect(store.has(KEY.last)).toBe(true);
    await sampleOnce();
    expect(redis.eval).toHaveBeenCalled();
    // Proses lain memegang kunci → tidak mengambil sampel.
    store.set(KEY.lock, "proses-lain");
    store.delete(KEY.queue);
    expect(await sampleOnce()).toBe(false);
    expect(store.has(KEY.queue)).toBe(false);
  });

  it("monitor mati (URL kosong) → tidak mengambil kunci atau memanggil exporter", async () => {
    env.METRICS_NODE_URL = undefined;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    redis.set.mockClear();
    expect(await sampleOnce()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
