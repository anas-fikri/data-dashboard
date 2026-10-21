import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  defaultMeasureFor,
  duplicateField,
  pivotSummary,
  splitColumn,
  toggleSubtotal,
  withRows,
} from "@/components/dashboards/pivot-config-model";
import { WidgetConfigForm } from "@/components/dashboards/widget-config";
import { defaultConfig, type Source } from "@/components/dashboards/widget-config-model";
import { fittingPivotRows, printPivotNote } from "@/components/render/print-pivot";
import { PivotTableMarkup } from "@/components/widgets/pivot-markup";
import type { PivotData } from "@/features/query/pivot";
import { columnNames, keepColumns, pivotTable } from "@/features/widgets/pivot-table";
import {
  MISSING_COLUMN,
  parseWidgetConfig,
  pivotSubtotalLevels,
  type PivotSpec,
  type WidgetConfig,
} from "@/features/widgets/spec";

/*
 * T-tcjp: panel pivot (nilai awal, isian dobel, ringkasan), model tabel (header periode + Total,
 * subtotal), potongan kolom/baris cetak PDF, dan markup tabel (semantik header, sel kosong).
 */
const S1 = "cmv4kljx40009oczvdmpurrs1";
const sources: Source[] = [
  {
    id: S1,
    name: "Penjualan",
    columns: [
      { pos: 1, name: "Customer", type: "text" },
      { pos: 2, name: "Tanggal", type: "date" },
      { pos: 3, name: "No.", type: "integer" },
      { pos: 4, name: "Layanan", type: "text" },
    ],
  },
];
const cols = sources[0]!.columns;
const empty: WidgetConfig = { type: "empty", spec: {} };
const fmt = { style: "number", decimals: 0 } as const;

describe("panel pivot", () => {
  it("nilai awal: baris = kolom teks, pemisah per bulan, Total No., sah di server", () => {
    const c = defaultConfig("pivot", sources, empty);
    expect(c?.type).toBe("pivot");
    const spec = (c as { spec: PivotSpec }).spec;
    expect(spec.rows).toEqual([{ column: 1 }]);
    expect(spec.column).toEqual({ column: 2, timeGrain: "month" });
    expect(spec.values).toEqual([{ agg: "sum", column: 3 }]);
    expect(spec.totals).toBe(true);
    expect(parseWidgetConfig("pivot", spec).ok).toBe(true);
  });

  it("isian dobel (kolom + rentang waktu sama) ditandai; rentang lain boleh", () => {
    const base = (defaultConfig("pivot", sources, empty) as { spec: PivotSpec }).spec;
    expect(duplicateField(base)).toBeNull();
    expect(duplicateField({ ...base, rows: [{ column: 1 }, { column: 1 }] })).toBe("row1");
    const byMonth = { column: 2, timeGrain: "month" as const };
    expect(duplicateField({ ...base, rows: [byMonth] })).toBe("column");
    expect(duplicateField({ ...base, rows: [{ column: 2, timeGrain: "year" }] })).toBeNull();
  });

  it("kolom hilang tidak disebut dobel; Pisahkan per tidak menawarkan baris yang sama", () => {
    const base = (defaultConfig("pivot", sources, empty) as { spec: PivotSpec }).spec;
    const gone = { column: MISSING_COLUMN };
    expect(duplicateField({ ...base, rows: [gone, gone], column: gone })).toBeNull();
    const byMonth = { column: 2, timeGrain: "month" as const };
    expect(splitColumn({ ...base, rows: [byMonth] }, cols)?.pos).toBe(1);
    expect(splitColumn({ ...base, rows: [{ column: 1 }] }, cols)?.pos).toBe(2);
  });

  it("Tambah nilai: kolom angka yang belum dipakai, lalu Jumlah baris", () => {
    const spec = (defaultConfig("pivot", sources, empty) as { spec: PivotSpec }).spec;
    expect(defaultMeasureFor(spec, cols)).toEqual({ agg: "count" });
    expect(defaultMeasureFor({ ...spec, values: [{ agg: "count" }] }, cols)).toEqual({
      agg: "sum",
      column: 3,
    });
  });

  it("ringkasan kalimat menjelaskan bentuk tabel", () => {
    const spec = (defaultConfig("pivot", sources, empty) as { spec: PivotSpec }).spec;
    const text = pivotSummary(spec, cols, () => "Total No.")
      .map((p) => p.text)
      .join("");
    expect(text).toBe(
      "Satu baris per Customer, satu kolom per Tanggal (per bulan), berisi Total No., dengan kolom dan baris Total.",
    );
  });

  it("T-rrn1 AC2: ringkasan menyebut bagian Saring tersimpan (hanya / tanpa, kosong, sisa)", () => {
    const spec = (defaultConfig("pivot", sources, empty) as { spec: PivotSpec }).spec;
    const parts = pivotSummary(
      {
        ...spec,
        filters: [
          { column: 4, op: "in", values: ["Darat"] },
          { column: 3, op: "not_in", values: [1500, null, 2, 3] },
          { column: MISSING_COLUMN, op: "in", values: ["x"] },
        ],
      },
      cols,
      () => "Total No.",
    );
    expect(parts.map((p) => p.text).join("")).toBe(
      "Satu baris per Customer, satu kolom per Tanggal (per bulan), berisi Total No., dengan kolom dan baris Total, hanya Darat (Layanan), tanpa 1.500, (kosong) +2 (No.).",
    );
    expect(parts).toContainEqual({ text: "Darat", strong: true });
  });

  const form = (spec: PivotSpec) =>
    renderToStaticMarkup(
      createElement(WidgetConfigForm, {
        dashboardId: "cmv4kljx40009oczvdmpudash0",
        widget: { id: "w", type: "pivot", title: "", spec, version: "v1" },
        sources,
        datasetId: "ds",
        onSave: () => Promise.resolve(true as const),
      }),
    );
  const status = (html: string) => html.match(/data-testid="config-status"[^>]*>([^<]*)</)?.[1];

  it("panel tampil dengan ringkasan; rincian baris memunculkan sakelar subtotal", () => {
    const spec = (defaultConfig("pivot", sources, empty) as { spec: PivotSpec }).spec;
    const ok = form(spec);
    expect(ok).toContain('data-testid="pivot-config"');
    expect(ok).toContain("Pisahkan per (opsional)");
    expect(status(ok)).toBe("Perubahan tersimpan otomatis.");
    expect(ok).not.toContain("Subtotal per");
    const two = form({ ...spec, rows: [{ column: 1 }, { column: 4 }] });
    expect(two).toContain("Dirinci per");
    expect(two).toContain("Subtotal per Customer");
  });
});

