import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrintDashboard } from "@/components/render/print-dashboard";
import { tableRowsFit } from "@/components/render/print-layout";
import { fittingColumns, printTableNote } from "@/components/render/print-table";
import type { RenderData, RenderWidget } from "@/features/exports/render-data";

/*
 * T-018 halaman cetak dengan data fixture (jawaban /api/query yang sudah diambil server): kepala, pita
 * per halaman, dan keadaan kartu yang sama dengan layar — KPI, grafik bernilai teks, tabel dengan
 * "Menampilkan X dari N baris", galat dengan kode, widget kosong, catatan filter yang dilewati.
 */
const SHEET = "cmv4kljx40009oczvdmpurrs1";
const AUTO = { style: "auto", decimals: 0 } as const;
const RP = { style: "rupiah", decimals: 0 } as const;
const v = "2026-10-16T00:00:00.000Z";

const widgets: RenderWidget[] = [
  {
    id: "kpi",
    type: "kpi",
    title: "Total omzet",
    spec: { sheetId: SHEET, measure: { agg: "sum", column: 3 }, format: RP },
    result: {
      ok: true,
      columns: [{ key: "m", label: "Omzet", type: "decimal" }],
      rows: [[1_250_000]],
      widgetVersion: v,
    },
  },
  {
    id: "bar",
    type: "bar",
    title: "Omzet per cabang",
    spec: {
      sheetId: SHEET,
      dimension: { column: 1 },
      measure: { agg: "sum", column: 3 },
      sort: "value_desc",
      topN: 10,
      format: RP,
    },
    result: {
      ok: true,
      columns: [
        { key: "d", label: "Cabang", type: "text" },
        { key: "m", label: "Omzet", type: "decimal" },
      ],
      rows: [
        ["Jakarta", 800_000],
        ["Bandung", 450_000],
      ],
      categories: 2,
      grandTotal: 1_250_000,
      skippedFilters: ["Kota"],
      widgetVersion: v,
    },
  },
  {
    id: "tbl",
    type: "table",
    title: "Detail kiriman",
    spec: { sheetId: SHEET, columns: [1, 2], format: AUTO },
    result: {
      ok: true,
      columns: [
        { key: "a", label: "Resi", type: "text" },
        { key: "b", label: "Berat", type: "decimal" },
      ],
      rows: Array.from({ length: 100 }, (_, k) => [`R${k + 1}`, k + 0.5]),
      total: 250,
      page: 0,
      pageSize: 100,
      widgetVersion: v,
    },
  },
  {
    id: "err",
    type: "kpi",
    title: "Rata-rata ongkir",
    spec: { sheetId: SHEET, measure: { agg: "avg", column: 9 }, format: RP },
    result: {
      ok: false,
      code: "COLUMN_UNAVAILABLE",
      message: "Kolom “Ongkir” tidak tersedia lagi.",
      widgetVersion: v,
    },
  },
  {
    id: "empty",
    type: "empty",
    title: "",
    spec: {},
    result: { ok: false, code: "INVALID", message: "x" },
  },
];

const data: RenderData = {
  dashboard: {
    id: "d1",
    name: "Penjualan Oktober",
    datasetName: "Rekap 2026",
    layout: [
      { i: "kpi", x: 0, y: 0, w: 4, h: 2 },
      { i: "err", x: 4, y: 0, w: 4, h: 2 },
      { i: "empty", x: 8, y: 0, w: 4, h: 2 },
      { i: "bar", x: 0, y: 2, w: 12, h: 5 },
      { i: "tbl", x: 0, y: 7, w: 12, h: 6 },
      // Tata letak menyebut widget yang sudah tidak ada: diabaikan.
      { i: "hilang", x: 0, y: 13, w: 4, h: 2 },
    ],
    filterSummary: "Cabang: Jakarta, Bandung; Tanggal: Bulan ini",
    exportedAt: "2026-10-16T07:05:00.000Z",
  },
  widgets,
};
const html = renderToStaticMarkup(PrintDashboard({ data }));

describe("PrintDashboard", () => {
  it("kepala: satu h1 nama dashboard, dataset, ringkasan filter, waktu ekspor WIB", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Penjualan Oktober");
    expect(html).toContain("Rekap 2026");
    expect(html).toContain("Cabang: Jakarta, Bandung; Tanggal: Bulan ini");
    expect(html).toMatch(/Diekspor (<!-- -->)?16 Oktober 2026 14\.05 WIB/);
  });

  it("pita per halaman: halaman 1 (8 baris) lalu halaman baru; widget yatim diabaikan", () => {
    const bands = html.match(/data-testid="print-band"/g) ?? [];
    expect(bands).toHaveLength(2);
    expect(html.match(/break-before-page/g)).toHaveLength(1);
    expect(html.match(/data-testid="print-widget"/g)).toHaveLength(5);
    expect(html).not.toContain('data-widget-id="hilang"');
    expect(html).toContain("grid-column:1 / span 12;grid-row:1 / span 6");
  });

  it("KPI dan grafik: nilai sebagai teks", () => {
    expect(html).toContain("Rp 1.250.000");
    expect(html).toContain("Rp 800.000");
  });

  it("tabel: baris yang muat + 'Menampilkan X dari N baris'", () => {
    const fit = tableRowsFit(6);
    expect(html).toContain(`Menampilkan ${fit} dari 250 baris`);
    expect(html).toContain(`>R${fit}<`);
    expect(html).not.toContain(`>R${fit + 1}<`);
  });

  it("galat tercetak dengan pesan dan kode; widget kosong; filter yang dilewati", () => {
    expect(html).toContain('data-code="COLUMN_UNAVAILABLE"');
    expect(html).toContain("Kolom “Ongkir” tidak tersedia lagi.");
    expect(html).toMatch(/Kode: (<!-- -->)?COLUMN_UNAVAILABLE/);
    expect(html).toContain("Widget ini belum berisi data.");
    expect(html).toContain("Widget tanpa judul");
    expect(html).toContain("Filter Kota tidak berlaku untuk widget ini.");
  });

  it("tanpa kontrol layar: tidak ada tombol (urut, halaman, ekspor, coba lagi)", () => {
    expect(html).not.toContain("<button");
  });
});

describe("kolom tabel cetak", () => {
  it("hanya kolom depan yang muat utuh; paling sedikit satu", () => {
    expect(fittingColumns([120, 230, 310, 420], 392)).toBe(3);
    expect(fittingColumns([120, 230], 392)).toBe(2);
    expect(fittingColumns([500, 600], 392)).toBe(1);
    expect(fittingColumns([], 392)).toBe(0);
    // Pembulatan sub-piksel bukan "tidak muat".
    expect(fittingColumns([392.4], 392)).toBe(1);
  });

  it("keterangan: baris yang tampil + kolom yang tidak muat disebut namanya", () => {
    expect(printTableNote(7, 2000, [])).toBe("Menampilkan 7 dari 2.000 baris");
    expect(printTableNote(7, 2000, ["Jumlah", "Status"])).toBe(
      "Menampilkan 7 dari 2.000 baris · 2 kolom tidak muat: Jumlah, Status",
    );
    expect(printTableNote(0, 0, ["Jumlah"])).toBe("Tidak ada baris");
  });
});
