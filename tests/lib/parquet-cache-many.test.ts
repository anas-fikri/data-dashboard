import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DownloadPendingError, ParquetCache } from "@/lib/duckdb/parquet-cache";

/* T-037: sewa batch segmen (acquireMany) — satu admission, tanpa sewa yang tertahan. */
const root = mkdtempSync(join(tmpdir(), "dd-cache-many-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const files = (dir: string) => readdirSync(dir).filter((n) => n.endsWith(".parquet"));

function cache(delayMs: number, perOwnerDownloads = 1) {
  const dir = mkdtempSync(join(root, "c-"));
  const downloads: string[] = [];
  const c = new ParquetCache({
    dir,
    maxBytes: 1 << 20,
    maxDownloads: 2,
    perOwnerDownloads,
    download: async (key, dest) => {
      downloads.push(key);
      await wait(delayMs);
      writeFileSync(dest, `isi ${key}`);
    },
  });
  return { c, dir, downloads };
}

describe("ParquetCache.acquireMany", () => {
  it("path urut kunci; yang sudah ada tidak diunduh ulang; release melepas semuanya", async () => {
    const { c, dir, downloads } = cache(1);
    (await c.acquire("a")).release();
    const l = await c.acquireMany(["b", "a", "c"], { owner: "u" });
    expect(l.paths).toHaveLength(3);
    expect(downloads.sort()).toEqual(["a", "b", "c"]);
    expect(l.paths.every((p) => existsSync(p))).toBe(true);
    l.release();
    // Tidak tersewa lagi: forget membuang file seketika.
    for (const k of ["a", "b", "c"]) c.forget(k);
    expect(files(dir)).toEqual([]);
  });

  it("satu admission: 10 file dingin dengan perOwnerDownloads 1 tidak DownloadPendingError", async () => {
    const { c } = cache(2, 1);
    const keys = Array.from({ length: 10 }, (_, i) => `k${i}`);
    const l = await c.acquireMany(keys, { owner: "u" });
    expect(l.paths).toHaveLength(10);
    l.release();
    expect(c.activeDownloads).toBe(0);
  });

  it("menyerah karena waitMs → DownloadPendingError; unduhan berlanjut tetapi tidak ada sewa yang tertahan", async () => {
    const { c, dir } = cache(40);
    await expect(c.acquireMany(["x", "y"], { owner: "u", waitMs: 5 })).rejects.toBeInstanceOf(
      DownloadPendingError,
    );
    await wait(80);
    expect(files(dir)).toHaveLength(2); // unduhan selesai di background (dipakai permintaan berikut)
    c.forget("x");
    c.forget("y");
    expect(files(dir)).toEqual([]); // refs 0: tidak ada sewa yatim yang menahan file
  });
});
