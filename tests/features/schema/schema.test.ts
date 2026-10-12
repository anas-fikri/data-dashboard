import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { PREVIEW_CHARS, PREVIEW_COLS, previewOf } from "@/features/ingest/preview";
import type { QueryDeps, QueryRepo } from "@/features/query/service";
import {
  changedColumns,
  ingestStatus,
  recastStatus,
  requestRecast,
  SAMPLE_COLS,
  SAMPLE_ROWS,
  SAMPLE_TEXT_CHARS,
  sampleRows,
  sampleSql,
  type RecastJobView,
  type SchemaDeps,
  type SchemaRepo,
} from "@/features/schema/service";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-008: pratinjau baris mentah, sampel typed, permintaan dan status koreksi skema. Mesin DuckDB dan
 * cache parquet sungguhan; DB, antrean, dan Redis palsu.
 */
const USER = "user-pemilik";
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const WIDE = "cmv4kljx40009oczvdmpurrxw";

const col = (
  pos: number,
  name: string,
  type: ColumnSchema["type"],
  hidden = false,
): ColumnSchema => ({
  pos,
  name,
  original: name,
  type,
  hidden,
  nullPct: 0,
  distinctCount: 0,
  castFailCount: 0,
});
const SCHEMA = [col(1, "Kota", "text"), col(2, "Tanggal", "date"), col(3, "Total", "decimal")];
const WIDE_SCHEMA = Array.from({ length: 70 }, (_, i) => col(i + 1, `K${i + 1}`, "integer"));

let root: string;
let engine: QueryEngine;
let parquet: ParquetCache;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-schema-test-"));
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    `COPY (SELECT (i + 4)::INTEGER AS _row,
                  repeat('k', 300) || i AS c1,
                  DATE '2025-12-31' + CAST(i AS INTEGER) AS c2,
                  CAST(i * 1.5 AS DECIMAL(38,6)) AS c3
           FROM range(500) t(i)) TO '${join(root, "typed.parquet")}' (FORMAT parquet)`,
  );
  const wideCols = Array.from({ length: 70 }, (_, i) => `i + ${i} AS c${i + 1}`).join(", ");
  await c.run(
    `COPY (SELECT (i + 2)::INTEGER AS _row, ${wideCols} FROM range(80) t(i))
     TO '${join(root, "wide.parquet")}' (FORMAT parquet)`,
  );
  c.closeSync();
  db.closeSync();
  engine = await QueryEngine.create({
    dataDir: join(root, "cache"),
    tmpDir: join(root, "duck-tmp"),
    memoryLimit: "256MB",
    threads: 2,
    maxTempSize: "256MB",
    maxConcurrency: 2,
    perUser: 2,
    queueWaitMs: 1_000,
  });
  parquet = new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    download: async (key, dest) => {
      const { copyFileSync } = await import("node:fs");
      copyFileSync(join(root, key), dest);
    },
  });
});
afterAll(() => {
  engine?.close();
  rmSync(root, { recursive: true, force: true });
});

function queryDeps(): QueryDeps {
  const repo: QueryRepo = {
    ownedDataset: async (userId, datasetId) =>
      userId === USER && datasetId === DS ? { activeVersionId: VER } : null,
    sheet: async (versionId, sheetId) => {
      if (versionId !== VER) return null;
      if (sheetId === SHEET)
        return { typedKey: "typed.parquet", schemaRevision: 1, schema: SCHEMA };
      if (sheetId === WIDE)
        return { typedKey: "wide.parquet", schemaRevision: 1, schema: WIDE_SCHEMA };
      return null;
    },
  };
  return { repo, parquet, engine, cache: null, timeoutMs: 10_000 };
}

describe("pratinjau baris mentah (dipakai memilih baris header)", () => {
  it("urut nomor baris, dibatasi kolom dan panjang sel; tanggal/angka/boolean jadi teks", () => {
    const vals = [
      "x".repeat(500),
      42,
      true,
      new Date(Date.UTC(2025, 11, 31)),
      null,
      ...Array.from({ length: 80 }, (_, i) => `k${i}`),
    ];
    const p = previewOf(
      [
        { row: 5, vals },
        { row: 1, vals: ["Judul laporan"] },
      ],
      vals.length,
    );
    expect(p.colCount).toBe(vals.length);
    expect(p.rows.map((r) => r.row)).toEqual([1, 5]);
    expect(p.rows[0]!.cells).toHaveLength(PREVIEW_COLS);
    expect(p.rows[0]!.cells.slice(0, 2)).toEqual(["Judul laporan", null]);
    expect(p.rows[1]!.cells.slice(0, 5)).toEqual([
      "x".repeat(PREVIEW_CHARS),
      "42",
      "TRUE",
      "2025-12-31",
      null,
    ]);
  });
});

