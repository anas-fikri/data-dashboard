import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { ResultCache } from "@/features/query/cache";
import type { PivotData } from "@/features/query/pivot";
import {
  runWidgetQuery,
  type CachedQuery,
  type QueryDeps,
  type QueryRepo,
} from "@/features/query/service";
import { remapConfig } from "@/features/widgets/remap";
import { parseWidgetConfig, type PivotSpec } from "@/features/widgets/spec";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";

/*
 * T-686n: widget pivot in-process — mesin DuckDB + cache parquet sungguhan, repo palsu. Sel, subtotal, total
 * baris/kolom, dan total keseluruhan dibandingkan dengan agregasi yang dihitung test dari data yang sama;
 * batas tampilan (200 baris, 40 kolom) tidak mengubah total.
 */
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const USER = "user-pemilik";
const ROWS = 1000;

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
  col(2, "Layanan", "text"),
  col(3, "Tanggal", "date"),
  col(4, "Omzet", "decimal"),
  col(5, "Resi", "text"),
  col(6, "Hari", "date"),
  col(7, "Rahasia", "decimal", true),
];
// Variasi huruf besar/kecil satu kategori ("CABANG 1" = "Cabang 1"), label = variasi paling sering.
const cabangOf = (i: number) => (i % 10 === 1 ? "CABANG 1" : `Cabang ${i % 4}`);
const layananOf = (i: number) => (i % 50 === 0 ? null : ["Express", "Reguler", "Kargo"][i % 3]!);
const omzetOf = (i: number) => ((i * 37) % 1000) + 0.5;
const bulanOf = (i: number) => {
  const d = new Date(Date.UTC(2026, 0, 1 + (i % 90)));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

let root: string;
let source: string;
let engine: QueryEngine;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-pivot-test-"));
  source = join(root, "typed.parquet");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(
    `COPY (SELECT (i + 2)::INTEGER AS _row,
                  CASE WHEN i % 10 = 1 THEN 'CABANG 1' ELSE 'Cabang ' || (i % 4) END AS c1,
                  CASE WHEN i % 50 = 0 THEN NULL ELSE ['Express', 'Reguler', 'Kargo'][(i % 3) + 1] END AS c2,
                  DATE '2026-01-01' + CAST(i % 90 AS INTEGER) AS c3,
                  CAST((i * 37) % 1000 + 0.5 AS DECIMAL(38,6)) AS c4,
                  'R' || lpad(CAST(i AS VARCHAR), 4, '0') AS c5,
                  DATE '2026-01-01' + CAST(i % 60 AS INTEGER) AS c6,
                  CAST(i AS DECIMAL(38,6)) AS c7
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

const fmt = { style: "auto", decimals: 0 } as const;
const base = {
  sheetId: SHEET,
  format: fmt,
  totals: true,
  subtotals: false,
  sort: "value_desc" as const,
};
const WIDGETS: Record<string, Omit<PivotSpec, "sheetId" | "format"> & Partial<PivotSpec>> = {
  bulan: {
    ...base,
    sort: "value_desc",
    rows: [{ column: 1 }],
    column: { column: 3, timeGrain: "month" },
    values: [{ agg: "sum", column: 4 }, { agg: "count" }],
  },
  dua: {
    ...base,
    sort: "label_asc",
    subtotals: true,
    rows: [{ column: 1 }, { column: 2 }],
    values: [{ agg: "sum", column: 4 }],
  },
  dkol: {
    ...base,
    sort: "label_asc",
    subtotals: true,
    rows: [{ column: 1 }, { column: 2 }],
    column: { column: 3, timeGrain: "month" },
    values: [{ agg: "sum", column: 4 }],
  },
  batas: {
    ...base,
    sort: "label_asc",
    rows: [{ column: 5 }],
    column: { column: 6 },
    values: [{ agg: "count" }],
  },
  tanpaTotal: {
    ...base,
    totals: false,
    rows: [{ column: 1 }],
    column: { column: 3, timeGrain: "month" },
    values: [{ agg: "avg", column: 4 }],
  },
  rahasia: { ...base, rows: [{ column: 1 }], values: [{ agg: "sum", column: 7 }] },
  // T-f4a7: bagian Saring tersimpan (huruf besar/kecil diabaikan seperti filter dashboard).
  srng: {
    ...base,
    rows: [{ column: 1 }],
    values: [{ agg: "sum", column: 4 }],
    filters: [{ column: 2, op: "in", values: ["EXPRESS"] }],
  },
  slah: {
    ...base,
    rows: [{ column: 1 }],
    values: [{ agg: "count" }],
    filters: [{ column: 3, op: "in", values: [5] }],
  },
};
const WID = (name: string) => `cmv4kljx40009oczvdmpu${name.padEnd(4, "x").slice(0, 4)}0`;

function deps(): QueryDeps {
  const repo: QueryRepo = {
    ownedDataset: async () => null,
    sheet: async (versionId, sheetId) =>
      versionId === VER && sheetId === SHEET
        ? { typedKey: "parquet/ds/v/s/typed-1.parquet", schemaRevision: 1, schema: SCHEMA }
        : null,
    widget: async (userId, widgetId) => {
      const name = Object.keys(WIDGETS).find((n) => WID(n) === widgetId);
      if (userId !== USER || !name) return null;
      return {
        type: "pivot",
        spec: WIDGETS[name]!,
        updatedAt: new Date(0),
        datasetId: DS,
        activeVersionId: VER,
        filterColumns: [{ sheet: "Data", column: "Layanan" }],
        dashboardId: "cmv4kljx40009oczvdmpudash0",
        role: "OWNER" as const,
      };
    },
    filterSources: async () => [{ name: "Layanan", type: "text" }],
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
  };
}

async function pivotOf(name: string, body: Record<string, unknown> = {}): Promise<PivotData> {
  const r = await runWidgetQuery(USER, { widgetId: WID(name), ...body }, deps());
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  expect(r.pivot).toBeDefined();
  return r.pivot!;
}

/** Kunci kategori teks seperti PivotTable: tidak peka huruf besar/kecil. */
const keyOf = (s: string | null) => (s === null ? null : s.toLowerCase());
const sumBy = <K>(key: (i: number) => K, pick: (i: number) => boolean = () => true) => {
  const m = new Map<K, number>();
  for (let i = 0; i < ROWS; i++) if (pick(i)) m.set(key(i), (m.get(key(i)) ?? 0) + omzetOf(i));
  return m;
};

describe("AC 1: sel, total baris/kolom, dan total keseluruhan = agregasi langsung", () => {
  it("Cabang × bulan: Total Omzet + Jumlah baris, urut total terbesar", async () => {
    const p = await pivotOf("bulan");
    expect(p.rowFields.map((f) => f.label)).toEqual(["Cabang"]);
    expect(p.columnField).toMatchObject({ label: "Tanggal", grain: "month" });
    expect(p.values.map((v) => v.label)).toEqual(["Total Omzet", "Jumlah baris"]);
    expect(p.columns).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);

    const perCabang = sumBy((i) => keyOf(cabangOf(i)));
    // Urutan baris: total terbesar dulu; label = variasi paling sering ("Cabang 1", bukan "CABANG 1").
    const order = [...perCabang.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    expect(p.rows.map((r) => keyOf(r.labels[0] as string))).toEqual(order);
    expect(p.rows.map((r) => r.labels[0])).toContain("Cabang 1");
    expect(p.rows.map((r) => r.labels[0])).not.toContain("CABANG 1");

    const cell = sumBy((i) => `${keyOf(cabangOf(i))}|${bulanOf(i)}`);
    p.rows.forEach((r, ri) => {
      const k = keyOf(r.labels[0] as string);
      p.columns.forEach((bulan, ci) => {
        const v = p.cells[ri]![ci]!;
        expect(v[0]).toBeCloseTo(cell.get(`${k}|${bulan}`)!, 6);
      });
      expect(p.rowTotals![ri]![0]).toBeCloseTo(perCabang.get(k)!, 6);
    });
    const perBulan = sumBy(bulanOf);
    p.columns.forEach((bulan, ci) =>
      expect(p.columnTotals![ci]![0]).toBeCloseTo(perBulan.get(bulan as string)!, 6),
    );
    let all = 0;
    for (let i = 0; i < ROWS; i++) all += omzetOf(i);
    expect(p.grandTotal![0]).toBeCloseTo(all, 6);
    expect(p.grandTotal![1]).toBe(ROWS);
    expect(p.subtotals).toBeNull();
  });

  it("dua baris + subtotal: urut label, (Kosong) terakhir, subtotal per cabang mencakup semua layanan", async () => {
    const p = await pivotOf("dua");
    expect(p.columns).toEqual([]);
    expect(p.groups).toEqual(["Cabang 0", "Cabang 1", "Cabang 2", "Cabang 3"]);
    const first = p.rows.filter((r) => r.group === 0).map((r) => r.labels[1]);
    expect(first).toEqual(["Express", "Kargo", "Reguler", null]);
    const leaf = sumBy((i) => `${keyOf(cabangOf(i))}|${layananOf(i)}`);
    p.rows.forEach((r, ri) => {
      const k = `${keyOf(r.labels[0] as string)}|${r.labels[1] as string | null}`;
      expect(p.cells[ri]![0]![0]).toBeCloseTo(leaf.get(k)!, 6);
    });
    const perCabang = sumBy((i) => keyOf(cabangOf(i)));
    p.groups.forEach((g, gi) =>
      expect(p.subtotals![gi]![0]![0]).toBeCloseTo(perCabang.get(keyOf(g as string))!, 6),
    );
    expect(p.rowTotals).toBeNull();
    expect(p.columnTotals).toBeNull();
  });

  it("dua baris + pemisah bulan: subtotal per bulan dan di kolom Total", async () => {
    const p = await pivotOf("dkol");
    const sub = sumBy((i) => `${keyOf(cabangOf(i))}|${bulanOf(i)}`);
    const perCabang = sumBy((i) => keyOf(cabangOf(i)));
    p.groups.forEach((g, gi) => {
      p.columns.forEach((b, ci) =>
        expect(p.subtotals![gi]![ci]![0]).toBeCloseTo(sub.get(`${keyOf(g as string)}|${b}`)!, 6),
      );
      expect(p.subtotalTotals![gi]![0]).toBeCloseTo(perCabang.get(keyOf(g as string))!, 6);
    });
  });

  it("tanpa total: tidak ada kolom/baris Total; rata-rata per sel", async () => {
    const p = await pivotOf("tanpaTotal");
    expect(p.rowTotals).toBeNull();
    expect(p.columnTotals).toBeNull();
    expect(p.grandTotal).toBeNull();
    const n = new Map<string, number>();
    const s = new Map<string, number>();
    for (let i = 0; i < ROWS; i++) {
      const k = `${keyOf(cabangOf(i))}|${bulanOf(i)}`;
      n.set(k, (n.get(k) ?? 0) + 1);
      s.set(k, (s.get(k) ?? 0) + omzetOf(i));
    }
    const ri = p.rows.findIndex((r) => r.labels[0] === "Cabang 2");
    p.columns.forEach((b, ci) => {
      const k = `cabang 2|${b}`;
      expect(p.cells[ri]![ci]![0]).toBeCloseTo(s.get(k)! / n.get(k)!, 6);
    });
  });
});

describe("AC 2: batas tampilan 200 baris × 40 kolom, total tetap dari seluruh data", () => {
  it("Resi (1.000) × Hari (60): tampil 200 × 40, jumlah sebenarnya dilaporkan, total = 1.000", async () => {
    const p = await pivotOf("batas");
    expect(p.rows).toHaveLength(200);
    expect(p.rowCount).toBe(ROWS);
    expect(p.columns).toHaveLength(40);
    expect(p.columnCount).toBe(60);
    expect(p.rows[0]!.labels).toEqual(["R0000"]);
    expect(p.columns[0]).toBe("2026-01-01");
    // Total baris mencakup kolom yang tidak tampil; total kolom mencakup baris yang tidak tampil.
    p.rowTotals!.forEach((t) => expect(t![0]).toBe(1));
    const perHari = new Map<number, number>();
    for (let i = 0; i < ROWS; i++) perHari.set(i % 60, (perHari.get(i % 60) ?? 0) + 1);
    p.columnTotals!.forEach((t, ci) => expect(t![0]).toBe(perHari.get(ci)));
    expect(p.grandTotal![0]).toBe(ROWS);
  });
});

describe("AC 3: filter dashboard, kolom tersembunyi, dan ganti data", () => {
  it("filter Layanan = Express berlaku pada sel dan total", async () => {
    const body = { dashboardFilters: [{ column: "Layanan", op: "in", values: ["Express"] }] };
    const r = await runWidgetQuery(USER, { widgetId: WID("bulan"), ...body }, deps());
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.skippedFilters).toBeFalsy();
    const p = await pivotOf("bulan", body);
    let all = 0;
    for (let i = 0; i < ROWS; i++) if (layananOf(i) === "Express") all += omzetOf(i);
    expect(p.grandTotal![0]).toBeCloseTo(all, 6);
  });

  it("kolom nilai disembunyikan → COLUMN_UNAVAILABLE untuk widget ini saja", async () => {
    const r = await runWidgetQuery(USER, { widgetId: WID("rahasia") }, deps());
    expect(r).toMatchObject({ ok: false, code: "COLUMN_UNAVAILABLE" });
  });

  it("hasil kedua dari cache hasil", async () => {
    const d = deps();
    await runWidgetQuery(USER, { widgetId: WID("bulan") }, d);
    expect(await runWidgetQuery(USER, { widgetId: WID("bulan") }, d)).toMatchObject({
      ok: true,
      cached: true,
    });
  });

  it("ganti data: kolom baris/pemisah/nilai dipetakan lewat nama", () => {
    const cfg = parseWidgetConfig("pivot", WIDGETS.bulan);
    if (!cfg.ok || cfg.config.type === "empty") throw new Error("spec");
    const old = { id: SHEET, name: "Data", aliasName: null, index: 0, schema: SCHEMA };
    const moved = SCHEMA.map((c) => ({ ...c, pos: c.pos + 10 }));
    const out = remapConfig(cfg.config, old, { ...old, id: "baru", schema: moved }, []);
    expect(out.missing).toEqual([]);
    expect(out.config).toMatchObject({
      type: "pivot",
      spec: {
        sheetId: "baru",
        rows: [{ column: 11 }],
        column: { column: 13, timeGrain: "month" },
        values: [{ agg: "sum", column: 14 }, { agg: "count" }],
      },
    });
  });
});

const total = (pick: (i: number) => boolean) => {
  let all = 0;
  for (let i = 0; i < ROWS; i++) if (pick(i)) all += omzetOf(i);
  return all;
};

describe("T-f4a7: saringan pivot dari pembaca, daftar nilai, dan bagian Saring", () => {
  it("baris 1 = Cabang 1 (semua variasi huruf): baris, total kolom, dan total ikut", async () => {
    const p = await pivotOf("bulan", {
      pivotFilters: [{ field: "row0", op: "in", values: ["Cabang 1"] }],
    });
    expect(p.rows.map((r) => r.labels[0])).toEqual(["Cabang 1"]);
    const pick = (i: number) => keyOf(cabangOf(i)) === "cabang 1";
    expect(p.grandTotal![0]).toBeCloseTo(total(pick), 6);
    const perBulan = sumBy(bulanOf, pick);
    p.columns.forEach((b, ci) =>
      expect(p.columnTotals![ci]![0]).toBeCloseTo(perBulan.get(b as string)!, 6),
    );
    expect(p.filters).toEqual([{ label: "Cabang", type: "text", op: "in", values: ["Cabang 1"] }]);
  });

  it("kolom pemisah bukan Januari (awal periode): kolom dan total tanpa Januari", async () => {
    const p = await pivotOf("bulan", {
      pivotFilters: [{ field: "column", op: "not_in", values: ["2026-01-01"] }],
    });
    expect(p.columns).toEqual(["2026-02-01", "2026-03-01"]);
    expect(p.grandTotal![0]).toBeCloseTo(
      total((i) => bulanOf(i) !== "2026-01-01"),
      6,
    );
    expect(p.filters?.[0]).toMatchObject({ label: "Tanggal", grain: "month", op: "not_in" });
  });

  it("baris 2 = (Kosong): hanya baris tanpa layanan, subtotal ikut", async () => {
    const p = await pivotOf("dua", { pivotFilters: [{ field: "row1", op: "in", values: [null] }] });
    expect(p.rows.every((r) => r.labels[1] === null)).toBe(true);
    const perCabang = sumBy(
      (i) => keyOf(cabangOf(i)),
      (i) => layananOf(i) === null,
    );
    p.groups.forEach((g, gi) =>
      expect(p.subtotals![gi]![0]![0]).toBeCloseTo(perCabang.get(keyOf(g as string))!, 6),
    );
  });

  it("field yang tidak ada di pivot / nilai salah tipe dilewati (hasil = tanpa saringan)", async () => {
    const plain = await pivotOf("bulan");
    const p = await pivotOf("bulan", {
      pivotFilters: [
        { field: "row1", op: "in", values: ["Express"] },
        { field: "row0", op: "in", values: [5] },
      ],
    });
    expect(p.grandTotal).toEqual(plain.grandTotal);
    expect(p.filters).toEqual([]);
  });

  it("daftar nilai field: urut naik, saringan field itu sendiri diabaikan, field lain berlaku", async () => {
    const run = (body: Record<string, unknown>) =>
      runWidgetQuery(USER, { widgetId: WID("bulan"), ...body }, deps());
    const own = await run({
      pivotValues: "row0",
      pivotFilters: [{ field: "row0", op: "in", values: ["Cabang 1"] }],
    });
    expect(own).toMatchObject({
      ok: true,
      pivotValues: { values: ["Cabang 0", "Cabang 1", "Cabang 2", "Cabang 3"], truncated: false },
    });
    const months = await run({ pivotValues: "column" });
    expect(months).toMatchObject({
      pivotValues: { values: ["2026-01-01", "2026-02-01", "2026-03-01"] },
    });
    // Saringan field lain berlaku pada daftar: periode tanpa data → daftar kosong.
    const other = await run({
      pivotValues: "row0",
      pivotFilters: [{ field: "column", op: "in", values: ["2099-01-01"] }],
    });
    expect(other).toMatchObject({ ok: true, pivotValues: { values: [] } });
    expect(await run({ pivotValues: "row1" })).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("bagian Saring tersimpan: hanya baris Express yang dihitung, tercatat di catatan", async () => {
    const p = await pivotOf("srng");
    expect(p.grandTotal![0]).toBeCloseTo(
      total((i) => layananOf(i) === "Express"),
      6,
    );
    expect(p.filters).toEqual([
      { label: "Layanan", type: "text", op: "in", values: ["EXPRESS"], saved: true },
    ]);
  });

  it("Saring dengan nilai yang tidak cocok tipe kolom → COLUMN_UNAVAILABLE, bukan diam-diam dilewati", async () => {
    const r = await runWidgetQuery(USER, { widgetId: WID("slah") }, deps());
    expect(r).toMatchObject({ ok: false, code: "COLUMN_UNAVAILABLE" });
  });

  it("ganti data: kolom Saring ikut dipetakan; kolom Saring ganda ditolak", () => {
    const cfg = parseWidgetConfig("pivot", { ...WIDGETS.srng, sheetId: SHEET });
    if (!cfg.ok || cfg.config.type === "empty") throw new Error("spec");
    const old = { id: SHEET, name: "Data", aliasName: null, index: 0, schema: SCHEMA };
    const moved = SCHEMA.map((c) => ({ ...c, pos: c.pos + 10 }));
    const out = remapConfig(cfg.config, old, { ...old, id: "baru", schema: moved }, []);
    expect(out.config).toMatchObject({ spec: { filters: [{ column: 12, values: ["EXPRESS"] }] } });
    const dup = { column: 2, op: "in", values: ["a"] };
    expect(parseWidgetConfig("pivot", { ...WIDGETS.srng, filters: [dup, dup] }).ok).toBe(false);
  });
});

describe("validasi spec pivot", () => {
  const ok = (spec: unknown) => parseWidgetConfig("pivot", spec).ok;
  it("baris 1–2, nilai 1–3, kolom sama hanya boleh dengan pengelompokan waktu berbeda", () => {
    expect(ok({ ...WIDGETS.bulan, sheetId: SHEET })).toBe(true);
    expect(ok({ ...WIDGETS.bulan, rows: [] })).toBe(false);
    expect(ok({ ...WIDGETS.bulan, rows: [{ column: 1 }, { column: 2 }, { column: 5 }] })).toBe(
      false,
    );
    expect(ok({ ...WIDGETS.bulan, values: [] })).toBe(false);
    expect(ok({ ...WIDGETS.bulan, values: Array(4).fill({ agg: "count" }) })).toBe(false);
    expect(ok({ ...WIDGETS.bulan, column: { column: 1 } })).toBe(false);
    // Tahun di baris × bulan di kolom dari kolom tanggal yang sama: sah.
    expect(
      ok({
        ...WIDGETS.bulan,
        rows: [{ column: 3, timeGrain: "year" }],
        column: { column: 3, timeGrain: "month" },
      }),
    ).toBe(true);
  });
});
