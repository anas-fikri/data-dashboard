import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-013: job pembersihan storage (StorageCleanup) dan retensi file asli 7 hari. Prisma dan storage
 * dimock: prefix tidak sah / masih dipakai tidak pernah menyentuh storage, sukses menghapus baris,
 * gagal menaikkan attempts dengan jeda bertingkat.
 */
const prisma = {
  storageCleanup: {
    findMany: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    updateMany: vi.fn(),
  },
  dataset: { count: vi.fn() },
  datasetVersion: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/objects", () => ({ deletePrefix: vi.fn() }));
vi.mock("@/lib/storage/multipart", () => ({ abortMultipartUnder: vi.fn() }));

const {
  CLEANUP_MAX_ATTEMPTS,
  isSafeToDelete,
  nextAttemptAt,
  parseCleanupPrefix,
  runRawRetention,
  runStorageCleanup,
} = await import("@/features/versions/cleanup");

const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrve";
const NOW = new Date("2026-10-14T05:00:00Z");
const MIN = 60 * 1000;

const order: string[] = [];
const deps = {
  deletePrefix: vi.fn(async (p: string) => {
    order.push(`delete:${p}`);
    return 1;
  }),
  abortMultipartUnder: vi.fn(async (p: string) => {
    order.push(`abort:${p}`);
    return 0;
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
});

describe("parseCleanupPrefix", () => {
  it("hanya (raw|parquet)/<cuid>/[<cuid>/]", () => {
    expect(parseCleanupPrefix(`raw/${DS}/`)).toEqual({
      kind: "raw",
      datasetId: DS,
      versionId: null,
    });
    expect(parseCleanupPrefix(`parquet/${DS}/${VER}/`)).toEqual({
      kind: "parquet",
      datasetId: DS,
      versionId: VER,
    });
    for (const bad of [
      "",
      "raw/",
      `raw/${DS}`,
      `exports/${DS}/`,
      `raw/${DS}/../`,
      `raw/${DS}/${VER}/source.csv`,
      `parquet/${DS}/${VER}/${VER}/`,
      `/raw/${DS}/`,
      `raw/${DS.toUpperCase()}/`,
    ]) {
      expect(parseCleanupPrefix(bad), bad).toBeNull();
    }
  });
});

describe("isSafeToDelete", () => {
  const ds = { kind: "parquet" as const, datasetId: DS, versionId: null };
  const raw = { kind: "raw" as const, datasetId: DS, versionId: VER };
  const parquet = { kind: "parquet" as const, datasetId: DS, versionId: VER };
  it("prefix dataset hanya bila Dataset sudah tidak ada", () => {
    expect(isSafeToDelete(ds, { datasetExists: false, versionStatus: null })).toBe(true);
    expect(isSafeToDelete(ds, { datasetExists: true, versionStatus: null })).toBe(false);
  });
  it("raw versi hanya bila versinya hilang; Parquet versi bila hilang atau FAILED", () => {
    const gone = { datasetExists: true, versionStatus: null };
    expect(isSafeToDelete(raw, gone)).toBe(true);
    expect(isSafeToDelete(parquet, gone)).toBe(true);
    for (const status of ["READY", "AWAITING_MAPPING", "INGESTING", "FAILED"]) {
      expect(isSafeToDelete(raw, { datasetExists: true, versionStatus: status })).toBe(false);
    }
    expect(isSafeToDelete(parquet, { datasetExists: true, versionStatus: "FAILED" })).toBe(true);
    for (const status of ["READY", "AWAITING_MAPPING", "INGESTING"]) {
      expect(isSafeToDelete(parquet, { datasetExists: true, versionStatus: status })).toBe(false);
    }
  });
});

describe("nextAttemptAt", () => {
  it("5 menit · 2^attempts, maksimal 24 jam", () => {
    const after = (n: number) => (nextAttemptAt(n, NOW).getTime() - NOW.getTime()) / MIN;
    expect([0, 1, 2, 3].map(after)).toEqual([5, 10, 20, 40]);
    expect(after(9)).toBe(24 * 60);
    expect(after(CLEANUP_MAX_ATTEMPTS - 1)).toBe(640);
  });
});

describe("runStorageCleanup", () => {
  const row = (id: string, prefix: string, attempts = 0) => ({ id, prefix, attempts });

  it("memilih baris jatuh tempo dengan attempts < 8, terlama dulu, ≤ 50", async () => {
    prisma.storageCleanup.findMany.mockResolvedValueOnce([]);
    await runStorageCleanup(deps, NOW);
    expect(prisma.storageCleanup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { notBefore: { lte: NOW }, attempts: { lt: 8 } },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
    );
  });

  it("raw versi yang sudah dihapus: abort multipart → hapus prefix → hapus baris", async () => {
    prisma.storageCleanup.findMany.mockResolvedValueOnce([row("c1", `raw/${DS}/${VER}/`)]);
    prisma.datasetVersion.findUnique.mockResolvedValueOnce(null);
    expect(await runStorageCleanup(deps, NOW)).toEqual({ deleted: 1, skipped: 0, failed: 0 });
    expect(order).toEqual([`abort:raw/${DS}/${VER}/`, `delete:raw/${DS}/${VER}/`]);
    expect(prisma.storageCleanup.deleteMany).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("prefix tidak sah atau masih dipakai → baris dibuang tanpa menyentuh storage", async () => {
    prisma.storageCleanup.findMany.mockResolvedValueOnce([
      row("bad", "raw/"),
      row("used", `parquet/${DS}/${VER}/`),
      row("live", `raw/${DS}/`),
    ]);
    prisma.datasetVersion.findUnique.mockResolvedValueOnce({ status: "READY" });
    prisma.dataset.count.mockResolvedValueOnce(1);
    expect(await runStorageCleanup(deps, NOW)).toEqual({ deleted: 0, skipped: 3, failed: 0 });
    expect(order).toEqual([]);
    expect(prisma.storageCleanup.deleteMany).toHaveBeenCalledTimes(3);
  });

  it("gagal → attempts+1, lastError ≤ 500, notBefore mundur; baris tetap", async () => {
    prisma.storageCleanup.findMany.mockResolvedValueOnce([row("c2", `parquet/${DS}/${VER}/`, 2)]);
    prisma.datasetVersion.findUnique.mockResolvedValueOnce({ status: "FAILED" });
    deps.deletePrefix.mockRejectedValueOnce(new Error("x".repeat(900)));
    expect(await runStorageCleanup(deps, NOW)).toEqual({ deleted: 0, skipped: 0, failed: 1 });
    expect(deps.abortMultipartUnder).not.toHaveBeenCalled();
    expect(prisma.storageCleanup.deleteMany).not.toHaveBeenCalled();
    const data = prisma.storageCleanup.updateMany.mock.calls[0]![0].data;
    expect(data.attempts).toEqual({ increment: 1 });
    expect(data.lastError).toHaveLength(500);
    expect(data.notBefore).toEqual(new Date(NOW.getTime() + 20 * MIN));
  });
});

describe("runRawRetention", () => {
  it("hapus raw/<ds>/<ver>/ lalu tandai sourceDeletedAt (dijaga null); gagal → dicoba putaran berikutnya", async () => {
    const OTHER = "cmv4kljx40009oczvdmpurrv2";
    prisma.datasetVersion.findMany.mockResolvedValueOnce([
      { id: VER, datasetId: DS },
      { id: OTHER, datasetId: DS },
    ]);
    deps.deletePrefix.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("s3 mati"));
    expect(await runRawRetention(deps, NOW)).toEqual({ deleted: 1, failed: 1 });
    expect(deps.deletePrefix).toHaveBeenNthCalledWith(1, `raw/${DS}/${VER}/`);
    expect(prisma.datasetVersion.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.datasetVersion.updateMany).toHaveBeenCalledWith({
      where: { id: VER, sourceDeletedAt: null },
      data: { sourceDeletedAt: NOW },
    });
    expect(prisma.datasetVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100, orderBy: { createdAt: "asc" } }),
    );
  });

  it("id versi tidak berbentuk cuid → tidak pernah menghapus", async () => {
    prisma.datasetVersion.findMany.mockResolvedValueOnce([{ id: "../x", datasetId: DS }]);
    expect(await runRawRetention(deps, NOW)).toEqual({ deleted: 0, failed: 1 });
    expect(deps.deletePrefix).not.toHaveBeenCalled();
  });
});
