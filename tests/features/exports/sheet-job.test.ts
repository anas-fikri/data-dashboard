import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  maxRowsFor,
  runExportJob,
  type ExportJobDeps,
  type ExportJobRow,
} from "@/features/exports/job";
import type { SheetExportParams } from "@/features/exports/schema";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache } from "@/features/query/cache";
import type { RowsBody } from "@/features/query/grid";
import {
  runGridRows,
  type GridDeps,
  type GridSegment,
  type GridSheet,
} from "@/features/query/grid-service";
import type { CachedQuery } from "@/features/query/service";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";
import { createSaxParser } from "@/lib/xlsx/parser";
import type { RawValue } from "@/lib/xlsx/types";
import { parseCsv } from "./fixtures";

/*
 * T-046 AC1: "Unduh tampilan" menghasilkan file dengan kolom, urutan, dan baris SAMA dengan grid. Fixture
 * 1.000 baris dalam 3 segmen (legacy `_row INTEGER`, segmen tanpa kolom Tanggal, segmen biasa); harapan
 * diambil dari runGridRows (mesin DuckDB + cache parquet sungguhan) untuk tampilan yang sama, lalu
 * dibandingkan dengan isi file job ekspor (repo/storage palsu, DuckDB ekspor sungguhan). AC2: batas
 * baris → EXPORT_TOO_LARGE tanpa file; AC3: viewer → FORBIDDEN di worker.
 */

const SHEET = "cmv4kljx40009oczvdsheetx1";
const VER = "cmv4kljx40009oczvdsheetv1";
const OTHER_VER = "cmv4kljx40009oczvdsheetv2";
const EXPORT_ID = "cmv4kljx40009oczvdsheete1";
const OWNER = "cmv4kljx40009oczvdsheetow";
const EDITOR = "cmv4kljx40009oczvdsheeted";
const VIEWER = "cmv4kljx40009oczvdsheetvw";
const SECRET = "GajiRahasia";

const col = (pos: number, name: string, type: ColumnSchema["type"], hidden = false) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;
const SCHEMA: ColumnSchema[] = [
  col(1, "Nama", "text"),
  col(2, "Jumlah", "integer"),
  col(3, "Harga", "decimal"),
  col(4, "Tanggal", "date"),
  col(5, SECRET, "text", true),
];
// rowBase segmen 2 < segmen 1: urutan manifest (jalur polos grid) ≠ urutan `_row` — ekspor harus
// mengikuti grid, bukan ORDER BY _row.
const SEGS = [
  { rows: 400, rowBase: 0, legacy: true, c4: true },
  { rows: 300, rowBase: 9000, legacy: false, c4: false },
  { rows: 300, rowBase: 5000, legacy: false, c4: true },
];
const TOTAL = SEGS.reduce((a, s) => a + s.rows, 0);

/** Teks dengan awalan formula, koma, kutip, dan baris baru di sebagian baris. */
function nama(k: number, i: number): string | null {
  const m = (i + k * 3) % 50;
  if (m === 0) return "=SUM(A1:A9)";
  if (m === 1) return "-tidak ada";
  if (m === 2) return "@cmd";
  if (m === 3) return 'Toko "A", Jalan\nB';
  if (m === 4) return null;
  return `Cabang ${(i * 7 + k) % 13}`;
}

let root: string;
let engine: QueryEngine;
const segments: GridSegment[] = [];

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-sheet-export-"));
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  for (const [k, s] of SEGS.entries()) {
    const values = Array.from({ length: s.rows }, (_, i) => {
      const t = nama(k, i);
      const lit = t === null ? "NULL" : `'${t.replace(/'/g, "''")}'`;
      return `(${i}, ${lit})`;
    }).join(", ");
    await c.run(`CREATE OR REPLACE TABLE d AS SELECT * FROM (VALUES ${values}) v(i, t)`);
    const row = s.legacy
      ? "(i + 2)::INTEGER AS _row"
      : `(${s.rowBase} + i + 2)::BIGINT AS _row, (i + 2)::INTEGER AS _src_row`;
    const c4 = s.c4 ? `, DATE '2026-01-01' + ((i * 5 + ${k}) % 90) AS c4` : "";
    await c.run(
      `COPY (SELECT ${row}, t AS c1, ((i * 37 + ${k} * 11) % 201 - 100)::BIGINT AS c2,
              CAST(((i * 13 + ${k}) % 1000) / 8.0 AS DECIMAL(38,6)) AS c3${c4}, 'rahasia' AS c5
            FROM d ORDER BY i)
       TO '${join(root, `typed-${k}.parquet`)}' (FORMAT parquet)`,
    );
    segments.push({
      typedKey: `typed-${k}.parquet`,
      legacyRow: s.legacy,
      columns: s.c4 ? [1, 2, 3, 4, 5] : [1, 2, 3, 5],
      dataRows: s.rows,
      rowBase: s.rowBase,
      maxSrcRow: s.rows + 1,
      rawKey: `raw-${k}.parquet`,
      colMap: [],
      fileName: `file-${k}.xlsx`,
    });
  }
  c.closeSync();
  db.closeSync();
  engine = await QueryEngine.create({
    dataDir: join(root, "cache"),
    tmpDir: join(root, "duck-tmp"),
    memoryLimit: "256MB",
    threads: 2,
    maxTempSize: "1GB",
    maxConcurrency: 4,
    perUser: 4,
    queueWaitMs: 2_000,
  });
});
afterAll(() => {
  engine?.close();
  rmSync(root, { recursive: true, force: true });
});