describe("AC 2: sampel 50 baris typed", () => {
  it("SQL sampel hanya memakai posisi dari skema; teks dipotong", () => {
    expect(
      sampleSql([
        { pos: 1, type: "text" },
        { pos: 3, type: "decimal" },
      ]),
    ).toBe(
      `SELECT _row, left(c1, ${SAMPLE_TEXT_CHARS}) AS c1, c3 FROM read_parquet($path) LIMIT ${SAMPLE_ROWS}`,
    );
  });

  it("50 baris pertama urut nomor baris, nilai siap tampil (tanggal ISO, teks ≤ 200)", async () => {
    const r = await sampleRows(USER, DS, SHEET, queryDeps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.columns.map((c) => c.name)).toEqual(["Kota", "Tanggal", "Total"]);
    expect(r.rows).toHaveLength(SAMPLE_ROWS);
    expect(r.rows.map((x) => x[0])).toEqual(Array.from({ length: 50 }, (_, i) => i + 4));
    expect(r.rows[0]).toEqual([4, "k".repeat(SAMPLE_TEXT_CHARS), "2025-12-31", 0]);
    expect(r.rows[1]![2]).toBe("2026-01-01");
    expect(r.totalColumns).toBe(3);
  });

  it("sheet lebar: hanya 60 kolom pertama dikirim, jumlah total tetap dilaporkan", async () => {
    const r = await sampleRows(USER, DS, WIDE, queryDeps());
    expect(r).toMatchObject({ ok: true, totalColumns: 70 });
    if (!r.ok) return;
    expect(r.columns).toHaveLength(SAMPLE_COLS);
    expect(r.rows[0]).toHaveLength(SAMPLE_COLS + 1);
  });

  it("bukan pemilik, sheet dataset lain, atau id rusak → NOT_FOUND; belum ada typed → NOT_READY", async () => {
    const d = queryDeps();
    expect(await sampleRows("orang-lain", DS, SHEET, d)).toMatchObject({ code: "NOT_FOUND" });
    expect(await sampleRows(USER, DS, "cmv4kljx40009oczvdmpurrxz", d)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await sampleRows(USER, "../x", SHEET, d)).toMatchObject({ code: "NOT_FOUND" });
    const notReady: QueryDeps = {
      ...d,
      repo: { ...d.repo, sheet: async () => ({ typedKey: null, schemaRevision: 0, schema: null }) },
    };
    expect(await sampleRows(USER, DS, SHEET, notReady)).toMatchObject({ code: "NOT_READY" });
  });
});

describe("AC 1: status ingest", () => {
  it("id rusak → null tanpa menyentuh DB", async () => {
    const latestVersion = vi.fn();
    expect(await ingestStatus(USER, "x'; DROP", { latestVersion })).toBeNull();
    expect(latestVersion).not.toHaveBeenCalled();
  });
});

function schemaDeps(
  over: Partial<SchemaDeps> = {},
  sheet: Partial<Awaited<ReturnType<SchemaRepo["ownedActiveSheet"]>>> = {},
) {
  const enqueue = vi.fn(async () => "17");
  const repo: SchemaRepo = {
    latestVersion: async () => "none",
    schemaView: async () => null,
    ownedActiveSheet: async (userId, sheetId) =>
      userId === USER && sheetId === SHEET
        ? {
            colCount: 3,
            schemaRevision: 2,
            headerRow: 1,
            schema: SCHEMA,
            versionStatus: "READY",
            ...sheet,
          }
        : null,
  };
  const deps: SchemaDeps = {
    repo,
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    enqueue,
    job: async () => null,
    ...over,
  };
  return { deps, enqueue };
}

