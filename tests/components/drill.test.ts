import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartWidget } from "@/components/widgets/chart-widget";
import type { WidgetFilters } from "@/components/dashboards/filters/filter-context";
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
const html = (s: ChartSpec, drill?: { widgetId: string }, cross?: WidgetFilters) =>
  renderToStaticMarkup(
    createElement(ChartWidget, {
      type: "bar",
      data,
      spec: s,
      showData: true,
      title: "Kiriman",
      drill,
      cross,
    }),
  );
/** Filter dashboard widget dengan filter silang aktif; `selected` = kategori yang sedang dipilih. */
const crossOf = (selected: string | null): WidgetFilters => ({
  filters: [],
  selected: selected ? { column: "Kota", op: "in", values: [selected] } : null,
  pick: () => {},
  canPick: () => true,
  pivot: [],
  pivotEdit: null,
});

describe("klik-tembus di tabel data grafik", () => {
  it("v1.15.1: filter silang aktif → klik tetap menyaring; tombol Lihat baris data untuk kategori terpilih", () => {
    const drilled = spec({ drill: { columns: [1, 2, 3] } });
    const picked = html(drilled, { widgetId: "w1" }, crossOf("Bandung"));
    expect(picked.match(/data-testid="crossfilter-item"/g)).toHaveLength(2);
    expect(picked).toMatch(
      /aria-pressed="true"[^>]*data-testid="crossfilter-item"[^>]*data-value="Bandung"/,
    );
    expect(picked).not.toContain('data-testid="drill-item"');
    expect(picked).toMatch(
      /aria-haspopup="dialog"[^>]*data-testid="drill-open"[^>]*>Lihat baris data “Bandung”/,
    );
    // Belum ada pilihan → petunjuk, tanpa tombol.
    const none = html(drilled, { widgetId: "w1" }, crossOf(null));
    expect(none).toContain('data-testid="drill-bar"');
    expect(none).toContain("Klik kategori, lalu lihat baris datanya di sini.");
    expect(none).not.toContain("drill-open");
    // Tanpa klik-tembus: tidak ada bilah sama sekali.
    expect(html(spec(), { widgetId: "w1" }, crossOf("Bandung"))).not.toContain("drill-bar");
  });

  it("filter silang widget dimatikan → klik langsung membuka baris (tanpa bilah)", () => {
    const out = html(
      spec({ crossFilter: false, drill: { columns: [1, 2] } }),
      { widgetId: "w1" },
      crossOf(null),
    );
    expect(out.match(/data-testid="drill-item"/g)).toHaveLength(2);
    expect(out).not.toContain("drill-bar");
  });

  it("dengan spec.drill + widgetId tanpa filter silang → tombol pembuka dialog per kategori", () => {
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

describe("drillDefaults (review v1.15 #4)", () => {
  const cols = [1, 2, 3].map((pos) => ({ pos, name: `K${pos}`, type: "text" as const }));
  it("unik, hanya kolom yang ada; kosong → kolom pertama", async () => {
    const { drillDefaults } = await import("@/components/dashboards/config-sections");
    expect(drillDefaults([3, 3], cols as never)).toEqual([3]);
    expect(drillDefaults([2, 9], cols as never)).toEqual([2]);
    expect(drillDefaults([9], cols as never)).toEqual([1]);
  });
});
