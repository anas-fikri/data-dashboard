import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { printTitleClamp } from "@/components/render/print-card";
import { PrintDashboard } from "@/components/render/print-dashboard";
import {
  PRINT_MIN_SCALE,
  ROWS_PER_PAGE,
  rowsPx,
  tableRowsFit,
  tableRowsFitPx,
} from "@/components/render/print-layout";
import { fittingColumns, fittingRows, printTableNote } from "@/components/render/print-table";
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

  it("judul dokumen PDF = nama dashboard (<title>, diangkat React 19 ke <head>)", () => {
    expect(html).toContain("<title>Penjualan Oktober</title>");
  });

  it("pita tidak bisa dipecah halaman dan setinggi isinya (review R1 INT-1)", () => {
    const bands = [
      ...html.matchAll(/<div class="([^"]*)" style="height:(\d+)px" data-testid="print-band"/g),
    ];
    expect(bands.map((b) => Number(b[2]))).toEqual([rowsPx(7), rowsPx(6)]);
    for (const [, cls] of bands) {
      expect(cls).toContain("overflow-hidden");
      expect(cls).toContain("break-inside-avoid");
    }
  });

  it("nama dashboard dan judul kartu membungkus, bukan satu baris berelipsis (R1-DS-6)", () => {
    expect(html).toMatch(/<h1 class="[^"]*line-clamp-2[^"]*\[overflow-wrap:anywhere\]/);
    expect(html).not.toMatch(/<h1 class="[^"]*truncate/);
    const titles = [...html.matchAll(/<h2 class="[^"]*"><span class="([^"]*)">/g)].map((m) => m[1]);
    expect(titles).toHaveLength(5);
    for (const cls of titles)
      expect(cls).toMatch(/^line-clamp-[23] min-w-0 \[overflow-wrap:anywhere\]$/);
  });

  it("kartu < 3 baris (mis. KPI h=2) judul maks 2 baris agar angka tidak terpotong (R2-INT-1)", () => {
    expect(printTitleClamp(rowsPx(2))).toBe("line-clamp-2");
    expect(printTitleClamp(rowsPx(3) - 1)).toBe("line-clamp-2");
    expect(printTitleClamp(rowsPx(3))).toBe("line-clamp-3");
    expect(printTitleClamp(rowsPx(10))).toBe("line-clamp-3");
  });
});

describe("widget lebih tinggi dari halamannya (review R1 DS-2)", () => {
  const tall = renderToStaticMarkup(
    PrintDashboard({
      data: {
        ...data,
        dashboard: {
          ...data.dashboard,
          layout: [
            { i: "kpi", x: 0, y: 0, w: 6, h: 2 },
            { i: "tbl", x: 0, y: 2, w: 6, h: 40 },
            { i: "bar", x: 6, y: 0, w: 6, h: 5 },
          ],
        },
      },
    }),
  );

  it("hanya widget itu diperkecil (0,75, dibatasi satu halaman) dan tetap selebar kolomnya", () => {
    expect(tall.match(/data-testid="print-scaled"/g)).toHaveLength(1);
    const capped = Math.floor(rowsPx(ROWS_PER_PAGE) / PRINT_MIN_SCALE);
    expect(tall).toContain(
      `data-testid="print-scaled" data-scale="${PRINT_MIN_SCALE}"><article style="width:133.33333333333334%;height:${capped}px;transform:scale(${PRINT_MIN_SCALE})" data-testid="print-widget" data-widget-id="tbl"`,
    );
    // Tetangga skala 1, tabel memuat baris untuk tinggi yang dibatasi.
    expect(tall).toContain(`Menampilkan ${tableRowsFitPx(capped)} dari 250 baris`);
    expect(tall.match(/data-testid="print-band"/g)).toHaveLength(2);
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

  it("review R1 INT-2: kolom terakhir yang pas di tepi kotak tetap dicetak", () => {
    // Kartu w=4: tepi kanan bulat [124, 219, 337] vs lebar 336 (pecahan: 336,297 = lebar kotak).
    expect(fittingColumns([124, 219, 337], 336)).toBe(3);
    expect(fittingColumns([123.6, 218.9, 336.297], 336.297)).toBe(3);
    expect(fittingColumns([124, 219, 338.5], 336.297)).toBe(2);
  });

  it("baris yang muat diukur dari kotak sebenarnya (judul kartu bisa 1–3 baris)", () => {
    // Kotak 181 px, kepala kolom 25 px → 6 baris utuh (156 px).
    expect(fittingRows(181, 25)).toBe(6);
    expect(fittingRows(20, 25)).toBe(0);
  });

  it("keterangan: baris yang tampil + kolom yang tidak muat disebut namanya", () => {
    expect(printTableNote(7, 2000, [])).toBe("Menampilkan 7 dari 2.000 baris");
    expect(printTableNote(7, 2000, ["Jumlah", "Status"])).toBe(
      "Menampilkan 7 dari 2.000 baris · 2 kolom tidak muat: Jumlah, Status",
    );
    expect(printTableNote(0, 0, ["Jumlah"])).toBe("Tidak ada baris");
  });
});
