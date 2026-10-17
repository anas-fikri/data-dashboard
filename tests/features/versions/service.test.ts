import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VersionRecord } from "@/features/versions/service";

/*
 * T-013: riwayat versi pemilik — pemetaan baris (canActivate/canDiscard/pesan), aktifkan versi lain
 * (pemilik saja, BUSY selama ada versi belum terminal, hanya READY yang belum aktif) dan buang versi
 * yang menunggu pemetaan. Prisma + aktivasi dimock.
 */
const tx = {
  $queryRaw: vi.fn(),
  datasetVersion: { findFirst: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
  storageCleanup: { createMany: vi.fn() },
};
const prisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  dataset: { findFirst: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
const activateVersionInTx = vi.fn();
vi.mock("@/features/versions/activation", () => ({ activateVersionInTx }));
const forgetLocalParquet = vi.fn();
vi.mock("@/features/query/local-parquet", () => ({ forgetLocalParquet }));
// Pengumuman versi aktif untuk pemanasan cache parquet app (T-pvq8).
const publish = vi.fn(async () => 1);
vi.mock("@/lib/redis", () => ({ redisReady: async () => ({ publish }) }));

const svc = await import("@/features/versions/service");
const { logger } = await import("@/lib/logger");

const OWNER = "owner1";
const DS = "cmv4klj5r0007oczvgiofocpg";
const A = "cmv4kljx40009oczvdmpurrva";
const B = "cmv4kljx40009oczvdmpurrvb";
const at = new Date("2026-10-10T03:00:00Z");

const record = (over: Partial<VersionRecord> = {}): VersionRecord => ({
  id: B,
  originalName: "penjualan.xlsx",
  status: "READY",
  sizeBytes: 2048n,
  createdAt: at,
  ingestFinishedAt: at,
  errorMessage: null,
  sourceDeletedAt: null,
  uploadedBy: { name: null, email: "ana@pcpexpress.com" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  tx.$queryRaw.mockResolvedValue([{ activeVersionId: A }]);
  tx.datasetVersion.count.mockResolvedValue(0);
});

describe("toVersionRow", () => {
  it("READY bukan aktif → bisa diaktifkan; tanggal ISO, ukuran angka, pengunggah nama/email", () => {
    expect(svc.toVersionRow(record(), A)).toEqual({
      id: B,
      fileName: "penjualan.xlsx",
      status: "READY",
      sizeBytes: 2048,
      createdAt: at.toISOString(),
      finishedAt: at.toISOString(),
      active: false,
      canActivate: true,
      canDiscard: false,
      message: null,
      uploadedBy: "ana@pcpexpress.com",
      sourceDeleted: false,
    });
    expect(
      svc.toVersionRow(record({ uploadedBy: { name: "Ana", email: "a@x.id" } }), B),
    ).toMatchObject({ active: true, canActivate: false, uploadedBy: "Ana" });
  });

  it("pesan hanya untuk FAILED/AWAITING_MAPPING; buang hanya AWAITING_MAPPING; file asli terhapus", () => {
    const failed = record({ status: "FAILED", errorMessage: "File rusak." });
    expect(svc.toVersionRow(failed, A)).toMatchObject({
      canActivate: false,
      canDiscard: false,
      message: "File rusak.",
    });
    const mapping = record({ status: "AWAITING_MAPPING", errorMessage: 'Kolom "Omzet" hilang.' });
    expect(svc.toVersionRow(mapping, A)).toMatchObject({
      canActivate: false,
      canDiscard: true,
      message: 'Kolom "Omzet" hilang.',
    });
    expect(
      svc.toVersionRow(
        record({
          errorMessage: "lama",
          sizeBytes: null,
          uploadedBy: null,
          sourceDeletedAt: at,
          ingestFinishedAt: null,
        }),
        A,
      ),
    ).toMatchObject({
      message: null,
      sizeBytes: null,
      uploadedBy: null,
      sourceDeleted: true,
      finishedAt: null,
    });
  });
});

describe("listVersions", () => {
  it("pemilik saja, terbaru dulu, tanpa UPLOADING; bukan pemilik/id rusak → []", async () => {
    prisma.dataset.findFirst.mockResolvedValueOnce({ activeVersionId: B, versions: [record()] });
    expect(await svc.listVersions(OWNER, DS)).toMatchObject([{ id: B, active: true }]);
    const q = prisma.dataset.findFirst.mock.calls[0]![0];
    expect(q.where).toEqual({ id: DS, ownerId: OWNER });
    expect(q.select.versions).toMatchObject({
      where: { status: { not: "UPLOADING" } },
      orderBy: { createdAt: "desc" },
    });
    prisma.dataset.findFirst.mockResolvedValueOnce(null);
    expect(await svc.listVersions("lain", DS)).toEqual([]);
    expect(await svc.listVersions(OWNER, "../x")).toEqual([]);
    expect(prisma.dataset.findFirst).toHaveBeenCalledTimes(2);
  });
});

describe("activateVersion", () => {
  it("READY bukan aktif → diaktifkan dengan audit; salinan lokal versi yang dibuang dilupakan", async () => {
    tx.datasetVersion.findFirst.mockResolvedValueOnce({
      status: "READY",
      originalName: "lama.xlsx",
    });
    activateVersionInTx.mockResolvedValueOnce({ deletedTypedKeys: ["k1"] });
    expect(await svc.activateVersion(OWNER, DS, B, "10.0.0.1")).toEqual({
      ok: true,
      data: { fileName: "lama.xlsx" },
    });
    expect(activateVersionInTx).toHaveBeenCalledWith(tx, DS, B, {
      actorId: OWNER,
      ip: "10.0.0.1",
      audit: true,
    });
    expect(forgetLocalParquet).toHaveBeenCalledWith(["k1"]);
    await vi.waitFor(() => expect(publish).toHaveBeenCalledWith("dataset:version-activated", B));
    expect(publish).toHaveBeenCalledTimes(1);
    // Lock Dataset dengan pemilik di WHERE.
    expect(tx.$queryRaw.mock.calls[0]!.slice(1)).toEqual([DS, OWNER]);
  });

  it("bukan pemilik / versi tidak ada / id rusak → NOT_FOUND tanpa aktivasi", async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    expect(await svc.activateVersion("lain", DS, B)).toMatchObject({ code: "NOT_FOUND" });
    tx.datasetVersion.findFirst.mockResolvedValueOnce(null);
    expect(await svc.activateVersion(OWNER, DS, B)).toMatchObject({ code: "NOT_FOUND" });
    expect(await svc.activateVersion(OWNER, DS, "x")).toMatchObject({ code: "NOT_FOUND" });
    expect(activateVersionInTx).not.toHaveBeenCalled();
  });

  it("ada versi belum terminal → DATASET_BUSY; bukan READY atau sudah aktif → INVALID", async () => {
    tx.datasetVersion.findFirst.mockResolvedValue({ status: "READY", originalName: "a.xlsx" });
    tx.datasetVersion.count.mockResolvedValueOnce(1);
    expect(await svc.activateVersion(OWNER, DS, B)).toMatchObject({
      ok: false,
      code: "DATASET_BUSY",
      message: expect.stringContaining("Tunggu file baru selesai diproses"),
    });
    expect(tx.datasetVersion.count).toHaveBeenCalledWith({
      where: {
        datasetId: DS,
        status: { in: ["UPLOADING", "UPLOADED", "INGESTING", "AWAITING_MAPPING"] },
      },
    });
    expect(await svc.activateVersion(OWNER, DS, A)).toMatchObject({ code: "INVALID" });
    tx.datasetVersion.findFirst.mockResolvedValue({ status: "FAILED", originalName: "a.xlsx" });
    expect(await svc.activateVersion(OWNER, DS, B)).toMatchObject({ code: "INVALID" });
    expect(activateVersionInTx).not.toHaveBeenCalled();
    expect(forgetLocalParquet).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("T-pvq8: pengumuman pemanasan gagal (Redis mati) → aktivasi tetap berhasil, dicatat", async () => {
    tx.datasetVersion.findFirst.mockResolvedValueOnce({ status: "READY", originalName: "a.xlsx" });
    activateVersionInTx.mockResolvedValueOnce({ deletedTypedKeys: [] });
    publish.mockRejectedValueOnce(new Error("redis mati"));
    expect(await svc.activateVersion(OWNER, DS, B)).toMatchObject({ ok: true });
    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ versionId: B, err: "Error: redis mati" }),
        expect.stringContaining("pengumuman versi aktif gagal"),
      ),
    );
  });

  it("antrean lock habis waktu (P2028) → DATASET_BUSY, bukan error", async () => {
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("x", { code: "P2028", clientVersion: "6.12.0" }),
    );
    expect(await svc.activateVersion(OWNER, DS, B)).toMatchObject({ code: "DATASET_BUSY" });
  });
});

