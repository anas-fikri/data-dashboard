import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { pivotGrid } from "@/features/exports/pivot";
import { buildPivotSql, pivotOutTypes, shapePivot, type PivotData } from "@/features/query/pivot";
import { buildSql, buildTotalsSql } from "@/features/query/sql";
import { toJson } from "@/features/query/service";
import { widgetPlan } from "@/features/query/widget";
import { pivotTable } from "@/features/widgets/pivot-table";
import {
  PIVOT_OTHER_LABEL,
  TOP_N_AXIS_TEXT,
  parseWidgetConfig,
  pivotTopNAxisRow,
  type WidgetConfig,
} from "@/features/widgets/spec";
import { LEGACY_SCHEMA, LEGACY_SHEET, T070_CASES, legacyHashes } from "./pivot-legacy-cases";

/*
 * T-071: Top N per kelompok induk + "(Lainnya)". Fixture kecil bernilai manual:
 *  Wilayah Jawa: C1 700, "Lainnya" (kategori data sungguhan) 650, C2 600, C3 500, C4 400,
 *    C5 300 (dua baris 100 + 200), C6 300 (Feb), C7 60 → Top 5 = C1, Lainnya, C2, C3, C4;
 *    "(Lainnya)" = C5 + C6 + C7 = 660.
 *  Wilayah Bali: B2 200, (kosong) 150, B1 100.
 * Pendapatan = c3, Biaya = c4, Resi = c5 (beberapa resi dipakai dua kota), Bulan = c6.
 */
const SHEET = "cmv4kljx40009oczvdmpurrxa";
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
  col(1, "Wilayah", "text"),
  col(2, "Kota", "text"),
  col(3, "Pendapatan", "decimal"),
  col(4, "Biaya", "decimal"),
  col(5, "Resi", "text"),
  col(6, "Tanggal", "date"),
];
// [wilayah, kota, pendapatan, biaya, resi, tanggal]
const DATA: [string, string | null, number, number, string, string][] = [
  ["Jawa", "C1", 700, 100, "R10", "2026-01-05"],
  ["Jawa", "Lainnya", 650, 0, "R11", "2026-01-05"],
  ["Jawa", "C2", 600, 0, "R12", "2026-01-05"],
  ["Jawa", "C3", 500, 0, "R13", "2026-01-05"],
  ["Jawa", "C4", 400, 0, "R14", "2026-01-05"],
  ["Jawa", "C5", 100, 50, "R1", "2026-01-06"],
  ["Jawa", "C5", 200, 50, "R2", "2026-01-07"],
  ["Jawa", "C6", 300, 100, "R2", "2026-02-01"],
  ["Jawa", "C7", 60, 30, "R3", "2026-01-08"],
  ["Bali", "B2", 200, 0, "R20", "2026-01-05"],
  ["Bali", null, 150, 0, "R21", "2026-01-05"],
  ["Bali", "B1", 100, 0, "R22", "2026-02-05"],
];

let root: string;
let path: string;
let db: DuckDBInstance;
let conn: DuckDBConnection;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-pivot-topn-"));
  path = join(root, "typed.parquet");
  db = await DuckDBInstance.create(":memory:");
  conn = await db.connect();
  const q = (v: string | null) => (v === null ? "NULL" : `'${v}'`);
  const values = DATA.map(
    ([w, k, p, b, r, t]) => `(${q(w)}, ${q(k)}, ${p}, ${b}, ${q(r)}, DATE '${t}')`,
  ).join(", ");
  await conn.run(
    `COPY (SELECT c1, c2, CAST(c3 AS DECIMAL(38,6)) AS c3, CAST(c4 AS DECIMAL(38,6)) AS c4, c5, c6
           FROM (VALUES ${values}) t(c1, c2, c3, c4, c5, c6)) TO '${path}' (FORMAT parquet)`,
  );
});
afterAll(() => {
  conn?.closeSync();
  db?.closeSync();
  rmSync(root, { recursive: true, force: true });
});

