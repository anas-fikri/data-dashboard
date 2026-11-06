import { describe, expect, it } from "vitest";
import { chartDisplaySchema, pivotDisplaySchema } from "@/features/widgets/bound";
import { parseWidgetConfig } from "@/features/widgets/spec";

/*
 * v1.6.2 menerima field warna status (tone per nilai, colors per widget) tanpa memakainya, agar
 * rollback dari v1.7.x tidak membuat widget berwarna tampil "Pengaturan widget tidak valid".
 */
const S1 = "cmv4kljx40009oczvdmpurrs1";
const format = { style: "auto" as const, decimals: 0 };

const pivot = (extra: object = {}, value: object = { agg: "sum", column: 2 }) => ({
  sheetId: S1,
  rows: [{ column: 1 }],
  values: [value],
  sort: "value_desc",
  format,
  totals: true,
  subtotals: false,
  ...extra,
});

describe("skema warna status", () => {
  it("pivot menerima tone per nilai (ukuran dan field terhitung) dan colors widget", () => {
    expect(parseWidgetConfig("pivot", pivot({}, { agg: "sum", column: 2, tone: "up" })).ok).toBe(
      true,
    );
    expect(
      parseWidgetConfig(
        "pivot",
        pivot(
          { colors: { template: "custom", custom: ["#c00000", "#ffc000", "#00b050"] } },
          {
            kind: "calc",
            label: "Rasio klaim",
            expr: { op: "div", args: [{ agg: "sum", column: 2 }, { agg: "count" }] },
            tone: "down",
          },
        ),
      ).ok,
    ).toBe(true);
  });

  it("grafik menerima tone dan colors", () => {
    const spec = {
      sheetId: S1,
      dimension: { column: 1 },
      measure: { agg: "sum", column: 2, tone: "down" },
      sort: "value_desc",
      topN: 10,
      format,
      colors: { template: "soft" },
    };
    expect(parseWidgetConfig("bar", spec).ok).toBe(true);
  });

  it("menolak tone tak dikenal, hex tidak valid, dan custom tanpa warna", () => {
    expect(parseWidgetConfig("pivot", pivot({}, { agg: "sum", column: 2, tone: "x" })).ok).toBe(
      false,
    );
    expect(
      parseWidgetConfig(
        "pivot",
        pivot({ colors: { template: "custom", custom: ["red", "#ffc000", "#00b050"] } }),
      ).ok,
    ).toBe(false);
    expect(parseWidgetConfig("pivot", pivot({ colors: { template: "custom" } })).ok).toBe(false);
  });

  it("tampilan widget terikat pivot tersimpan menerima colors", () => {
    expect(
      pivotDisplaySchema.safeParse({
        sort: "value_desc",
        totals: true,
        subtotals: false,
        colors: { template: "cvd" },
      }).success,
    ).toBe(true);
    expect(
      chartDisplaySchema.safeParse({
        dimension: "row",
        value: 0,
        sort: "value_desc",
        topN: 10,
        colors: { template: "bold" },
      }).success,
    ).toBe(true);
  });
});