function sheet(over: Partial<GridSheet> = {}): GridSheet {
  return {
    versionId: VER,
    versionStatus: "READY",
    activeVersionId: VER,
    role: "OWNER",
    datasetId: "cmv4kljx40009oczvdsheetd1",
    title: "Penjualan - Maret",
    typedKey: "typed-0.parquet",
    rawKey: "raw-0.parquet",
    fileName: "file-0.xlsx",
    schemaRevision: 2,
    schema: SCHEMA,
    segments,
    ...over,
  };
}

const roleSheet = (u: string): GridSheet | null =>
  u === OWNER
    ? sheet()
    : u === EDITOR
      ? sheet({ role: "EDITOR" })
      : u === VIEWER
        ? sheet({ role: null })
        : null;

function gridDeps(): GridDeps {
  const parquet = new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    maxDownloads: 2,
    download: async (key, dest) => copyFileSync(join(root, key), dest),
  });
  return {
    repo: { sheet: async (u) => roleSheet(u) },
    parquet,
    engine,
    timeoutMs: 30_000,
    cache: new ResultCache<CachedQuery>(1 << 20),
    now: () => new Date("2026-03-15T03:00:00Z"),
  };
}

type View = Omit<SheetExportParams, "requestedAt" | "versionId">;

/** Semua baris tampilan dari grid (blok 500 = batas server), sel per kolom `cols`. */
async function gridRows(view: View): Promise<unknown[][]> {
  const out: unknown[][] = [];
  for (let start = 0; ; start += 500) {
    const body: RowsBody = { versionId: VER, rowStart: start, rowCount: 500, ...view };
    const r = await runGridRows(OWNER, SHEET, body, gridDeps());
    if (!r.ok) throw new Error(`grid gagal: ${r.code}`);
    out.push(...r.rows.map((x) => x.cells));
    if (start + 500 >= r.filteredTotal) return out;
  }
}