const margin = {
  kind: "calc",
  label: "Margin",
  expr: {
    op: "div",
    args: [
      {
        op: "sub",
        args: [
          { agg: "sum", column: 3 },
          { agg: "sum", column: 4 },
        ],
      },
      { agg: "sum", column: 3 },
    ],
  },
} as const;
const base = {
  sheetId: SHEET,
  format: { style: "auto", decimals: 0 },
  sort: "value_desc",
  totals: true,
  subtotals: true,
} as const;
const top5 = {
  ...base,
  rows: [{ column: 1 }, { column: 2, topN: { n: 5, by: 0 } }],
  values: [{ agg: "sum", column: 3 }],
};

async function run(spec: unknown): Promise<PivotData> {
  const c = parseWidgetConfig("pivot", spec);
  if (!c.ok) throw new Error(c.message);
  const w = widgetPlan(c.config as Exclude<WidgetConfig, { type: "empty" }>, SCHEMA, { page: 0 });
  if (!w.ok || w.kind !== "pivot") throw new Error(w.ok ? "bukan pivot" : w.message);
  const built = buildPivotSql(w.plan, w.pivot, path);
  const raw = (await conn.runAndReadAll(built.sql, built.params)).getRowsJS() as unknown[][];
  const types = pivotOutTypes(w.plan, w.pivot);
  return shapePivot(
    raw.map((r) => r.map((x, i) => toJson(x, types[i]!))),
    w.plan,
    w.pivot,
  );
}

/** Baris model tabel: [jenis, label, angka pertama…]. */
const lines = (p: PivotData) =>
  pivotTable(p).rows.map((r) => [
    r.kind,
    r.label,
    ...r.values.map((v) => (v === null ? null : Number(v))),
  ]);

