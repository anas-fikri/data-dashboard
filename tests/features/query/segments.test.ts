import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { sampleSql } from "@/features/schema/service";
import {
  execOnParquet,
  runOnParquet,
  runWidgetQuery,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";
import type { SegmentFile } from "@/features/query/source";
import { buildFilterValuesSql } from "@/features/query/sql";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-037 (ADR-0008): sheet = daftar segmen typed dari manifest. Hasil setiap jenis query (KPI, batang
 * berbatas + total, garis per bulan, tabel terurut/tanpa urut + jumlah, pivot, nilai filter, sampel
 * skema) atas 24 segmen identik dengan satu file gabungan; skema campuran (segmen legacy `_row INTEGER`
 * tanpa `_src_row`, segmen tanpa kolom c5) dibaca lewat proyeksi eksplisit dengan hasil identik dengan
 * file gabungan yang kolomnya NULL di baris itu. Mesin DuckDB + cache parquet sungguhan.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const USER = "user-pemilik";
const ROWS = 2400;
const SEGMENTS = 24;
const SHEETS = {
  one: "cmv4kljx40009oczvdmpusone",
  seg: "cmv4kljx40009oczvdmpusseg",
  oneMix: "cmv4kljx40009oczvdmpusonm",
  mix: "cmv4kljx40009oczvdmpusmix",
} as const;

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
  col(2, "Layanan", "text"),
  col(3, "Tanggal", "date"),
  col(4, "Omzet", "decimal"),
  col(5, "Kode", "integer"),
];

let root: string;
let engine: QueryEngine;
const files: Record<string, SegmentFile[]> = {};

