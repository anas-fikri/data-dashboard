import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, describe, expect, it } from "vitest";
import { runGridRows, type GridDeps } from "@/features/query/grid-service";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";
import { generateGridData, gridSchema, ROW_BASE_STEP } from "../../scripts/perf-grid-data";

/*
 * Fixture perf "Lihat data" (T-061): tata letak typed ingest (`_row` = rowBase + baris fisik, `_src_row`,
 * `_period` per segmen bulanan) harus terbaca jalur grid sungguhan — kalau tidak, angka perf/seed mengukur
 * data yang tidak pernah ada di produksi.
 */
const dir = mkdtempSync(join(tmpdir(), "dd-perf-grid-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("perf-grid-data", () => {
  it("membangkitkan segmen bulanan bertata letak typed dan terbaca runGridRows", async () => {
    const data = await generateGridData({ dir, rows: 1000, segs: 3, layout: "period" });
    expect(data.segments.map((s) => [s.dataRows, s.rowBase, s.maxSrcRow, s.period?.key])).toEqual([
      [334, 0, 335, "2024-01"],
      [334, ROW_BASE_STEP, 335, "2024-02"],
      [332, 2 * ROW_BASE_STEP, 333, "2024-03"],
    ]);
    const db = await DuckDBInstance.create(":memory:");
    const c = await db.connect();
    const r = await c.runAndReadAll(
      `SELECT min(_row), max(_src_row), min(_period)::VARCHAR, min(c1), count(*) FROM read_parquet('${join(data.dir, "seg-1.parquet")}')`,
    );
    c.closeSync();
    db.closeSync();
    expect(r.getRows()[0]!.map(String)).toEqual([
      String(ROW_BASE_STEP + 2),
      "335",
      "2024-02-01",
      "PCP00000000334",
      "334",
    ]);

    const engine = await QueryEngine.create({
      dataDir: join(dir, "cache"),
      tmpDir: join(dir, "tmp"),
      memoryLimit: "256MB",
      threads: 1,
      maxTempSize: "1GB",
      maxConcurrency: 2,
      perUser: 2,
      queueWaitMs: 5_000,
    });
    const cache = new ParquetCache({
      dir: join(dir, "cache"),
      maxBytes: 2 ** 30,
      maxDownloads: 2,
      download: async (key, dest) => copyFileSync(join(data.dir, key), dest),
    });
    const V = "cmv4kljx40009oczvdtestver1";
    const deps: GridDeps = {
      repo: {
        sheet: async () => ({
          versionId: V,
          versionStatus: "READY",
          activeVersionId: V,
          role: "OWNER",
          typedKey: data.segments[0]!.typedKey,
          rawKey: "-",
          fileName: null,
          schemaRevision: 1,
          schema: gridSchema,
          segments: data.segments,
          period: { grain: "MONTH", column: null },
        }),
      },
      parquet: cache,
      engine,
      timeoutMs: 30_000,
    };
    try {
      const sheet = "cmv4kljx40009oczvdtestsht1";
      // Jalur 1 (tanpa urut) lintas batas segmen: nomor tampil = indeks global.
      const plain = await runGridRows(
        "u",
        sheet,
        { versionId: V, rowStart: 330, rowCount: 8, cols: [1, 2] },
        deps,
      );
      expect(plain.ok && plain.rows.map((x) => x.cells[0])).toEqual(
        Array.from({ length: 8 }, (_, i) => `PCP${String(330 + i).padStart(11, "0")}`),
      );
      // Jalur 2 (urut + saring periode): baris terakhir sheet di atas.
      const sorted = await runGridRows(
        "u",
        sheet,
        { versionId: V, rowStart: 0, rowCount: 2, cols: [1], sort: [{ pos: 1, dir: "desc" }] },
        deps,
      );
      expect(sorted.ok && [sorted.total, sorted.rows[0]!.cells[0]]).toEqual([
        1000,
        "PCP00000000999",
      ]);
    } finally {
      engine.close();
    }
  });
});