describe("AC 1: Top 5 Kota per Wilayah menurut Total Pendapatan", () => {
  it("≤ 5 kota teratas + (Lainnya) per wilayah; subtotal = tampil + (Lainnya) = tanpa Top N", async () => {
    const p = await run(top5);
    expect(lines(p)).toEqual([
      ["group", "Jawa", 3510],
      ["leaf", "C1", 700],
      ["leaf", "Lainnya", 650],
      ["leaf", "C2", 600],
      ["leaf", "C3", 500],
      ["leaf", "C4", 400],
      ["leaf", PIVOT_OTHER_LABEL, 660],
      ["group", "Bali", 450],
      ["leaf", "B2", 200],
      ["leaf", "(kosong)", 150],
      ["leaf", "B1", 100],
    ]);
    expect(Number(p.grandTotal![0])).toBe(3960);
    // Tanpa Top N: subtotal dan total keseluruhan sama.
    const all = await run({ ...top5, rows: [{ column: 1 }, { column: 2 }] });
    expect(all.subtotals!.map((s) => Number(s[0]![0]))).toEqual(
      p.subtotals!.map((s) => Number(s[0]![0])),
    );
    expect(Number(all.grandTotal![0])).toBe(3960);
    expect(all.rowCount).toBe(12 - 1 /* C5 dua baris */);
    // Jumlah baris = baris setelah digabung (11 kota → 9 baris tampil).
    expect(p.rowCount).toBe(9);
  });

  it("(Lainnya) selalu terakhir di induknya, juga urut label naik/turun", async () => {
    const order = {
      label_asc: ["C1", "C2", "C3", "C4", "Lainnya"],
      label_desc: ["Lainnya", "C4", "C3", "C2", "C1"],
      value_asc: ["C4", "C3", "C2", "Lainnya", "C1"],
    };
    for (const sort of ["label_asc", "label_desc", "value_asc"] as const) {
      const l = lines(await run({ ...top5, sort }));
      const at = l.findIndex((x) => x[1] === "Jawa");
      expect(l.slice(at + 1, at + 7).map((x) => x[1])).toEqual([...order[sort], PIVOT_OTHER_LABEL]);
    }
  });

  it("seri nilai dipecah label naik (deterministik): Top 6 memilih C5 (300) bukan C6 (300)", async () => {
    const p = await run({ ...top5, rows: [{ column: 1 }, { column: 2, topN: { n: 6, by: 0 } }] });
    const jawa = lines(p).slice(1, 8);
    expect(jawa.map((l) => l[1])).toEqual([
      "C1",
      "Lainnya",
      "C2",
      "C3",
      "C4",
      "C5",
      PIVOT_OTHER_LABEL,
    ]);
    expect(jawa.at(-1)![2]).toBe(360);
  });

  it("(kosong) sungguhan tetap berbeda dari (Lainnya) di induk yang sama", async () => {
    const p = await run({ ...top5, rows: [{ column: 1 }, { column: 2, topN: { n: 2, by: 0 } }] });
    const bali = lines(p).slice(-4);
    expect(bali).toEqual([
      ["group", "Bali", 450],
      ["leaf", "B2", 200],
      ["leaf", "(kosong)", 150],
      ["leaf", PIVOT_OTHER_LABEL, 100],
    ]);
  });

  it("Top N level 1: wilayah sisa jadi (Lainnya) dengan rincian kotanya", async () => {
    const p = await run({
      ...top5,
      rows: [{ column: 1, topN: { n: 1, by: 0 } }, { column: 2 }],
    });
    const m = pivotTable(p);
    const groups = m.rows.filter((r) => r.kind === "group");
    expect(groups.map((g) => [g.label, Number(g.values[0])])).toEqual([
      ["Jawa", 3510],
      [PIVOT_OTHER_LABEL, 450],
    ]);
    // Rincian di bawah (Lainnya) tetap kota aslinya (bisa disaring), induknya tidak.
    const under = m.rows.slice(m.rows.indexOf(groups[1]!) + 1);
    expect(under.map((r) => r.label)).toEqual(["B2", "(kosong)", "B1"]);
    expect(under[0]!.pick).toEqual({ field: "row1", raw: "B2" });
    expect(groups[1]!.pick).toBeUndefined();
  });

  it("Top N dua level sekaligus: kota dihitung di dalam wilayah (Lainnya)", async () => {
    const p = await run({
      ...top5,
      rows: [
        { column: 1, topN: { n: 1, by: 0 } },
        { column: 2, topN: { n: 1, by: 0 } },
      ],
    });
    expect(lines(p)).toEqual([
      ["group", "Jawa", 3510],
      ["leaf", "C1", 700],
      ["leaf", PIVOT_OTHER_LABEL, 2810],
      ["group", PIVOT_OTHER_LABEL, 450],
      ["leaf", "B2", 200],
      ["leaf", PIVOT_OTHER_LABEL, 250],
    ]);
    expect(Number(p.grandTotal![0])).toBe(3960);
  });

  it("dengan kolom pemisah: sel (Lainnya) per bulan, total baris/kolom tetap", async () => {
    const p = await run({ ...top5, column: { column: 6, timeGrain: "month" } });
    expect(p.columns).toEqual(["2026-01-01", "2026-02-01"]);
    const m = pivotTable(p);
    const other = m.rows.find((r) => r.other)!;
    // Jan: C5 300 + C7 60; Feb: C6 300; Total 660.
    expect(other.values.map(Number)).toEqual([360, 300, 660]);
    expect(m.total!.values.map(Number)).toEqual([3560, 400, 3960]);
  });

  it("satu field baris: Top 3 kota seluruh data + (Lainnya), total tetap", async () => {
    const p = await run({ ...top5, rows: [{ column: 2, topN: { n: 3, by: 0 } }] });
    expect(lines(p)).toEqual([
      ["leaf", "C1", 700],
      ["leaf", "Lainnya", 650],
      ["leaf", "C2", 600],
      ["leaf", PIVOT_OTHER_LABEL, 3960 - 1950],
    ]);
    expect(Number(p.grandTotal![0])).toBe(3960);
  });

  it("3 field baris: Top 2 kota di level tengah, subtotal kota (Lainnya) = jumlah bulannya", async () => {
    const p = await run({
      ...top5,
      sort: "label_asc",
      rows: [
        { column: 1 },
        { column: 2, topN: { n: 2, by: 0 } },
        { column: 6, timeGrain: "month" },
      ],
    });
    const l = lines(p);
    const at = l.findIndex((x) => x[1] === PIVOT_OTHER_LABEL && x[0] === "group");
    // Top 2 Bali = B2 200, (kosong) 150 → (Lainnya) = B1 100 (Feb).
    expect(l.slice(at, at + 2)).toEqual([
      ["group", PIVOT_OTHER_LABEL, 100],
      ["leaf", "Feb 2026", 100],
    ]);
    const jawaOther = l.findLastIndex((x) => x[1] === PIVOT_OTHER_LABEL && x[0] === "group");
    // Jawa (Lainnya) = C2 600 + C3 500 + C4 400 + C5 300 + C6 300 + C7 60 = 2160: Jan 1860, Feb 300.
    expect(l.slice(jawaOther, jawaOther + 3)).toEqual([
      ["group", PIVOT_OTHER_LABEL, 2160],
      ["leaf", "Jan 2026", 1860],
      ["leaf", "Feb 2026", 300],
    ]);
    expect(Number(p.grandTotal![0])).toBe(3960);
  });

  it("Top N menurut nilai ke-2 (Biaya): peringkat berbeda, angka tetap Pendapatan", async () => {
    const p = await run({
      ...top5,
      rows: [{ column: 1 }, { column: 2, topN: { n: 2, by: 1 } }],
      values: [
        { agg: "sum", column: 3 },
        { agg: "sum", column: 4 },
      ],
    });
    // Biaya Jawa: C1, C5, C6 = 100 (seri → label naik: C1, C5), sisanya (Lainnya).
    const jawa = lines(p).slice(1, 4);
    expect(jawa.map((l) => l[1])).toEqual(["C1", "C5", PIVOT_OTHER_LABEL]);
    // Pendapatan 3510 − 700 − 300, Biaya 330 − 100 − 100 (C6 100 + C7 30).
    expect(jawa[2]!.slice(2)).toEqual([2510, 130]);
  });
});

