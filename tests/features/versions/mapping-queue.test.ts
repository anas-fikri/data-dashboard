import type Redis from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-014 antrean pemetaan (lib/queue/versions): satu job per versi, batas job berjalan per user yang
 * SAMA dengan recast (set recast:inflight:u:<userId> + lock enqueue per user), dan hasil terakhir
 * versi (mapping-last, 24 jam). Redis palsu di memori; state BullMQ dimock.
 */
class FakeRedis {
  kv = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  ttl = new Map<string, number>();
  async get(k: string) {
    return this.kv.get(k) ?? null;
  }
  async set(k: string, v: string, _px: "PX", ms: number, nx?: "NX") {
    if (nx && this.kv.has(k)) return null;
    this.kv.set(k, v);
    this.ttl.set(k, ms);
    return "OK";
  }
  async del(k: string) {
    return this.kv.delete(k) ? 1 : 0;
  }
  async smembers(k: string) {
    return [...(this.sets.get(k) ?? [])];
  }
  async srem(k: string, v: string) {
    return this.sets.get(k)?.delete(v) ? 1 : 0;
  }
  async eval(script: string, _n: number, k: string, v: string) {
    if (this.kv.get(k) !== v) return 0;
    if (script.includes('"DEL"')) this.kv.delete(k);
    return 1;
  }
  multi() {
    const ops: (() => void)[] = [];
    const chain = {
      sadd: (k: string, v: string) => {
        ops.push(() => this.sets.set(k, new Set([...(this.sets.get(k) ?? []), v])));
        return chain;
      },
      pexpire: (k: string, ms: number) => {
        ops.push(() => this.ttl.set(k, ms));
        return chain;
      },
      del: (k: string) => {
        ops.push(() => this.kv.delete(k));
        return chain;
      },
      exec: async () => ops.map((op) => op()),
    };
    return chain;
  }
}

const redis = new FakeRedis();
vi.mock("@/lib/redis", () => ({ redisReady: async () => redis }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const states = new Map<string, string>();
const add = vi.fn(async (_name: string, _data: unknown, opts: { jobId: string }) => {
  states.set(opts.jobId, "waiting");
  return { id: opts.jobId };
});
vi.mock("@/lib/queue/connection", () => ({
  MAP_VERSION_JOB: "map-version",
  mappingQueue: () => ({ add, getJobState: async (id: string) => states.get(id) ?? "unknown" }),
  ingestQueue: vi.fn(),
  recastQueue: vi.fn(),
  withQueueTimeout: <T>(p: Promise<T>) => p,
}));

const q = await import("@/lib/queue/versions");

const data = (versionId: string, actorId = "u1") => ({
  versionId,
  datasetId: "ds",
  input: { base: { activeVersionId: null, sheets: [] }, sheets: [] },
  actorId,
  ip: "10.0.0.1",
});

beforeEach(() => {
  redis.kv.clear();
  redis.sets.clear();
  redis.ttl.clear();
  states.clear();
  add.mockClear();
});

describe("enqueueMapping", () => {
  it("satu job per versi; job dicatat di indeks versi + set job berjalan user; hasil terakhir dihapus", async () => {
    redis.kv.set("mapping-last:v1", "{}");
    const r = await q.enqueueMapping(data("v1"), 2);
    if (!r.ok) throw new Error(r.reason);
    expect(r.jobId).toMatch(/^mp_[0-9a-f]{24}$/);
    expect(redis.kv.get("mapping:v1")).toBe(r.jobId);
    expect([...redis.sets.get("recast:inflight:u:u1")!]).toEqual([r.jobId]);
    expect(redis.kv.has("mapping-last:v1")).toBe(false);
    expect(add).toHaveBeenCalledWith("map-version", data("v1"), { jobId: r.jobId });
    expect(await q.mappingInFlight("v1")).toBe(r.jobId);
    expect(await q.enqueueMapping(data("v1"), 2)).toEqual({ ok: false, reason: "version" });
    // Job selesai → indeks dilepas, kiriman berikutnya boleh.
    states.set(r.jobId, "completed");
    expect(await q.mappingInFlight("v1")).toBeNull();
    expect(redis.kv.has("mapping:v1")).toBe(false);
  });

  it("batas job berjalan per user dihitung bersama recast; entri basi dibuang", async () => {
    redis.sets.set("recast:inflight:u:u1", new Set(["rc_a", "rc_b", "rc_old"]));
    states.set("rc_a", "active");
    states.set("rc_b", "delayed");
    states.set("rc_old", "completed");
    expect(await q.enqueueMapping(data("v2"), 2)).toEqual({ ok: false, reason: "user", count: 2 });
    expect([...redis.sets.get("recast:inflight:u:u1")!]).toEqual(["rc_a", "rc_b"]);
    expect(add).not.toHaveBeenCalled();
    expect(redis.kv.has("mapping:v2")).toBe(false);
    // User lain tidak terpengaruh.
    expect(await q.enqueueMapping(data("v2", "u2"), 2)).toMatchObject({ ok: true });
  });

  it("lock enqueue user dipegang kiriman lain > 3 s → lock", async () => {
    vi.useFakeTimers();
    try {
      redis.kv.set("recast:enqueue-lock:u1", "token-lain");
      const p = q.enqueueMapping(data("v3"), 2);
      await vi.advanceTimersByTimeAsync(3_200);
      expect(await p).toEqual({ ok: false, reason: "lock" });
      expect(add).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("hasil terakhir pemetaan (mapping-last)", () => {
  it("dicatat worker 24 jam, dibaca app; null → dihapus; isi rusak → null", async () => {
    const r = redis as unknown as Redis;
    await q.recordMappingLast(r, "v1", { jobId: "mp_1", result: { outcome: "stale" } });
    expect(redis.ttl.get("mapping-last:v1")).toBe(24 * 60 * 60 * 1000);
    expect(await q.mappingLast("v1")).toEqual({ jobId: "mp_1", result: { outcome: "stale" } });
    await q.recordMappingLast(r, "v1", null);
    expect(await q.mappingLast("v1")).toBeNull();
    redis.kv.set("mapping-last:v1", "{rusak");
    expect(await q.mappingLast("v1")).toBeNull();
  });
});
