import { describe, expect, it } from "vitest";
import {
  CANCEL_FAILED,
  cancelFailedState,
  holdsActivation,
  ownVersionAfterError,
  showsPendingCard,
  versionGone,
  type UploadPanelState,
} from "@/components/datasets/upload-panel-state";
import type { UploadProgress } from "@/features/uploads/client";

const file = new File(["a,b\n1,2\n"], "data.csv");
const progress = (over: Partial<UploadProgress> = {}): UploadProgress => ({
  phase: "uploading",
  loaded: 1,
  total: 10,
  resumed: false,
  ...over,
});
const retryErr: UploadPanelState = {
  kind: "error",
  file,
  message: "Koneksi terputus.",
  retryable: true,
};

/* T-013 review 5: satu model `ownVersion` = versi UPLOADING milik tab ini. */
describe("ownVersionAfterError", () => {
  it("mengingat versi dari galat atau versi yang sudah dikenal (part gagal tanpa versionId)", () => {
    expect(ownVersionAfterError({ code: "NETWORK", versionId: "v2" }, "v1")).toBe("v2");
    expect(ownVersionAfterError({ code: "RATE_LIMITED" }, "v1")).toBe("v1");
    expect(ownVersionAfterError({ code: "NETWORK" }, undefined)).toBeUndefined();
  });

  it("file lain → DATASET_BUSY tetap memegang versi yang dikenal", () => {
    expect(ownVersionAfterError({ code: "DATASET_BUSY" }, "v1")).toBe("v1");
  });

  it("versi hilang atau gagal permanen di server → dilepas", () => {
    expect(ownVersionAfterError({ code: "NOT_FOUND" }, "v1")).toBeUndefined();
    for (const code of ["INVALID_FORMAT", "UPLOAD_CORRUPT", "UPLOAD_FAILED"]) {
      expect(ownVersionAfterError({ code, versionId: "v1" }, "v1")).toBeUndefined();
    }
  });

  it("init: unggahan lama kedaluwarsa (UPLOAD_FAILED tanpa versionId) → versi dilepas", () => {
    expect(versionGone({ code: "UPLOAD_FAILED" })).toBe(true);
    expect(versionGone({ code: "UPLOAD_CORRUPT" })).toBe(true);
    expect(ownVersionAfterError({ code: "UPLOAD_FAILED" }, "v1")).toBeUndefined();
  });

  it("pra-cek file lokal (format/ukuran, tanpa versionId) tidak melepas versi yang dikenal", () => {
    expect(versionGone({ code: "INVALID_FORMAT" })).toBe(false);
    expect(ownVersionAfterError({ code: "INVALID_FORMAT" }, "v1")).toBe("v1");
    expect(ownVersionAfterError({ code: "FILE_TOO_LARGE" }, "v1")).toBe("v1");
  });
});

describe("cancelFailedState", () => {
  it("batal gagal karena koneksi: file tetap, tanpa Coba lagi (melanjutkan unggahan), pesan khusus batal", () => {
    const next = cancelFailedState(retryErr, { code: "NETWORK", message: "Koneksi terputus." });
    expect(next).toEqual({ kind: "error", file, message: CANCEL_FAILED, retryable: false });
    expect(CANCEL_FAILED).toContain("Batalkan unggahan");
  });

  it("galat lain memakai pesan server; status sebelumnya yang tidak bisa diulang tetap begitu", () => {
    const busy: UploadPanelState = { ...retryErr, retryable: false };
    const next = cancelFailedState(busy, { code: "BUSY", message: "File sedang diperiksa." });
    expect(next).toMatchObject({ file, message: "File sedang diperiksa.", retryable: false });
  });

  it("dari progres (berjalan/jeda) file tetap, tanpa Coba lagi", () => {
    for (const kind of ["running", "paused"] as const) {
      const prev: UploadPanelState = { kind, file, progress: progress({ versionId: "v1" }) };
      expect(cancelFailedState(prev, null)).toMatchObject({ file, retryable: false });
    }
  });

  it("dari kartu tertunda (tanpa file) tidak menawarkan Coba lagi", () => {
    expect(cancelFailedState({ kind: "idle" }, null)).toMatchObject({
      file: null,
      retryable: false,
    });
  });

  it("versi sudah hilang (NOT_FOUND) → tidak ditawarkan untuk diulang", () => {
    const next = cancelFailedState(retryErr, { code: "NOT_FOUND", message: "Tidak ditemukan." });
    expect(next).toMatchObject({ retryable: false, message: "Tidak ditemukan." });
  });
});

describe("holdsActivation", () => {
  it("galat menahan Aktifkan selama versi milik tab ini masih ada (apa pun kodenya)", () => {
    expect(holdsActivation(retryErr, "v1", false)).toBe(true);
    expect(holdsActivation({ ...retryErr, retryable: false }, "v1", false)).toBe(true);
    expect(holdsActivation(retryErr, undefined, false)).toBe(false);
  });

  it("transfer, jeda, dan selesai sampai refresh", () => {
    const running: UploadPanelState = { kind: "running", file, progress: progress() };
    expect(holdsActivation(running, undefined, false)).toBe(false);
    expect(
      holdsActivation({ ...running, progress: progress({ versionId: "v1" }) }, "v1", false),
    ).toBe(true);
    expect(
      holdsActivation(
        { kind: "paused", file, progress: progress({ versionId: "v1" }) },
        "v1",
        false,
      ),
    ).toBe(true);
    expect(holdsActivation({ kind: "done", name: "a" }, undefined, true)).toBe(true);
    expect(holdsActivation({ kind: "done", name: "a" }, undefined, false)).toBe(false);
    expect(holdsActivation({ kind: "idle" }, undefined, false)).toBe(false);
  });
});

describe("showsPendingCard", () => {
  it("disembunyikan selama galat memegang versi yang sama (tanpa tombol ganda)", () => {
    expect(showsPendingCard(retryErr, "v1", "v1")).toBe(false);
  });

  it("tampil bila galat tidak memegang versi itu, atau saat diam", () => {
    expect(showsPendingCard(retryErr, "v1", undefined)).toBe(true);
    expect(showsPendingCard(retryErr, "v1", "v9")).toBe(true);
    expect(showsPendingCard({ kind: "idle" }, "v1", undefined)).toBe(true);
    expect(showsPendingCard({ kind: "idle" }, undefined, undefined)).toBe(false);
  });

  it("tidak tampil saat progres berjalan", () => {
    const running: UploadPanelState = { kind: "running", file, progress: progress() };
    expect(showsPendingCard(running, "v1", "v1")).toBe(false);
  });
});