function setup(
  over: {
    userId?: string;
    format?: "CSV" | "XLSX";
    view?: View;
    versionId?: string;
    deps?: Partial<ExportJobDeps>;
  } = {},
) {
  const tmpRoot = mkdtempSync(join(root, "tmp-"));
  const stored = mkdtempSync(join(root, "s3-"));
  const params: SheetExportParams = {
    versionId: over.versionId ?? VER,
    cols: [1, 2, 3, 4],
    ...over.view,
    requestedAt: "2026-03-15T03:00:00.000Z",
  };
  const row: ExportJobRow = {
    id: EXPORT_ID,
    userId: over.userId ?? OWNER,
    dashboardId: null,
    widgetId: null,
    sheetId: SHEET,
    format: over.format ?? "CSV",
    status: "QUEUED",
    params,
    fileName: "Penjualan - Maret-20260315-1000.csv",
    key: null,
    title: null,
  };
  const state: {
    status: string;
    failed?: { code: string; message: string };
    done?: { key: string; expiresAt: Date; finishedAt: Date; rows: number | null };
  } = { status: "QUEUED" };
  const objects = new Map<string, string>();
  const repo = {
    load: vi.fn(async () => ({
      ...row,
      status: state.status as ExportJobRow["status"],
      key: state.done?.key ?? null,
    })),
    start: vi.fn(async () => {
      if (state.status !== "QUEUED" && state.status !== "RUNNING") return false;
      state.status = "RUNNING";
      return true;
    }),
    finish: vi.fn(async (_id: string, done: NonNullable<typeof state.done>) => {
      if (state.status !== "RUNNING") return false;
      state.status = "DONE";
      state.done = done;
      return true;
    }),
    fail: vi.fn(async (_id: string, code: string, message: string) => {
      state.status = "FAILED";
      state.failed = { code, message };
    }),
    exists: vi.fn(async () => true),
  };
  const downloaded: string[] = [];
  const storage = {
    download: vi.fn(async (key: string, dest: string) => {
      downloaded.push(key);
      copyFileSync(join(root, key), dest);
    }),
    upload: vi.fn(async (key: string, path: string) => {
      const to = join(stored, key.replace(/\//g, "_"));
      copyFileSync(path, to);
      objects.set(key, to);
    }),
    remove: vi.fn(async () => {}),
  };
  const deps: ExportJobDeps = {
    repo,
    query: { repo: {} as ExportJobDeps["query"]["repo"] },
    grid: { sheet: async (u) => roleSheet(u) },
    storage,
    scheduleDelete: vi.fn(async () => {}),
    tmpRoot,
    maxRows: 1_000_000,
    ttlMs: 60 * 60 * 1000,
    deadlineMs: 60_000,
    now: () => new Date("2026-03-15T03:01:00.000Z"),
    ...over.deps,
  };
  return { deps, repo, storage, state, objects, tmpRoot, downloaded };
}

/** Sel grid → teks CSV yang diharapkan (netralisasi formula teks, angka/tanggal apa adanya). */
function csvOf(v: unknown, type: ColumnSchema["type"]): string | null {
  if (v === null || v === undefined) return null;
  if (type === "text") return /^[=+\-@\t\r]/.test(String(v)) ? `'${v}` : String(v);
  if (type === "decimal") return String(Number(v));
  return String(v);
}

const typeOf = (pos: number) => SCHEMA.find((c) => c.pos === pos)!.type;

async function csvRows(t: ReturnType<typeof setup>) {
  const text = readFileSync(t.objects.get(`exports/${OWNER}/${EXPORT_ID}.csv`)!, "utf8");
  expect(text.startsWith("\uFEFF")).toBe(true);
  return parseCsv(text.slice(1));
}

const VIEWS: [string, View][] = [
  ["polos lintas 3 segmen (urutan manifest)", { cols: [1, 2, 3, 4] }],
  [
    "kolom digeser + kolom disembunyikan pengguna, urut 2 kunci, saringan",
    {
      cols: [3, 1, 2],
      sort: [
        { pos: 1, dir: "desc" },
        { pos: 2, dir: "asc" },
      ],
      filters: [{ pos: 2, op: "range", gte: -50, lte: 60 }],
    },
  ],
  [
    "cari teks + saringan tanggal + urut angka turun",
    {
      cols: [4, 1, 2],
      sort: [{ pos: 2, dir: "desc" }],
      filters: [{ pos: 4, op: "range", gte: "2026-01-10", lte: "2026-02-20" }],
      search: { text: "cabang 1", cols: [1] },
    },
  ],
];

describe("T-046 AC1: file = grid (fixture 1.000 baris)", () => {
  it.each(VIEWS)("CSV %s: header, kolom, urutan, dan baris sama dengan grid", async (_n, view) => {
    const expected = await gridRows(view);
    expect(expected.length).toBeGreaterThan(0);
    const t = setup({ view });
    const r = await runExportJob(EXPORT_ID, t.deps);
    expect(r).toMatchObject({ outcome: "done", rows: expected.length });
    const lines = await csvRows(t);
    const names = new Map(SCHEMA.map((c) => [c.pos, c.name]));
    expect(lines[0]).toEqual(view.cols.map((p) => names.get(p)));
    expect(lines.slice(1)).toEqual(
      expected.map((cells) => cells.map((v, j) => csvOf(v, typeOf(view.cols[j]!)))),
    );
    // Kolom tersembunyi tidak pernah ikut (isi maupun nama).
    expect(readFileSync(t.objects.get(`exports/${OWNER}/${EXPORT_ID}.csv`)!, "utf8")).not.toMatch(
      /rahasia|GajiRahasia/,
    );
    expect(readdirSync(t.tmpRoot)).toEqual([]);
  });

  it("tampilan polos memuat seluruh 1.000 baris dan ketiga segmen diunduh", async () => {
    const t = setup();
    expect(await runExportJob(EXPORT_ID, t.deps)).toMatchObject({ outcome: "done", rows: TOTAL });
    expect(t.downloaded).toEqual(["typed-0.parquet", "typed-1.parquet", "typed-2.parquet"]);
  });

  it("DONE dengan kedaluwarsa 60 menit (tautan presigned dibatasi sisa umur ini)", async () => {
    const t = setup();
    await runExportJob(EXPORT_ID, t.deps);
    expect(t.state.done).toMatchObject({
      key: `exports/${OWNER}/${EXPORT_ID}.csv`,
      finishedAt: new Date("2026-03-15T03:01:00.000Z"),
      expiresAt: new Date("2026-03-15T04:01:00.000Z"),
    });
  });

  it("XLSX: sel bertipe, teks formula tetap string, sheet bernama judul, baris = grid", async () => {
    const view = VIEWS[1]![1];
    const expected = await gridRows(view);
    const t = setup({ format: "XLSX", view });
    expect(await runExportJob(EXPORT_ID, t.deps)).toMatchObject({
      outcome: "done",
      rows: expected.length,
    });
    const rows: RawValue[][] = [];
    await createSaxParser().parse(
      t.objects.get(`exports/${OWNER}/${EXPORT_ID}.xlsx`)!,
      { sheetNames: ["Penjualan - Maret"], tmpDir: root },
      (_s, _n, v) => rows.push([...v]),
    );
    expect(rows[0]).toEqual(["Harga", "Nama", "Jumlah"]);
    expect(rows.length).toBe(expected.length + 1);
    const norm = (v: unknown) =>
      v === null || v === undefined || v === "" ? null : typeof v === "string" ? v : Number(v);
    expect(rows.slice(1).map((r) => r.map(norm))).toEqual(
      expected.map((cells) => cells.map((v) => (typeof v === "string" ? v : norm(v)))),
    );
    expect(rows.slice(1).some((r) => r[1] === "=SUM(A1:A9)")).toBe(true);
  });
});

describe("T-046 AC2: batas baris — file tidak pernah dipotong diam-diam", () => {
  it("CSV melewati batas → EXPORT_TOO_LARGE dengan batas + saran saring, tanpa unggah", async () => {
    const t = setup({ deps: { maxRows: 999 } });
    expect(await runExportJob(EXPORT_ID, t.deps)).toEqual({
      outcome: "failed",
      code: "EXPORT_TOO_LARGE",
    });
    expect(t.state.failed?.message).toBe(
      "Tampilan ini 1.000 baris, melebihi batas unduhan 999 baris. Saring data dulu lalu unduh lagi; file tidak pernah dipotong.",
    );
    expect(t.storage.upload).not.toHaveBeenCalled();
  });

  it("XLSX menyebut batas Excel 1.048.575 baris; tepat di batas tetap lolos utuh", async () => {
    const t = setup({ format: "XLSX", deps: { maxRows: 500 } });
    await runExportJob(EXPORT_ID, t.deps);
    expect(t.state.failed?.message).toContain(
      "File Excel (XLSX) paling banyak 1.048.575 baris data",
    );
    const ok = setup({ deps: { maxRows: TOTAL } });
    expect(await runExportJob(EXPORT_ID, ok.deps)).toMatchObject({ outcome: "done", rows: TOTAL });
  });

  it("batas efektif XLSX tidak pernah di atas 1.048.575", () => {
    expect(maxRowsFor("xlsx", 5_000_000)).toBe(1_048_575);
    expect(maxRowsFor("csv", 5_000_000)).toBe(5_000_000);
    expect(maxRowsFor("xlsx", 1_000_000)).toBe(1_000_000);
  });
});

describe("T-046 AC3 + akses dicek ulang di worker", () => {
  it("viewer → FORBIDDEN tanpa mengunduh data", async () => {
    const t = setup({ userId: VIEWER });
    expect(await runExportJob(EXPORT_ID, t.deps)).toEqual({ outcome: "failed", code: "FORBIDDEN" });
    expect(t.storage.download).not.toHaveBeenCalled();
  });

  it("editor boleh; pengguna asing → FORBIDDEN", async () => {
    expect(await runExportJob(EXPORT_ID, setup({ userId: EDITOR }).deps)).toMatchObject({
      outcome: "done",
    });
    expect(
      await runExportJob(EXPORT_ID, setup({ userId: "cmv4kljx40009oczvdsheetas" }).deps),
    ).toEqual({
      outcome: "failed",
      code: "FORBIDDEN",
    });
  });

  it("versi aktif berganti sejak diminta → VERSION_CHANGED (baris dua versi tidak tercampur)", async () => {
    const t = setup({ versionId: OTHER_VER });
    expect(await runExportJob(EXPORT_ID, t.deps)).toEqual({
      outcome: "failed",
      code: "VERSION_CHANGED",
    });
  });

  it("kolom tersembunyi skema di params → INVALID, tanpa unduh", async () => {
    const t = setup({ view: { cols: [1, 5] } });
    expect(await runExportJob(EXPORT_ID, t.deps)).toEqual({ outcome: "failed", code: "INVALID" });
    expect(t.state.failed?.message).not.toContain(SECRET);
    expect(t.storage.download).not.toHaveBeenCalled();
  });
});
