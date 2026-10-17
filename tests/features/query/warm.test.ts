import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  announceVersionActivated,
  createWarmer,
  MAX_QUEUED,
  VERSION_ACTIVATED_CHANNEL,
  watchRedis,
  type WarmCache,
  type WarmDeps,
} from "@/features/query/warm";
import { CacheFullError, ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-pvq8: pemanasan cache parquet app saat versi baru aktif. Versi aktif diunduh sekali (kunci =
 * typedKey), pemicu ganda digabung, versi dipanaskan berurutan (satu unduhan sekaligus), separuh cache
 * per versi paling banyak, versi dicek aktif lagi sebelum setiap unduhan, dependensi yang menggantung
 * dibatasi waktu, dan kegagalan (cache penuh, storage) hanya dicatat — query pertama tetap mengunduh.
 */

const V1 = "cmv4kljx40009oczvdmpurrva";
const V2 = "cmv4kljx40009oczvdmpurrvb";

const root = mkdtempSync(join(tmpdir(), "dd-warm-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const deferred = <T = void>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

/** Cache palsu: mencatat kunci yang disewa/dilepas dan unduhan yang berjalan bersamaan. */
function fakeCache(maxBytes = 1_000, hold?: Promise<void>) {
  const acquired: string[] = [];
  const released: string[] = [];
  let active = 0;
  let peak = 0;
  const cache: WarmCache = {
    maxBytes,
    acquire: vi.fn(async (key: string) => {
      active++;
      peak = Math.max(peak, active);
      acquired.push(key);
      await (hold ?? Promise.resolve());
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return { release: () => void released.push(key) };
    }),
  };
  return { cache, acquired, released, peak: () => peak };
}

function deps(over: Partial<WarmDeps> = {}, cache = fakeCache().cache) {
  const log = { info: vi.fn(), warn: vi.fn() };
  const d: WarmDeps = {
    activeKeys: vi.fn(async (v: string) => (v === V1 ? ["v1/a.parquet", "v1/b.parquet"] : null)),
    cache: () => cache,
    sizeOf: vi.fn(async () => 10),
    log,
    ...over,
  };
  return { d, log };
}

describe("createWarmer", () => {
  it("versi aktif: setiap typedKey disewa sekali lalu dilepas, berurutan, dicatat", async () => {
    const f = fakeCache();
    const { d, log } = deps({}, f.cache);
    await createWarmer(d).warm(V1);
    expect(d.activeKeys).toHaveBeenCalledWith(V1);
    expect(f.acquired).toEqual(["v1/a.parquet", "v1/b.parquet"]);
    expect(f.released).toEqual(["v1/a.parquet", "v1/b.parquet"]);
    expect(f.peak()).toBe(1);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ versionId: V1, files: 2, bytes: 20, skipped: 0 }),
      "cache parquet versi aktif dipanaskan",
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("pemicu bersamaan untuk versi yang sama digabung: satu putaran, satu sewa per kunci", async () => {
    const f = fakeCache();
    const { d } = deps({}, f.cache);
    const w = createWarmer(d);
    const a = w.warm(V1);
    const b = w.warm(V1);
    expect(b).toBe(a);
    await Promise.all([a, b, w.warm(V1)]);
    // Satu putaran: baca awal + cek ulang sebelum tiap unduhan (2 file).
    expect(d.activeKeys).toHaveBeenCalledTimes(3);
    expect(d.sizeOf).toHaveBeenCalledTimes(2);
    expect(f.acquired).toEqual(["v1/a.parquet", "v1/b.parquet"]);
  });

  it("versi di-rollback/dihapus di tengah pemanasan → berhenti sebelum unduhan berikutnya", async () => {
    const f = fakeCache();
    const activeKeys = vi
      .fn<WarmDeps["activeKeys"]>()
      .mockResolvedValueOnce(["a", "b", "c"])
      .mockResolvedValueOnce(["a", "b", "c"])
      .mockResolvedValue(null);
    const { d, log } = deps({ activeKeys }, f.cache);
    await createWarmer(d).warm(V1);
    expect(f.acquired).toEqual(["a"]);
    expect(log.info).toHaveBeenCalledWith(
      { versionId: V1, files: 1 },
      "pemanasan cache parquet dihentikan: versi tidak aktif lagi",
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("koreksi skema di tengah pemanasan (typedKey baru) → file lama dilewati", async () => {
    const f = fakeCache();
    const activeKeys = vi
      .fn<WarmDeps["activeKeys"]>()
      .mockResolvedValueOnce(["a/typed-1", "b/typed-1"])
      .mockResolvedValue(["a/typed-2", "b/typed-1"]);
    const { d, log } = deps({ activeKeys }, f.cache);
    await createWarmer(d).warm(V1);
    expect(f.acquired).toEqual(["b/typed-1"]);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ files: 1, skipped: 1 }),
      "cache parquet versi aktif dipanaskan",
    );
  });

  it("versi berbeda dipanaskan berurutan: paling banyak satu unduhan pemanasan sekaligus", async () => {
    const f = fakeCache();
    const { d } = deps({ activeKeys: vi.fn(async (v: string) => [`${v}/a`, `${v}/b`]) }, f.cache);
    const w = createWarmer(d);
    await Promise.all([w.warm(V1), w.warm(V2)]);
    expect(f.acquired).toEqual([`${V1}/a`, `${V1}/b`, `${V2}/a`, `${V2}/b`]);
    expect(f.peak()).toBe(1);
  });

  it("versi tidak aktif lagi (rollback / dihapus) → tidak ada unduhan", async () => {
    const f = fakeCache();
    const { d, log } = deps({}, f.cache);
    await createWarmer(d).warm(V2);
    expect(f.cache.acquire).not.toHaveBeenCalled();
    expect(d.sizeOf).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      { versionId: V2 },
      "pemanasan cache parquet dilewati: versi tidak aktif",
    );
  });

  it("total ≤ separuh cache: file yang tidak muat (termasuk > maxBytes) dilewati", async () => {
    const f = fakeCache(100);
    const sizes: Record<string, number> = { a: 30, b: 30, c: 15, d: 200 };
    const { d, log } = deps(
      {
        activeKeys: async () => ["a", "b", "c", "d"],
        sizeOf: async (k) => sizes[k]!,
      },
      f.cache,
    );
    await createWarmer(d).warm(V1);
    expect(f.acquired).toEqual(["a", "c"]);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ files: 2, bytes: 45, skipped: 2 }),
      "cache parquet versi aktif dipanaskan",
    );
  });

  it("cache penuh → dicatat, tidak melempar, sisa file tidak diunduh; versi berikutnya tetap jalan", async () => {
    const acquire = vi
      .fn<WarmCache["acquire"]>()
      .mockRejectedValueOnce(new CacheFullError())
      .mockResolvedValue({ release: () => {} });
    const { d, log } = deps(
      { activeKeys: async (v) => [`${v}/a`, `${v}/b`] },
      { maxBytes: 1_000, acquire },
    );
    const w = createWarmer(d);
    await expect(w.warm(V1)).resolves.toBeUndefined();
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: V1,
        files: 0,
        err: expect.stringMatching(/^CacheFullError/),
      }),
      "pemanasan cache parquet gagal; query pertama mengunduh sendiri",
    );
    await w.warm(V2);
    expect(acquire.mock.calls.map((c) => c[0])).toEqual([`${V1}/a`, `${V2}/a`, `${V2}/b`]);
  });

  it("storage / DB gagal → dicatat tanpa melempar; pemicu berikutnya mencoba lagi", async () => {
    const f = fakeCache();
    const sizeOf = vi
      .fn<WarmDeps["sizeOf"]>()
      .mockRejectedValueOnce(new Error("HEAD 503"))
      .mockResolvedValue(10);
    const activeKeys = vi
      .fn<WarmDeps["activeKeys"]>()
      .mockRejectedValueOnce(new Error("db mati"))
      .mockResolvedValue(["k"]);
    const { d, log } = deps({ sizeOf, activeKeys }, f.cache);
    const w = createWarmer(d);
    await expect(w.warm(V1)).resolves.toBeUndefined();
    await expect(w.warm(V1)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn.mock.calls.map((c) => (c[0] as { err: string }).err)).toEqual([
      "Error: db mati",
      "Error: HEAD 503",
    ]);
    await w.warm(V1);
    expect(f.acquired).toEqual(["k"]);
  });

  it("HEAD storage / baca DB menggantung → dibatalkan setelah batas langkah, dicatat, antrean lanjut", async () => {
    const f = fakeCache();
    let aborted: unknown = null;
    const sizeOf = vi.fn<WarmDeps["sizeOf"]>(async (key, signal) => {
      if (key.startsWith(V1)) {
        // HEAD yang tidak pernah menjawab; berhenti hanya lewat signal.
        return new Promise<number>((_, reject) =>
          signal.addEventListener("abort", () => reject((aborted = signal.reason))),
        );
      }
      return 10;
    });
    const activeKeys = vi.fn<WarmDeps["activeKeys"]>(async (v) =>
      v === V2 ? new Promise<never>(() => {}) : [`${v}/a`],
    );
    const { d, log } = deps({ sizeOf, activeKeys }, f.cache);
    const w = createWarmer(d, { stepTimeoutMs: 20 });
    const V3 = "cmv4kljx40009oczvdmpurrvc";
    await Promise.all([w.warm(V1), w.warm(V2), w.warm(V3)]);
    expect(aborted).toBeInstanceOf(Error);
    expect(log.warn.mock.calls.map((c) => c[0] as { versionId: string; err: string })).toEqual([
      expect.objectContaining({ versionId: V1, err: expect.stringMatching(/^TimeoutError/) }),
      expect.objectContaining({ versionId: V2, err: expect.stringMatching(/^TimeoutError/) }),
    ]);
    expect(f.acquired).toEqual([`${V3}/a`]);
  });

  it("unduhan versi melewati batas versi → dicatat, antrean lanjut, sewa yang terlambat dilepas", async () => {
    const gate = deferred();
    let released = 0;
    const acquire = vi.fn<WarmCache["acquire"]>(async (key) => {
      if (key.startsWith(V1)) await gate.promise;
      return { release: () => void released++ };
    });
    const { d, log } = deps(
      { activeKeys: async (v) => [`${v}/a`, `${v}/b`] },
      { maxBytes: 1_000, acquire },
    );
    const w = createWarmer(d, { runTimeoutMs: 50 });
    await Promise.all([w.warm(V1), w.warm(V2)]);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: V1,
        files: 0,
        err: expect.stringMatching(/^TimeoutError/),
      }),
      "pemanasan cache parquet gagal; query pertama mengunduh sendiri",
    );
    // V1/b tidak pernah diminta; V2 tetap dipanaskan.
    expect(acquire.mock.calls.map((c) => c[0])).toEqual([`${V1}/a`, `${V2}/a`, `${V2}/b`]);
    expect(released).toBe(2);
    gate.resolve();
    await vi.waitFor(() => expect(released).toBe(3));
  });

  it("antrean dibatasi: lebih dari MAX_QUEUED versi menunggu → dilewati dan dicatat", async () => {
    const gate = deferred();
    const f = fakeCache(1_000, gate.promise);
    const { d, log } = deps({ activeKeys: async (v) => [v] }, f.cache);
    const w = createWarmer(d);
    const ids = Array.from({ length: MAX_QUEUED }, (_, i) => `cmv4kljx40009oczvdmpurr${i}x`);
    const jobs = ids.map((id) => w.warm(id));
    await w.warm("cmv4kljx40009oczvdmpurrzz");
    expect(log.warn).toHaveBeenCalledWith(
      { versionId: "cmv4kljx40009oczvdmpurrzz" },
      "pemanasan cache parquet dilewati: antrean penuh",
    );
    gate.resolve();
    await Promise.all(jobs);
    expect(f.acquired).toEqual(ids);
  });
});

