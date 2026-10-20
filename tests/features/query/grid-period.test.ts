import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { gridOrderSql, planGrid, type RowsBody } from "@/features/query/grid";
import {
  byPeriod,
  runGridCell,
  runGridRows,
  runGridStats,
  runGridValues,
  scopePeriods,
  type GridDeps,
  type GridSegment,
  type GridSheet,
} from "@/features/query/grid-service";
import { runExportJob, type ExportJobDeps, type ExportJobRow } from "@/features/exports/job";
import type { SheetExportParams } from "@/features/exports/schema";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";
import { parseCsv } from "../exports/fixtures";

/*
 * T-058 AC3/AC4: "Lihat data" pada sheet periode. Tiga segmen bulanan; Maret diunggah sebelum Februari
 * (rowBase Maret < Februari) dan Februari tanpa kolom c3 (skema campuran). Pemilih periode membatasi
 * manifest (total = baris periode di metadata), urutan bawaan = (_period, _row). DuckDB sungguhan.
 */
const SHEET = "cmv4kljx40009oczvdgridpe1";
const VER = "cmv4kljx40009oczvdgridpv1";
const OWNER = "cmv4kljx40009oczvdgridown";

const col = (pos: number, name: string, type: ColumnSchema["type"]) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden: false,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;
const SCHEMA: ColumnSchema[] = [
  col(1, "Cabang", "text"),
  col(2, "Jumlah", "integer"),
  col(3, "Tanggal", "date"),
];

/** Urutan manifest = urutan unggah: Jan, Mar, Feb. */
const SEGS = [
  { m: "01", rows: 20, rowBase: 1000, c3: true },
  { m: "03", rows: 15, rowBase: 2000, c3: true },
  { m: "02", rows: 10, rowBase: 3000, c3: false },
];

let root: string;
let engine: QueryEngine;
let leased: string[] = [];
const manifest: GridSegment[] = [];

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-grid-period-"));
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  for (const s of SEGS) {
    const c3 = s.c3 ? `, DATE '2026-${s.m}-01' + CAST(i % 5 AS INTEGER) AS c3` : "";
    await c.run(
      `COPY (SELECT (${s.rowBase} + i + 2)::BIGINT AS _row, (i + 2)::INTEGER AS _src_row,
                    DATE '2026-${s.m}-01' AS _period,
                    'Cabang ' || (i % 3) AS c1, CAST(i * 10 + ${Number(s.m)} AS BIGINT) AS c2${c3}
             FROM range(${s.rows}) t(i) ORDER BY i)
       TO '${join(root, `typed-${s.m}.parquet`)}' (FORMAT parquet)`,
    );
    manifest.push({
      typedKey: `typed-${s.m}.parquet`,
      legacyRow: false,
      columns: s.c3 ? [1, 2, 3] : [1, 2],
      dataRows: s.rows,
      rowBase: s.rowBase,
      maxSrcRow: s.rows + 1,
      rawKey: `raw-${s.m}.parquet`,
      colMap: [],
      fileName: `periode-${s.m}.xlsx`,
      period: { key: `2026-${s.m}`, start: `2026-${s.m}-01`, min: null, max: null },
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
    typedKey: "typed-01.parquet",
    rawKey: "raw-01.parquet",
    fileName: null,
    schemaRevision: 1,
    schema: SCHEMA,
    // Repo mengurutkan segmen sheet periode menurut awal periode (grid-repo → byPeriod).
    segments: byPeriod(manifest),
    period: { column: null, grain: "MONTH" },
    ...over,
  };
}

function deps(s: () => GridSheet = () => sheet()): GridDeps {
  const parquet = new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    maxDownloads: 2,
    download: async (key, dest) => copyFileSync(join(root, key), dest),
  });
  return {
    repo: { sheet: async (userId) => (userId === OWNER ? s() : null) },
    parquet: {
      acquire: (key, opts) => {
        leased.push(key);
        return parquet.acquire(key, opts);
      },
    },
    engine,
    timeoutMs: 30_000,
    now: () => new Date("2026-03-15T03:00:00Z"),
  };
}

const body = (over: Partial<RowsBody> = {}): RowsBody => ({
  versionId: VER,
  rowStart: 0,
  rowCount: 100,
  cols: [1, 2, 3],
  ...over,
});

