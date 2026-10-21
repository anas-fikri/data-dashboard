import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalcEditor, CalcField } from "@/components/dashboards/calc-editor";
import {
  calcAggOptions,
  calcColumnsForAgg,
  calcLeafProblem,
  calcPreviewSpec,
  checkCalc,
} from "@/components/dashboards/calc-editor-model";
import {
  carryCalc,
  droppedCalcNotice,
  type Source,
} from "@/components/dashboards/widget-config-model";
import type { CalcToken } from "@/features/widgets/calc-tokens";
import { parseWidgetConfig, type CalcValue, type WidgetConfig } from "@/features/widgets/spec";

/*
 * T-069 editor field terhitung: aturan ukuran rumus sama dengan server (durasi/tanggal ditolak untuk
 * agregat nilai), pemeriksaan sebelum simpan (token salah, pai aditif, nama), spec pratinjau lewat
 * nama kolom, field terhitung ikut saat jenis berganti (T-068 L3) atau diberi tahu, dan markup editor
 * (token sebagai daftar, galat terhubung ke token, Simpan nonaktif, tanpa input rumus bebas).
 */
const S1 = "cmv4kljx40009oczvdmpurrs1";
const S2 = "cmv4kljx40009oczvdmpurrs2";
const cols = [
  { pos: 1, name: "Wilayah", type: "text" },
  { pos: 2, name: "Pendapatan", type: "decimal" },
  { pos: 3, name: "Biaya", type: "decimal" },
  { pos: 4, name: "Tanggal", type: "date" },
  { pos: 5, name: "Durasi", type: "duration" },
] as Source["columns"];
const m = (column: number, agg: "sum" | "avg" = "sum"): CalcToken => ({
  t: "measure",
  agg,
  column,
});
const op = (o: "add" | "sub" | "mul" | "div"): CalcToken => ({ t: "op", op: o });
const MARGIN_TOKENS: CalcToken[] = [
  { t: "lparen" },
  m(2),
  op("sub"),
  m(3),
  { t: "rparen" },
  op("div"),
  m(2),
];
const sum = (column: number) => ({ agg: "sum" as const, column });
const MARGIN: CalcValue = {
  kind: "calc",
  label: "Margin",
  expr: { op: "div", args: [{ op: "sub", args: [sum(2), sum(3)] }, sum(2)] },
};
const LABA: CalcValue = {
  kind: "calc",
  label: "Laba",
  expr: { op: "sub", args: [sum(2), sum(3)] },
};
const fmt = { style: "number", decimals: 0 } as const;
const base = { label: "Margin", format: undefined, showAs: undefined, columns: cols };

describe("model editor", () => {
  it("ukuran rumus: Total/Rata-rata/Terkecil/Terbesar hanya angka (bukan durasi/tanggal); jumlah semua kolom", () => {
    expect(calcColumnsForAgg("sum", cols).map((c) => c.pos)).toEqual([2, 3]);
    expect(calcColumnsForAgg("max", cols).map((c) => c.pos)).toEqual([2, 3]);
    expect(calcColumnsForAgg("count_distinct", cols)).toHaveLength(5);
    expect(calcAggOptions(cols).map((o) => o.value)).toEqual([
      "sum",
      "avg",
      "count",
      "count_filled",
      "count_distinct",
      "min",
      "max",
    ]);
    expect(calcLeafProblem({ agg: "sum", column: 5 }, cols)).toMatch(/durasi/);
    expect(calcLeafProblem({ agg: "max", column: 4 }, cols)).toMatch(/hanya bisa dari kolom angka/);
    expect(calcLeafProblem({ agg: "sum", column: 99 }, cols)).toMatch(/tidak tersedia/);
    expect(calcLeafProblem({ agg: "count", column: 5 }, cols)).toBeUndefined();
  });

  it("checkCalc: token tak cocok tipe ditunjuk, pai hanya aditif, nama wajib, nilai sah siap simpan", () => {
    const dur = checkCalc({ ...base, type: "bar", tokens: [m(2), op("add"), m(5)] });
    expect(dur).toMatchObject({ ok: false, at: 2, field: "formula" });
    expect(checkCalc({ ...base, type: "pie", tokens: MARGIN_TOKENS })).toMatchObject({
      ok: false,
      at: null,
      message: expect.stringMatching(/pai/),
    });
    expect(checkCalc({ ...base, type: "pie", tokens: [m(2), op("sub"), m(3)] }).ok).toBe(true);
    expect(checkCalc({ ...base, label: "  ", type: "bar", tokens: MARGIN_TOKENS })).toMatchObject({
      ok: false,
      field: "label",
    });
    const ok = checkCalc({
      ...base,
      type: "pivot",
      tokens: MARGIN_TOKENS,
      format: { style: "percent", decimals: 1 },
      showAs: "pct_grand",
    });
    expect(ok).toEqual({
      ok: true,
      value: { ...MARGIN, format: { style: "percent", decimals: 1 }, showAs: "pct_grand" },
    });
    // KPI tidak punya cara tampil; nilai yang dihasilkan lolos skema widget (server).
    const kpi = checkCalc({ ...base, type: "kpi", tokens: MARGIN_TOKENS, showAs: "running" });
    if (!kpi.ok) throw new Error(kpi.message);
    expect(kpi.value).not.toHaveProperty("showAs");
    expect(parseWidgetConfig("kpi", { sheetId: S1, measure: kpi.value, format: fmt }).ok).toBe(
      true,
    );
  });

  it("spec pratinjau memakai nama kolom (mode editor D6), tanpa SQL", () => {
    expect(calcPreviewSpec(S1, MARGIN, cols)).toEqual({
      sheetId: S1,
      measures: [
        {
          kind: "calc",
          label: "Margin",
          expr: {
            op: "div",
            args: [
              {
                op: "sub",
                args: [
                  { agg: "sum", column: "Pendapatan" },
                  { agg: "sum", column: "Biaya" },
                ],
              },
              { agg: "sum", column: "Pendapatan" },
            ],
          },
        },
      ],
      limit: 1,
    });
    expect(calcPreviewSpec(S1, { label: "x", expr: sum(42) }, cols)).toBeNull();
  });
});

