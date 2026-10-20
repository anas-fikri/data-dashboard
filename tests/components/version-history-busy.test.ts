import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UploadingInTab } from "@/components/datasets/dataset-activity";
import { VersionHistory } from "@/components/datasets/version-history";
import {
  BUSY_TEXT,
  shownBusy,
  type ActivationBusy,
} from "@/components/datasets/version-history-status";
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
  note: null,
  ...over,
});

const versions = [
  row({ id: "v3", status: "INGESTING", canActivate: false, finishedAt: null }),
  row({ id: "v2", active: true, canActivate: false }),
  row({ id: "v1" }),
];

/** `uploadingInTab`: nilai yang diterbitkan UploadPanel lewat DatasetActivityProvider. */
const html = (busy: ActivationBusy | null, uploadingInTab = false) =>
  renderToStaticMarkup(
    createElement(
      UploadingInTab,
      { value: uploadingInTab },
      createElement(VersionHistory, { datasetId: "d1", versions, busy }),
    ),
  );

/** Kelas sel aksi (sel terakhir) tiap baris. */
const actionCells = (out: string) =>
  [...out.matchAll(/<tr[^>]*data-testid="version-row"[^>]*>(.*?)<\/tr>/g)].map((m) => {
    const cells = [...(m[1] ?? "").matchAll(/<td role="cell" class="([^"]*)">(.*?)<\/td>/g)];
    const last = cells.at(-1);
    return { cls: last?.[1] ?? "", inner: last?.[2] ?? "" };
  });

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

  it("sel aksi kosong tidak memakan baris kartu, tetap sel di tabel", () => {
    const cells = actionCells(html("processing"));
    expect(cells).toHaveLength(versions.length);
    for (const { cls, inner } of cells) {
      expect(inner).toBe("");
      expect(cls).toContain("empty:hidden");
      expect(cls).toContain("@3xl:empty:table-cell");
    }
  });
});

/*
 * UI-R3-1/2/3: unggahan di tab ini tidak lagi memicu router.refresh() di tengahnya; UploadPanel
 * mengabarkannya lewat konteks, dan riwayat versi menahan "Aktifkan" dengan kalimat unggahan.
 */
describe("VersionHistory unggahan di tab ini", () => {
  it("server belum sibuk: tanpa Aktifkan, satu kalimat unggahan, sel aksi kosong", () => {
    const out = html(null, true);
    expect(out).not.toContain('data-testid="version-activate"');
    expect(out.match(/data-testid="version-busy"/g)).toHaveLength(1);
    expect(out).toContain(BUSY_TEXT.uploading);
    const cells = actionCells(out);
    expect(cells).toHaveLength(versions.length);
    expect(cells.every((c) => c.inner === "")).toBe(true);
  });

  it.each(["processing", "awaiting_mapping"] as const)(
    "server sibuk (%s) didahulukan: tetap satu kalimat, milik server",
    (kind) => {
      const out = html(kind, true);
      expect(out.match(/data-testid="version-busy"/g)).toHaveLength(1);
      expect(out).toContain(BUSY_TEXT[kind]);
      expect(out).not.toContain(BUSY_TEXT.uploading);
    },
  );

  it("shownBusy: server dulu, lalu unggahan di tab ini, selain itu tidak sibuk", () => {
    expect(shownBusy("processing", true)).toBe("processing");
    expect(shownBusy("awaiting_mapping", false)).toBe("awaiting_mapping");
    expect(shownBusy(null, true)).toBe("uploading");
    expect(shownBusy(null, false)).toBeNull();
  });
});
