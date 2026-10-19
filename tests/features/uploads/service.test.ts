import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MultipartStorage } from "@/lib/storage/multipart";

/*
 * Service unggah dengan Prisma dan storage dimock: urutan penolakan (tanpa menyentuh storage),
 * dan cabang completeUpload (rusak → abort, format salah → hapus objek, dataset terhapus → hapus objek).
 */
const MiB = 1024 * 1024;
const findFirstDataset = vi.fn();
const findFirstVersion = vi.fn();
const updateMany = vi.fn();
const findManyVersion = vi.fn(async (): Promise<unknown[]> => []);
vi.mock("@/lib/db", () => ({
  prisma: {
    dataset: { findFirst: findFirstDataset },
    datasetVersion: { findFirst: findFirstVersion, updateMany, findMany: findManyVersion },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/env", () => ({
  env: () => ({ MAX_UPLOAD_BYTES: 1024 * MiB, USER_STORAGE_QUOTA_BYTES: 20 * 1024 * MiB }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/queue/versions", () => ({ enqueueIngest: vi.fn() }));
vi.mock("@/lib/storage/multipart", () => ({ s3Multipart: {} }));

const { initUpload, completeUpload, validateInit, cleanFileName, expireStaleUploads } =
  await import("@/features/uploads/service");
const { isSameOrigin } = await import("@/features/uploads/http");

const VID = "cmv4kljx40009oczvdmpurrxf";
const DID = "cmv4klj5r0007oczvgiofocpg";

function storageMock(over: Partial<MultipartStorage> = {}): MultipartStorage {
  return {
    create: vi.fn(async () => "up-1"),
    signPart: vi.fn(async () => "https://storage/x"),
    listParts: vi.fn(async () => [
      { partNumber: 1, size: 16 * MiB, etag: '"a"' },
      { partNumber: 2, size: 4 * MiB, etag: '"b"' },
    ]),
    complete: vi.fn(async () => '"abc-2"'),
    abort: vi.fn(async () => {}),
    head: vi.fn(async () => ({ size: 20 * MiB, contentType: "application/octet-stream" })),
    readHead: vi.fn(async () => new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
    remove: vi.fn(async () => {}),
    ...over,
  };
}

const uploading = {
  id: VID,
  datasetId: DID,
  status: "UPLOADING",
  errorMessage: null,
  sourceKey: `raw/${DID}/${VID}/source.xlsx`,
  uploadId: "up-1",
  sizeBytes: BigInt(20 * MiB),
  partSize: 16 * MiB,
  partCount: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  findFirstVersion.mockResolvedValue(uploading);
  updateMany.mockResolvedValue({ count: 1 });
});

describe("validasi init", () => {
  it("1 GB + 1 byte → FILE_TOO_LARGE sebelum DB dan storage disentuh", async () => {
    const storage = storageMock();
    const r = await initUpload(
      "u1",
      { datasetId: DID, name: "besar.xlsx", size: 1024 * MiB + 1, lastModified: 1 },
      storage,
    );
    expect(r).toMatchObject({ ok: false, code: "FILE_TOO_LARGE" });
    expect(storage.create).not.toHaveBeenCalled();
    expect(findFirstDataset).not.toHaveBeenCalled();
  });

  it("ekstensi, ukuran, nama, dan id divalidasi", () => {
    const base = { datasetId: DID, name: "a.xlsx", size: 10, lastModified: 1 };
    expect(validateInit({ ...base, name: "a.exe" }, 100)).toMatchObject({ code: "INVALID_FORMAT" });
    expect(validateInit({ ...base, size: 0 }, 100)).toMatchObject({ code: "INVALID_FORMAT" });
    expect(validateInit({ ...base, size: 1.5 }, 100)).toMatchObject({ code: "INVALID" });
    expect(validateInit({ ...base, datasetId: "../x" }, 100)).toMatchObject({ code: "NOT_FOUND" });
    expect(validateInit(base, 100)).toMatchObject({ ok: true, ext: "xlsx" });
    expect(cleanFileName("C:\\data\\laporan\u202e.xlsx")).toBe("laporan.xlsx");
    expect(cleanFileName("a".repeat(300))).toBeNull();
  });

  it("Origin harus sama persis dengan APP_URL", async () => {
    const { appOrigins } = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
    const req = (origin: string | null) =>
      ({ headers: new Headers(origin ? { origin } : {}) }) as unknown as Parameters<
        typeof isSameOrigin
      >[0];
    expect(isSameOrigin(req("https://app.pcp.co"), "https://app.pcp.co")).toBe(true);
    expect(isSameOrigin(req("https://app.pcp.co.evil.io"), "https://app.pcp.co")).toBe(false);
    expect(isSameOrigin(req(null), "https://app.pcp.co")).toBe(false);
    // Domain publik + akses LAN lewat IP (T-9t9b): keduanya sah, origin lain tetap ditolak.
    const both = appOrigins({
      APP_URL: "https://data-slicer.pcpexpress.com",
      APP_LAN_URL: "https://10.3.3.221:8443",
    });
    expect(both).toEqual(["https://data-slicer.pcpexpress.com", "https://10.3.3.221:8443"]);
    expect(isSameOrigin(req("https://10.3.3.221:8443"), both)).toBe(true);
    expect(isSameOrigin(req("https://data-slicer.pcpexpress.com"), both)).toBe(true);
    expect(isSameOrigin(req("https://10.3.3.221:8444"), both)).toBe(false);
    expect(appOrigins({ APP_URL: "https://x.pcp.co/" })).toEqual(["https://x.pcp.co"]);
  });
});

describe("completeUpload", () => {
  it("valid → UPLOADED + enqueue", async () => {
    const enqueue = vi.fn(async () => {});
    const r = await completeUpload("u1", VID, { storage: storageMock(), enqueue });
    expect(r).toEqual({ ok: true, status: "UPLOADED" });
    expect(enqueue).toHaveBeenCalledWith(VID, DID);
  });

  it("part lebih besar dari rencana → abort multipart, FAILED, tanpa complete", async () => {
    const storage = storageMock({
      listParts: vi.fn(async () => [
        { partNumber: 1, size: 20 * MiB, etag: '"a"' },
        { partNumber: 2, size: 0, etag: '"b"' },
      ]),
    });
    const r = await completeUpload("u1", VID, { storage, enqueue: vi.fn() });
    expect(r).toMatchObject({ ok: false, code: "UPLOAD_CORRUPT" });
    expect(storage.abort).toHaveBeenCalledWith(uploading.sourceKey, "up-1");
    expect(storage.complete).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("part hilang → INCOMPLETE dengan daftar part, klaim dilepas, tidak di-abort", async () => {
    const storage = storageMock({
      listParts: vi.fn(async () => [{ partNumber: 1, size: 16 * MiB, etag: '"a"' }]),
    });
    const r = await completeUpload("u1", VID, { storage, enqueue: vi.fn() });
    expect(r).toMatchObject({ ok: false, code: "INCOMPLETE", missing: [2] });
    expect(storage.abort).not.toHaveBeenCalled();
  });

  it("signature bukan ZIP → objek dihapus, FAILED, INVALID_FORMAT, tidak di-enqueue", async () => {
    const enqueue = vi.fn();
    const storage = storageMock({ readHead: vi.fn(async () => new Uint8Array([0x4d, 0x5a])) });
    const r = await completeUpload("u1", VID, { storage, enqueue });
    expect(r).toMatchObject({ ok: false, code: "INVALID_FORMAT" });
    expect(storage.remove).toHaveBeenCalledWith(uploading.sourceKey);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("dataset terhapus selama complete → objek dibuang, NOT_FOUND", async () => {
    const storage = storageMock();
    updateMany
      .mockResolvedValueOnce({ count: 1 }) // klaim
      .mockResolvedValueOnce({ count: 0 }); // UPLOADED: versi sudah tidak ada
    const enqueue = vi.fn();
    const r = await completeUpload("u1", VID, { storage, enqueue });
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(storage.remove).toHaveBeenCalledWith(uploading.sourceKey);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("complete kedua bersamaan → BUSY (klaim gagal)", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    const storage = storageMock();
    const r = await completeUpload("u1", VID, { storage, enqueue: vi.fn() });
    expect(r).toMatchObject({ ok: false, code: "BUSY" });
    expect(storage.listParts).not.toHaveBeenCalled();
  });

  it("multipart sudah hilang tetapi objek utuh (respons complete hilang) → lanjut validasi → UPLOADED", async () => {
    const enqueue = vi.fn(async () => {});
    const storage = storageMock({
      listParts: vi.fn(async () => null),
      head: vi.fn(async () => ({ size: 20 * MiB, contentType: undefined, etag: '"abc-2"' })),
    });
    const r = await completeUpload("u1", VID, { storage, enqueue });
    expect(r).toEqual({ ok: true, status: "UPLOADED" });
    expect(storage.complete).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ etag: '"abc-2"' }) }),
    );
  });

  it("multipart hilang dan objek tidak ada → FAILED kedaluwarsa", async () => {
    const storage = storageMock({
      listParts: vi.fn(async () => null),
      head: vi.fn(async () => null),
    });
    expect(await completeUpload("u1", VID, { storage, enqueue: vi.fn() })).toMatchObject({
      code: "UPLOAD_FAILED",
    });
  });

  it("multipart hilang dan HEAD error (bukan 404) → STORAGE_ERROR, tidak ditandai FAILED", async () => {
    const storage = storageMock({
      listParts: vi.fn(async () => null),
      head: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    const r = await completeUpload("u1", VID, { storage, enqueue: vi.fn() });
    expect(r).toMatchObject({ ok: false, code: "STORAGE_ERROR" });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { completingAt: null } }),
    );
  });

  it("storage error setelah complete → STORAGE_ERROR, klaim dilepas, objek tidak dihapus", async () => {
    const storage = storageMock({
      head: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    const r = await completeUpload("u1", VID, { storage, enqueue: vi.fn() });
    expect(r).toMatchObject({ ok: false, code: "STORAGE_ERROR" });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { completingAt: null } }),
    );
  });

  it("versi sudah UPLOADED → idempoten, antre ulang ingest (enqueue dulu gagal)", async () => {
    findFirstVersion.mockResolvedValueOnce({ ...uploading, status: "UPLOADED" });
    const enqueue = vi.fn(async () => {});
    expect(await completeUpload("u1", VID, { storage: storageMock(), enqueue })).toEqual({
      ok: true,
      status: "UPLOADED",
    });
    expect(enqueue).toHaveBeenCalledWith(VID, DID);
  });

  it("versi milik orang lain / tidak ada → NOT_FOUND", async () => {
    findFirstVersion.mockResolvedValueOnce(null);
    expect(await completeUpload("u2", VID, { storage: storageMock() })).toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("expireStaleUploads", () => {
  it("UPLOADING > 24 jam → abort multipart + FAILED; filter umur dan status dipaksa", async () => {
    findManyVersion.mockResolvedValueOnce([
      { id: VID, sourceKey: uploading.sourceKey, uploadId: "up-1" },
    ]);
    const storage = storageMock();
    const now = Date.UTC(2026, 9, 12);
    expect(await expireStaleUploads({ uploadedById: "u1" }, storage, now)).toBe(1);
    expect(findManyVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          uploadedById: "u1",
          status: "UPLOADING",
          createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) },
        }),
      }),
    );
    expect(storage.abort).toHaveBeenCalledWith(uploading.sourceKey, "up-1");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VID, status: "UPLOADING" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });
});
