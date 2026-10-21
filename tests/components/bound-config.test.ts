import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoundConfigForm } from "@/components/dashboards/bound-config";
import {
  copyName,
  defaultDisplay,
  dimensionOptions,
  impactText,
  pivotDisplayOf,
  usageText,
  valueOptions,
  type SavedPivotOption,
} from "@/components/dashboards/bound-config-model";
import { withUnsaved } from "@/components/dashboards/config-saves";
import type { Source } from "@/components/dashboards/widget-config-model";
import { deletedConfig, rebindFailedNotice } from "@/components/dashboards/use-dashboard-editor";
import { WidgetSourceSection } from "@/components/dashboards/widget-source";
import type { WidgetView } from "@/features/dashboards/service";
import { effectiveConfig } from "@/features/widgets/bound";
import type { PivotSpec } from "@/features/widgets/spec";

/*
 * T-074: model panel widget terikat (tampilan bawaan yang lolos effectiveConfig server, pilihan nilai/
 * dimensi, teks pemakaian/dampak, nama salinan), withUnsaved menjaga ikatan (review T-073 L4), dan
 * markup panel: sumber terikat menampilkan "Bersumber dari…" + Lepas dari sumber; editor baca-saja.
 */
const S1 = "cmv4kljx40009oczvdmpurrs1";
const sources: Source[] = [
  {
    id: S1,
    name: "Laba",
    columns: [
      { pos: 1, name: "Wilayah", type: "text" },
      { pos: 2, name: "Pendapatan", type: "integer" },
      { pos: 3, name: "Biaya", type: "integer" },
      { pos: 4, name: "Bulan", type: "date" },
    ],
  },
];
const pivot: PivotSpec = {
  sheetId: S1,
  rows: [{ column: 1 }],
  column: { column: 4, timeGrain: "month" },
  values: [
    { agg: "avg", column: 2 },
    { agg: "sum", column: 3 },
    {
      kind: "calc",
      label: "Margin",
      expr: {
        op: "div",
        args: [
          {
            op: "sub",
            args: [
              { agg: "sum", column: 2 },
              { agg: "sum", column: 3 },
            ],
          },
          { agg: "sum", column: 2 },
        ],
      },
    },
  ],
  sort: "label_asc",
  format: { style: "auto", decimals: 0 },
  totals: true,
  subtotals: false,
  crossFilter: true,
};
const option: SavedPivotOption = {
  id: "cmv4kljx40009oczvdmpusp01",
  name: "Laba per wilayah",
  spec: pivot,
  revision: 3,
  canEdit: true,
};

describe("bound-config-model", () => {
  it("tampilan bawaan tiap jenis lolos effectiveConfig; pai memilih nilai pertama yang sah", () => {
    for (const t of ["pivot", "bar", "line", "pie", "kpi", "table"] as const) {
      const d = defaultDisplay(t, pivot);
      expect(d, t).not.toBeNull();
      expect(effectiveConfig(t, d, pivot).ok, t).toBe(true);
    }
    // Rata-rata tidak boleh di pai → nilai ke-2 (Jumlah Biaya).
    expect(defaultDisplay("pie", pivot)).toMatchObject({ value: 1 });
    expect(defaultDisplay("bar", pivot)).toMatchObject({ value: 0, dimension: "row" });
    expect(defaultDisplay("kpi", pivot)).toEqual({ value: 0 });
  });

  it("format sebelumnya ikut saat jenis berganti", () => {
    const f = { style: "rupiah", decimals: 0 };
    expect(defaultDisplay("kpi", pivot, f)).toEqual({ value: 0, format: f });
  });

  it("pivotDisplayOf menyalin tampilan pivot (simpan sebagai pivot tersimpan tidak mengubah tampilan)", () => {
    expect(pivotDisplayOf(pivot)).toEqual({
      sort: "label_asc",
      totals: true,
      subtotals: false,
      crossFilter: true,
    });
    const eff = effectiveConfig("pivot", pivotDisplayOf(pivot), pivot);
    expect(eff.ok && eff.config.spec).toMatchObject({ rows: pivot.rows, values: pivot.values });
  });

  it("pilihan nilai dan dimensi berlabel", () => {
    expect(valueOptions(pivot, sources[0]!.columns).map((o) => o.label)).toEqual([
      "Nilai 1: Rata-rata Pendapatan",
      "Nilai 2: Total Biaya",
      "Nilai 3: Margin",
    ]);
    expect(dimensionOptions(pivot, sources[0]!.columns).map((o) => o.value)).toEqual([
      "row",
      "column",
    ]);
    const { column: _c, ...noSplit } = pivot;
    expect(dimensionOptions(noSplit, sources[0]!.columns)).toHaveLength(1);
  });

  it("teks pemakaian, dampak, dan nama salinan", () => {
    expect(usageText(null)).toBe("Belum dipakai");
    expect(usageText({ widgets: 3, dashboards: 2 })).toBe("3 widget, 2 dashboard");
    expect(impactText({ widgets: 0, dashboards: 0 })).toBeNull();
    expect(impactText({ widgets: 3, dashboards: 2 })).toBe(
      "Perubahan berlaku di 3 widget pada 2 dashboard.",
    );
    expect(copyName("Laba", ["Laba"])).toBe("Laba (salinan)");
    expect(copyName("Laba", ["Laba", "laba (SALINAN)"])).toBe("Laba (salinan 2)");
    expect(copyName("x".repeat(80), []).length).toBeLessThanOrEqual(80);
  });
});