/** SELECT data baris i (0-based) dengan `_row` BIGINT = i + 2 (baris fisik). */
const SELECT = (c5: string) => `(i + 2)::BIGINT AS _row, (i + 2)::INTEGER AS _src_row,
  CASE WHEN i % 7 = 0 THEN 'CABANG 1' ELSE 'Cabang ' || (i % 5) END AS c1,
  CASE WHEN i % 40 = 0 THEN NULL ELSE ['Express', 'Reguler', 'Kargo'][(i % 3) + 1] END AS c2,
  DATE '2026-01-01' + CAST(i % 120 AS INTEGER) AS c3,
  CAST((i * 37) % 1000 + 0.5 AS DECIMAL(38,6)) AS c4,
  ${c5} AS c5`;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-segments-query-"));
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  const out = (name: string) => join(root, name);
  const per = ROWS / SEGMENTS;
  const range = (k: number) => `range(${k * per}, ${(k + 1) * per}) t(i)`;
  // File gabungan (perilaku lama: satu typed per sheet) + 24 segmen berskema sama.
  await c.run(
    `COPY (SELECT ${SELECT("CAST(i AS BIGINT)")} FROM range(${ROWS}) t(i)) TO '${out("one.parquet")}' (FORMAT parquet)`,
  );
  files.seg = [];
  for (let k = 0; k < SEGMENTS; k++) {
    await c.run(
      `COPY (SELECT ${SELECT("CAST(i AS BIGINT)")} FROM ${range(k)}) TO '${out(`seg-${k}.parquet`)}' (FORMAT parquet)`,
    );
    files.seg.push({ typedKey: `seg-${k}.parquet`, legacyRow: false, columns: [1, 2, 3, 4, 5] });
  }
  // Skema campuran: segmen 0 legacy (_row INTEGER, tanpa _src_row), segmen 1 tanpa c5 (kolom ditambah
  // belakangan), sisanya lengkap. Gabungan pembanding: c5 NULL di baris segmen 1.
  const c5Mix = `CASE WHEN i >= ${per} AND i < ${2 * per} THEN NULL ELSE CAST(i AS BIGINT) END`;
  await c.run(
    `COPY (SELECT ${SELECT(c5Mix)} FROM range(${ROWS}) t(i)) TO '${out("one-mix.parquet")}' (FORMAT parquet)`,
  );
  await c.run(
    `COPY (SELECT * EXCLUDE (_row, _src_row) REPLACE (c5 AS c5), (i + 2)::INTEGER AS _row
           FROM (SELECT i, ${SELECT("CAST(i AS BIGINT)")} FROM ${range(0)}))
     TO '${out("mix-0.parquet")}' (FORMAT parquet)`,
  );
  await c.run(
    `COPY (SELECT * EXCLUDE (c5) FROM (SELECT ${SELECT("CAST(i AS BIGINT)")} FROM ${range(1)}))
     TO '${out("mix-1.parquet")}' (FORMAT parquet)`,
  );
  files.mix = [
    { typedKey: "mix-0.parquet", legacyRow: true, columns: [1, 2, 3, 4, 5] },
    { typedKey: "mix-1.parquet", legacyRow: false, columns: [1, 2, 3, 4] },
  ];
  for (let k = 2; k < SEGMENTS; k++) {
    await c.run(
      `COPY (SELECT ${SELECT("CAST(i AS BIGINT)")} FROM ${range(k)}) TO '${out(`mix-${k}.parquet`)}' (FORMAT parquet)`,
    );
    files.mix.push({ typedKey: `mix-${k}.parquet`, legacyRow: false, columns: [1, 2, 3, 4, 5] });
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

const fmt = { style: "auto", decimals: 0 } as const;
const WIDGETS: Record<string, { type: string; spec: Record<string, unknown> }> = {
  kpi: { type: "kpi", spec: { measure: { agg: "sum", column: 4 }, format: fmt } },
  bar: {
    type: "bar",
    spec: {
      dimension: { column: 1 },
      measure: { agg: "sum", column: 4 },
      sort: "value_desc",
      topN: 3,
      format: fmt,
    },
  },
  line: {
    type: "line",
    spec: {
      dimension: { column: 3, timeGrain: "month" },
      measure: { agg: "count" },
      sort: "label_asc",
      topN: 365,
      format: fmt,
    },
  },
  avg5: { type: "kpi", spec: { measure: { agg: "avg", column: 5 }, format: fmt } },
  table: { type: "table", spec: { columns: [1, 2, 3, 4, 5], format: fmt } },
  pivot: {
    type: "pivot",
    spec: {
      rows: [{ column: 1 }, { column: 2 }],
      column: { column: 3, timeGrain: "month" },
      values: [{ agg: "sum", column: 4 }, { agg: "count" }],
      sort: "value_desc",
      format: fmt,
      totals: true,
      subtotals: true,
    },
  },
};
const WID = (name: string, sheet: string) =>
  `cmv4kljx40009oczvd${name.padEnd(4, "x").slice(0, 4)}${sheet.slice(-3)}`;

function deps(): QueryDeps {
  const repo: QueryRepo = {
    ownedDataset: async () => null,
    sheet: async (versionId, sheetId) => {
      if (versionId !== VER) return null;
      if (sheetId === SHEETS.one)
        return { typedKey: "one.parquet", schemaRevision: 1, schema: SCHEMA };
      if (sheetId === SHEETS.oneMix)
        return { typedKey: "one-mix.parquet", schemaRevision: 1, schema: SCHEMA };
      if (sheetId === SHEETS.seg)
        return {
          typedKey: "seg-0.parquet",
          schemaRevision: 1,
          schema: SCHEMA,
          segments: files.seg,
        };
      if (sheetId === SHEETS.mix)
        return {
          typedKey: "mix-0.parquet",
          schemaRevision: 1,
          schema: SCHEMA,
          segments: files.mix,
        };
      return null;
    },
    widget: async (userId, widgetId) => {
      for (const [name, w] of Object.entries(WIDGETS)) {
        for (const sheetId of Object.values(SHEETS)) {
          if (WID(name, sheetId) !== widgetId || userId !== USER) continue;
          return {
            type: w.type,
            spec: { ...w.spec, sheetId },
            updatedAt: new Date(0),
            datasetId: DS,
            activeVersionId: VER,
            filterColumns: [],
            dashboardId: "cmv4kljx40009oczvdmpudash0",
            role: "OWNER" as const,
          };
        }
      }
      return null;
    },
  };
  const parquet = new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    maxDownloads: 2,
    download: async (key, dest) => copyFileSync(join(root, key), dest),
  });
  return { repo, parquet, engine, cache: null, timeoutMs: 30_000 };
}