describe("ganti jenis membawa field terhitung (T-068 L3)", () => {
  const bar = (measure: CalcValue): WidgetConfig => ({
    type: "bar",
    spec: {
      sheetId: S1,
      dimension: { column: 1 },
      measure,
      sort: "value_desc",
      topN: 12,
      format: fmt,
    },
  });
  const kpiPlain: WidgetConfig = {
    type: "kpi",
    spec: { sheetId: S1, measure: { agg: "count" }, format: fmt },
  };
  const valid = (c: WidgetConfig) => expect(parseWidgetConfig(c.type, c.spec).ok).toBe(true);

  it("ke KPI yang diingat: rumus menggantikan ukuran, cara tampil dibuang", () => {
    const next = carryCalc(bar({ ...MARGIN, showAs: "diff_prev" } as CalcValue), kpiPlain);
    expect(next).toMatchObject({ type: "kpi", spec: { measure: MARGIN } });
    expect(next.spec).not.toHaveProperty("measure.showAs");
    valid(next);
    expect(droppedCalcNotice(bar(MARGIN), next)).toBeNull();
  });

  it("ke pivot: jadi nilai pertama tanpa duplikat; ke pai: hanya rumus aditif", () => {
    const pivot: WidgetConfig = {
      type: "pivot",
      spec: {
        sheetId: S1,
        rows: [{ column: 1 }],
        values: [{ agg: "sum", column: 2 }, MARGIN],
        sort: "value_desc",
        format: fmt,
        totals: true,
        subtotals: true,
      },
    };
    const next = carryCalc(bar(MARGIN), pivot);
    expect(next.type === "pivot" && next.spec.values).toEqual([MARGIN, { agg: "sum", column: 2 }]);
    valid(next);
    const pie: WidgetConfig = { ...bar(MARGIN), type: "pie" } as WidgetConfig;
    const plainPie = {
      ...pie,
      spec: { ...pie.spec, topN: 5, measure: { agg: "sum", column: 2 } },
    } as WidgetConfig;
    expect(carryCalc(bar(MARGIN), plainPie)).toBe(plainPie);
    expect(droppedCalcNotice(bar(MARGIN), plainPie)).toMatch(/“Margin”.*pai/);
    const laba = carryCalc(bar(LABA), plainPie);
    expect(laba).toMatchObject({ type: "pie", spec: { measure: LABA } });
    valid(laba);
  });

  it("pivot dengan beberapa field terhitung: semua ikut ke pivot, grafik ambil yang cocok, sisanya disebut", () => {
    const pivot: WidgetConfig = {
      type: "pivot",
      spec: {
        sheetId: S1,
        rows: [{ column: 1 }],
        values: [{ agg: "sum", column: 2 }, MARGIN, LABA],
        sort: "value_desc",
        format: fmt,
        totals: true,
        subtotals: true,
      },
    };
    const pie = {
      type: "pie",
      spec: {
        sheetId: S1,
        dimension: { column: 1 },
        measure: { agg: "sum", column: 2 },
        sort: "value_desc",
        topN: 5,
        format: fmt,
      },
    } as WidgetConfig;
    const nextPie = carryCalc(pivot, pie);
    expect(nextPie).toMatchObject({ spec: { measure: LABA } });
    expect(droppedCalcNotice(pivot, nextPie)).toBe(
      "Field terhitung tidak dipakai di sini: “Margin” karena pai hanya untuk rumus yang menjumlah atau mengurangkan Total atau Jumlah baris. Kembali ke jenis sebelumnya untuk memakainya lagi.",
    );
    const nextKpi = carryCalc(pivot, kpiPlain);
    expect(nextKpi).toMatchObject({ spec: { measure: MARGIN } });
    expect(droppedCalcNotice(pivot, nextKpi)).toMatch(
      /“Laba” karena jenis ini hanya menampilkan satu nilai/,
    );
    const table: WidgetConfig = { type: "table", spec: { sheetId: S1, columns: [1], format: fmt } };
    expect(droppedCalcNotice(pivot, table)).toMatch(/“Margin”, “Laba” karena tabel/);
    const back = carryCalc(pivot, {
      ...pivot,
      spec: { ...pivot.spec, values: [{ agg: "count" }] },
    });
    expect(back.type === "pivot" && back.spec.values).toEqual([MARGIN, LABA, { agg: "count" }]);
  });

  it("tabel dan sheet lain tidak membawa rumus — diberi tahu alasannya", () => {
    const table: WidgetConfig = {
      type: "table",
      spec: { sheetId: S1, columns: [1, 2], format: fmt },
    };
    expect(carryCalc(bar(MARGIN), table)).toBe(table);
    expect(droppedCalcNotice(bar(MARGIN), table)).toMatch(/tabel/);
    const other = { ...kpiPlain, spec: { ...kpiPlain.spec, sheetId: S2 } } as WidgetConfig;
    expect(carryCalc(bar(MARGIN), other)).toBe(other);
    expect(droppedCalcNotice(bar(MARGIN), other)).toMatch(/sheet lain/);
    expect(droppedCalcNotice(kpiPlain, table)).toBeNull();
  });
});