const boundWidget: WidgetView = {
  id: "w",
  type: "kpi",
  title: "KPI",
  spec: { sheetId: S1, measure: { agg: "avg", column: 2 }, format: { style: "auto", decimals: 0 } },
  version: "v1",
  source: {
    savedPivotId: option.id,
    name: option.name,
    revision: 3,
    type: "kpi",
    display: { value: 0 },
  },
};

describe("withUnsaved menjaga ikatan (review T-073 L4)", () => {
  it("simpanan terikat mengganti tampilan sumber, bukan spec efektif", () => {
    const w = withUnsaved(boundWidget, {
      type: "bar",
      spec: { dimension: "row", value: 1, sort: "value_desc", topN: 12 },
      savedPivotId: option.id,
    });
    expect(w.source).toMatchObject({ savedPivotId: option.id, name: option.name, type: "bar" });
    expect(w.spec).toBe(boundWidget.spec);
  });
  it("simpanan mandiri melepas sumber dari tampilan panel", () => {
    const w = withUnsaved(boundWidget, { type: "kpi", spec: { sheetId: S1 } });
    expect(w.source).toBeUndefined();
  });
});

describe("markup panel sumber", () => {
  const section = (opts: { isOwner: boolean; canEdit: boolean; widget?: WidgetView }) =>
    renderToStaticMarkup(
      createElement(WidgetSourceSection, {
        dashboardId: "cmv4kljx40009oczvdmpudash0",
        widget: opts.widget ?? boundWidget,
        sources,
        datasetId: "cmv4kljx40009oczvdmpudata0",
        isOwner: opts.isOwner,
        savedPivots: [{ ...option, canEdit: opts.canEdit }],
        onSave: () => Promise.resolve(true),
        onDetach: () => Promise.resolve(null),
        onCreated: () => {},
      }),
    );

  it("pemilik: sumber terikat, tautan ubah, dan Lepas dari sumber", () => {
    const html = section({ isOwner: true, canEdit: true });
    expect(html).toContain("Sumber data");
    expect(html).toContain("Bersumber dari pivot tersimpan <strong>Laba per wilayah</strong>");
    expect(html).toContain(`/datasets/cmv4kljx40009oczvdmpudata0/pivot-tersimpan/${option.id}`);
    expect(html).toContain("Lepas dari sumber");
    // Bukan form sheet langsung (yang menyimpan tanpa savedPivotId).
    expect(html).not.toContain('data-testid="widget-config"');
  });

  it("editor dashboard: definisi baca-saja tanpa tautan ubah", () => {
    const html = section({ isOwner: false, canEdit: false });
    expect(html).toContain("baca-saja");
    expect(html).not.toContain("Ubah pivot tersimpan");
    expect(html).toContain("Lepas dari sumber");
  });

  it("widget pivot mandiri pemilik: tombol Simpan sebagai pivot tersimpan; editor tidak", () => {
    const standalone: WidgetView = {
      id: "w2",
      type: "pivot",
      title: "Pivot",
      spec: pivot,
      version: "v1",
    };
    expect(section({ isOwner: true, canEdit: true, widget: standalone })).toContain(
      "Simpan sebagai pivot tersimpan",
    );
    expect(section({ isOwner: false, canEdit: false, widget: standalone })).not.toContain(
      "Simpan sebagai pivot tersimpan",
    );
  });

  it("form terikat: tampilan KPI hanya pilihan nilai + format", () => {
    const html = renderToStaticMarkup(
      createElement(BoundConfigForm, {
        initial: { savedPivotId: option.id, type: "kpi", display: { value: 2 } },
        bound: { currentType: "kpi", bound: true },
        savedPivots: [option],
        sources,
        datasetId: null,
        onSave: () => Promise.resolve(true),
        onDetach: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain('data-testid="bound-value"');
    expect(html).not.toContain('data-testid="bound-dimension"');
    expect(html).toContain("Format angka");
  });
});

describe("review T-074: urungkan hapus, sumber hilang", () => {
  it("widget terikat dihapus → dipulihkan kosong lalu diikat lagi (bukan spec efektif mandiri)", () => {
    expect(deletedConfig(boundWidget)).toEqual({
      type: "empty",
      spec: {},
      bound: { savedPivotId: option.id, name: option.name, type: "kpi", display: { value: 0 } },
    });
    const plain: WidgetView = { ...boundWidget, source: undefined };
    expect(deletedConfig(plain)).toEqual({ type: "kpi", spec: plain.spec });
    expect(rebindFailedNotice("X")).toContain("“X”");
  });

  it("sumber pivot tersimpan hilang: panel memberi tahu sebelum menyimpan sebagai sheet langsung", () => {
    const gone: WidgetView = {
      ...boundWidget,
      source: undefined,
      sourceError: "Sumber data widget ini tidak tersedia.",
    };
    const html = renderToStaticMarkup(
      createElement(WidgetSourceSection, {
        dashboardId: "cmv4kljx40009oczvdmpudash0",
        widget: gone,
        sources,
        datasetId: "cmv4kljx40009oczvdmpudata0",
        isOwner: true,
        savedPivots: [option],
        onSave: () => Promise.resolve(true),
        onDetach: () => Promise.resolve(null),
        onCreated: () => {},
      }),
    );
    expect(html).toContain('data-testid="widget-source-gone"');
    expect(html).toContain("widget akan disimpan sebagai sheet langsung");
  });
});
