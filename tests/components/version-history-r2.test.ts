import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DatasetDataSummary } from "@/components/datasets/dataset-data-summary";
import { VersionHistory } from "@/components/datasets/version-history";
import type { VersionRow } from "@/features/versions/types";

// Komponen klien "Aktifkan" butuh router App Router dan Server Action; keduanya diganti stub.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/features/versions/actions", () => ({ activateVersionAction: vi.fn() }));

const row = (over: Partial<VersionRow>): VersionRow => ({
  id: "v1",
  fileName: "Laporan Penjualan September 2026.xlsx",
  status: "READY",
  sizeBytes: 1024,
  createdAt: "2026-10-14T01:00:00.000Z",
  finishedAt: "2026-10-14T01:05:00.000Z",
  active: false,
  canActivate: true,
  canDiscard: false,
  message: null,
  uploadedBy: null,
  sourceDeleted: false,
  ...over,
});

/** Kelas sel Status (sel kedua) tiap baris riwayat versi. */
function statusCellClasses(versions: VersionRow[]): string[] {
  const out = renderToStaticMarkup(
    createElement(VersionHistory, { datasetId: "d1", versions, busy: null }),
  );
  return [...out.matchAll(/<tr[^>]*data-testid="version-row"[^>]*>(.*?)<\/tr>/g)].map((m) => {
    const cells = [...(m[1] ?? "").matchAll(/<td role="cell" class="([^"]*)"/g)];
    return cells[1]?.[1] ?? "";
  });
}

/* UI-R2-1: lebar minimum kolom Status hanya untuk sel yang memuat alasan (nama file tidak terpotong). */
describe("VersionHistoryRow sel Status", () => {
  it("tanpa alasan: tanpa lebar minimum, jadi kolom selebar pil", () => {
    const cells = statusCellClasses([row({ id: "v2", active: true, canActivate: false }), row({})]);
    expect(cells).toHaveLength(2);
    for (const cls of cells) {
      expect(cls).not.toContain("min-w-64");
      expect(cls).not.toContain("basis-full");
    }
  });

  it("dengan alasan: sel itu ≥ 16rem di tabel dan selebar kartu di bawah @3xl", () => {
    const [failed, ready] = statusCellClasses([
      row({ id: "v3", status: "FAILED", canActivate: false, message: "File rusak." }),
      row({}),
    ]);
    expect(failed).toContain("@3xl:min-w-64");
    expect(failed).toContain("basis-full");
    expect(ready).not.toContain("min-w-64");
  });
});

/* UI-R2-2: token panjang tanpa spasi (nama file/sheet) dipecah di dalam alert, tidak melebarkan halaman. */
describe("FormAlert pembungkus isi", () => {
  const WRAP = /<div class="min-w-0 \[overflow-wrap:anywhere\]">(.*?)<\/div>/;

  it("alasan gagal di kartu Data berada di pembungkus yang boleh menyusut dan dipecah", () => {
    const token = "Rekap_Penjualan_Cabang_Jabodetabek_Kuartal_Ketiga_2026_FinalRevisi_v2";
    const out = renderToStaticMarkup(
      createElement(DatasetDataSummary, {
        datasetId: "d1",
        failed: { fileName: `${token}.xlsx`, message: `Sheet "${token}" baris 41: file rusak.` },
        active: null,
      }),
    );
    const inner = out.match(WRAP)?.[1];
    expect(inner).toContain('data-testid="dataset-status-message"');
    expect(inner).toContain(`${token}.xlsx`);
  });
});