describe("AC 2: nilai tidak aditif di (Lainnya) dihitung ulang dari baris mentah", () => {
  it("rata-rata, jumlah unik, min/maks, field terhitung = nilai manual", async () => {
    const p = await run({
      ...top5,
      values: [
        { agg: "avg", column: 3 },
        { agg: "count_distinct", column: 5 },
        { agg: "min", column: 3 },
        { agg: "max", column: 3 },
        margin,
        { agg: "count" },
      ],
      rows: [{ column: 1 }, { column: 2, topN: { n: 5, by: 5 } }],
    });
    // Top 5 menurut jumlah baris (C5 = 2 baris, lalu seri 1 baris → label naik: C1–C4); tampil urut
    // Nilai 1 (rata-rata).
    const m = pivotTable(p);
    const jawa = m.rows.slice(1, 7);
    expect(jawa.map((r) => r.label)).toEqual(["C1", "C2", "C3", "C4", "C5", PIVOT_OTHER_LABEL]);
    const other = jawa.at(-1)!.values.map(Number);
    // (Lainnya) = Lainnya 650 (R11, biaya 0), C6 300 (R2, biaya 100), C7 60 (R3, biaya 30).
    expect(other[0]).toBeCloseTo((650 + 300 + 60) / 3, 9); // bukan rata-rata dari rata-rata
    expect(other[1]).toBe(3); // R11, R2, R3
    expect(other[2]).toBe(60);
    expect(other[3]).toBe(650);
    expect(other[4]).toBeCloseTo((1010 - 130) / 1010, 9);
    expect(other[5]).toBe(3);
  });

  it("resi dipakai dua kota di (Lainnya): jumlah unik tidak dijumlahkan per kota", async () => {
    const p = await run({
      ...top5,
      values: [
        { agg: "sum", column: 3 },
        { agg: "count_distinct", column: 5 },
      ],
    });
    const other = pivotTable(p).rows.find((r) => r.other)!;
    // C5 (R1, R2) + C6 (R2) + C7 (R3) = 3 resi unik, bukan 2 + 1 + 1.
    expect(other.values.map(Number)).toEqual([660, 3]);
  });

  it("% dari total keseluruhan: (Lainnya) = sisa / seluruh data", async () => {
    const p = await run({
      ...top5,
      values: [{ agg: "sum", column: 3, showAs: "pct_grand" }],
    });
    const m = pivotTable(p);
    const leaves = m.rows.slice(1, 7);
    const other = m.rows.find((r) => r.other)!;
    expect(Number(other.values[0])).toBeCloseTo(660 / 3960, 9);
    // Persen tampil + (Lainnya) = persen subtotal wilayah.
    const sum = leaves.reduce((a, r) => a + Number(r.values[0]), 0);
    expect(sum).toBeCloseTo(Number(m.rows[0]!.values[0]), 9);
    expect(Number(m.rows[0]!.values[0])).toBeCloseTo(3510 / 3960, 9);
  });
});