/** Jawaban widget tanpa bagian yang memang berbeda antar-run (ms, cached). */
async function answer(name: string, sheetId: string, body: Record<string, unknown> = {}) {
  const r = await runWidgetQuery(USER, { widgetId: WID(name, sheetId), ...body }, deps());
  if (!r.ok) throw new Error(`${name}@${sheetId}: ${r.code} ${r.message}`);
  const {
    ms: _ms,
    cached: _cached,
    widgetVersion: _v,
    ...rest
  } = r as typeof r & {
    ms?: number;
    cached?: boolean;
    widgetVersion?: string;
  };
  return rest;
}

const CASES: [string, Record<string, unknown>][] = [
  ["kpi", {}],
  ["avg5", {}],
  ["bar", {}],
  ["line", {}],
  ["table", {}],
  ["table", { page: 7 }],
  ["table", { sort: { column: 4, dir: "desc" }, page: 3 }],
  ["table", { sort: { column: 1, dir: "asc" }, page: 23 }],
  ["pivot", {}],
];

describe("T-037: 24 segmen = satu file gabungan", () => {
  it.each(CASES)("AC1: widget %s %j identik", async (name, body) => {
    const one = await answer(name, SHEETS.one, body);
    const seg = await answer(name, SHEETS.seg, body);
    expect(seg).toEqual(one);
  });

  it("AC1: nilai filter (teks, tanggal) dan sampel skema identik", async () => {
    const run = async (
      sheet: "one" | "seg",
      build: (path: string) => { sql: string; params: Record<string, unknown> },
    ) => {
      const s = await deps().repo.sheet(VER, SHEETS[sheet]);
      const source = sheet === "seg" ? { files: s!.segments!, schema: SCHEMA } : s!.typedKey!;
      const r = await execOnParquet(USER, source, deps(), build as never);
      if (!r.ok) throw new Error(r.message);
      return r.out.rows;
    };
    for (const c of [SCHEMA[0]!, SCHEMA[2]!]) {
      const build = (path: string) =>
        buildFilterValuesSql({ col: `c${c.pos}`, type: c.type, float: false }, "", path);
      expect(await run("seg", build)).toEqual(await run("one", build));
    }
    const sample = (path: string) => ({ sql: sampleSql(SCHEMA), params: { path } });
    expect(await run("seg", sample)).toEqual(await run("one", sample));
  });
});

describe("T-037: skema campuran → proyeksi eksplisit", () => {
  it.each(CASES)("AC1 + AC3: widget %s %j identik dengan gabungan ber-NULL", async (name, body) => {
    const one = await answer(name, SHEETS.oneMix, body);
    const mix = await answer(name, SHEETS.mix, body);
    expect(mix).toEqual(one);
  });

  it("AC2: 24 segmen dingin disewa dalam satu admission (tanpa QUERY_BUSY), unduhan ≤ maxDownloads", async () => {
    // deps() dulu: konstruktor ParquetCache di root/cache membersihkan subdirektori sisa.
    const base = deps();
    let active = 0;
    let peak = 0;
    const parquet = new ParquetCache({
      dir: join(root, "cache", `dingin-${Math.random().toString(36).slice(2)}`),
      maxBytes: 1 << 30,
      maxDownloads: 2,
      perOwnerDownloads: 1,
      download: async (key, dest) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        copyFileSync(join(root, key), dest);
        active--;
      },
    });
    const d = { ...base, parquet };
    const r = await runOnParquet(USER, { files: files.seg!, schema: SCHEMA }, d, (path, exec) =>
      exec({ sql: "SELECT count(*) FROM read_parquet($path)", params: { path } }),
    );
    expect(r.ok && Number(r.value.rows[0]![0])).toBe(ROWS);
    expect(peak).toBeLessThanOrEqual(2);
    expect(parquet.activeDownloads).toBe(0);
  });
});
