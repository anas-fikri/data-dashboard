import { describe, expect, it } from "vitest";
import { REPICK_VALUE, effectiveConfig, parseBoundDisplay } from "@/features/widgets/bound";
import { crossFilterPositions, parseWidgetConfig, type PivotSpec } from "@/features/widgets/spec";

/*
 * T-073 (ADR-0009, rencana G-7 §4.3): spec efektif widget terikat = pivot tersimpan + tampilan widget,
 * murni dan divalidasi ulang seperti widget mandiri.
 */
const SHEET = "cmv4kljx40009oczvdmpurrxa";
const fmt = { style: "number", decimals: 0 } as const;
const margin = {
  kind: "calc" as const,
  label: "Margin",
  expr: {
    op: "div" as const,
    args: [
      {
        op: "sub" as const,
        args: [
          { agg: "sum" as const, column: 2 },
          { agg: "sum" as const, column: 3 },
        ],
      },
      { agg: "sum" as const, column: 2 },
    ] as [never, never],
  },
  format: { style: "percent", decimals: 1 } as const,
};
const PIVOT = (() => {
  const p = parseWidgetConfig("pivot", {
    sheetId: SHEET,
    rows: [{ column: 1, topN: { n: 5, by: 0 } }, { column: 5 }],
    column: { column: 4, timeGrain: "month" },
    values: [{ agg: "sum", column: 2, showAs: "pct_col" }, margin, { agg: "avg", column: 3 }],
    sort: "value_desc",
    format: fmt,
    totals: true,
    subtotals: true,
    subtotalLevels: [1],
    filters: [{ column: 5, op: "in", values: ["Reguler"] }],
    crossFilter: true,
  });
  if (!p.ok || p.config.type !== "pivot") throw new Error(JSON.stringify(p));
  return p.config.spec;
})();

describe("effectiveConfig: enam jenis widget dari satu pivot tersimpan", () => {
  it("pivot: definisi dari pivot tersimpan, urut/total/subtotal/filter silang/format dari tampilan", () => {
    const r = effectiveConfig(
      "pivot",
      { sort: "label_asc", totals: false, subtotals: false, crossFilter: false },
      PIVOT,
    );
    expect(r).toEqual({
      ok: true,
      config: {
        type: "pivot",
        spec: {
          sheetId: SHEET,
          rows: PIVOT.rows,
          column: PIVOT.column,
          values: PIVOT.values,
          filters: PIVOT.filters,
          sort: "label_asc",
          totals: false,
          subtotals: false,
          crossFilter: false,
          format: fmt,
        },
      },
    });
  });

  it("pivot: filter silang pivot tersimpan TIDAK diwarisi (tampilan yang memutuskan, D6)", () => {
    const r = effectiveConfig(
      "pivot",
      { sort: "value_desc", totals: true, subtotals: true },
      PIVOT,
    );
    expect(r.ok && crossFilterPositions(r.config)).toEqual([]);
    const on = effectiveConfig(
      "pivot",
      { sort: "value_desc", totals: true, subtotals: true, crossFilter: true },
      PIVOT,
    );
    expect(on.ok && crossFilterPositions(on.config)).toEqual([1, 5, 4]);
  });

  it("bar/line/pie: dimensi baris pertama atau kolom pemisah, SATU nilai + cara tampilnya, Saring ikut", () => {
    const bar = effectiveConfig(
      "bar",
      { dimension: "row", value: 1, sort: "value_desc", topN: 10 },
      PIVOT,
    );
    expect(bar).toEqual({
      ok: true,
      config: {
        type: "bar",
        spec: {
          sheetId: SHEET,
          dimension: { column: 1 },
          measure: margin,
          sort: "value_desc",
          topN: 10,
          format: fmt,
        },
      },
      filters: PIVOT.filters,
    });
    const line = effectiveConfig(
      "line",
      { dimension: "column", value: 2, sort: "label_desc", topN: 24, crossFilter: false },
      PIVOT,
    );
    expect(line.ok && line.config).toEqual({
      type: "line",
      spec: {
        sheetId: SHEET,
        dimension: { column: 4, timeGrain: "month" },
        measure: { agg: "avg", column: 3 },
        sort: "label_desc",
        topN: 24,
        format: fmt,
        crossFilter: false,
      },
    });
    // Pai: Total (tanpa cara tampil yang tidak bisa dipakai pai) — nilai 1 = Total + % kolom → ditolak.
    const pieBad = effectiveConfig(
      "pie",
      { dimension: "row", value: 0, sort: "value_desc", topN: 5 },
      PIVOT,
    );
    expect(pieBad).toMatchObject({ ok: false });
    expect(!pieBad.ok && pieBad.message.endsWith(REPICK_VALUE)).toBe(true);
  });

  it("kpi: satu nilai sebagai total keseluruhan, tanpa cara tampil; Saring ikut", () => {
    const r = effectiveConfig("kpi", { value: 0 }, PIVOT);
    expect(r).toEqual({
      ok: true,
      config: {
        type: "kpi",
        spec: { sheetId: SHEET, measure: { agg: "sum", column: 2 }, format: fmt },
      },
      filters: PIVOT.filters,
    });
    const calc = effectiveConfig(
      "kpi",
      { value: 1, format: { style: "rupiah", decimals: 0 } },
      PIVOT,
    );
    expect(calc.ok && calc.config.spec).toEqual({
      sheetId: SHEET,
      measure: margin,
      format: { style: "rupiah", decimals: 0 },
    });
  });

  it("tabel: pivot rata (baris + nilai, tanpa kolom pemisah/subtotal), bukan sumber filter silang", () => {
    const r = effectiveConfig("table", { sort: "value_asc", totals: true }, {
      ...PIVOT,
      values: [PIVOT.values[1]!, PIVOT.values[2]!],
    } as PivotSpec);
    expect(r).toEqual({
      ok: true,
      config: {
        type: "pivot",
        spec: {
          sheetId: SHEET,
          rows: PIVOT.rows,
          values: [PIVOT.values[1], PIVOT.values[2]],
          filters: PIVOT.filters,
          sort: "value_asc",
          totals: true,
          subtotals: false,
          format: fmt,
        },
      },
    });
    expect(r.ok && crossFilterPositions(r.config)).toEqual([]);
  });
});

