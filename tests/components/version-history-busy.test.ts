import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VersionHistory } from "@/components/datasets/version-history";
import { BUSY_TEXT, type ActivationBusy } from "@/components/datasets/version-history-status";
import type { VersionRow } from "@/features/versions/types";

// Komponen klien "Aktifkan" butuh router App Router dan Server Action; keduanya diganti stub.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/features/versions/actions", () => ({ activateVersionAction: vi.fn() }));

const row = (over: Partial<VersionRow>): VersionRow => ({
  id: "v1",
  fileName: "september.xlsx",
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

const versions = [
  row({ id: "v3", status: "INGESTING", canActivate: false, finishedAt: null }),
  row({ id: "v2", active: true, canActivate: false }),
  row({ id: "v1" }),
];

const html = (busy: ActivationBusy | null) =>
  renderToStaticMarkup(createElement(VersionHistory, { datasetId: "d1", versions, busy }));

/* T-013: "Aktifkan" tidak ditawarkan selama dataset sibuk (selalu DATASET_BUSY); diganti satu baris. */
describe("VersionHistory busy", () => {
  it.each(Object.entries(BUSY_TEXT) as [ActivationBusy, string][])(
    "sibuk (%s): tanpa tombol Aktifkan, dengan satu kalimat sesuai keadaan",
    (kind, text) => {
      const out = html(kind);
      expect(out).not.toContain('data-testid="version-activate"');
      expect(out.match(/data-testid="version-busy"/g)).toHaveLength(1);
      expect(out).toContain(text);
      // Kalimat keadaan lain tidak ikut tampil.
      for (const other of Object.values(BUSY_TEXT)) {
        if (other !== text) expect(out).not.toContain(other);
      }
    },
  );

  it("tidak sibuk: versi siap non-aktif bisa diaktifkan, tanpa baris sibuk", () => {
    const out = html(null);
    expect(out.match(/data-testid="version-activate"/g)).toHaveLength(1);
    expect(out).not.toContain('data-testid="version-busy"');
  });
});
