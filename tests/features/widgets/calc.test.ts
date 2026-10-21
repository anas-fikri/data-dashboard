import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { resolveSpec, specSchema } from "@/features/query/spec";
import { widgetPlan } from "@/features/query/widget";
import {
  CALC_AGGS_MAX,
  CALC_DEPTH_MAX,
  CALC_NODES_MAX,
  calcText,
  isAdditiveCalc,
  parseCalcExpr,
  type CalcExpr,
} from "@/features/widgets/calc";
import { MISSING_COLUMN, markerNames, remapConfig, type SheetInfo } from "@/features/widgets/remap";
import { columnsOf, parseWidgetConfig, type WidgetConfig } from "@/features/widgets/spec";
import { z } from "zod";
import { defaultConfig, type Source } from "@/components/dashboards/widget-config-model";

/*
 * T-068 field terhitung: validasi pohon ekspresi (bentuk, operator, batas, konstanta), aturan tipe
 * daun saat resolve (kolom tersembunyi/teks/tanggal), remap versi menjelajahi daun rumus, dan teks
 * rumus untuk panel. Murni (tanpa DuckDB); nilai/SQL diuji di tests/features/query/calc.test.ts.
 */
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const OTHER = "cmv4kljx40009oczvdmpurrxb";
const fmt = { style: "number", decimals: 0 } as const;
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
const SCHEMA = [
  col(1, "Wilayah", "text"),
  col(2, "Pendapatan", "decimal"),
  col(3, "Biaya", "decimal"),
  col(4, "Tanggal", "date"),
  col(5, "Rahasia", "decimal", true),
  col(6, "Durasi", "duration"),
];

const sum = (column: number) => ({ agg: "sum", column });
const op = (o: string, ...args: unknown[]) => ({ op: o, args });
const MARGIN = op("div", op("sub", sum(2), sum(3)), sum(2));
const calc = (expr: unknown, over: Record<string, unknown> = {}) => ({
  kind: "calc",
  label: "Margin",
  expr,
  ...over,
});
const pivot = (values: unknown[]) => ({
  sheetId: SHEET,
  rows: [{ column: 1 }],
  values,
  sort: "value_desc",
  format: fmt,
  totals: true,
  subtotals: false,
});
const parsePivot = (values: unknown[]) => parseWidgetConfig("pivot", pivot(values));
const message = (r: { ok: boolean; message?: string }) => (r.ok ? "" : (r.message ?? ""));
const posExpr = z.number().int().min(1);

/** neg(neg(…neg(sum)…)) sedalam `n` node. */
const deep = (n: number): unknown => (n <= 1 ? sum(2) : op("neg", deep(n - 1)));
/** Pohon seimbang add berisi `leaves` daun (2·leaves − 1 node). */
const wide = (leaves: unknown[]): unknown =>
  leaves.length === 1
    ? leaves[0]
    : op(
        "add",
        wide(leaves.slice(0, Math.ceil(leaves.length / 2))),
        wide(leaves.slice(Math.ceil(leaves.length / 2))),
      );

