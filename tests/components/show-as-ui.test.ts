import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WidgetConfigForm } from "@/components/dashboards/widget-config";
import { defaultConfig, type Source } from "@/components/dashboards/widget-config-model";
import { PivotTableMarkup } from "@/components/widgets/pivot-markup";
import type { PivotData } from "@/features/query/pivot";
import { formatCell } from "@/features/widgets/format";
import { pivotTable } from "@/features/widgets/pivot-table";
import { showAsTitle, valueFormat } from "@/features/widgets/show-as";
import {
  parseWidgetConfig,
  type ChartSpec,
  type PivotSpec,
  type WidgetConfig,
} from "@/features/widgets/spec";

/*
 * T-067: format persen 1 desimal id-ID, model/markup tabel pivot memakai format per nilai, panel
 * "Tampilkan sebagai" per jenis widget, dan cara tampil tidak terbawa ke jenis yang tidak mendukungnya.
 */
const S1 = "cmv4kljx40009oczvdmpurrs1";
const sources: Source[] = [
  {
    id: S1,
    name: "Penjualan",
    columns: [
      { pos: 1, name: "Wilayah", type: "text" },
      { pos: 2, name: "Tanggal", type: "date" },
      { pos: 3, name: "Pendapatan", type: "decimal" },
    ],
  },
];
const rupiah = { style: "rupiah", decimals: 0 } as const;

describe("format", () => {
  it("persen 1 desimal id-ID; selisih tetap format widget (Rupiah)", () => {
    const pct = valueFormat("pct_col", rupiah);
    expect(formatCell(0.125, "decimal", pct)).toBe("12,5%");
    expect(formatCell(1, "decimal", pct)).toBe("100,0%");
    expect(formatCell(-0.5, "decimal", valueFormat("pct_diff_prev", rupiah))).toBe("-50,0%");
    expect(formatCell(-1500, "decimal", valueFormat("diff_prev", rupiah))).toBe("-Rp 1.500");
    expect(showAsTitle("pct_col", "Total Pendapatan")).toBe(
      "% dari total kolom · Total Pendapatan",
    );
    expect(showAsTitle(undefined, "Total Pendapatan")).toBe("Total Pendapatan");
  });

  it("tabel pivot: sel persen dan sel Rupiah berdampingan, kosong '–'", () => {
    const p: PivotData = {
      rowFields: [{ label: "Wilayah", type: "text" }],
      columnField: null,
      values: [
        {
          label: "% dari total keseluruhan · Total Pendapatan",
          type: "decimal",
          showAs: "pct_grand",
        },
        {
          label: "Selisih dari sebelumnya · Total Pendapatan",
          type: "decimal",
          showAs: "diff_prev",
        },
      ],
      rows: [
        { labels: ["Barat"], group: null },
        { labels: ["Timur"], group: null },
      ],
      groups: [],
      columns: [],
      cells: [[[0.4, null]], [[0.6, 2000]]],
      subtotals: null,
      rowTotals: null,
      subtotalTotals: null,
      columnTotals: null,
      grandTotal: [1, null],
      rowCount: 2,
      columnCount: 0,
    };
    const m = pivotTable(p);
    expect(m.valueHeads.map((h) => h.showAs)).toEqual(["pct_grand", "diff_prev"]);
    const html = renderToStaticMarkup(
      createElement(PivotTableMarkup, { model: m, format: rupiah, variant: "print" }),
    );
    expect(html).toContain("40,0%");
    expect(html).toContain("Rp 2.000");
    expect(html).toContain("100,0%");
    expect(html).toContain("tidak ada data");
  });
});

describe("panel", () => {
  const form = (type: string, spec: unknown) =>
    renderToStaticMarkup(
      createElement(WidgetConfigForm, {
        dashboardId: "cmv4kljx40009oczvdmpudash0",
        widget: { id: "w", type, title: "", spec, version: "v1" },
        sources,
        datasetId: "ds",
        onSave: () => Promise.resolve(true as const),
      }),
    );
  const options = (html: string) =>
    [...html.matchAll(/<option value="([a-z_]+)"[^>]*>([^<]*)<\/option>/g)]
      .map((m) => m[1])
      .filter((v) =>
        [
          "none",
          "pct_grand",
          "pct_row",
          "pct_col",
          "running",
          "diff_prev",
          "pct_diff_prev",
        ].includes(v!),
      );

  it("pivot: tujuh pilihan + penjelasan sumbu; pai hanya % keseluruhan; KPI tanpa pilihan", () => {
    const pivot = (
      defaultConfig("pivot", sources, { type: "empty", spec: {} }) as {
        spec: PivotSpec;
      }
    ).spec;
    const html = form("pivot", {
      ...pivot,
      values: [{ ...pivot.values[0]!, showAs: "running" }],
    });
    expect(html).toContain("Tampilkan sebagai");
    expect(html).toContain("Dihitung urut Tanggal naik");
    if (html.includes("<option")) expect(new Set(options(html)).size).toBe(7);
    const pie = defaultConfig("pie", sources, { type: "empty", spec: {} }) as {
      spec: ChartSpec;
    };
    const pieHtml = form("pie", pie.spec);
    expect(pieHtml).toContain("Tampilkan sebagai");
    const kpi = defaultConfig("kpi", sources, { type: "empty", spec: {} })!;
    expect(form("kpi", kpi.spec)).not.toContain("Tampilkan sebagai");
  });

  it("ganti jenis: % baris pivot tidak terbawa ke grafik/KPI; % keseluruhan terbawa ke pai", () => {
    const base = (
      defaultConfig("pivot", sources, { type: "empty", spec: {} }) as {
        spec: PivotSpec;
      }
    ).spec;
    const withShow = (showAs: string): WidgetConfig =>
      ({
        type: "pivot",
        spec: { ...base, values: [{ ...base.values[0]!, showAs }] },
      }) as WidgetConfig;
    const bar = defaultConfig("bar", sources, withShow("pct_row")) as { spec: ChartSpec };
    expect(bar.spec.measure.showAs).toBeUndefined();
    expect(parseWidgetConfig("bar", bar.spec).ok).toBe(true);
    const pie = defaultConfig("pie", sources, withShow("pct_grand")) as { spec: ChartSpec };
    expect(pie.spec.measure.showAs).toBe("pct_grand");
    expect(parseWidgetConfig("pie", pie.spec).ok).toBe(true);
    const line = defaultConfig("line", sources, withShow("running")) as { spec: ChartSpec };
    expect(line.spec.measure.showAs).toBe("running");
    const kpi = defaultConfig("kpi", sources, withShow("pct_grand"))!;
    expect(parseWidgetConfig("kpi", kpi.spec).ok).toBe(true);
  });
});
