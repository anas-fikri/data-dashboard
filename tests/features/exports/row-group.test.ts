import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openExportDuck, rowGroupOf } from "@/features/exports/job";
import type { Duck } from "@/lib/duckdb";

/*
 * Review T-017 INT-R4-1: parquet kerja XLSX memakai row group typed.parquet sumber (ingest sudah
 * menyesuaikannya dengan lebar baris), bukan bawaan DuckDB 122.880 baris yang OOM untuk teks panjang.
 */
let work = "";
let duck: Duck | null = null;

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "rowgroup-"));
  duck = await openExportDuck(work);
});

afterAll(async () => {
  duck?.close();
  rmSync(work, { recursive: true, force: true });
});

describe("rowGroupOf", () => {
  it("mengikuti row group sumber (2.048 baris per grup → 2.048)", async () => {
    // DuckDB menulis row group dalam kelipatan vektor (2.048 baris), seperti ingest (rowGroupFor).
    const src = join(work, "lebar.parquet");
    await duck!.conn.run(
      `COPY (SELECT i, repeat('x', 300) AS t FROM range(5000) r(i)) TO '${src}' (FORMAT parquet, ROW_GROUP_SIZE 2048)`,
    );
    expect(await rowGroupOf(duck!.conn, src)).toBe(2048);
  });

  it("file kecil satu grup → jumlah barisnya; tidak pernah di atas bawaan 122.880", async () => {
    const src = join(work, "kecil.parquet");
    await duck!.conn.run(
      `COPY (SELECT i FROM range(40) r(i)) TO '${src}' (FORMAT parquet, ROW_GROUP_SIZE 1000000)`,
    );
    const n = await rowGroupOf(duck!.conn, src);
    expect(n).toBe(40);
    expect(n).toBeLessThanOrEqual(122_880);
  });
});