describe("discardVersion", () => {
  it("AWAITING_MAPPING → baris dihapus + raw/parquet diantrekan sekarang", async () => {
    tx.datasetVersion.findFirst.mockResolvedValueOnce({
      status: "AWAITING_MAPPING",
      originalName: "baru.xlsx",
    });
    tx.datasetVersion.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await svc.discardVersion(OWNER, DS, B)).toEqual({
      ok: true,
      data: { fileName: "baru.xlsx" },
    });
    expect(tx.datasetVersion.deleteMany).toHaveBeenCalledWith({
      where: { id: B, datasetId: DS, status: "AWAITING_MAPPING", activeFor: { is: null } },
    });
    expect(tx.storageCleanup.createMany).toHaveBeenCalledWith({
      data: [
        { prefix: `raw/${DS}/${B}/`, reason: "versi dibuang pemilik" },
        { prefix: `parquet/${DS}/${B}/`, reason: "versi dibuang pemilik" },
      ],
    });
  });

  it("status lain → INVALID; bukan pemilik → NOT_FOUND; tanpa hapus", async () => {
    tx.datasetVersion.findFirst.mockResolvedValueOnce({ status: "READY", originalName: "a" });
    expect(await svc.discardVersion(OWNER, DS, B)).toMatchObject({ code: "INVALID" });
    tx.$queryRaw.mockResolvedValueOnce([]);
    expect(await svc.discardVersion("lain", DS, B)).toMatchObject({ code: "NOT_FOUND" });
    expect(tx.datasetVersion.deleteMany).not.toHaveBeenCalled();
    expect(tx.storageCleanup.createMany).not.toHaveBeenCalled();
  });
});