describe("AC 3–5: permintaan koreksi skema", () => {
  it("hanya kolom yang berubah yang dikirim ke antrean, beserta baseRevision", async () => {
    const { deps, enqueue } = schemaDeps();
    const r = await requestRecast(
      USER,
      SHEET,
      {
        baseRevision: 2,
        columns: [
          { pos: 1, name: "Kota Tujuan", type: "text" }, // tipe sama → hanya nama
          { pos: 2, type: "date", dateFormat: "dd-mm-yyyy" },
          { pos: 3, name: "Total" }, // tidak berubah
        ],
      },
      deps,
    );
    expect(r).toEqual({ ok: true, jobId: "17" });
    expect(enqueue).toHaveBeenCalledWith(SHEET, {
      baseRevision: 2,
      columns: [
        { pos: 1, name: "Kota Tujuan" },
        { pos: 2, dateFormat: "dd-mm-yyyy" },
      ],
    });
  });

  it("baris header baru dikirim tanpa edit kolom (nama dan tipe dibentuk ulang dari baris itu)", async () => {
    const { deps, enqueue } = schemaDeps();
    const r = await requestRecast(
      USER,
      SHEET,
      { baseRevision: 2, headerRow: 3, columns: [{ pos: 1, name: "X" }] },
      deps,
    );
    expect(r).toMatchObject({ ok: true });
    expect(enqueue).toHaveBeenCalledWith(SHEET, { baseRevision: 2, headerRow: 3 });
  });

  it("ditolak sebelum masuk antrean: bukan pemilik, belum siap, tidak valid, basi, tanpa perubahan, nama ganda", async () => {
    const { deps, enqueue } = schemaDeps();
    const body = { baseRevision: 2, columns: [{ pos: 1, name: "Baru" }] };
    expect(await requestRecast("orang-lain", SHEET, body, deps)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await requestRecast(USER, "bukan id", body, deps)).toMatchObject({ code: "NOT_FOUND" });
    const ingesting = schemaDeps({}, { versionStatus: "INGESTING" }).deps;
    expect(await requestRecast(USER, SHEET, body, ingesting)).toMatchObject({ code: "NOT_READY" });
    expect(
      await requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 1, type: "uang" }] },
        deps,
      ),
    ).toMatchObject({ code: "INVALID" });
    expect(
      await requestRecast(USER, SHEET, { baseRevision: 2, columns: [{ pos: 9, name: "X" }] }, deps),
    ).toMatchObject({ code: "INVALID" });
    expect(
      await requestRecast(USER, SHEET, { columns: [{ pos: 1, name: "X" }] }, deps),
    ).toMatchObject({ code: "INVALID" });
    expect(await requestRecast(USER, SHEET, { ...body, baseRevision: 1 }, deps)).toMatchObject({
      code: "STALE",
    });
    expect(
      await requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 1, name: "Kota" }] },
        deps,
      ),
    ).toMatchObject({ code: "NO_CHANGE" });
    expect(await requestRecast(USER, SHEET, { baseRevision: 2, headerRow: 1 }, deps)).toMatchObject(
      { code: "NO_CHANGE" },
    );
    expect(
      await requestRecast(
        USER,
        SHEET,
        { baseRevision: 2, columns: [{ pos: 3, name: "kota" }] },
        deps,
      ),
    ).toMatchObject({ code: "INVALID", message: expect.stringContaining("kota") });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rate limit per user → RATE_LIMITED dengan Retry-After, tanpa masuk antrean", async () => {
    const { deps, enqueue } = schemaDeps({
      rateLimit: async () => ({ allowed: false, retryAfterSec: 125 }),
    });
    const r = await requestRecast(
      USER,
      SHEET,
      { baseRevision: 2, columns: [{ pos: 1, name: "B" }] },
      deps,
    );
    expect(r).toMatchObject({ ok: false, code: "RATE_LIMITED", retryAfterSec: 125 });
    expect(r.ok ? "" : r.message).toMatch(/3 menit/);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("changedColumns membuang kolom yang tidak berubah dan posisi yang tidak dikenal tetap diteruskan", () => {
    expect(
      changedColumns(SCHEMA, [
        { pos: 1, name: " Kota " },
        { pos: 3, hidden: true },
      ]),
    ).toEqual([{ pos: 3, hidden: true }]);
  });
});

describe("status koreksi skema (polling)", () => {
  const job = (v: Partial<RecastJobView>): RecastJobView => ({
    sheetId: SHEET,
    state: "completed",
    result: null,
    ...v,
  });
  const status = (j: RecastJobView | null, jobId = "17") =>
    recastStatus(USER, SHEET, jobId, schemaDeps({ job: async () => j }).deps);

  it("antre/jalan/selesai/basi/tidak valid/gagal dipetakan untuk UI", async () => {
    expect(await status(job({ state: "waiting" }))).toEqual({
      ok: true,
      status: { state: "queued" },
    });
    expect(await status(job({ state: "delayed" }))).toEqual({
      ok: true,
      status: { state: "queued" },
    });
    expect(await status(job({ state: "active" }))).toEqual({
      ok: true,
      status: { state: "running" },
    });
    expect(await status(job({ result: { outcome: "done", revision: 3 } }))).toEqual({
      ok: true,
      status: { state: "done", revision: 3 },
    });
    expect(await status(job({ result: { outcome: "stale" } }))).toMatchObject({
      status: { state: "stale" },
    });
    expect(
      await status(job({ result: { outcome: "invalid", message: "Nama kolom ganda" } })),
    ).toMatchObject({ status: { state: "invalid", message: "Nama kolom ganda" } });
    expect(await status(job({ state: "failed" }))).toMatchObject({ status: { state: "failed" } });
    expect(await status(null)).toEqual({ ok: true, status: { state: "unknown" } });
  });

  it("job milik sheet lain, id job rusak, atau sheet bukan milik user → NOT_FOUND", async () => {
    expect(await status(job({ sheetId: "cmv4kljx40009oczvdmpurrxq" }))).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await status(job({}), "abc")).toMatchObject({ code: "NOT_FOUND" });
    const other = await recastStatus("orang-lain", SHEET, "17", schemaDeps().deps);
    expect(other).toMatchObject({ code: "NOT_FOUND" });
  });
});
