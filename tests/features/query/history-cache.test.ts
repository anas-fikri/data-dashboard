import { describe, expect, it } from "vitest";
import { HistoryCache } from "@/features/query/history-cache";

const make = (o: { maxEntries?: number; maxSize?: number } = {}) => {
  let now = 0;
  const cache = new HistoryCache<number[]>({
    ttlMs: 30_000,
    maxEntries: o.maxEntries ?? 100,
    maxSize: o.maxSize ?? 1_000,
    size: (v) => v.length,
    now: () => now,
  });
  return { cache, tick: (ms: number) => (now += ms) };
};

describe("cache riwayat sheet (T-011 putaran 3)", () => {
  it("dibaca sekali dalam TTL, dimuat ulang setelahnya", async () => {
    const { cache, tick } = make();
    let loads = 0;
    const load = async () => (loads++, [1, 2, 3]);
    await cache.get("a", load);
    await cache.get("a", load);
    expect(loads).toBe(1);
    tick(30_001);
    await cache.get("a", load);
    expect(loads).toBe(2);
  });

  it("dibatasi total ukuran, bukan hanya jumlah entri: yang terlama dibuang", async () => {
    const { cache } = make({ maxSize: 250 });
    for (const k of ["a", "b", "c"]) await cache.get(k, async () => new Array(100).fill(0));
    await Promise.resolve();
    expect(cache.stats()).toEqual({ entries: 2, size: 200 });
    let reloaded = false;
    await cache.get("a", async () => ((reloaded = true), []));
    expect(reloaded).toBe(true);
  });

  it("entri kedaluwarsa dibuang saat menulis (memori tidak tumbuh dari kunci lama)", async () => {
    const { cache, tick } = make();
    for (let i = 0; i < 50; i++) await cache.get(`k${i}`, async () => [i]);
    tick(30_001);
    await cache.get("baru", async () => [1]);
    expect(cache.stats().entries).toBe(1);
  });

  it("gagal memuat → tidak disimpan", async () => {
    const { cache } = make();
    await expect(cache.get("x", () => Promise.reject(new Error("db")))).rejects.toThrow("db");
    await Promise.resolve();
    expect(cache.stats().entries).toBe(0);
  });
});
