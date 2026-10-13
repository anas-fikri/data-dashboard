import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache } from "@/features/query/cache";
import {
  runWidgetQuery,
  type CachedQuery,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";
import {
  formatCell,
  formatCompact,
  formatDuration,
  formatLabelNumber,
  formatNumber,
} from "@/features/widgets/format";
import { MISSING_COLUMN, matchSheet, missingMessage, remapConfig } from "@/features/widgets/remap";
import { parseWidgetConfig } from "@/features/widgets/spec";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-011: query widget in-process — spec diambil dari widget (repo palsu), mesin DuckDB + cache parquet
 * sungguhan. Nilai grafik dibandingkan dengan SUMIF yang dihitung test dari data yang sama.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const USER = "user-pemilik";
const XSS = "<img src=x onerror=alert(1)>";

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
  col(1, "Cabang", "text"),
  col(2, "Omzet", "decimal"),
  col(3, "Tanggal", "date"),
  col(4, XSS, "text"),
  col(5, "Rahasia", "decimal", true),
];
const ROWS = 1000;
const cabangOf = (i: number) => `Cabang ${i % 4}`;
const omzetOf = (i: number) => ((i * 37) % 1000) + 0.5;

let root: string;
let source: string;
let engine: QueryEngine;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-widget-test-"));
  source = join(root, "typed.parquet");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    `COPY (SELECT (i + 2)::INTEGER AS _row,
                  'Cabang ' || (i % 4) AS c1,
                  CAST((i * 37) % 1000 + 0.5 AS DECIMAL(38,6)) AS c2,
                  DATE '2026-01-01' + CAST(i % 90 AS INTEGER) AS c3,
                  '${XSS}' AS c4,
                  CAST(i AS DECIMAL(38,6)) AS c5
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
  bar: {
    type: "bar",
    spec: {
      sheetId: SHEET,
      dimension: { column: 1 },
      measure: { agg: "sum", column: 2 },
      sort: "label_asc",
      topN: 12,
      format: fmt,
    },
  },
  kpi: { type: "kpi", spec: { sheetId: SHEET, measure: { agg: "count" }, format: fmt } },
  table: { type: "table", spec: { sheetId: SHEET, columns: [1, 2, 4], format: fmt } },
  hidden: {
    type: "kpi",
    spec: { sheetId: SHEET, measure: { agg: "sum", column: 5 }, format: fmt },
  },
  gone: { type: "table", spec: { sheetId: SHEET, columns: [1, 99], format: fmt } },
  otherSheet: {
    type: "kpi",
    spec: { sheetId: "cmv4kljx40009oczvdmpurrzz", measure: { agg: "count" }, format: fmt },
  },
  empty: { type: "empty", spec: {} },
};
const WID = (name: string) => `cmv4kljx40009oczvdmpu${name.padEnd(4, "x").slice(0, 4)}0`;

function deps(over: Partial<QueryDeps> = {}): QueryDeps {
  const repo: QueryRepo = {
    ownedDataset: async () => null,
    sheet: async (versionId, sheetId) =>
      versionId === VER && sheetId === SHEET
        ? { typedKey: "parquet/ds/v/s/typed-1.parquet", schemaRevision: 1, schema: SCHEMA }
        : null,
    widget: async (userId, widgetId) => {
      const name = Object.keys(WIDGETS).find((n) => WID(n) === widgetId);
      if (userId !== USER || !name) return null;
      return { ...WIDGETS[name]!, datasetId: DS, activeVersionId: VER };
    },
  };
  const parquet = new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    download: async (_key, dest) => copyFileSync(source, dest),
  });
  return {
    repo,
    parquet,
    engine,
    cache: new ResultCache<CachedQuery>(64 * 1024 * 1024),
    timeoutMs: 30_000,
    ...over,
  };
}

describe("AC 1: grafik batang = SUMIF dari data", () => {
  it("sum(Omzet) per Cabang sama dengan penjumlahan per cabang yang dihitung test", async () => {
    const expected = new Map<string, number>();
    for (let i = 0; i < ROWS; i++) {
      expected.set(cabangOf(i), (expected.get(cabangOf(i)) ?? 0) + omzetOf(i));
    }
    const r = await runWidgetQuery(USER, { widgetId: WID("bar") }, deps());
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.columns.map((c) => c.label)).toEqual(["Cabang", "Total Omzet"]);
    expect(r.rows.map((row) => row[0])).toEqual(["Cabang 0", "Cabang 1", "Cabang 2", "Cabang 3"]);
    // Grafik membawa jumlah kategori + total seluruh kategori (irisan "Lainnya", "N dari M").
    let all = 0;
    for (let i = 0; i < ROWS; i++) all += omzetOf(i);
    expect(r).toMatchObject({ categories: 4 });
    expect(r.ok && r.grandTotal).toBeCloseTo(all, 6);
    for (const [cabang, total] of r.rows as [string, number][]) {
      expect(total).toBeCloseTo(expected.get(cabang)!, 6);
    }
  });

  it("KPI count(*) = jumlah baris", async () => {
    const r = await runWidgetQuery(USER, { widgetId: WID("kpi") }, deps());
    expect(r).toMatchObject({ ok: true, rows: [[ROWS]] });
  });
});

describe("AC 3: tabel — 100 baris per halaman, urut kolom tabel", () => {
  it("halaman 0 tanpa urutan = 100 baris pertama urut file; total dengan filter", async () => {
    const d = deps();
    const r = await runWidgetQuery(USER, { widgetId: WID("table") }, d);
    expect(r).toMatchObject({ ok: true, total: ROWS, page: 0, pageSize: 100, cached: false });
    if (!r.ok || !("total" in r)) return;
    expect(r.rows).toHaveLength(100);
    expect(r.rows[0]).toEqual([cabangOf(0), omzetOf(0), XSS]);
    // Permintaan sama kedua kali dari cache hasil.
    expect(await runWidgetQuery(USER, { widgetId: WID("table") }, d)).toMatchObject({
      cached: true,
    });
  });

  it("urut Omzet menurun lalu pindah halaman: urutan menyambung, seri dipecah urutan baris", async () => {
    const all = Array.from({ length: ROWS }, (_, i) => ({ i, v: omzetOf(i) })).sort(
      (a, b) => b.v - a.v || a.i - b.i,
    );
    const d = deps();
    for (const page of [0, 1, 9]) {
      const r = await runWidgetQuery(
        USER,
        { widgetId: WID("table"), page, sort: { column: 2, dir: "desc" } },
        d,
      );
      if (!r.ok || !("total" in r)) throw new Error(JSON.stringify(r));
      expect(r.rows).toHaveLength(100);
      expect(r.rows.map((row) => row[1])).toEqual(
        all.slice(page * 100, page * 100 + 100).map((x) => x.v),
      );
    }
    // Halaman di luar data dijepit ke halaman terakhir (tanpa OFFSET mahal yang kosong, review M1).
    const beyond = await runWidgetQuery(USER, { widgetId: WID("table"), page: 50_000 }, d);
    expect(beyond).toMatchObject({ ok: true, total: ROWS, page: 9 });
    expect(beyond.ok && beyond.rows).toHaveLength(100);
    // Total disimpan terpisah: halaman lain tidak menghitung ulang count(*).
    const exec = vi.spyOn(engine, "exec");
    await runWidgetQuery(USER, { widgetId: WID("table"), page: 3 }, d);
    expect(exec).toHaveBeenCalledTimes(1);
    exec.mockRestore();
  });

  it("urutan hanya untuk kolom yang ada di tabel itu; halaman di luar batas → INVALID", async () => {
    const exec = vi.fn();
    const d = deps({ engine: { withSlot: (_u, fn) => fn(), exec } });
    for (const body of [
      { widgetId: WID("table"), sort: { column: 3, dir: "asc" } },
      { widgetId: WID("table"), page: -1 },
      { widgetId: WID("table"), page: 100_001 },
      { widgetId: WID("table"), extra: true },
    ]) {
      expect(await runWidgetQuery(USER, body, d)).toMatchObject({ ok: false, code: "INVALID" });
    }
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("AC 4: kolom disembunyikan/hilang → pesan di widget itu saja", () => {
  it("COLUMN_UNAVAILABLE tanpa menjalankan query; widget lain tetap jalan", async () => {
    const exec = vi.fn();
    const d = deps({ engine: { withSlot: (_u, fn) => fn(), exec } });
    const hidden = await runWidgetQuery(USER, { widgetId: WID("hidden") }, d);
    expect(hidden).toMatchObject({ ok: false, code: "COLUMN_UNAVAILABLE" });
    expect(hidden.ok === false && hidden.message).toContain('"Rahasia" disembunyikan');
    expect(await runWidgetQuery(USER, { widgetId: WID("gone") }, d)).toMatchObject({
      code: "COLUMN_UNAVAILABLE",
    });
    expect(exec).not.toHaveBeenCalled();
    expect(await runWidgetQuery(USER, { widgetId: WID("kpi") }, deps())).toMatchObject({
      ok: true,
    });
  });

  it("filter dari klien: kolom tersembunyi tidak disebut namanya; angka di luar ±2^53 → INVALID", async () => {
    const exec = vi.fn();
    const d = deps({ engine: { withSlot: (_u, fn) => fn(), exec } });
    const r = await runWidgetQuery(
      USER,
      { widgetId: WID("kpi"), filters: [{ column: 5, op: "gt", value: 1 }] },
      d,
    );
    expect(r).toMatchObject({ ok: false, code: "COLUMN_UNAVAILABLE" });
    expect(r.ok === false && r.message).not.toContain("Rahasia");
    expect(
      await runWidgetQuery(
        USER,
        { widgetId: WID("kpi"), filters: [{ column: 2, op: "gt", value: 1e308 }] },
        d,
      ),
    ).toMatchObject({ ok: false, code: "INVALID" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("sheet tidak ada di versi aktif → SHEET_UNAVAILABLE; widget kosong → INVALID; bukan pemilik → NOT_FOUND", async () => {
    expect(await runWidgetQuery(USER, { widgetId: WID("otherSheet") }, deps())).toMatchObject({
      code: "SHEET_UNAVAILABLE",
    });
    expect(await runWidgetQuery(USER, { widgetId: WID("empty") }, deps())).toMatchObject({
      code: "INVALID",
    });
    expect(await runWidgetQuery("orang-lain", { widgetId: WID("bar") }, deps())).toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("AC 2: format angka", () => {
  it("Rp dengan spasi biasa U+0020 dan ribuan titik; persen dari rasio; minus", () => {
    const rp = formatNumber(1234567.5, { style: "rupiah", decimals: 0 });
    expect(rp).toBe("Rp 1.234.568");
    expect([...rp].map((ch) => ch.charCodeAt(0))).not.toContain(0xa0);
    expect(rp.charCodeAt(2)).toBe(0x20);
    expect(formatNumber(-1234.5, { style: "rupiah", decimals: 2 })).toBe("-Rp 1.234,50");
    expect(formatNumber(-0.2, { style: "rupiah", decimals: 0 })).toBe("Rp 0");
    expect(formatNumber(0.256, { style: "percent", decimals: 1 })).toBe("25,6%");
    expect(formatNumber(1234567.5, { style: "number", decimals: 1 })).toBe("1.234.567,5");
    // Otomatis: bulat tanpa desimal, desimal maks. 2 (rasio 0,07 tidak jadi "0").
    expect(formatNumber(0.0712, { style: "auto", decimals: 0 })).toBe("0,07");
    expect(formatNumber(15007, { style: "auto", decimals: 0 })).toBe("15.007");
    // "Rp " dengan spasi biasa; "3,97 jt" dengan spasi tak-putus bawaan Intl (angka + satuan tidak terpisah baris).
    expect(formatCompact(3969625, { style: "rupiah", decimals: 0 })).toBe("Rp 3,97\u00a0jt");
    expect(formatCell("2026-10-12", "date", fmt, "month")).toBe("Okt 2026");
    expect(formatCell(null, "text", fmt)).toBe("(kosong)");
    expect(formatCell(XSS, "text", fmt)).toBe(XSS);
  });
});

describe("validasi spec widget", () => {
  it("bentuk per tipe: pai ≤ 12 kategori, kolom tabel unik, agregasi selain count butuh kolom", () => {
    const chart = (type: string, over: Record<string, unknown> = {}) =>
      parseWidgetConfig(type, { ...(WIDGETS.bar!.spec as object), ...over });
    expect(chart("bar")).toMatchObject({ ok: true });
    expect(chart("pie", { topN: 13 })).toMatchObject({ ok: false });
    expect(chart("line", { topN: 1000 })).toMatchObject({ ok: true });
    expect(chart("bar", { measure: { agg: "sum" } })).toMatchObject({ ok: false });
    expect(chart("bar", { extra: 1 })).toMatchObject({ ok: false });
    expect(
      parseWidgetConfig("table", { sheetId: SHEET, columns: [1, 1], format: fmt }),
    ).toMatchObject({ ok: false });
    expect(parseWidgetConfig("table", { sheetId: SHEET, columns: [], format: fmt })).toMatchObject({
      ok: false,
    });
    expect(parseWidgetConfig("radar", {})).toMatchObject({ ok: false });
    expect(parseWidgetConfig("empty", { apa: 1 })).toEqual({
      ok: true,
      config: { type: "empty", spec: {} },
    });
  });
});

describe("verifikasi T-011 putaran 2: format, data diganti, total grafik", () => {
  it("durasi j:mm:dd; 'Otomatis' tidak menampilkan 0/-0 untuk nilai kecil; label angka tanpa ribuan", () => {
    expect(formatDuration(3909)).toBe("1:05:09");
    expect(formatDuration(26 * 86_400 + 3 * 3600)).toBe("26 hari 3:00");
    expect(formatCell(3909, "duration", { style: "auto", decimals: 0 })).toBe("1:05:09");
    expect(formatNumber(0.0004, { style: "auto", decimals: 0 })).toBe("0,0004");
    expect(formatNumber(-0.001, { style: "number", decimals: 2 })).toBe("0,00");
    expect(formatLabelNumber(2024)).toBe("2024");
    expect(formatCompact(-3969625, { style: "rupiah", decimals: 0 })).toBe("-Rp 3,97\u00a0jt");
  });

  it("data diganti: sheet lewat nama, kolom lewat nama; yang tidak ketemu → penanda + nama lama", () => {
    const old = { id: "old", name: "Penjualan", index: 0, schema: SCHEMA };
    const next = {
      id: "new",
      name: "penjualan ",
      index: 1,
      schema: [col(1, "Tanggal", "date"), col(2, "Cabang", "text"), col(3, "omzet", "decimal")],
    };
    expect(matchSheet(old, [next, { ...next, id: "x", name: "Lain" }], 2)).toBe(next);
    // Satu-satunya sheet hanya dipakai bila versi lama juga satu sheet (CSV/nama file berubah).
    expect(matchSheet(old, [{ ...next, name: "Bulan Oktober" }], 1)?.name).toBe("Bulan Oktober");
    expect(matchSheet(old, [{ ...next, name: "Bulan Oktober" }], 3)).toBeNull();
    expect(
      matchSheet(
        old,
        [
          { ...next, name: "A" },
          { ...next, id: "b", name: "B" },
        ],
        1,
      ),
    ).toBeNull();
    const bar = parseWidgetConfig("bar", WIDGETS.bar!.spec);
    if (!bar.ok || bar.config.type === "empty") throw new Error("spec");
    const moved = remapConfig(bar.config, old, next);
    expect(moved.missing).toEqual([]);
    expect(moved.config.spec).toMatchObject({
      sheetId: "new",
      dimension: { column: 2 },
      measure: { agg: "sum", column: 3 },
    });
    const table = parseWidgetConfig("table", WIDGETS.table!.spec);
    if (!table.ok || table.config.type !== "table") throw new Error("spec");
    const t = remapConfig(table.config, old, next);
    // Kolom yang hilang tidak pernah jatuh ke posisi 0 (bisa jadi kolom lain): satu penanda saja.
    expect(t.config.spec).toMatchObject({ columns: [2, 3, MISSING_COLUMN] });
    expect(t.missing.length).toBeGreaterThan(0);
    expect(missingMessage(["Catatan"])).toContain('Kolom "Catatan" tidak ada di data terbaru');
  });

  it("kolom widget hilang di data baru → COLUMN_UNAVAILABLE menyebut nama lama", async () => {
    const OLD = "cmv4kljx40009oczvdmpurrol";
    const d = deps();
    d.repo = {
      ...d.repo,
      widget: async () => ({
        type: "kpi",
        spec: { sheetId: OLD, measure: { agg: "sum", column: 2 }, format: fmt },
        datasetId: DS,
        activeVersionId: VER,
      }),
      sheetHistory: async () => ({
        old: {
          id: OLD,
          name: "Sheet1",
          index: 0,
          schema: [col(0, "Cabang", "text"), col(2, "Omzet Lama", "decimal")],
        },
        oldSheetCount: 1,
        active: [{ id: SHEET, name: "Sheet1", index: 0, schema: SCHEMA }],
      }),
    };
    const r = await runWidgetQuery(USER, { widgetId: WID("kpi") }, d);
    expect(r).toMatchObject({ ok: false, code: "COLUMN_UNAVAILABLE" });
    expect(!r.ok && r.message).toContain('"Omzet Lama"');
  });

  it("widget versi lama tetap jalan setelah data diganti (dipetakan saat query)", async () => {
    const OLD = "cmv4kljx40009oczvdmpurrol";
    const d = deps();
    const base = d.repo;
    d.repo = {
      ...base,
      widget: async () => ({
        type: "kpi",
        spec: { sheetId: OLD, measure: { agg: "sum", column: 2 }, format: fmt },
        datasetId: DS,
        activeVersionId: VER,
      }),
      sheetHistory: async () => ({
        old: { id: OLD, name: "Sheet1", index: 0, schema: SCHEMA },
        oldSheetCount: 1,
        active: [{ id: SHEET, name: "Sheet1", index: 0, schema: SCHEMA }],
      }),
    };
    let all = 0;
    for (let i = 0; i < ROWS; i++) all += omzetOf(i);
    const r = await runWidgetQuery(USER, { widgetId: WID("bar") }, d);
    expect(r.ok && (r.rows[0]![0] as number)).toBeCloseTo(all, 6);
  });

  it("total grafik dengan ukuran tanggal tidak gagal (tanpa sum atas tanggal); kunci cache terpisah", async () => {
    const d = deps();
    d.repo = {
      ...d.repo,
      widget: async () => ({
        type: "bar",
        spec: {
          sheetId: SHEET,
          dimension: { column: 1 },
          measure: { agg: "max", column: 3 },
          sort: "value_desc",
          topN: 2,
          format: fmt,
        },
        datasetId: DS,
        activeVersionId: VER,
      }),
    };
    const r = await runWidgetQuery(USER, { widgetId: WID("bar") }, d);
    expect(r).toMatchObject({ ok: true, categories: 4, grandTotal: null });
    expect(r.ok && r.rows).toHaveLength(2);
  });

  it("query total gagal → grafik tetap tampil tanpa total dan TIDAK di-cache (dicoba lagi)", async () => {
    const failing = {
      exec: (sql: string, params: Record<string, unknown>, ms: number) =>
        /count\(DISTINCT/.test(sql)
          ? Promise.reject(new Error("total gagal"))
          : engine.exec(sql, params as never, ms),
      withSlot: <T>(u: string, fn: () => Promise<T>) => engine.withSlot(u, fn),
    } as unknown as QueryEngine;
    const d = deps({ engine: failing });
    const first = await runWidgetQuery(USER, { widgetId: WID("bar") }, d);
    expect(first).toMatchObject({ ok: true, cached: false });
    expect(first.ok && first.categories).toBeUndefined();
    const again = await runWidgetQuery(USER, { widgetId: WID("bar") }, d);
    expect(again).toMatchObject({ ok: true, cached: false });
    // Mesin pulih → total ada dan baru sekarang di-cache.
    d.engine = engine;
    const healed = await runWidgetQuery(USER, { widgetId: WID("bar") }, d);
    expect(healed.ok && healed.categories).toBeGreaterThan(0);
    expect(await runWidgetQuery(USER, { widgetId: WID("bar") }, d)).toMatchObject({ cached: true });
  });
});