describe("AC4: tampilan tidak cocok lagi dengan sumber → pesan 'Pilih ulang nilai'", () => {
  it("nilai ke-N yang sudah dihapus dari pivot tersimpan", () => {
    for (const [type, display] of [
      ["bar", { dimension: "row", value: 5, sort: "value_desc", topN: 10 }],
      ["kpi", { value: 7 }],
    ] as const) {
      const r = effectiveConfig(type, display, PIVOT);
      expect(r).toEqual({
        ok: false,
        message: `Nilai yang dipilih widget ini sudah tidak ada di pivot tersimpan. ${REPICK_VALUE}`,
      });
    }
  });

  it("grafik dengan % dari total kolom (hanya pivot) dan kolom pemisah yang dihapus", () => {
    const pct = effectiveConfig(
      "bar",
      { dimension: "row", value: 0, sort: "value_desc", topN: 10 },
      PIVOT,
    );
    expect(pct.ok).toBe(false);
    expect(!pct.ok && pct.message).toContain(REPICK_VALUE);
    const { column: _c, ...noColumn } = PIVOT;
    const r = effectiveConfig(
      "line",
      { dimension: "column", value: 2, sort: "label_desc", topN: 24 },
      noColumn as PivotSpec,
    );
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("Pilih ulang dimensi") });
  });
});

describe("parseBoundDisplay: tampilan saja (strict)", () => {
  it("menolak jenis tanpa sumber pivot dan field definisi di tampilan", () => {
    expect(parseBoundDisplay("empty", {})).toMatchObject({ ok: false });
    expect(
      parseBoundDisplay("kpi", { value: 0, sheetId: SHEET, measure: { agg: "count" } }),
    ).toMatchObject({ ok: false });
    expect(
      parseBoundDisplay("pivot", {
        sort: "value_desc",
        totals: true,
        subtotals: true,
        rows: [{ column: 3 }],
      }),
    ).toMatchObject({ ok: false });
    expect(
      parseBoundDisplay("pie", { dimension: "row", value: 0, sort: "value_desc", topN: 6 }),
    ).toEqual({ ok: false, message: "Maksimal 5 kategori untuk grafik ini." });
  });

  it("tampilan widget terikat tidak pernah lolos sebagai spec widget mandiri (aktivasi melewatinya)", () => {
    for (const [type, display] of [
      ["pivot", { sort: "value_desc", totals: true, subtotals: true }],
      ["bar", { dimension: "row", value: 0, sort: "value_desc", topN: 10 }],
      ["kpi", { value: 0 }],
      ["table", { sort: "value_desc", totals: true }],
    ] as const) {
      expect(parseBoundDisplay(type, display).ok).toBe(true);
      expect(parseWidgetConfig(type, display).ok).toBe(false);
    }
  });
});