describe("pemanasan dengan ParquetCache sungguhan", () => {
  const cacheWith = (name: string, maxBytes: number, sizes: Record<string, number>) => {
    const downloads: string[] = [];
    const download = vi.fn(async (key: string, dest: string) => {
      downloads.push(key);
      writeFileSync(dest, Buffer.alloc(sizes[key] ?? 1));
    });
    const cache = new ParquetCache({
      dir: join(root, name),
      maxBytes,
      sizeOf: async (key) => sizes[key] ?? 1,
      download,
      maxDownloads: 2,
      perOwnerDownloads: 1,
    });
    return { cache, downloads, download };
  };

  it("AC 1: setelah dipanaskan, sewa pertama query (owner, waitMs 0) tanpa unduhan baru", async () => {
    const sizes = {
      "parquet/ds/v1/s1/typed-1.parquet": 40,
      "parquet/ds/v1/s2/typed-1.parquet": 30,
    };
    const { cache, downloads } = cacheWith("ac1", 1_000, sizes);
    const { d } = deps(
      {
        activeKeys: async () => Object.keys(sizes),
        sizeOf: async (k) => sizes[k as keyof typeof sizes],
      },
      cache,
    );
    await createWarmer(d).warm(V1);
    expect(downloads).toEqual(Object.keys(sizes));
    for (const key of Object.keys(sizes)) {
      const lease = await cache.acquire(key, { owner: "pemilik", waitMs: 0 });
      lease.release();
    }
    expect(downloads).toHaveLength(2);
    expect(cache.totalBytes).toBe(70);
  });

  it("query yang datang saat pemanasan berjalan menunggu unduhan yang sama (tidak dua kali)", async () => {
    const gate = deferred();
    const fetched: string[] = [];
    const cache = new ParquetCache({
      dir: join(root, "join"),
      maxBytes: 1_000,
      download: async (key, dest) => {
        fetched.push(key);
        await gate.promise;
        writeFileSync(dest, "x");
      },
    });
    const { d } = deps({ activeKeys: async () => ["k"] }, cache);
    const warming = createWarmer(d).warm(V1);
    await vi.waitFor(() => expect(fetched).toEqual(["k"]));
    const query = cache.acquire("k", { owner: "pemilik", waitMs: 5_000 });
    gate.resolve();
    (await query).release();
    await warming;
    expect(fetched).toEqual(["k"]);
  });

  it("AC 2: cache penuh oleh file yang sedang dipakai → dicatat; query pertama mengunduh sendiri", async () => {
    const { cache, downloads } = cacheWith("ac2", 100, { pakai: 60, baru: 45 });
    const inUse = await cache.acquire("pakai");
    const { d, log } = deps({ activeKeys: async () => ["baru"], sizeOf: async () => 45 }, cache);
    await expect(createWarmer(d).warm(V1)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.stringMatching(/^CacheFullError/) }),
      "pemanasan cache parquet gagal; query pertama mengunduh sendiri",
    );
    expect(downloads).toEqual(["pakai"]);
    inUse.release();
    (await cache.acquire("baru", { owner: "pemilik" })).release();
    expect(downloads).toEqual(["pakai", "baru"]);
  });

  it("AC 2: unduhan storage gagal → dicatat; query pertama mengunduh ulang", async () => {
    const { cache, download } = cacheWith("ac2-storage", 1_000, { k: 10 });
    download.mockRejectedValueOnce(new Error("storage 503"));
    const { d, log } = deps({ activeKeys: async () => ["k"] }, cache);
    await createWarmer(d).warm(V1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: "Error: storage 503" }),
      "pemanasan cache parquet gagal; query pertama mengunduh sendiri",
    );
    (await cache.acquire("k", { owner: "pemilik" })).release();
    expect(download).toHaveBeenCalledTimes(2);
  });
});

