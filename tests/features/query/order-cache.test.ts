import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderCache, type OrderMeta } from "@/features/query/order-cache";

/*
 * T-062 AC2: batas byte (LRU, yang dibaca tidak dibuang), TTL 30 menit, invalidasi versi/revisi, data
 * dihapus, single-flight. Berkas "parquet" di sini hanya byte (DuckDB tidak dipakai).
 */
let dir: string;
let now = 0;
beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), "dd-order-cache-")), "order");
  now = 1_000_000;
});
afterEach(() => rmSync(join(dir, ".."), { recursive: true, force: true }));

const meta = (over: Partial<OrderMeta> = {}): OrderMeta => ({
  sheetId: "s1",
  versionId: "v1",
  schemaRevision: 1,
  typedKeys: ["seg/a/typed-1.parquet"],
  ...over,
});
const write = (bytes: number) => async (file: string) => {
  writeFileSync(file, Buffer.alloc(bytes));
  return { rows: 10, total: 20 };
};
const cache = (maxBytes = 1_000, ttlMs = 30 * 60 * 1000) =>
  new OrderCache({ dir, maxBytes, ttlMs, now: () => now });

describe("OrderCache", () => {
  it("direktori dikosongkan saat dibuat (indeks hanya di memori)", () => {
    const c1 = cache();
    writeFileSync(join(dir, "sisa.parquet"), "x");
    cache();
    expect(readdirSync(dir)).toEqual([]);
    expect(c1.size).toBe(0);
  });

  it("perm dibangun sekali (single-flight) dan dicatat byte-nya", async () => {
    const c = cache();
    let calls = 0;
    const build = async (file: string) => {
      calls++;
      return write(100)(file);
    };
    const [a, b] = await Promise.all([
      c.buildPerm("k1", meta(), 10, build),
      c.buildPerm("k1", meta(), 10, build),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(c.bytes).toBe(100);
    expect(c.lookup("k1")).toMatchObject({ rows: 10, total: 20, chunkRows: 10 });
  });

  it("anggaran penuh: entri yang paling lama tidak dipakai dibuang, berkasnya dihapus", async () => {
    const c = cache(250);
    const a = (await c.buildPerm("a", meta(), 10, write(100)))!;
    now += 1;
    await c.buildPerm("b", meta(), 10, write(100));
    now += 1;
    c.lookup("a"); // a dipakai lagi → b paling lama
    now += 1;
    await c.buildPerm("c", meta(), 10, write(100));
    expect(c.lookup("b")).toBeNull();
    expect(c.lookup("a")).toBe(a);
    expect(c.lookup("c")).not.toBeNull();
    expect(c.bytes).toBe(200);
    expect(readdirSync(dir)).toHaveLength(2);
  });

  it("entri yang sedang dibaca tidak dibuang; potongan tanpa pin dibuang dulu", async () => {
    const c = cache(250);
    const a = (await c.buildPerm("a", meta(), 10, write(100)))!;
    const release = c.pin(a);
    const k0 = (await c.buildChunk(a, 0, [1, 2], async (f) => writeFileSync(f, Buffer.alloc(60))))!;
    c.unpin(k0);
    now += 1;
    const k1 = (await c.buildChunk(a, 1, [1, 2], async (f) => writeFileSync(f, Buffer.alloc(60))))!;
    // 100 + 60 + 60 = 220 ≤ 250; entri baru 100 → 320: entri a dipin, jadi b sendiri dibuang dulu.
    now += 1;
    await c.buildPerm("b", meta(), 10, write(100));
    expect(c.lookup("a")).toBe(a);
    expect(c.lookup("b")).toBeNull();
    // Potongan 0 (tanpa pin) dibuang saat anggaran terlewati lagi; potongan 1 dipin pemanggil.
    const k2 = (await c.buildChunk(a, 2, [1], async (f) => writeFileSync(f, Buffer.alloc(60))))!;
    expect(existsSync(k0.file)).toBe(false);
    expect(c.chunk(a, 0, [1])).toBeNull();
    expect(existsSync(k1.file)).toBe(true);
    expect(existsSync(k2.file)).toBe(true);
    c.unpin(k1);
    c.unpin(k2);
    release();
    expect(c.bytes).toBeLessThanOrEqual(250);
  });

  it("potongan dengan kolom lebih banyak dipakai untuk permintaan kolom lebih sedikit", async () => {
    const c = cache();
    const a = (await c.buildPerm("a", meta(), 10, write(10)))!;
    const k = (await c.buildChunk(a, 3, [5, 1, 2], async (f) => writeFileSync(f, "x")))!;
    c.unpin(k);
    expect(c.chunk(a, 3, [2, 5])).toBe(k);
    expect(c.chunk(a, 3, [2, 6])).toBeNull();
    expect(c.chunk(a, 4, [1])).toBeNull();
  });

  it("TTL: entri tidak dipakai > 30 menit dibuang; yang dibaca menunggu dilepas", async () => {
    const c = cache();
    const a = (await c.buildPerm("a", meta(), 10, write(10)))!;
    const b = (await c.buildPerm("b", meta(), 10, write(10)))!;
    const release = c.pin(b);
    now += 30 * 60 * 1000 + 1;
    c.sweep();
    expect(c.lookup("a")).toBeNull();
    expect(existsSync(a.dir)).toBe(false);
    expect(c.lookup("b")).toBe(b);
    release();
    now += 30 * 60 * 1000 + 1;
    expect(c.lookup("b")).toBeNull();
    expect(existsSync(b.dir)).toBe(false);
  });

  it("versi/revisi berganti: entri sheet itu yang lama dibuang, sheet lain tetap", async () => {
    const c = cache();
    await c.buildPerm("v1r1", meta(), 10, write(10));
    await c.buildPerm("v1r2", meta({ schemaRevision: 2 }), 10, write(10));
    await c.buildPerm("lain", meta({ sheetId: "s2" }), 10, write(10));
    c.invalidate("s1", "v1", 2);
    expect(c.lookup("v1r1")).toBeNull();
    expect(c.lookup("v1r2")).not.toBeNull();
    c.invalidate("s1", "v2", 1);
    expect(c.lookup("v1r2")).toBeNull();
    expect(c.lookup("lain")).not.toBeNull();
    c.invalidate("s2", null);
    expect(c.size).toBe(0);
    expect(c.bytes).toBe(0);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("entri yang dibuang selagi dibaca: berkas dihapus setelah pin terakhir dilepas", async () => {
    const c = cache();
    const a = (await c.buildPerm("a", meta(), 10, write(10)))!;
    const release = c.pin(a);
    c.invalidate("s1", null);
    expect(c.lookup("a")).toBeNull();
    expect(existsSync(a.perm)).toBe(true);
    release();
    release(); // sekali saja
    expect(existsSync(a.dir)).toBe(false);
  });

  it("potongan yang selesai setelah entrinya dibuang tidak disimpan", async () => {
    const c = cache();
    const a = (await c.buildPerm("a", meta(), 10, write(10)))!;
    const k = await c.buildChunk(a, 0, [1], async (f) => {
      writeFileSync(f, "x");
      c.invalidate("s1", null);
    });
    expect(k).toBeNull();
    expect(c.bytes).toBe(0);
    expect(existsSync(a.dir)).toBe(false);
  });

  it("data dihapus (forget): entri dari file typed itu dibuang", async () => {
    const c = cache();
    await c.buildPerm("a", meta({ typedKeys: ["seg/x.parquet", "seg/y.parquet"] }), 10, write(10));
    await c.buildPerm("b", meta({ typedKeys: ["seg/z.parquet"] }), 10, write(10));
    c.forget(["seg/y.parquet"]);
    expect(c.lookup("a")).toBeNull();
    expect(c.lookup("b")).not.toBeNull();
  });

  it("perm lebih besar dari anggaran atau gagal dibangun: tidak ada entri, tidak ada berkas", async () => {
    const c = cache(50);
    expect(await c.buildPerm("besar", meta(), 10, write(100))).toBeNull();
    await expect(
      c.buildPerm("gagal", meta(), 10, async () => {
        throw new Error("duckdb");
      }),
    ).rejects.toThrow("duckdb");
    expect(await c.buildPerm("sibuk", meta(), 10, async () => null)).toBeNull();
    expect(c.size).toBe(0);
    expect(readdirSync(dir)).toEqual([]);
    expect(c.buildingPerm).toBe(false);
  });
});