const data = (over: Partial<PivotData> = {}): PivotData => ({
  rowFields: [{ label: "Customer", type: "text" }],
  columnField: { label: "Tanggal", type: "date", grain: "month" },
  values: [{ label: "Total No.", type: "integer" }],
  rows: [
    { labels: ["Alfa"], group: null },
    { labels: ["Beta"], group: null },
  ],
  groups: [],
  columns: ["2026-01-01", "2026-02-01"],
  cells: [
    [[5], [7]],
    [[3], null],
  ],
  subtotals: null,
  rowTotals: [[12], [3]],
  subtotalTotals: null,
  columnTotals: [[8], [7]],
  grandTotal: [15],
  rowCount: 2,
  columnCount: 2,
  ...over,
});

describe("model tabel pivot", () => {
  it("satu nilai: kolom periode lalu kolom Total bernama nilainya; sel kosong null", () => {
    const m = pivotTable(data());
    expect(m.columnHeads).toBeNull();
    expect(m.valueHeads.map((h) => [h.label, h.total])).toEqual([
      ["Jan 2026", false],
      ["Feb 2026", false],
      ["Total No.", true],
    ]);
    expect(m.rows.map((r) => r.values)).toEqual([
      [5, 7, 12],
      [3, null, 3],
    ]);
    expect(m.total?.values).toEqual([8, 7, 15]);
    expect(m.note).toBeNull();
  });

  it("dua nilai: header dua tingkat; potong kolom cetak menjaga rentang header", () => {
    const two = data({
      values: [
        { label: "Total No.", type: "integer" },
        { label: "Jumlah baris", type: "integer" },
      ],
      cells: [
        [
          [5, 1],
          [7, 2],
        ],
        [[3, 1], null],
      ],
      rowTotals: [
        [12, 3],
        [3, 1],
      ],
      columnTotals: [
        [8, 2],
        [7, 2],
      ],
      grandTotal: [15, 4],
    });
    const m = pivotTable(two);
    expect(m.columnHeads?.map((h) => [h.label, h.span])).toEqual([
      ["Jan 2026", 2],
      ["Feb 2026", 2],
      ["Total", 2],
    ]);
    expect(columnNames(m).slice(4)).toEqual(["Total · Total No.", "Total · Jumlah baris"]);
    const cut = keepColumns(m, 3);
    expect(cut.columnHeads?.map((h) => [h.label, h.span])).toEqual([
      ["Jan 2026", 2],
      ["Feb 2026", 1],
    ]);
    expect(cut.rows[0]!.values).toEqual([5, 1, 7]);
    expect(cut.total?.values).toEqual([8, 2, 7]);
  });

  it("dua kolom baris: baris kelompok berisi subtotal di atas rinciannya", () => {
    const m = pivotTable(
      data({
        rowFields: [
          { label: "Customer", type: "text" },
          { label: "Layanan", type: "text" },
        ],
        columnField: null,
        rows: [
          { labels: ["Alfa", "Darat"], group: 0 },
          { labels: ["Alfa", "Laut"], group: 0 },
        ],
        groups: ["Alfa"],
        columns: [],
        cells: [[[5]], [[7]]],
        subtotals: [[[12]]],
        rowTotals: null,
        columnTotals: null,
        grandTotal: [12],
      }),
    );
    expect(m.rowHeader).toBe("Customer › Layanan");
    expect(m.rows.map((r) => [r.kind, r.label, r.depth, r.values])).toEqual([
      ["group", "Alfa", 0, [12]],
      ["leaf", "Darat", 1, [5]],
      ["leaf", "Laut", 1, [7]],
    ]);
  });

  it("markup: kepala kolom/baris ber-scope, sel kosong dibacakan, baris Total di tfoot", () => {
    const html = renderToStaticMarkup(
      createElement(PivotTableMarkup, {
        model: pivotTable(data()),
        format: fmt,
        variant: "screen",
      }),
    );
    expect(html).toContain('<th scope="row"');
    expect(html).toContain('scope="col"');
    expect(html).toContain('<span class="sr-only">tidak ada data</span>');
    expect(html).toMatch(/<tfoot[^>]*><tr data-kind="total"/);
    expect(html).toContain("sticky");
    const print = renderToStaticMarkup(
      createElement(PivotTableMarkup, { model: pivotTable(data()), format: fmt, variant: "print" }),
    );
    expect(print).not.toContain("sticky");
  });
});

