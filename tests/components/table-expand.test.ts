import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableExpand } from "@/components/widgets/table-expand";
import { TableView } from "@/components/widgets/table-view";
import type { WidgetData } from "@/components/widgets/widget-query";
import { DEFAULT_FORMAT } from "@/features/widgets/spec";

/*
 * T-047 "Perbesar" widget tabel: rupa lembar kerja (nomor baris global beku di kiri, garis sel) di atas
 * data jalur widget yang sama; tombol kepala kartu tanpa dialog terbuka tidak merender tabel/tautan.
 * Akses (viewer tanpa tautan Lihat data, endpoint sheet ditolak) diuji e2e data-view.spec.ts.
 */
const data: WidgetData = {
  columns: [
    { key: "d0", label: "Kode", type: "text" },
    { key: "d1", label: "Jumlah", type: "integer" },
  ],
  rows: [
    ["K101", 101000],
    ["K102", null],
  ],
  total: 450,
  page: 1,
  pageSize: 100,
};

const view = (sheet: boolean) =>
  renderToStaticMarkup(
    createElement(TableView, {
      data,
      positions: [1, 2],
      format: DEFAULT_FORMAT,
      sort: null,
      busy: false,
      label: "Tabel kode",
      sheet,
      onSort: () => {},
      onPage: () => {},
    }),
  );

describe("TableView rupa lembar kerja", () => {
  it("nomor baris global (halaman × ukuran + baris) sebagai kepala baris beku", () => {
    const html = view(true);
    expect(html).toContain('<span class="sr-only">Nomor baris</span>');
    expect(
      html.match(/<th scope="row"[^>]*>(\d+)<\/th>/g)?.map((t) => t.replace(/<[^>]+>/g, "")),
    ).toEqual(["101", "102"]);
    expect(html).toContain("sticky left-0");
    expect(html).toContain("Baris 101–102 dari 450");
  });

  it("kartu biasa tanpa kolom nomor baris (tidak berubah)", () => {
    const html = view(false);
    expect(html).not.toContain("Nomor baris");
    expect(html).not.toContain('scope="row"');
  });
});

describe("TableExpand", () => {
  it("tertutup: hanya tombol Perbesar berlabel judul, tanpa tabel dan tanpa tautan", () => {
    const html = renderToStaticMarkup(
      createElement(TableExpand, {
        widgetId: "w1",
        config: {
          type: "table",
          spec: { sheetId: "s1", columns: [1, 2], format: DEFAULT_FORMAT },
        },
        title: "Tabel kode",
        dataHref: "/datasets/d1/data?sheetId=s1",
        request: { current: null },
      }),
    );
    expect(html).toContain('aria-label="Perbesar Tabel kode"');
    expect(html).not.toContain("widget-table");
    expect(html).not.toContain("Lihat data");
  });
});
