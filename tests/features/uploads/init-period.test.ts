import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MultipartStorage } from "@/lib/storage/multipart";

/*
 * Init unggahan periode (T-052 AC6, rencana G-6 §4.5 langkah 2 / R20): mode + label + baseVersionId;
 * resume hanya untuk mode + label yang sama (versi lama dengan pilihan lain dibuang, bukan dilanjutkan
 * diam-diam); InitOk menggemakan mode efektif; mode PERIOD hanya untuk dataset per periode terhadap
 * versi aktif yang dilihat pemilik. Prisma dimock di tingkat transaksi.
 */
const MiB = 1024 * 1024;
const tx = {
  $executeRaw: vi.fn(),
  dataset: { findUnique: vi.fn() },
  datasetVersion: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
};
vi.mock("@/lib/db", () => ({
  prisma: {
    dataset: { findFirst: vi.fn(async () => ({ id: DID })) },
    datasetVersion: {
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));
vi.mock("@/lib/env", () => ({
  env: () => ({ MAX_UPLOAD_BYTES: 1024 * MiB, USER_STORAGE_QUOTA_BYTES: 20 * 1024 * MiB }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/queue/versions", () => ({ enqueueIngest: vi.fn() }));
vi.mock("@/lib/storage/multipart", () => ({ s3Multipart: {} }));
// Batas periode saat init (T-055): logika murni diuji di period-capacity.test.ts; di sini urutan + gema.
const periodInitCheck = vi.fn();
vi.mock("@/features/versions/period-capacity", () => ({
  periodInitCheck: (...a: unknown[]) => periodInitCheck(...a),
}));
vi.mock("@/features/uploads/quota", () => ({
  userUsage: vi.fn(async () => ({ bytes: 0 })),
  quotaGraceUntil: vi.fn(async () => null),
  quotaDecision: vi.fn(() => ({ ok: true, warn: false })),
  formatGiB: (n: number) => `${n}`,
}));

const DID = "cmv4klj5r0007oczvgiofocpg";
const ACTIVE = "cmv4kljx40009oczvaktif0001";
const OLD = "cmv4kljx40009oczvlama00001";
const { initUpload, validateInit } = await import("@/features/uploads/service");

function storage(): MultipartStorage {
  return {
    create: vi.fn(async () => "up-new"),
    signPart: vi.fn(),
    listParts: vi.fn(async () => [{ partNumber: 1, size: 5 * MiB, etag: '"a"' }]),
    complete: vi.fn(),
    abort: vi.fn(async () => {}),
    head: vi.fn(),
    readHead: vi.fn(),
    remove: vi.fn(async () => {}),
  } as unknown as MultipartStorage;
}

const file = { datasetId: DID, name: "april.csv", size: 5 * MiB, lastModified: 1 };
const periodDataset = (source: "COLUMN" | "LABEL" = "COLUMN", activeVersionId = ACTIVE) => ({
  activeVersionId,
  activeVersion: { periodGrain: "MONTH", sheets: [{ periodSource: source }] },
});
const ownUploading = (mode: string, label: string | null) => ({
  id: OLD,
  sourceKey: `raw/${DID}/${OLD}/source.csv`,
  uploadId: "up-old",
  sizeBytes: BigInt(5 * MiB),
  partSize: 16 * MiB,
  partCount: 1,
  mode,
  periodLabel: label ? new Date(`${label}T00:00:00Z`) : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  tx.dataset.findUnique.mockResolvedValue(periodDataset());
  tx.datasetVersion.findFirst.mockResolvedValue(null);
  tx.datasetVersion.count.mockResolvedValue(0);
  tx.datasetVersion.create.mockResolvedValue({ id: "cmv4kljx40009oczvbaru00001" });
  tx.datasetVersion.update.mockResolvedValue({});
  tx.datasetVersion.deleteMany.mockResolvedValue({ count: 1 });
  periodInitCheck.mockResolvedValue({ ok: true, estimate: null });
});

describe("validateInit (mode/label/baseVersionId)", () => {
  it("tanpa mode = REPLACE (helper lama tetap jalan); mode PERIOD wajib baseVersionId; label harus tanggal", () => {
    expect(validateInit(file, 1024 * MiB)).toMatchObject({
      ok: true,
      mode: "REPLACE",
      label: null,
    });
    expect(validateInit({ ...file, mode: "APPEND" }, 1024 * MiB)).toMatchObject({
      code: "INVALID",
    });
    expect(validateInit({ ...file, mode: "PERIOD" }, 1024 * MiB)).toMatchObject({
      code: "INVALID",
    });
    expect(
      validateInit({ ...file, mode: "PERIOD", baseVersionId: ACTIVE, label: "Maret" }, 1024 * MiB),
    ).toMatchObject({ code: "INVALID" });
    expect(
      validateInit(
        { ...file, mode: "PERIOD", baseVersionId: ACTIVE, label: "2026-03-01" },
        1024 * MiB,
      ),
    ).toMatchObject({ ok: true, mode: "PERIOD", label: "2026-03-01", baseVersionId: ACTIVE });
  });
});

describe("initUpload mode PERIOD", () => {
  it("versi baru membawa mode, satuan, versi dasar; InitOk menggemakan mode efektif", async () => {
    const r = await initUpload("u1", { ...file, mode: "PERIOD", baseVersionId: ACTIVE }, storage());
    expect(r).toMatchObject({ ok: true, resumed: false, mode: "PERIOD", label: null });
    expect(tx.datasetVersion.create.mock.calls[0]![0].data).toMatchObject({
      mode: "PERIOD",
      periodGrain: "MONTH",
      baseVersionId: ACTIVE,
      periodLabel: null,
    });
  });

  it("label diabaikan bila tidak ada sheet berlabel (gema label = null)", async () => {
    const r = await initUpload(
      "u1",
      { ...file, mode: "PERIOD", baseVersionId: ACTIVE, label: "2026-03-01" },
      storage(),
    );
    expect(r).toMatchObject({ ok: true, label: null });
  });

  it("sheet berlabel: label wajib dan harus awal periode", async () => {
    tx.dataset.findUnique.mockResolvedValue(periodDataset("LABEL"));
    expect(
      await initUpload("u1", { ...file, mode: "PERIOD", baseVersionId: ACTIVE }, storage()),
    ).toMatchObject({ ok: false, code: "INVALID", message: "Pilih periode untuk file ini." });
    expect(
      await initUpload(
        "u1",
        { ...file, mode: "PERIOD", baseVersionId: ACTIVE, label: "2026-03-15" },
        storage(),
      ),
    ).toMatchObject({ ok: false, code: "INVALID" });
    const ok = await initUpload(
      "u1",
      { ...file, mode: "PERIOD", baseVersionId: ACTIVE, label: "2026-03-01" },
      storage(),
    );
    expect(ok).toMatchObject({ ok: true, mode: "PERIOD", label: "2026-03-01" });
    expect(tx.datasetVersion.create.mock.calls[0]![0].data.periodLabel).toEqual(
      new Date("2026-03-01T00:00:00Z"),
    );
  });

  it("dataset belum per periode → INVALID; versi aktif berubah sejak halaman dibuka → STALE", async () => {
    tx.dataset.findUnique.mockResolvedValue({
      activeVersionId: ACTIVE,
      activeVersion: { periodGrain: null, sheets: [] },
    });
    expect(
      await initUpload("u1", { ...file, mode: "PERIOD", baseVersionId: ACTIVE }, storage()),
    ).toMatchObject({ ok: false, code: "INVALID" });
    tx.dataset.findUnique.mockResolvedValue(periodDataset("COLUMN", OLD));
    expect(
      await initUpload("u1", { ...file, mode: "PERIOD", baseVersionId: ACTIVE }, storage()),
    ).toMatchObject({ ok: false, code: "STALE" });
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
  });
});

describe("resume (AC6)", () => {
  it("file sama, mode + label sama → dilanjutkan", async () => {
    tx.datasetVersion.findFirst.mockResolvedValueOnce(ownUploading("PERIOD", null));
    const r = await initUpload("u1", { ...file, mode: "PERIOD", baseVersionId: ACTIVE }, storage());
    expect(r).toMatchObject({ ok: true, versionId: OLD, resumed: true, mode: "PERIOD" });
    expect(tx.datasetVersion.deleteMany).not.toHaveBeenCalled();
  });

  it("file sama dipilih ulang dengan mode lain → versi lama dibuang (multipart di-abort), unggahan baru", async () => {
    const s = storage();
    tx.datasetVersion.findFirst
      .mockResolvedValueOnce(ownUploading("REPLACE", null))
      .mockResolvedValueOnce(null);
    const r = await initUpload("u1", { ...file, mode: "PERIOD", baseVersionId: ACTIVE }, s);
    expect(r).toMatchObject({ ok: true, resumed: false, mode: "PERIOD" });
    expect(r.ok && r.versionId).not.toBe(OLD);
    expect(tx.datasetVersion.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: OLD, status: "UPLOADING" }) }),
    );
    expect(s.abort).toHaveBeenCalledWith(`raw/${DID}/${OLD}/source.csv`, "up-old");
  });

  it("file sama dengan label lain → tidak dilanjutkan; versi lama sedang di-complete → BUSY", async () => {
    tx.dataset.findUnique.mockResolvedValue(periodDataset("LABEL"));
    tx.datasetVersion.findFirst.mockResolvedValueOnce(ownUploading("PERIOD", "2026-02-01"));
    tx.datasetVersion.deleteMany.mockResolvedValueOnce({ count: 0 });
    const r = await initUpload(
      "u1",
      { ...file, mode: "PERIOD", baseVersionId: ACTIVE, label: "2026-03-01" },
      storage(),
    );
    expect(r).toMatchObject({ ok: false, code: "BUSY" });
  });

  it("review L3: unggahan baru ditolak (sibuk/batas/kuota) setelah unggahan lama pilihan lain dihapus → transaksi batal, multipart lama tidak di-abort", async () => {
    const s = storage();
    tx.datasetVersion.findFirst
      .mockResolvedValueOnce(ownUploading("REPLACE", null))
      .mockResolvedValueOnce(null);
    tx.datasetVersion.count.mockResolvedValueOnce(2);
    const r = await initUpload("u1", { ...file, mode: "PERIOD", baseVersionId: ACTIVE }, s);
    expect(r).toMatchObject({ ok: false, code: "LIMIT_REACHED" });
    expect(tx.datasetVersion.deleteMany).toHaveBeenCalled(); // di transaksi yang dibatalkan
    expect(s.abort).not.toHaveBeenCalled();
    expect(s.remove).not.toHaveBeenCalled();
  });

  it("REPLACE tanpa mode (helper lama) tetap melanjutkan unggahan REPLACE", async () => {
    tx.datasetVersion.findFirst.mockResolvedValueOnce(ownUploading("REPLACE", null));
    const r = await initUpload("u1", file, storage());
    expect(r).toMatchObject({ ok: true, versionId: OLD, resumed: true, mode: "REPLACE" });
  });

  it("T-055: batas periode pasti terlewati (mode label) → PERIOD_LIMIT sebelum versi/multipart dibuat", async () => {
    tx.dataset.findUnique.mockResolvedValue(periodDataset("LABEL"));
    periodInitCheck.mockResolvedValueOnce({
      ok: false,
      message:
        "Menyimpan April 2026 akan melewati batas simpan 3 periode. Hapus periode Januari 2026 dulu.",
    });
    const s = storage();
    const r = await initUpload(
      "u1",
      { ...file, mode: "PERIOD", baseVersionId: ACTIVE, label: "2026-04-01" },
      s,
    );
    expect(r).toMatchObject({
      ok: false,
      code: "PERIOD_LIMIT",
      message: expect.stringContaining("April 2026"),
    });
    expect(periodInitCheck).toHaveBeenCalledWith(tx, DID, {
      name: "april.csv",
      size: 5 * MiB,
      label: "2026-04-01",
    });
    expect(tx.datasetVersion.create).not.toHaveBeenCalled();
    expect(s.create).not.toHaveBeenCalled();
  });

  it("T-055: perkiraan dari ukuran file hanya peringatan — unggahan tetap dibuat, InitOk membawanya", async () => {
    const estimate = {
      rows: 14_000_000,
      bytes: 6 * MiB,
      likely: "TOO_LARGE",
      message: "Perkiraan ±14 jt baris",
    };
    periodInitCheck.mockResolvedValueOnce({ ok: true, estimate });
    const r = await initUpload("u1", { ...file, mode: "PERIOD", baseVersionId: ACTIVE }, storage());
    expect(r).toMatchObject({ ok: true, resumed: false, estimate });
    expect(tx.datasetVersion.create).toHaveBeenCalled();
    // Mode REPLACE tidak diperiksa terhadap batas periode.
    periodInitCheck.mockClear();
    expect(await initUpload("u1", file, storage())).toMatchObject({ ok: true, estimate: null });
    expect(periodInitCheck).not.toHaveBeenCalled();
  });
});
