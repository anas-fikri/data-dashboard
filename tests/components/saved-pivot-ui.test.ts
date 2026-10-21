import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
// Server Action (headers, env, Redis) tidak dipanggil saat render statis.
vi.mock("@/features/saved-pivots/actions", () => ({
  createSavedPivotAction: vi.fn(),
  updateSavedPivotAction: vi.fn(),
  deleteSavedPivotAction: vi.fn(),
}));

import { scopeKey, scopeOf } from "@/components/dashboards/query-scope";
import type { Source } from "@/components/dashboards/widget-config-model";
import { SavedPivotList } from "@/components/saved-pivots/saved-pivot-list";
import { SavedPivotEditorPage } from "@/components/saved-pivots/saved-pivot-page";
import type { PivotSpec } from "@/features/widgets/spec";

/*
 * T-074: lingkup query pratinjau (dashboard/dataset), markup daftar pivot tersimpan (kolom, aksi,
 * Hapus nonaktif + alasan bila dipakai) dan halaman editor (konfirmasi dampak, keadaan kosong).
 */
const S1 = "cmv4kljx40009oczvdmpurrs1";
const DS = "cmv4kljx40009oczvdmpudata0";
const sources: Source[] = [
  {
    id: S1,
    name: "Laba",
    columns: [
      { pos: 1, name: "Wilayah", type: "text" },
      { pos: 2, name: "Pendapatan", type: "integer" },
    ],
  },
];
const spec: PivotSpec = {
  sheetId: S1,
  rows: [{ column: 1 }],
  values: [{ agg: "sum", column: 2 }],
  sort: "label_asc",
  format: { style: "auto", decimals: 0 },
  totals: true,
  subtotals: false,
};
const base = {
  spec,
  revision: 2,
  updatedAt: "2026-10-21T10:00:00.000Z",
};

describe("query-scope", () => {
  it("kunci stabil bolak-balik untuk dashboard dan dataset", () => {
    expect(scopeOf(scopeKey({ dashboardId: "d1" }))).toEqual({ dashboardId: "d1" });
    expect(scopeOf(scopeKey({ datasetId: "x1" }))).toEqual({ datasetId: "x1" });
    expect(scopeKey({ dashboardId: "a" })).not.toBe(scopeKey({ datasetId: "a" }));
  });
});

describe("daftar pivot tersimpan", () => {
  const html = renderToStaticMarkup(
    createElement(SavedPivotList, {
      datasetId: DS,
      sheetNames: { [S1]: "Laba" },
      pivots: [
        {
          ...base,
          id: "p1",
          name: "Dipakai",
          usage: {
            widgets: 3,
            dashboards: 2,
            usedIn: [
              { id: "a", name: "Ringkasan" },
              { id: "b", name: "Wilayah" },
            ],
          },
        },
        { ...base, id: "p2", name: "Bebas", usage: { widgets: 0, dashboards: 0, usedIn: [] } },
      ],
    }),
  );

  it("kolom Nama | Sheet | Dipakai di | Diubah dan aksi per baris", () => {
    for (const h of ["Nama", "Sheet", "Dipakai di", "Diubah"]) expect(html).toContain(`>${h}<`);
    expect(html).toContain("3 widget, 2 dashboard");
    expect(html).toContain("Belum dipakai");
    expect(html).toContain(`href="/datasets/${DS}/pivot-tersimpan/p1"`);
    for (const a of ["Ubah Dipakai", "Ganti nama Dipakai", "Duplikat Dipakai", "Hapus Dipakai"]) {
      expect(html).toContain(`aria-label="${a}"`);
    }
  });

  it("Hapus nonaktif + alasan (dashboard pemakai) hanya untuk pivot yang dipakai", () => {
    const rows = html.split('data-testid="saved-pivot-row"');
    expect(rows[1]).toContain('aria-disabled="true"');
    expect(rows[1]).toContain("masih dipakai 3 widget di dashboard “Ringkasan”, “Wilayah”");
    expect(rows[2]).not.toContain('aria-disabled="true"');
  });

  it("kosong: ajakan membuat", () => {
    const empty = renderToStaticMarkup(
      createElement(SavedPivotList, { datasetId: DS, sheetNames: {}, pivots: [] }),
    );
    expect(empty).toContain("Belum ada pivot tersimpan");
  });
});

describe("halaman editor pivot tersimpan", () => {
  it("ubah pivot yang dipakai: info dampak, penyusun pivot, tombol simpan perubahan", () => {
    const html = renderToStaticMarkup(
      createElement(SavedPivotEditorPage, {
        dataset: { id: DS, name: "Laba" },
        sources,
        initial: {
          id: "p1",
          name: "Dipakai",
          spec,
          revision: 2,
          usage: { widgets: 3, dashboards: 2 },
        },
      }),
    );
    expect(html).toContain("Ubah “Dipakai”");
    expect(html).toContain("Dipakai 3 widget di 2 dashboard");
    expect(html).toContain('data-testid="pivot-config"');
    expect(html).toContain("Simpan perubahan");
  });

  it("buat baru tanpa data siap: keadaan kosong", () => {
    const html = renderToStaticMarkup(
      createElement(SavedPivotEditorPage, {
        dataset: { id: DS, name: "Laba" },
        sources: [],
        initial: null,
      }),
    );
    expect(html).toContain("Belum ada data untuk dipakai");
    expect(html).not.toContain('data-testid="saved-pivot-editor"');
  });
});
