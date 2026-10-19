import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WidgetFilters } from "@/components/dashboards/filters/filter-context";
import {
  crossColumnsOf,
  encodeFilterParam,
  parseFilterParam,
  sanitize,
} from "@/components/dashboards/filters/filter-model";
import { PivotFields } from "@/components/dashboards/pivot-config";
import { printPivotNote } from "@/components/render/print-pivot";
import { requestFilters, widgetRequest } from "@/components/widgets/body-state";
import { exportBody } from "@/components/widgets/export-model";
import { PivotView } from "@/components/widgets/pivot-view";
import { crossFilterColumnsOf } from "@/features/dashboards/filter-columns";
import type { ColumnSchema } from "@/features/ingest/infer";
import { encodePdfFilter, parsePdfFilter } from "@/features/exports/pdf-filter";
import { renderQueryBody } from "@/features/exports/render-session";
import { exportBodySchema, exportParamsSchema } from "@/features/exports/schema";
import type { PivotData } from "@/features/query/pivot";
import { widgetBodySchema } from "@/features/query/widget";
import { pivotTable } from "@/features/widgets/pivot-table";
import type { PivotSpec } from "@/features/widgets/spec";

/*
 * T-f4a7 di klien: status ?f= membawa saringan pivot per widget (round-trip, disaring terhadap widget
 * yang ada), permintaan/ekspor/PDF memakai saringan yang sama, model tabel menandai label yang bisa
 * menyaring widget lain + catatan saringan, field pivot jadi kolom filter silang, dan panel Saring.
 */
const W = "cmv4kljx40009oczvdmpupvt01";
const OTHER = "cmv4kljx40009oczvdmpupvt02";
const SHEET = "cmv4kljx40009oczvdmpurrs1";
const cabang = {
  field: "row0" as const,
  column: "Cabang",
  op: "in" as const,
  values: ["Bandung", null],
};