describe("AC 3: validasi pohon ekspresi (zod) — pesan Indonesia", () => {
  it("rumus margin valid; nilai ukuran lama tanpa kind tetap valid", () => {
    const r = parsePivot([calc(MARGIN), sum(2)]);
    expect(r.ok).toBe(true);
    if (!r.ok || r.config.type !== "pivot") return;
    expect(r.config.spec.values[0]).toEqual(calc(MARGIN));
    expect(r.config.spec.values[1]).toEqual(sum(2));
  });

  it.each([
    ["teks SQL sebagai expr", "SUM(c2) - SUM(c3); DROP TABLE x", "Bagian rumus tidak dikenal"],
    [
      "teks SQL di kolom daun",
      op("add", { agg: "sum", column: "c2); --" }, sum(3)),
      "Kolom di rumus",
    ],
    ["operator di luar enum", op("pow", sum(2), sum(3)), "Operator rumus hanya"],
    ["operator teks SQL", op("+ 1; --", sum(2), sum(3)), "Operator rumus hanya"],
    ["argumen kurang", op("div", sum(2)), "dua bagian"],
    ["argumen lebih", op("add", sum(2), sum(3), sum(2)), "dua bagian"],
    ["neg dua argumen", op("neg", sum(2), sum(3)), "satu bagian"],
    ["kunci asing di node", { ...sum(2), sql: "1" }, "tidak dikenal"],
    ["kunci asing di operator", { ...op("add", sum(2), sum(3)), raw: "x" }, "tidak dikenal"],
    ["agregasi asing", { agg: "median", column: 2 }, "Agregasi di rumus tidak dikenal"],
    ["sum tanpa kolom", { agg: "sum" }, "membutuhkan kolom"],
    ["hanya konstanta", op("add", { const: 1 }, { const: 2 }), "minimal satu ukuran"],
    ["konstanta Infinity", op("mul", sum(2), { const: Infinity }), "Angka di rumus"],
    ["konstanta NaN", op("mul", sum(2), { const: NaN }), "Angka di rumus"],
    ["konstanta > 1e15", op("mul", sum(2), { const: 1.000001e15 }), "Angka di rumus"],
    ["konstanta < −1e15", op("mul", sum(2), { const: -2e15 }), "Angka di rumus"],
    ["konstanta teks", op("mul", sum(2), { const: "2" }), "Angka di rumus"],
    ["null", null, "tidak dikenal"],
    ["larik", [sum(2)], "tidak dikenal"],
  ])("%s → ditolak", (_name, expr, text) => {
    const r = parsePivot([calc(expr)]);
    expect(r.ok).toBe(false);
    expect(message(r)).toContain(text);
  });

  it(`> ${CALC_NODES_MAX} node, kedalaman > ${CALC_DEPTH_MAX}, > ${CALC_AGGS_MAX} agregat unik → ditolak; tepat di batas → diterima`, () => {
    // 16 daun = 31 node, kedalaman 5 (pohon seimbang).
    const leaves = (n: number, distinct: number) =>
      Array.from({ length: n }, (_, i) => ({ agg: "count", column: (i % distinct) + 1 }));
    expect(parseCalcExpr(wide(leaves(16, 4)), posExpr).ok).toBe(true);
    const tooMany = op("add", wide(leaves(16, 4)), op("neg", sum(2)));
    expect(parseCalcExpr(tooMany, posExpr)).toEqual({
      ok: false,
      message: `Rumus terlalu panjang (maksimal ${CALC_NODES_MAX} bagian).`,
    });
    expect(parseCalcExpr(deep(CALC_DEPTH_MAX), posExpr).ok).toBe(true);
    expect(message(parseCalcExpr(deep(CALC_DEPTH_MAX + 1), posExpr) as never)).toContain(
      "terlalu bertingkat",
    );
    const aggs = (n: number) =>
      wide(Array.from({ length: n }, (_, i) => ({ agg: i % 2 ? "max" : "min", column: i + 1 })));
    expect(parseCalcExpr(aggs(CALC_AGGS_MAX), posExpr).ok).toBe(true);
    expect(message(parseCalcExpr(aggs(CALC_AGGS_MAX + 1), posExpr) as never)).toContain(
      `maksimal ${CALC_AGGS_MAX}`,
    );
    // Daun yang sama dihitung sekali: 9 kali Total Pendapatan = 1 agregat unik.
    expect(parseCalcExpr(wide(Array(9).fill(sum(2))), posExpr).ok).toBe(true);
  });

  it("pohon sangat dalam/lebar (ribuan tingkat) ditolak cepat tanpa stack overflow", () => {
    let nested: unknown = sum(2);
    for (let i = 0; i < 100_000; i++) nested = { op: "neg", args: [nested] };
    const t0 = performance.now();
    expect(message(parsePivot([calc(nested)]))).toContain("terlalu");
    const broad = op("add", ...Array.from({ length: 100_000 }, () => sum(2)));
    expect(parsePivot([calc(broad)]).ok).toBe(false);
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it("label wajib dan ≤ 60 karakter; showAs di KPI ditolak; kind lain ditolak", () => {
    expect(message(parsePivot([calc(MARGIN, { label: "  " })]))).toContain("wajib");
    expect(message(parsePivot([calc(MARGIN, { label: "x".repeat(61) })]))).toContain("60");
    const kpi = (measure: unknown) =>
      parseWidgetConfig("kpi", { sheetId: SHEET, measure, format: fmt });
    expect(kpi(calc(MARGIN)).ok).toBe(true);
    expect(kpi(calc(MARGIN, { showAs: "pct_grand" })).ok).toBe(false);
    expect(parsePivot([{ kind: "sql", sql: "SELECT 1" }]).ok).toBe(false);
    expect(parsePivot([calc(MARGIN, { sql: "x" })]).ok).toBe(false);
  });

  it("pai hanya untuk rumus aditif (± Total/Jumlah tanpa konstanta)", () => {
    const pie = (expr: unknown) =>
      parseWidgetConfig("pie", {
        sheetId: SHEET,
        dimension: { column: 1 },
        measure: calc(expr),
        sort: "value_desc",
        topN: 5,
        format: fmt,
      });
    expect(pie(op("sub", sum(2), sum(3))).ok).toBe(true);
    expect(message(pie(MARGIN))).toContain("pai");
    expect(pie(op("add", sum(2), { const: 1 })).ok).toBe(false);
    expect(isAdditiveCalc(op("sub", sum(2), op("neg", { agg: "count" })) as CalcExpr)).toBe(true);
    expect(isAdditiveCalc(op("add", sum(2), { agg: "avg", column: 2 }) as CalcExpr)).toBe(false);
  });

  it("spec query bebas (nama kolom) memakai validasi yang sama", () => {
    const base = { sheetId: SHEET, dimensions: [{ column: "Wilayah" }] };
    const ok = specSchema.safeParse({
      ...base,
      measures: [
        {
          kind: "calc",
          label: "M",
          expr: op("sub", { agg: "sum", column: "Pendapatan" }, { agg: "sum", column: "Biaya" }),
        },
      ],
    });
    expect(ok.success).toBe(true);
    const bad = specSchema.safeParse({
      ...base,
      measures: [
        {
          kind: "calc",
          label: "M",
          expr: op("exp", { agg: "sum", column: "Pendapatan" }, { const: 2 }),
        },
      ],
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toContain("Operator rumus hanya");
  });
});

describe("AC 3: resolve terhadap skema — tipe daun dan kolom tersembunyi", () => {
  const plan = (expr: unknown) => {
    const c = parsePivot([calc(expr)]);
    if (!c.ok) throw new Error(c.message);
    return widgetPlan(c.config as Exclude<WidgetConfig, { type: "empty" }>, SCHEMA, { page: 0 });
  };

  it.each([
    [
      "Total kolom teks",
      op("add", sum(1), sum(2)),
      "INVALID",
      'tidak bisa dipakai untuk kolom "Wilayah"',
    ],
    [
      "Rata-rata tanggal",
      op("add", { agg: "avg", column: 4 }, sum(2)),
      "INVALID",
      "tidak bisa dipakai",
    ],
    ["Terkecil tanggal", op("add", { agg: "min", column: 4 }, sum(2)), "INVALID", "ukuran angka"],
    ["Total durasi", op("div", sum(6), sum(2)), "INVALID", "kolom durasi"],
    ["kolom tersembunyi", op("div", sum(5), sum(2)), "COLUMN_UNAVAILABLE", "disembunyikan"],
    ["kolom tidak ada", op("div", sum(9), sum(2)), "COLUMN_UNAVAILABLE", "tidak ada di data"],
  ])("%s → %s", (_n, expr, code, text) => {
    const r = plan(expr);
    expect(r).toMatchObject({ ok: false, code });
    expect(message(r as never)).toContain(text);
  });

  it("jumlah unik/jumlah terisi kolom teks boleh; hasil angka berlabel nama field", () => {
    const r = plan(op("div", sum(2), { agg: "count_distinct", column: 1 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.columns.at(-1)).toEqual({ key: "m0", label: "Margin", type: "decimal" });
    expect(r.plan.measures[0]).toMatchObject({
      key: "m0",
      calc: { num: "double", additive: false },
    });
  });

  it("spec bebas: kolom tersembunyi/teks ditolak resolveSpec (INVALID 400)", () => {
    const free = (expr: unknown) =>
      resolveSpec(
        specSchema.parse({ sheetId: SHEET, measures: [{ kind: "calc", label: "M", expr }] }),
        SCHEMA,
      );
    expect(message(free(op("add", { agg: "sum", column: "Rahasia" }, { const: 1 })))).toContain(
      "disembunyikan",
    );
    expect(message(free(op("add", { agg: "sum", column: "Wilayah" }, { const: 1 })))).toContain(
      "tidak bisa dipakai",
    );
    expect(free(op("add", { agg: "sum", column: "Biaya" }, { const: 1 })).ok).toBe(true);
  });

  it("jenis angka: ± DECIMAL tetap tepat; ÷, × konstanta pecahan, rata-rata → DOUBLE", () => {
    const num = (expr: unknown) => {
      const r = plan(expr);
      if (!r.ok) throw new Error(r.message);
      return (r.plan.measures[0] as { calc: { num: string } }).calc.num;
    };
    expect(num(op("sub", sum(2), op("neg", sum(3))))).toBe("decimal");
    expect(num(op("add", sum(2), { const: 2 }))).toBe("decimal");
    expect(num(op("sub", { agg: "count" }, { agg: "count", column: 1 }))).toBe("integer");
    expect(num(op("add", sum(2), { const: 0.5 }))).toBe("double");
    expect(num(op("mul", sum(2), { const: 2 }))).toBe("double");
    expect(num(MARGIN)).toBe("double");
    expect(num(op("add", sum(2), { agg: "avg", column: 3 }))).toBe("double");
  });
});

describe("AC 5: remap versi menjelajahi daun rumus", () => {
  const sheet = (id: string, schema: ColumnSchema[]): SheetInfo => ({
    id,
    name: "Penjualan",
    index: 0,
    schema,
  });
  const OLD = sheet(SHEET, SCHEMA);

  it("kolom di dalam rumus dipetakan ke posisi baru (pivot, KPI, grafik)", () => {
    const moved = sheet(OTHER, [
      col(1, "Tanggal", "date"),
      col(2, "Wilayah", "text"),
      col(3, "Biaya", "decimal"),
      col(4, "Pendapatan", "decimal"),
    ]);
    const p = parsePivot([calc(MARGIN), sum(2)]);
    if (!p.ok || p.config.type === "empty") throw new Error("pivot");
    const r = remapConfig(p.config, OLD, moved);
    expect(r.missing).toEqual([]);
    expect(r.config.spec).toMatchObject({
      sheetId: OTHER,
      values: [calc(op("div", op("sub", sum(4), sum(3)), sum(4))), sum(4)],
    });
    const k = parseWidgetConfig("kpi", { sheetId: SHEET, measure: calc(MARGIN), format: fmt });
    if (!k.ok || k.config.type === "empty") throw new Error("kpi");
    const rk = remapConfig(k.config, OLD, moved);
    expect(columnsOf(rk.config)).toEqual([4, 3, 4]);
  });

  it("kolom rumus yang hilang → MISSING_COLUMN + nama lama, lalu COLUMN_UNAVAILABLE per widget", () => {
    const without = sheet(OTHER, [col(1, "Wilayah", "text"), col(2, "Pendapatan", "decimal")]);
    const b = parseWidgetConfig("bar", {
      sheetId: SHEET,
      dimension: { column: 1 },
      measure: calc(MARGIN),
      sort: "value_desc",
      topN: 10,
      format: fmt,
    });
    if (!b.ok || b.config.type === "empty") throw new Error("bar");
    const r = remapConfig(b.config, OLD, without);
    expect(r.missing).toEqual(["Biaya"]);
    expect(columnsOf(r.config)).toEqual([1, 2, MISSING_COLUMN, 2]);
    // Spec hasil pemetaan tetap valid dan penanda dikenali markerNames (nama lama dari missingColumns).
    expect(parseWidgetConfig(r.config.type, r.config.spec).ok).toBe(true);
    expect(markerNames(r.config, without.schema, ["Biaya"])).toEqual(["Biaya"]);
    const planned = widgetPlan(r.config, without.schema, { page: 0 });
    expect(planned).toMatchObject({ ok: false, code: "COLUMN_UNAVAILABLE" });
  });
});

describe("teks rumus untuk panel", () => {
  it("kurung hanya bila perlu; angka format Indonesia", () => {
    const name = (l: { agg: string; column?: number }) => `${l.agg}${l.column ?? ""}`;
    const t = (e: unknown) => calcText(e as CalcExpr, name as never);
    expect(t(MARGIN)).toBe("(sum2 − sum3) ÷ sum2");
    expect(t(op("sub", sum(2), op("sub", sum(3), sum(2))))).toBe("sum2 − (sum3 − sum2)");
    expect(t(op("mul", op("div", sum(2), sum(3)), { const: 1234.5 }))).toBe(
      "sum2 ÷ sum3 × 1.234,5",
    );
    expect(t(op("neg", op("add", sum(2), sum(3))))).toBe("−(sum2 + sum3)");
  });
});

describe("panel: ganti jenis grafik", () => {
  const sources = [
    {
      id: SHEET,
      name: "Penjualan",
      columns: [
        { pos: 1, name: "Wilayah", type: "text" },
        { pos: 2, name: "Pendapatan", type: "decimal" },
        { pos: 3, name: "Biaya", type: "decimal" },
      ],
    },
  ] as unknown as Source[];
  const bar = parseWidgetConfig("bar", {
    sheetId: SHEET,
    dimension: { column: 1 },
    measure: calc(MARGIN, { showAs: "diff_prev" }),
    sort: "value_desc",
    topN: 10,
    format: fmt,
  });

  it("batang → garis/KPI mempertahankan field terhitung (KPI tanpa cara tampil); pai rasio → ukuran bawaan", () => {
    if (!bar.ok) throw new Error(bar.message);
    const line = defaultConfig("line", sources, bar.config);
    expect(line).toMatchObject({
      type: "line",
      spec: { measure: calc(MARGIN, { showAs: "diff_prev" }) },
    });
    expect(parseWidgetConfig(line!.type, line!.spec).ok).toBe(true);
    expect(defaultConfig("pie", sources, bar.config)).toMatchObject({
      spec: { measure: { agg: "sum", column: 2 } },
    });
    // T-069 (T-068 L3): KPI memakai rumus yang sama tanpa "Tampilkan sebagai".
    const kpi = defaultConfig("kpi", sources, bar.config);
    expect(kpi).toMatchObject({ type: "kpi", spec: { measure: calc(MARGIN) } });
    expect(kpi!.spec).not.toHaveProperty("measure.showAs");
    expect(parseWidgetConfig(kpi!.type, kpi!.spec).ok).toBe(true);
  });
});