describe("markup editor", () => {
  const props = {
    scope: { dashboardId: "d" },
    sheetId: S1,
    columns: cols,
    widgetFormat: fmt,
    onSave: () => {},
    onCancel: () => {},
  };

  it("field tersimpan: token sebagai daftar, pratinjau teks, Simpan aktif, tanpa input rumus bebas", () => {
    const html = renderToStaticMarkup(
      createElement(CalcEditor, { ...props, type: "pivot", value: MARGIN }),
    );
    expect(html).toContain('aria-label="Bagian rumus"');
    expect(html.match(/data-testid="calc-token"/g)).toHaveLength(7);
    expect(html).toContain("Margin = (Total Pendapatan − Total Biaya) ÷ Total Pendapatan");
    expect(html).toMatch(/<button[^>]*data-testid="calc-save"(?![^>]*disabled)/);
    // Satu-satunya input teks bebas: nama field dan angka (bukan rumus/SQL).
    const inputs = html.match(/<input[^>]*>/g) ?? [];
    expect(inputs.map((i) => /data-testid="([^"]+)"/.exec(i)?.[1])).toEqual([
      "calc-label",
      "calc-const",
    ]);
    expect(html).not.toMatch(/<textarea/);
  });

  it("field baru (kosong): Simpan nonaktif dan rumus kosong dijelaskan", () => {
    const html = renderToStaticMarkup(createElement(CalcEditor, { ...props, type: "bar" }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="calc-save"/);
    expect(html).toContain("Rumus masih kosong");
  });

  it("token yang salah (durasi) diberi aria-describedby ke pesan galat", () => {
    const value: CalcValue = { kind: "calc", label: "X", expr: { agg: "sum", column: 5 } };
    const html = renderToStaticMarkup(createElement(CalcEditor, { ...props, type: "bar", value }));
    const chip = /<button[^>]*data-testid="calc-token"[^>]*>/.exec(html)![0];
    const describedby = /aria-describedby="([^"]+)"/.exec(chip)![1];
    expect(chip).toContain("perlu diperbaiki");
    expect(html).toContain(`id="${describedby}"`);
    expect(html).toMatch(/data-testid="calc-error"[^>]*>[^<]*durasi/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="calc-save"/);
  });

  it("kartu ringkas: rumus dibaca, KPI tanpa 'Tampilkan sebagai'", () => {
    const card = (type: "kpi" | "bar") =>
      renderToStaticMarkup(
        createElement(CalcField, { ...props, type, value: MARGIN, onRemove: () => {} }),
      );
    expect(card("bar")).toContain("Tampilkan sebagai");
    expect(card("kpi")).not.toContain("Tampilkan sebagai");
    expect(card("kpi")).toContain("(Total Pendapatan − Total Biaya) ÷ Total Pendapatan");
    expect(card("kpi")).toContain("Ubah rumus");
  });
});