const data = (over: Partial<PivotData> = {}): PivotData => ({
  rowFields: [{ label: "Cabang", type: "text" }],
  columnField: { label: "Tanggal", type: "date", grain: "month" },
  values: [{ label: "Total Omzet", type: "decimal" }],
  rows: [
    { labels: ["Bandung"], group: null },
    { labels: [null], group: null },
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

describe("status filter: saringan pivot di URL", () => {
  it("round-trip ?f=; tanpa saringan pivot bentuknya sama dengan sebelumnya", () => {
    const state = { filters: [], pivot: { [W]: [cabang] } };
    const f = encodeFilterParam(state)!;
    expect(parseFilterParam(f)).toEqual(state);
    expect(encodeFilterParam({ filters: [] })).toBeNull();
    const only = { filters: [{ column: "Cabang", op: "in" as const, values: ["A"] }] };
    expect(encodeFilterParam(only)).toBe(JSON.stringify(only));
    // Server memvalidasi bentuk yang sama (PDF).
    expect(parsePdfFilter(f)).toEqual(state);
    expect(encodePdfFilter(state)).toBe(f);
  });

  it("sanitize: widget tak dikenal dibuang, satu saringan per field, nilai tanpa ganda", () => {
    const out = sanitize(
      {
        filters: [],
        pivot: {
          [W]: [
            cabang,
            { ...cabang, values: ["X"] },
            {
              field: "column",
              column: "Tanggal",
              grain: "month",
              op: "not_in",
              values: ["2026-01-01", "2026-01-01"],
            },
          ],
          [OTHER]: [cabang],
        },
      },
      { columns: [], crossColumns: [], widgetIds: [W] },
    );
    expect(out.pivot).toEqual({
      [W]: [
        cabang,
        {
          field: "column",
          column: "Tanggal",
          grain: "month",
          op: "not_in",
          values: ["2026-01-01"],
        },
      ],
    });
    expect(
      sanitize(
        { filters: [], pivot: { [W]: [] } },
        { columns: [], crossColumns: [], widgetIds: [W] },
      ),
    ).toEqual({ filters: [] });
  });
});

describe("permintaan, ekspor, dan PDF memakai saringan yang sama", () => {
  it("widgetRequest: pivotFilters hanya untuk pivot; kunci filter lama tetap tanpa saringan", () => {
    const dash = [{ column: "Layanan", op: "in" as const, values: ["Express"] }];
    const req = widgetRequest(W, "pivot", 0, null, dash, [cabang]);
    expect(req).toEqual({ widgetId: W, dashboardFilters: dash, pivotFilters: [cabang] });
    expect(widgetRequest(W, "bar", 0, null, dash, [cabang])).toEqual({
      widgetId: W,
      dashboardFilters: dash,
    });
    expect(requestFilters({ dashboardFilters: dash })).toBe(JSON.stringify(dash));
    expect(requestFilters(req)).not.toBe(JSON.stringify(dash));
    expect(widgetBodySchema.safeParse(req).success).toBe(true);
    expect(
      widgetBodySchema.safeParse({ widgetId: W, pivotFilters: [{ ...cabang, field: "row9" }] })
        .success,
    ).toBe(false);
  });

  it("ekspor CSV/XLSX dan render PDF membawa pivotFilters", () => {
    const body = exportBody({ widgetId: W, pivotFilters: [cabang] }, "xlsx");
    expect(body).toEqual({ widgetId: W, format: "xlsx", pivotFilters: [cabang] });
    expect(exportBodySchema.safeParse(body).success).toBe(true);
    expect(
      exportParamsSchema.safeParse({
        pivotFilters: [cabang],
        requestedAt: new Date(0).toISOString(),
      }).success,
    ).toBe(true);
    expect(renderQueryBody({ id: W, type: "pivot" }, [], [cabang])).toEqual({
      widgetId: W,
      pivotFilters: [cabang],
    });
    expect(renderQueryBody({ id: W, type: "table" }, [], [cabang])).toEqual({
      widgetId: W,
      page: 0,
    });
  });
});

describe("model tabel dan tampilan pivot", () => {
  it("label baris/kolom membawa nilai mentah + field; catatan saringan diformat", () => {
    const m = pivotTable(
      data({
        filters: [
          { label: "Layanan", type: "text", op: "in", values: ["EXPRESS"], saved: true },
          { label: "Tanggal", type: "date", grain: "month", op: "not_in", values: ["2026-03-01"] },
          { label: "Cabang", type: "text", op: "in", values: ["A", "B", "C", "D", "E"] },
        ],
      }),
    );
    expect(m.fields.map((f) => f.role)).toEqual(["row0", "column"]);
    expect(m.rows.map((r) => r.pick)).toEqual([
      { field: "row0", raw: "Bandung" },
      { field: "row0", raw: null },
    ]);
    expect(m.valueHeads[0]!.pick).toEqual({ field: "column", raw: "2026-01-01" });
    expect(m.valueHeads.at(-1)!.pick).toBeUndefined();
    expect(m.filterNote).toBe(
      "Disaring — Layanan: EXPRESS (pengaturan widget); Tanggal: kecuali Mar 2026; Cabang: A, B, C +2 lainnya.",
    );
    expect(pivotTable(data()).filterNote).toBeNull();
  });

  it("PivotView: menu saring per field, label jadi tombol filter silang, catatan + Hapus saringan", () => {
    const cross: WidgetFilters = {
      filters: [],
      selected: { column: "Cabang", op: "in", values: ["Bandung"] },
      pick: () => {},
      canPick: (c) => c === "Cabang",
      pivot: [cabang],
      pivotEdit: { current: [cabang], set: () => {}, clear: () => {} },
    };
    const html = renderToStaticMarkup(
      createElement(PivotView, {
        data: data({
          filters: [{ label: "Cabang", type: "text", op: "in", values: ["Bandung", null] }],
        }),
        format: { style: "auto", decimals: 0 },
        label: "Pivot omzet",
        request: { widgetId: W, pivotFilters: [cabang] },
        cross,
        crossFilter: true,
      }),
    );
    expect(html.match(/data-testid="pivot-filter"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Saring Cabang (baris): 2 dipilih"');
    expect(html).toContain('aria-label="Saring Tanggal (kolom): semua"');
    // Hanya kolom yang diizinkan dashboard (Cabang) yang bisa diklik; yang ditekan = filter silang aktif.
    expect(html.match(/data-testid="crossfilter-item"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="crossfilter-item"[^>]*>Bandung</);
    expect(html).toContain("Disaring — Cabang: Bandung, (kosong).");
    expect(html).toContain('data-testid="pivot-filter-clear"');
    // Sakelar filter silang mati → label biasa; di luar dashboard → tanpa menu saring.
    const off = renderToStaticMarkup(
      createElement(PivotView, {
        data: data(),
        format: { style: "auto", decimals: 0 },
        label: "P",
        cross,
        crossFilter: false,
      }),
    );
    expect(off).not.toContain("crossfilter-item");
    expect(off).not.toContain('data-testid="pivot-filter"');
  });

  it("PDF: keterangan batas tetap; catatan saringan dari model", () => {
    expect(printPivotNote(data(), 2, [])).toBeNull();
  });
});

describe("filter silang dari pivot", () => {
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
  const schema = [
    col(1, "Cabang", "text"),
    col(2, "Layanan", "text"),
    col(3, "Tanggal", "date"),
    col(4, "Omzet", "decimal"),
  ];
  const spec: PivotSpec = {
    sheetId: SHEET,
    rows: [{ column: 1 }, { column: 2 }],
    column: { column: 3, timeGrain: "month" },
    values: [{ agg: "sum", column: 4 }],
    sort: "value_desc",
    format: { style: "auto", decimals: 0 },
    totals: true,
    subtotals: false,
  };
  const sheets = [{ id: SHEET, schema }];

  it("baris + kolom pemisah jadi kolom filter silang (server = klien) hanya bila sakelar = true", () => {
    const on = [{ type: "pivot", spec: { ...spec, crossFilter: true } }];
    expect(crossFilterColumnsOf(on, sheets)).toEqual(["Cabang", "Layanan", "Tanggal"]);
    const sources = [{ id: SHEET, columns: schema.map((c) => ({ pos: c.pos, name: c.name })) }];
    expect(crossColumnsOf(on, sources)).toEqual(["Cabang", "Layanan", "Tanggal"]);
    // Review M3: pivot tersimpan sebelum T-f4a7 (tanpa crossFilter) tidak menambah kolom silang (D6).
    for (const s of [spec, { ...spec, crossFilter: false }]) {
      const off = [{ type: "pivot", spec: s }];
      expect(crossFilterColumnsOf(off, sheets)).toEqual([]);
      expect(crossColumnsOf(off, sources)).toEqual([]);
    }
  });
});

describe("panel Saring (pengaturan pivot)", () => {
  const columns = [
    { pos: 1, name: "Cabang", type: "text" as const },
    { pos: 2, name: "Layanan", type: "text" as const },
  ];
  const base: PivotSpec = {
    sheetId: SHEET,
    rows: [{ column: 1 }],
    values: [{ agg: "count" }],
    sort: "value_desc",
    format: { style: "auto", decimals: 0 },
    totals: true,
    subtotals: false,
  };
  const render = (spec: PivotSpec) =>
    renderToStaticMarkup(
      createElement(PivotFields, {
        dashboardId: "cmv4kljx40009oczvdmpudash0",
        spec,
        columns,
        onChange: () => {},
      }),
    );

  it("tanpa saringan: tombol tambah; dengan saringan: kolom + daftar nilai; sakelar filter silang", () => {
    const none = render(base);
    expect(none).toContain("Saring (opsional)");
    expect(none).toContain("Tambah saringan");
    expect(none).toContain("Klik label menyaring widget lain");
    const one = render({ ...base, filters: [{ column: 2, op: "in", values: ["Express"] }] });
    expect(one.match(/data-testid="pivot-saved-filter"/g)).toHaveLength(1);
    expect(one).toContain('data-testid="pivot-saved-column-0"');
    expect(one).toContain('aria-label="Cari nilai Layanan"');
  });
});
