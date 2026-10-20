import { describe, expect, it } from "vitest";
import { ingestSteps } from "@/components/datasets/ingest-progress";
import {
  PERIOD_GONE,
  REPLACE_CHOICE,
  actionForFile,
  cancelFailedState,
  periodRequest,
  replaceAllText,
  type UploadPanelState,
} from "@/components/datasets/upload-panel-state";

/* T-053: pilihan unggahan panel (periode / ganti semua / lanjut tertunda) dan tahap "Membaca periode". */
const file = { name: "laporan_2026-04.csv", size: 120 };
type Pending = NonNullable<Parameters<typeof actionForFile>[1]["pending"]>;
const pendingOf = (over: Partial<Pending>): Pending => ({
  originalName: file.name,
  sizeBytes: file.size,
  mode: "PERIOD",
  label: "2026-03-01",
  ...over,
});
const start = (choice: unknown) => ({ kind: "start", choice });

describe("actionForFile", () => {
  it("dataset non-periode → ganti data (panel lama)", () => {
    expect(actionForFile(file, { period: null, pending: null })).toEqual(start(REPLACE_CHOICE));
  });

  it("dataset periode mode kolom → PERIOD tanpa label", () => {
    expect(actionForFile(file, { period: { needsLabel: false }, pending: null })).toEqual(
      start({ mode: "PERIOD", label: null }),
    );
  });

  it("sheet berlabel → pemilih periode wajib diisi dulu", () => {
    expect(actionForFile(file, { period: { needsLabel: true }, pending: null })).toEqual({
      kind: "pick",
    });
  });

  it("file sama dengan unggahan periode tertunda → pilihan unggahan itu (mode + label sama, R20)", () => {
    expect(actionForFile(file, { period: { needsLabel: true }, pending: pendingOf({}) })).toEqual(
      start({ mode: "PERIOD", label: "2026-03-01" }),
    );
    // Ukuran berbeda = file lain → pilihan baru.
    expect(
      actionForFile(file, { period: { needsLabel: true }, pending: pendingOf({ sizeBytes: 1 }) }),
    ).toEqual({ kind: "pick" });
  });

  it("review M2: unggahan 'ganti semua' tertunda dipilih di dropzone periode → konfirmasi dulu", () => {
    for (const needsLabel of [false, true]) {
      expect(
        actionForFile(file, {
          period: { needsLabel },
          pending: pendingOf({ mode: "REPLACE", label: null }),
        }),
      ).toEqual({ kind: "confirm-replace" });
    }
  });

  it("review L2: unggahan periode tertunda tanpa label, data aktif kini berlabel → pemilih", () => {
    expect(
      actionForFile(file, { period: { needsLabel: true }, pending: pendingOf({ label: null }) }),
    ).toEqual({ kind: "pick" });
    expect(
      actionForFile(file, { period: { needsLabel: false }, pending: pendingOf({ label: null }) }),
    ).toEqual(start({ mode: "PERIOD", label: null }));
  });

  it("dataset tidak lagi per periode → panel biasa (ganti data dengan file baru)", () => {
    expect(actionForFile(file, { period: null, pending: pendingOf({}) })).toEqual(
      start(REPLACE_CHOICE),
    );
  });
});

describe("periodRequest (review M1)", () => {
  it("PERIOD tanpa konteks periode tidak pernah diturunkan menjadi ganti semua data", () => {
    expect(periodRequest({ mode: "PERIOD", label: "2026-04-01" }, null)).toEqual({
      ok: false,
      message: PERIOD_GONE,
    });
    expect(periodRequest({ mode: "PERIOD", label: null }, null).ok).toBe(false);
  });
  it("PERIOD dengan konteks → versi dasar + label; REPLACE → tanpa isian periode", () => {
    expect(periodRequest({ mode: "PERIOD", label: "2026-04-01" }, { baseVersionId: "v1" })).toEqual(
      { ok: true, period: { baseVersionId: "v1", label: "2026-04-01" } },
    );
    expect(periodRequest(REPLACE_CHOICE, { baseVersionId: "v1" })).toEqual({ ok: true });
    expect(periodRequest(REPLACE_CHOICE, null)).toEqual({ ok: true });
  });
});

describe("replaceAllText (review L3)", () => {
  it("jumlah periode, atau 'Semua data' bila 0", () => {
    expect(replaceAllText(18)).toBe("Semua 18 periode akan diganti");
    expect(replaceAllText(1200)).toBe("Semua 1.200 periode akan diganti");
    expect(replaceAllText(0)).toBe("Semua data akan diganti");
  });
});

describe("cancelFailedState", () => {
  it("pilihan unggahan ikut dipertahankan (lanjut dengan pilihan yang sama)", () => {
    const prev: UploadPanelState = {
      kind: "paused",
      file: new File(["x"], "a.csv"),
      progress: { phase: "uploading", loaded: 1, total: 2, resumed: false },
      choice: { mode: "PERIOD", label: "2026-04-01" },
    };
    expect(cancelFailedState(prev, null).choice).toEqual({ mode: "PERIOD", label: "2026-04-01" });
  });
});

describe("ingestSteps (AC 4)", () => {
  it("unggahan periode menampilkan 'Membaca periode' lalu skema aktif", () => {
    expect(ingestSteps({ period: true }).map((s) => [s.key, s.label])).toEqual([
      ["unduh", "Menyiapkan file"],
      ["baca", "Membaca isi file"],
      ["periode", "Membaca periode"],
      ["tipe", "Menerapkan skema aktif"],
    ]);
  });
  it("ingest biasa tidak berubah", () => {
    expect(ingestSteps({}).map((s) => s.label)).toEqual([
      "Menyiapkan file",
      "Membaca isi file",
      "Menyimpan data",
      "Mendeteksi tipe kolom",
    ]);
  });
});
