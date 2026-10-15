import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache } from "@/features/query/cache";
import { runWidgetQuery, type CachedQuery, type QueryDeps } from "@/features/query/service";
import { absentNames } from "@/features/query/widget";
import { parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-014 AC 3: kolom kosong (absent, dikonfirmasi NULL saat pemetaan) = kolom fisik bertipe berisi NULL.
 * Widget yang memakainya tetap jalan (nilai kosong, bukan error) dan respons menyebut kolomnya di
 * `absent` agar UI menampilkan "(kosong)" + catatan. DuckDB + cache parquet sungguhan.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const USER = "user-pemilik";
const ROWS = 50;

const col = (pos: number, name: string, type: ColumnSchema["type"], absent = false) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden: false,
    nullPct: absent ? 1 : 0,
    distinctCount: 0,
    castFailCount: 0,
    ...(absent ? { absent: true, nonEmpty: 0 } : {}),
  }) as ColumnSchema;
const SCHEMA: ColumnSchema[] = [
  col(1, "Cabang", "text"),
  col(2, "Omzet", "decimal"),
  col(3, "Diskon", "decimal", true),
  col(4, "Tanggal Kirim", "date", true),
];

let root: string;
let source: string;
let engine: QueryEngine;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-absent-test-"));
  source = join(root, "typed.parquet");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    `COPY (SELECT (i + 2)::INTEGER AS _row,
                  'Cabang ' || (i % 2) AS c1,
                  CAST(i AS DECIMAL(38,6)) AS c2,
                  CAST(NULL AS DECIMAL(38,6)) AS c3,
                  CAST(NULL AS DATE) AS c4
           FROM range(${ROWS}) t(i)) TO '${source}' (FORMAT parquet)`,
  );
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

const fmt = { style: "number", decimals: 0 } as const;
const WIDGETS: Record<string, { type: string; spec: unknown }> = {
  ksum: { type: "kpi", spec: { sheetId: SHEET, measure: { agg: "sum", column: 3 }, format: fmt } },
  kavg: { type: "kpi", spec: { sheetId: SHEET, measure: { agg: "avg", column: 3 }, format: fmt } },
  kreal: { type: "kpi", spec: { sheetId: SHEET, measure: { agg: "sum", column: 2 }, format: fmt } },
  line: {
    type: "line",
    spec: {
      sheetId: SHEET,
      dimension: { column: 4, timeGrain: "month" },
      measure: { agg: "count" },
      sort: "label_asc",
      topN: 12,
      format: fmt,
    },
  },
  table: { type: "table", spec: { sheetId: SHEET, columns: [1, 3, 4], format: fmt } },
};
/** id widget bentuk cuid (huruf kecil): 4 huruf pertama nama membedakan widget. */
const WID = (name: string) => `cmv4kljx40009oczvdmpu${name.padEnd(4, "x").slice(0, 4)}0`;

function deps(): QueryDeps {
  return {
    repo: {
      ownedDataset: async () => null,
      sheet: async (versionId, sheetId) =>
        versionId === VER && sheetId === SHEET
          ? { typedKey: "parquet/ds/v/s/typed-2.parquet", schemaRevision: 2, schema: SCHEMA }
          : null,
      widget: async (userId, widgetId) => {
        const name = Object.keys(WIDGETS).find((n) => WID(n) === widgetId);
        if (userId !== USER || !name) return null;
        return {
          ...WIDGETS[name]!,
          updatedAt: new Date(0),
          datasetId: DS,
          activeVersionId: VER,
          filterColumns: [],
          role: "OWNER" as const,
        };
      },
    },
    parquet: new ParquetCache({
      dir: join(root, "cache"),
      maxBytes: 1 << 30,
      download: async (_key, dest) => copyFileSync(source, dest),
    }),
    engine,
    cache: new ResultCache<CachedQuery>(1 << 20),
    timeoutMs: 30_000,
  };
}

const configOf = (name: string): WidgetConfig => {
  const w = WIDGETS[name]!;
  const r = parseWidgetConfig(w.type, w.spec);
  if (!r.ok) throw new Error(r.message);
  return r.config;
};

describe("absentNames", () => {
  it("nama kolom absent yang dipakai widget, urut spec tanpa duplikat; kolom nyata tidak", () => {
    expect(absentNames(configOf("table"), SCHEMA)).toEqual(["Diskon", "Tanggal Kirim"]);
    // Dimensi dan ukuran kolom yang sama (jumlah unik per kategori) → satu nama.
    const same = parseWidgetConfig("bar", {
      sheetId: SHEET,
      dimension: { column: 3 },
      measure: { agg: "count_distinct", column: 3 },
      sort: "label_asc",
      topN: 12,
      format: fmt,
    });
    expect(same.ok && absentNames(same.config, SCHEMA)).toEqual(["Diskon"]);
    expect(absentNames(configOf("ksum"), SCHEMA)).toEqual(["Diskon"]);
    expect(absentNames(configOf("kreal"), SCHEMA)).toEqual([]);
    expect(absentNames({ type: "empty", spec: {} } as WidgetConfig, SCHEMA)).toEqual([]);
  });
});

describe("AC 3: widget di kolom kosong → nilai kosong + penanda, bukan error", () => {
  it("KPI total/rata-rata kolom kosong: berhasil, absent disebut", async () => {
    const sum = await runWidgetQuery(USER, { widgetId: WID("ksum") }, deps());
    expect(sum).toMatchObject({ ok: true, absent: ["Diskon"], rows: [[0]] });
    const avg = await runWidgetQuery(USER, { widgetId: WID("kavg") }, deps());
    expect(avg).toMatchObject({ ok: true, absent: ["Diskon"], rows: [[null]] });
  });

  it("widget tanpa kolom kosong: respons tanpa field absent", async () => {
    const r = await runWidgetQuery(USER, { widgetId: WID("kreal") }, deps());
    expect(r.ok).toBe(true);
    expect(r).not.toHaveProperty("absent");
  });

  it("grafik garis per bulan di tanggal kosong (DATE bertipe): satu kategori kosong", async () => {
    const r = await runWidgetQuery(USER, { widgetId: WID("line") }, deps());
    expect(r).toMatchObject({ ok: true, absent: ["Tanggal Kirim"], rows: [[null, ROWS]] });
  });

  it("tabel: sel kolom kosong NULL; penanda tetap ada saat hasil dari cache", async () => {
    const d = deps();
    const first = await runWidgetQuery(USER, { widgetId: WID("table") }, d);
    expect(first).toMatchObject({ ok: true, total: ROWS, absent: ["Diskon", "Tanggal Kirim"] });
    if (first.ok) expect(first.rows[0]).toEqual(["Cabang 0", null, null]);
    expect(await runWidgetQuery(USER, { widgetId: WID("table") }, d)).toMatchObject({
      cached: true,
      absent: ["Diskon", "Tanggal Kirim"],
    });
  });
});