describe("AC 3: validasi sumbu dan label (Lainnya) berbeda dari data", () => {
  const parse = (spec: unknown) => parseWidgetConfig("pivot", spec);
  it("Top N baris terdalam + total berjalan/selisih tanpa pemisah ditolak dengan alasan", () => {
    for (const showAs of ["running", "diff_prev", "pct_diff_prev"] as const) {
      const r = parse({ ...top5, values: [{ agg: "sum", column: 3, showAs }] });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.message).toContain(TOP_N_AXIS_TEXT);
    }
  });
  it("diizinkan: dengan kolom pemisah (sumbu = kolom), atau Top N di level induk", () => {
    const running = [{ agg: "sum", column: 3, showAs: "running" }];
    expect(parse({ ...top5, values: running, column: { column: 6, timeGrain: "month" } }).ok).toBe(
      true,
    );
    expect(
      parse({
        ...top5,
        values: running,
        rows: [{ column: 1, topN: { n: 1, by: 0 } }, { column: 2 }],
      }).ok,
    ).toBe(true);
    expect(
      pivotTopNAxisRow({ rows: [{}, { topN: {} }], values: [{ showAs: "pct_grand" }] }),
    ).toBeNull();
  });
  it("batas: N 1–50, nilai peringkat harus ada", () => {
    const at = (topN: unknown) => parse({ ...top5, rows: [{ column: 1 }, { column: 2, topN }] });
    expect(at({ n: 1, by: 0 }).ok).toBe(true);
    expect(at({ n: 50, by: 0 }).ok).toBe(true);
    expect(at({ n: 0, by: 0 }).ok).toBe(false);
    expect(at({ n: 51, by: 0 }).ok).toBe(false);
    expect(at({ n: 2.5, by: 0 }).ok).toBe(false);
    expect(at({ n: 5, by: 1 }).ok).toBe(false);
    expect(at({ n: 5, by: 0, extra: 1 }).ok).toBe(false);
  });

  it("total berjalan sepanjang kolom pemisah tetap benar dengan Top N", async () => {
    const p = await run({
      ...top5,
      column: { column: 6, timeGrain: "month" },
      values: [{ agg: "sum", column: 3, showAs: "running" }],
    });
    const other = pivotTable(p).rows.find((r) => r.other)!;
    expect(other.values.slice(0, 2).map(Number)).toEqual([360, 660]);
  });

  it("kategori data 'Lainnya' bisa disaring; (Lainnya) sistem tidak", async () => {
    const m = pivotTable(await run(top5));
    const real = m.rows.find((r) => r.label === "Lainnya")!;
    expect(real.pick).toEqual({ field: "row1", raw: "Lainnya" });
    expect(real.other).toBeUndefined();
    const sys = m.rows.find((r) => r.label === PIVOT_OTHER_LABEL)!;
    expect(sys.other).toBe(true);
    expect(sys.pick).toBeUndefined();
  });
});

