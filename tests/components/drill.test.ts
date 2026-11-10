import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartWidget } from "@/components/widgets/chart-widget";
import { KpiView } from "@/components/widgets/kpi-view";
import type { WidgetData } from "@/components/widgets/widget-query";
import { drillTableConfig, type ChartSpec } from "@/features/widgets/spec";

/*
 * T-d5ev: klik-tembus — tombol kategori jadi pembuka dialog (aria-haspopup, bukan tombol tekan filter
 * silang) hanya di dashboard (widgetId) dengan spec.drill; tabel detail = kolom pilihan, format grafik
 * hanya untuk kolom ukurannya. T-43hv: baris pembanding KPI ikut tampil dengan warna arah.
 */
const AUTO = { style: "auto", decimals: 0 } as const;
const RP = { style: "rupiah", decimals: 0 } as const;
const SHEET = "cmv4kljx40009oczvdmpurrs1";
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  sheetId: SHEET,
  dimension: { column: 1 },
  measure: { agg: "sum", column: 2 },
  sort: "value_desc",
  topN: 5,
  format: AUTO,
  ...over,
});
const data: WidgetData = {
  columns: [
    { key: "d", label: "Kota", type: "text" },
    { key: "m", label: "Total Kiriman", type: "decimal" },
  ],
  rows: [
    ["Jakarta", 30],
    ["Bandung", 20],
  ],
};
const html = (s: ChartSpec, drill?: { widgetId: string }) =>
  renderToStaticMarkup(
    createElement(ChartWidget, {
      type: "bar",
      data,
      spec: s,
      showData: true,
      title: "Kiriman",
      drill,
    }),
  );

describe("klik-tembus di tabel data grafik", () => {
  it("dengan spec.drill + widgetId → tombol pembuka dialog per kategori", () => {
    const out = html(spec({ drill: { columns: [1, 2, 3] } }), { widgetId: "w1" });
    expect(out.match(/data-testid="drill-item"/g)).toHaveLength(2);
    expect(out).toMatch(
      /aria-haspopup="dialog"[^>]*data-testid="drill-item"[^>]*data-value="Jakarta"/,
    );
    expect(out).not.toContain("aria-pressed=");
  });

  it("tanpa spec.drill atau di luar dashboard → tidak ada tombol klik-tembus", () => {
    expect(html(spec(), { widgetId: "w1" })).not.toContain("drill-item");
    expect(html(spec({ drill: { columns: [1] } }))).not.toContain("drill-item");
  });
});

describe("drillTableConfig", () => {
  it("kolom detail; format grafik hanya untuk kolom ukuran yang ikut ditampilkan", () => {
    expect(
      drillTableConfig({ type: "bar", spec: spec({ format: RP, drill: { columns: [1, 2] } }) }),
    ).toEqual({
      type: "table",
      spec: { sheetId: SHEET, columns: [1, 2], format: RP, formatColumns: [2] },
    });
    expect(
      drillTableConfig({ type: "pie", spec: spec({ format: RP, drill: { columns: [1, 3] } }) }),
    ).toMatchObject({ spec: { columns: [1, 3], format: AUTO } });
    expect(
      drillTableConfig({
        type: "line",
        spec: spec({
          format: RP,
          measure: { agg: "sum", column: 2, showAs: "pct_grand" },
          drill: { columns: [2] },
        }),
      })?.spec.format,
    ).toEqual(AUTO);
    expect(drillTableConfig({ type: "bar", spec: spec() })).toBeNull();
  });
});

describe("KpiView dengan pembanding (T-43hv)", () => {
  const kpi = (tone?: "up" | "down") =>
    renderToStaticMarkup(
      createElement(KpiView, {
        data: {
          columns: [{ key: "m0", label: "Total Omzet", type: "decimal" }],
          rows: [[1250]],
          compare: {
            period: "2026-11-01",
            previousPeriod: "2026-10-01",
            previous: 1000,
            previousRows: 3,
            grain: "month",
            against: "previous",
          },
        },
        format: AUTO,
        title: "Omzet",
        agg: "sum",
        ...(tone ? { status: { tones: [tone], targets: [undefined] } } : {}),
      }),
    );
  it("baris ▲ persen + label periode; warna mengikuti arah, netral tanpa arah", () => {
    const up = kpi("up");
    expect(up).toContain('data-testid="kpi-compare"');
    expect(up).toMatch(/data-status="good"[^>]*>▲ \+25/);
    expect(up).toContain("vs Okt 2026");
    expect(up).toMatch(/Naik 25\s?% dibanding Okt 2026/);
    expect(kpi("down")).toMatch(/data-status="bad"/);
    expect(kpi()).not.toMatch(/data-status=/);
  });
});