describe("watchRedis", () => {
  it("Redis mati: galat pertama dicatat, lalu paling banyak sekali per menit; pulih dicatat sekali", () => {
    vi.useFakeTimers({ now: 0 });
    try {
      const on: Record<string, (e: Error) => void> = {};
      const log = { info: vi.fn(), warn: vi.fn() };
      watchRedis({ on: (ev: string, fn: (e: Error) => void) => (on[ev] = fn) }, log, "redis x");
      const err = new Error("ECONNREFUSED");
      const ready = () => on.ready!(err); // listener "ready" mengabaikan argumen
      ready(); // sambungan pertama: tidak dicatat
      for (let t = 0; t < 60_000; t += 5_000) {
        vi.setSystemTime(t);
        on.error!(err);
      }
      expect(log.warn).toHaveBeenCalledTimes(1);
      vi.setSystemTime(60_000);
      on.error!(err);
      expect(log.warn).toHaveBeenCalledTimes(2);
      expect(log.warn).toHaveBeenLastCalledWith({ err: "ECONNREFUSED" }, "redis x: koneksi gagal");
      ready();
      ready();
      expect(log.info).toHaveBeenCalledTimes(1);
      expect(log.info).toHaveBeenCalledWith({}, "redis x: koneksi pulih");
      // Putus lagi setelah pulih: langsung dicatat.
      vi.setSystemTime(61_000);
      on.error!(err);
      expect(log.warn).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("announceVersionActivated", () => {
  it("menerbitkan id versi di kanal pemanasan", async () => {
    const publish = vi.fn(async () => 1);
    const log = { info: vi.fn(), warn: vi.fn() };
    await announceVersionActivated(Promise.resolve({ publish }), V1, log);
    expect(publish).toHaveBeenCalledWith(VERSION_ACTIVATED_CHANNEL, V1);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("Redis mati (koneksi atau publish gagal) → dicatat, tidak melempar", async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    await expect(
      announceVersionActivated(Promise.reject(new Error("ECONNREFUSED")), V1, log),
    ).resolves.toBeUndefined();
    const publish = vi.fn(async () => {
      throw new Error("timeout");
    });
    await expect(announceVersionActivated({ publish }, V2, log)).resolves.toBeUndefined();
    expect(log.warn.mock.calls.map((c) => c[0])).toEqual([
      { versionId: V1, err: "Error: ECONNREFUSED" },
      { versionId: V2, err: "Error: timeout" },
    ]);
  });
});
