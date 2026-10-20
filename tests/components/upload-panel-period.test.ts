import { describe, expect, it } from "vitest";
import { ingestSteps } from "@/components/datasets/ingest-progress";
import {
  REPLACE_CHOICE,
  cancelFailedState,
  choiceForFile,
  type UploadPanelState,
} from "@/components/datasets/upload-panel-state";

/* T-053: pilihan unggahan panel (periode / ganti semua / lanjut tertunda) dan tahap "Membaca periode". */
const file = { name: "laporan_2026-04.csv", size: 120 };
const pendingOf = (over: Partial<NonNullable<Parameters<typeof choiceForFile>[1]["pending"]>>) => ({
  originalName: file.name,
  sizeBytes: file.size,
  mode: "PERIOD" as const,
  label: "2026-03-01",
  ...over,
});

describe("choiceForFile", () => {
  it("dataset non-periode → ganti data (panel lama)", () => {
    expect(choiceForFile(file, { period: null, pending: null })).toEqual(REPLACE_CHOICE);
  });

  it("dataset periode mode kolom → PERIOD tanpa label", () => {
    expect(choiceForFile(file, { period: { needsLabel: false }, pending: null })).toEqual({
      mode: "PERIOD",
      label: null,
    });
  });

  it("sheet berlabel → null: pemilih periode wajib diisi dulu", () => {
    expect(choiceForFile(file, { period: { needsLabel: true }, pending: null })).toBeNull();
  });

  it("file sama dengan unggahan tertunda → pilihan unggahan itu (mode + label sama, R20)", () => {
    const period = { needsLabel: true };
    expect(choiceForFile(file, { period, pending: pendingOf({}) })).toEqual({
      mode: "PERIOD",
      label: "2026-03-01",
    });
    expect(
      choiceForFile(file, { period, pending: pendingOf({ mode: "REPLACE", label: null }) }),
    ).toEqual(REPLACE_CHOICE);
    // Ukuran berbeda = file lain → pilihan baru.
    expect(choiceForFile(file, { period, pending: pendingOf({ sizeBytes: 1 }) })).toBeNull();
  });

  it("unggahan periode tertunda pada dataset yang tidak lagi per periode → panel biasa", () => {
    expect(choiceForFile(file, { period: null, pending: pendingOf({}) })).toEqual(REPLACE_CHOICE);
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