/** _row semua baris dalam urutan (_period, _row): Jan, Feb, Mar. */
const chronological = [SEGS[0]!, SEGS[2]!, SEGS[1]!].flatMap((s) =>
  Array.from({ length: s.rows }, (_, i) => s.rowBase + i + 2),
);

describe("T-058 AC3: urutan bawaan sheet periode = (_period, _row)", () => {
  it("byPeriod mengurutkan manifest menurut awal periode (stabil)", () => {
    expect(byPeriod(manifest).map((s) => s.period!.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("jalur 1 (tanpa urut): Februari yang diunggah terakhir tampil di antara Januari dan Maret", async () => {
    const r = await runGridRows(OWNER, SHEET, body(), deps());
    if (!r.ok) throw new Error(r.message);
    expect(r.rows.map((x) => x._row)).toEqual(chronological);
  });

  it("jalur 2 (urut + proyeksi skema campuran): pemutus seri (_period, _row)", async () => {
    const r = await runGridRows(OWNER, SHEET, body({ sort: [{ pos: 1, dir: "asc" }] }), deps());
    if (!r.ok) throw new Error(r.message);
    const rank = new Map(chronological.map((row, i) => [row, i]));
    const rows = r.rows.map((x) => ({ c1: x.cells[0] as string, at: rank.get(x._row)! }));
    const sorted = [...rows].sort((a, b) => (a.c1 < b.c1 ? -1 : a.c1 > b.c1 ? 1 : a.at - b.at));
    expect(rows).toEqual(sorted);
    expect(r.total).toBe(45);
  });

  it("gridOrderSql: _period sebelum _row hanya untuk sheet periode", () => {
    const p = planGrid(body(), SCHEMA, new Date(), true);
    const q = planGrid(body(), SCHEMA, new Date());
    if (!p.ok || !q.ok) throw new Error("plan");
    expect(gridOrderSql(p.plan)).toBe("_period ASC, _row ASC");
    expect(gridOrderSql(q.plan)).toBe("_row ASC");
  });
});

describe("T-058 AC4: pemilih periode membatasi grid; total = metadata periode", () => {
  it("Februari saja: total 10 (dataRows segmen), hanya file Februari disewa", async () => {
    leased = [];
    const r = await runGridRows(OWNER, SHEET, body({ period: ["2026-02"] }), deps());
    if (!r.ok) throw new Error(r.message);
    expect(r.total).toBe(10);
    expect(r.filteredTotal).toBe(10);
    expect(r.rows.map((x) => x._row)).toEqual(Array.from({ length: 10 }, (_, i) => 3000 + i + 2));
    expect(r.rows.every((x) => x.cells[2] === null)).toBe(true);
    expect([...new Set(leased)]).toEqual(["typed-02.parquet"]);
  });

  it("saringan + periode: total = periode, filteredTotal ⊆ periode", async () => {
    const r = await runGridRows(
      OWNER,
      SHEET,
      body({ period: ["2026-03"], filters: [{ pos: 1, op: "in", values: ["Cabang 0"] }] }),
      deps(),
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.total).toBe(15);
    expect(r.filteredTotal).toBe(5);
  });

  it("ringkasan dan daftar nilai ikut periode terpilih", async () => {
    const st = await runGridStats(
      OWNER,
      SHEET,
      { versionId: VER, pos: 2, period: ["2026-01"] },
      deps(),
    );
    if (!st.ok) throw new Error(st.message);
    expect(st.count).toBe(20);
    const v = await runGridValues(
      OWNER,
      SHEET,
      { versionId: VER, pos: 3, period: ["2026-02"] },
      deps(),
    );
    if (!v.ok) throw new Error(v.message);
    expect(v.values).toEqual([null]);
  });

  it("periode tidak dikenal / sheet non-periode → INVALID tanpa query", async () => {
    leased = [];
    const bad = await runGridRows(OWNER, SHEET, body({ period: ["2025-12"] }), deps());
    expect(bad).toMatchObject({ ok: false, code: "INVALID" });
    const plain = await runGridRows(
      OWNER,
      SHEET,
      body({ period: ["2026-01"] }),
      deps(() => sheet({ period: null })),
    );
    expect(plain).toMatchObject({ ok: false, code: "INVALID" });
    expect(leased).toEqual([]);
    expect(scopePeriods(sheet(), []).ok).toBe(true);
  });

  it("kunci periode berbentuk salah ditolak skema body", async () => {
    const r = await runGridRows(OWNER, SHEET, body({ period: ["Maret"] }), deps());
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
  });
});

describe("T-058: sumber sel menyebut periode", () => {
  it("GET …/cell → source.period = label periode segmen", async () => {
    const r = await runGridCell(
      OWNER,
      SHEET,
      { versionId: VER, row: String(3000 + 2), pos: "2" },
      deps(),
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.source).toEqual({ fileName: "periode-02.xlsx", srcRow: 2, period: "Februari 2026" });
  });
});

describe("T-058: Unduh tampilan = grid pada periode terpilih", () => {
  const EXPORT_ID = "cmv4kljx40009oczvdgridex1";

  /** Job ekspor tampilan (repo/storage palsu, DuckDB ekspor sungguhan) → baris CSV + file diunduh. */
  async function exportCsv(view: Omit<SheetExportParams, "versionId" | "requestedAt">) {
    const tmpRoot = mkdtempSync(join(root, "tmp-"));
    let status: ExportJobRow["status"] = "QUEUED";
    const objects = new Map<string, string>();
    const downloaded: string[] = [];
    const row: ExportJobRow = {
      id: EXPORT_ID,
      userId: OWNER,
      dashboardId: null,
      widgetId: null,
      sheetId: SHEET,
      format: "CSV",
      status,
      params: { versionId: VER, ...view, requestedAt: "2026-03-15T03:00:00.000Z" },
      fileName: "periode.csv",
      key: null,
      title: null,
    };
    const deps: ExportJobDeps = {
      repo: {
        load: async () => ({ ...row, status }),
        start: async () => ((status = "RUNNING"), true),
        finish: async () => ((status = "DONE"), true),
        fail: async (_id: string, code: string, message: string) => {
          throw new Error(`${code}: ${message}`);
        },
        exists: async () => true,
      } as unknown as ExportJobDeps["repo"],
      query: { repo: {} as ExportJobDeps["query"]["repo"] },
      grid: { sheet: async (u) => (u === OWNER ? sheet() : null) },
      storage: {
        download: async (key: string, dest: string) => {
          downloaded.push(key);
          copyFileSync(join(root, key), dest);
        },
        upload: async (key: string, path: string) => {
          const to = join(root, `out-${Math.random().toString(36).slice(2)}.csv`);
          copyFileSync(path, to);
          objects.set(key, to);
        },
        remove: async () => {},
      } as unknown as ExportJobDeps["storage"],
      scheduleDelete: async () => {},
      tmpRoot,
      maxRows: 1_000_000,
      ttlMs: 60 * 60 * 1000,
      deadlineMs: 60_000,
      now: () => new Date("2026-03-15T03:01:00.000Z"),
    };
    const r = await runExportJob(EXPORT_ID, deps);
    expect(r.outcome).toBe("done");
    const text = readFileSync([...objects.values()][0]!, "utf8");
    return { rows: parseCsv(text.slice(1)).slice(1), downloaded };
  }

  it("periode Februari: hanya baris Februari, hanya file Februari diunduh", async () => {
    const { rows, downloaded } = await exportCsv({ cols: [2], period: ["2026-02"] });
    expect(rows.map((r) => Number(r[0]))).toEqual(Array.from({ length: 10 }, (_, i) => i * 10 + 2));
    expect(downloaded).toEqual(["typed-02.parquet"]);
  });

  it("semua periode: urutan polos dan berurut = grid (_period, _row)", async () => {
    for (const view of [
      { cols: [2] },
      { cols: [1, 2], sort: [{ pos: 1, dir: "desc" as const }] },
    ]) {
      const g = await runGridRows(OWNER, SHEET, body(view), deps());
      if (!g.ok) throw new Error(g.message);
      const { rows } = await exportCsv(view);
      expect(rows.map((r) => r.at(-1))).toEqual(g.rows.map((x) => String(x.cells.at(-1))));
    }
  });
});