describe("AC 4: ekspor memuat (Lainnya) dengan label yang sama", () => {
  it("grid CSV/XLSX", async () => {
    const p = await run(top5);
    const grid = pivotGrid(
      pivotTable(p),
      p.rowFields.map((f) => f.label),
    );
    const row = grid.rows.find((r) => r[1] === PIVOT_OTHER_LABEL)!;
    expect(row.slice(0, 3).map((v) => (typeof v === "number" ? v : v))).toEqual([
      "Jawa",
      PIVOT_OTHER_LABEL,
      660,
    ]);
    expect(grid.rows.find((r) => r[1] === "Lainnya")!.slice(0, 3)).toEqual([
      "Jawa",
      "Lainnya",
      650,
    ]);
  });
});

describe("AC 5: SQL + kunci cache tanpa Top N identik (pivot T-070 dan grafik Top N lama)", () => {
  // Dihitung dari HEAD 3f15210 (sebelum T-071).
  const GOLDEN: Record<string, readonly [string, string]> = {
    "4 baris + kolom, 8 nilai, subtotal level 2": [
      "ae0d29a539a74b1fa7d9590f205a1d5252e6ac101b3b17d16d2311c49546f245",
      "d325997d9db7dcc5906807b3e65edb6c94547e1d089d7ba4481c08f0fda78989",
    ],
    "3 baris tanpa kolom, total berjalan, urut label": [
      "0245e4334e1c0950af9295942e1d9736db83f5afc5a85d5d2c3b832b333dbd22",
      "214499e0b370435514d1f910efeec9916f613631786a1ed6a244b5c04c5fd599",
    ],
    "1 baris, 5 nilai": [
      "3ceb1b82d6cce8a8025fafcfb0494a50544371e9d075afc4374f3a05630230e5",
      "becb90e87c84e21f16f5390e12cf4c5eb5d77cb41f447baf5ded1945a5c9211e",
    ],
  };
  it.each(T070_CASES)("pivot %s", (name, spec, body) => {
    expect(legacyHashes(spec, body)).toEqual(GOLDEN[name]);
  });

  const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const f = { style: "auto", decimals: 0 };
  const CHART: [string, string, Record<string, unknown>, readonly [string, string]][] = [
    [
      "bar top 12",
      "bar",
      {
        sheetId: LEGACY_SHEET,
        dimension: { column: 1 },
        measure: { agg: "sum", column: 4 },
        sort: "value_desc",
        topN: 12,
        format: f,
      },
      [
        "42c773fdc04eabbf795cf3de91ad0ae8322b0c2074a687f7089acb44d71aad0a",
        "ff268889ecdc5b173e31e2d30da80b6ccf93c66a4a7fab24bfd932b2ba911557",
      ],
    ],
    [
      "pie top 5 + Lainnya",
      "pie",
      {
        sheetId: LEGACY_SHEET,
        dimension: { column: 2 },
        measure: { agg: "count" },
        sort: "value_desc",
        topN: 5,
        format: f,
      },
      [
        "75d9a2a57042bf998fa8a874c639ec6d727fa376adc6aae81eabcf62ee82bf1a",
        "d30621bbdc543c2415eebd3ecbf5038a2336422b71df99903b09d9cfe1ad3e08",
      ],
    ],
  ];
  it.each(CHART)("grafik %s", (_, type, spec, want) => {
    const c = parseWidgetConfig(type, spec);
    if (!c.ok) throw new Error(c.message);
    const w = widgetPlan(c.config as Exclude<WidgetConfig, { type: "empty" }>, LEGACY_SCHEMA, {
      page: 0,
    });
    if (!w.ok) throw new Error(w.message);
    expect([sha(buildSql(w.plan, "/x")), sha(buildTotalsSql(w.plan, "/x"))]).toEqual(want);
  });
});