describe("pivot cetak PDF", () => {
  it("baris yang muat bersama baris Total", () => {
    expect(fittingPivotRows([30, 60, 90, 120], 130, 30)).toBe(3);
    expect(fittingPivotRows([30, 60], 130, 30)).toBe(2);
    expect(fittingPivotRows([150], 130, 30)).toBe(0);
  });

  it("keterangan menyebut baris/kolom yang tidak tercetak dan batas server", () => {
    expect(printPivotNote(data(), 2, [])).toBeNull();
    expect(printPivotNote(data({ rowCount: 1500 }), 12, ["Total No."])).toBe(
      "Menampilkan 12 dari 1.500 baris · 1 kolom tidak muat: Total No. · Total mencakup semua data",
    );
    expect(printPivotNote(data({ columnCount: 55 }), 2, [])).toBe(
      "2 dari 55 kolom Tanggal · Total mencakup semua data",
    );
  });
});

describe("T-070: 4 tingkat baris, subtotal per level, 8 nilai", () => {
  const spec = (over: Partial<PivotSpec> = {}): PivotSpec => ({
    ...(defaultConfig("pivot", sources, empty) as { spec: PivotSpec }).spec,
    ...over,
  });
  const four = [{ column: 1 }, { column: 4 }, { column: 3 }, { column: 2 }];
  const form = (s: PivotSpec) =>
    renderToStaticMarkup(
      createElement(WidgetConfigForm, {
        dashboardId: "cmv4kljx40009oczvdmpudash0",
        widget: { id: "w", type: "pivot", title: "", spec: s, version: "v1" },
        sources,
        datasetId: "ds",
        onSave: () => Promise.resolve(true as const),
      }),
    );

  it("isian dobel di baris ke-3/ke-4 ditandai per barisnya", () => {
    expect(duplicateField(spec({ rows: [{ column: 1 }, { column: 4 }, { column: 1 }] }))).toBe(
      "row2",
    );
    expect(
      duplicateField(spec({ rows: [{ column: 1 }, { column: 4 }, { column: 3 }, { column: 4 }] })),
    ).toBe("row3");
  });

  it("rinci/hapus baris menjaga bentuk subtotal: ≤ 2 baris = bentuk 1.0.0", () => {
    const two = withRows(spec({ subtotals: true }), [{ column: 1 }, { column: 4 }]);
    expect(two.subtotals).toBe(true);
    expect(two).not.toHaveProperty("subtotalLevels");
    const three = withRows(two, [...two.rows, { column: 3 }]);
    expect(pivotSubtotalLevels(three)).toEqual([1, 2]);
    expect(three).not.toHaveProperty("subtotalLevels");
    const off2 = toggleSubtotal(three, 2, false);
    expect(off2).toMatchObject({ subtotals: true, subtotalLevels: [1] });
    expect(toggleSubtotal(toggleSubtotal(off2, 1, false), 2, true)).toMatchObject({
      subtotalLevels: [2],
    });
    expect(toggleSubtotal(toggleSubtotal(off2, 1, false), 1, false)).toMatchObject({
      subtotals: false,
    });
    // Kembali ke 2 baris: level 1 mengikuti sakelarnya, subtotalLevels hilang.
    const back = withRows(off2, off2.rows.slice(0, 2));
    expect(back).toMatchObject({ subtotals: true });
    expect(back).not.toHaveProperty("subtotalLevels");
    expect(parseWidgetConfig("pivot", off2).ok).toBe(true);
  });

  it("hapus baris tengah: sakelar subtotal tetap pada field-nya, bukan posisinya", () => {
    // Customer (on) › Layanan (off) › No. (on) › Tanggal.
    const s = toggleSubtotal(spec({ rows: four, subtotals: true }), 2, false);
    expect(pivotSubtotalLevels(s)).toEqual([1, 3]);
    const cut = withRows(
      s,
      s.rows.filter((_, i) => i !== 1),
    );
    expect(cut.rows.map((d) => d.column)).toEqual([1, 3, 2]);
    // Customer dan No. tetap on (dulu: level 2 = No. mewarisi "off" milik Layanan).
    expect(pivotSubtotalLevels(cut)).toEqual([1, 2]);
    const s2 = toggleSubtotal(spec({ rows: four, subtotals: true }), 1, false);
    expect(pivotSubtotalLevels(withRows(s2, s2.rows.slice(1)))).toEqual([1, 2]);
    expect(pivotSubtotalLevels(withRows(s2, [s2.rows[0]!, s2.rows[2]!, s2.rows[3]!]))).toEqual([2]);
  });

  it("ringkasan menyebut semua tingkat dan subtotal yang dipilih", () => {
    const s = toggleSubtotal(spec({ rows: four, subtotals: true }), 1, false);
    const text = pivotSummary(s, cols, () => "Total No.")
      .map((p) => p.text)
      .join("");
    expect(text).toBe(
      "Satu baris per Customer, dirinci per Layanan, lalu per No., lalu per Tanggal, satu kolom per Tanggal (per bulan), berisi Total No., dengan kolom dan baris Total serta subtotal per Layanan dan No..",
    );
  });

  it("panel: satu sakelar subtotal per level induk, tombol Rinci lagi sampai 4 tingkat", () => {
    const { column: _split, ...noSplit } = spec({ rows: four.slice(0, 3) });
    const html = form(noSplit);
    expect(html).toContain('data-testid="pivot-subtotals"');
    expect(html).toContain('data-testid="pivot-subtotals-2"');
    expect(html).not.toContain('data-testid="pivot-subtotals-3"');
    expect(html).toContain("Lalu dirinci per");
    expect(html).toContain("Rinci lagi");
    expect(html).toContain("Hapus rincian baris ke-2");
    const full = form(spec({ rows: four, values: Array(8).fill({ agg: "count" }) }));
    expect(full).toContain('data-testid="pivot-subtotals-3"');
    expect(full).not.toContain("Rinci lagi");
    expect(full).not.toContain(">Tambah nilai<");
    expect(full).toContain("maks. 24.000 sel");
  });

  it("markup: level 3–4 diindentasi, label ringkas di layar sempit dengan teks utuh", () => {
    const m = pivotTable(
      data({
        rowFields: ["A", "B", "C", "D"].map((label) => ({ label, type: "text" as const })),
        columnField: null,
        rows: [{ labels: ["a", "b", "c", "Nama cabang yang sangat panjang sekali"], group: 0 }],
        groups: ["a"],
        columns: [],
        cells: [[[1]]],
        subtotals: [[[1]]],
        rowTotals: null,
        columnTotals: null,
        grandTotal: [1],
        nest: {
          paths: [[0, 0, 0]],
          levels: [
            { labels: ["a"], subtotals: [[[1]]], totals: null },
            { labels: ["b"], subtotals: null, totals: null },
            { labels: ["c"], subtotals: [[[1]]], totals: null },
          ],
        },
      }),
    );
    expect(m.rows.map((r) => [r.kind, r.depth, r.values])).toEqual([
      ["group", 0, [1]],
      ["group", 1, []],
      ["group", 2, [1]],
      ["leaf", 3, [1]],
    ]);
    expect(m.fields.map((f) => f.role)).toEqual(["row0", "row1", "row2", "row3"]);
    const html = renderToStaticMarkup(
      createElement(PivotTableMarkup, { model: m, format: fmt, variant: "screen" }),
    );
    expect(html).toContain('data-depth="3"');
    expect(html).toContain("pl-[3.75rem]");
    expect(html).toContain('title="Nama cabang yang sangat panjang sekali"');
    expect(html).toContain("max-sm:line-clamp-2");
    const print = renderToStaticMarkup(
      createElement(PivotTableMarkup, { model: m, format: fmt, variant: "print" }),
    );
    expect(print).not.toContain("line-clamp");
  });
});
