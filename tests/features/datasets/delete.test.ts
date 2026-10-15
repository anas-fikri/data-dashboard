import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * deleteDataset: urutan pembatalan job → hapus DB (+ AuditLog dalam transaksi yang sama, T-016) →
 * hapus storage, dan konfirmasi nama wajib. Prisma dimock agar test tidak butuh database (AC T-003 #4:
 * hook terpanggil, diverifikasi test).
 */
const findFirst = vi.fn();
const deleteMany = vi.fn();
const sheetFindMany = vi.fn(async () => [{ typedKey: "parquet/d/v/s/typed-1.parquet" }]);
const dashboardFindMany = vi.fn();
const auditCreate = vi.fn();
const tx = {
  dataset: { deleteMany },
  dashboard: { findMany: dashboardFindMany },
  auditLog: { create: auditCreate },
};
/** Transaksi palsu: callback yang melempar membatalkan audit yang sudah "ditulis". */
const $transaction = vi.fn(async (fn: (t: typeof tx) => unknown) => {
  const before = auditCreate.mock.calls.length;
  try {
    return await fn(tx);
  } catch (e) {
    auditCreate.mock.calls.splice(before);
    throw e;
  }
});
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction,
    dataset: { findFirst },
    dashboard: { findMany: dashboardFindMany },
    sheet: { findMany: sheetFindMany },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/objects", () => ({ deleteDatasetObjects: vi.fn() }));
vi.mock("@/lib/queue/versions", () => ({ cancelVersionJobs: vi.fn() }));

const { deleteDataset, datasetShareImpact } = await import("@/features/datasets/service");

const ID = "cmv3z0sxg0000ocicnzrwpr0g";
const IP = "203.0.113.5";
const order: string[] = [];
const deps = {
  cancelJobs: vi.fn(async (ids: string[]) => {
    order.push(`cancel:${ids.join(",")}`);
  }),
  deleteObjects: vi.fn(async (id: string) => {
    order.push(`objects:${id}`);
    return 3;
  }),
};

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
  findFirst.mockResolvedValue({ id: ID, name: "Penjualan Cabang", versions: [{ id: "v1" }] });
  dashboardFindMany.mockResolvedValue([]);
  deleteMany.mockImplementation(async () => {
    order.push("db");
    return { count: 1 };
  });
  auditCreate.mockImplementation(async () => {
    order.push("audit");
    return { id: "a1" };
  });
});

describe("deleteDataset", () => {
  it("konfirmasi cocok → batalkan job, hapus DB + audit, hapus storage (berurutan)", async () => {
    const r = await deleteDataset("owner1", ID, "  PENJUALAN cabang ", IP, deps);
    expect(r).toEqual({ ok: true, data: { id: ID } });
    expect(order).toEqual(["cancel:v1", "db", "audit", `objects:${ID}`]);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID, ownerId: "owner1" } }),
    );
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: ID, ownerId: "owner1" } });
  });

  it("T-016 AC7: AuditLog dataset.delete {name, dashboards, shares} + ip ditulis di transaksi penghapusan", async () => {
    dashboardFindMany.mockResolvedValueOnce([
      { _count: { shares: 2 } },
      { _count: { shares: 0 } },
      { _count: { shares: 1 } },
    ]);
    expect(await deleteDataset("owner1", ID, "penjualan cabang", IP, deps)).toMatchObject({
      ok: true,
    });
    expect($transaction).toHaveBeenCalledTimes(1);
    // Hitungan dibaca di transaksi yang sama (tx), sebelum kaskade menghapus dashboard + share.
    expect(dashboardFindMany).toHaveBeenCalledWith({
      where: { datasetId: ID, dataset: { ownerId: "owner1" } },
      select: { _count: { select: { shares: true } } },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        actorId: "owner1",
        action: "dataset.delete",
        targetType: "dataset",
        targetId: ID,
        meta: { name: "Penjualan Cabang", dashboards: 3, shares: 3 },
        ip: IP,
      },
      select: { id: true },
    });
  });

  it("review T-016 DI-2: batas waktu transaksi = transaksi Dataset lain; P2028 → BUSY tanpa hapus storage", async () => {
    expect(await deleteDataset("owner1", ID, "penjualan cabang", IP, deps)).toMatchObject({
      ok: true,
    });
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 30_000,
    });
    deleteMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("timeout", { code: "P2028", clientVersion: "6" }),
    );
    order.length = 0;
    const r = await deleteDataset("owner1", ID, "penjualan cabang", IP, deps);
    expect(r).toEqual({
      ok: false,
      code: "BUSY",
      message: "Sedang memproses permintaan lain. Coba lagi.",
    });
    expect(order).toEqual(["cancel:v1"]);
    expect(deps.deleteObjects).toHaveBeenCalledTimes(1); // hanya dari penghapusan pertama
  });

  it("review T-016 R2 DI-1: korban deadlock (40P01 tanpa code) atau P2034 → BUSY tanpa hapus storage", async () => {
    for (const e of [
      new Prisma.PrismaClientUnknownRequestError(
        'Error occurred during query execution: ConnectorError(... code: "40P01", message: "deadlock detected" ...)',
        { clientVersion: "6.12.0" },
      ),
      new Prisma.PrismaClientKnownRequestError("write conflict or deadlock", {
        code: "P2034",
        clientVersion: "6.12.0",
      }),
    ]) {
      deleteMany.mockRejectedValueOnce(e);
      expect(await deleteDataset("owner1", ID, "penjualan cabang", IP, deps)).toEqual({
        ok: false,
        code: "BUSY",
        message: "Sedang memproses permintaan lain. Coba lagi.",
      });
    }
    expect(deps.deleteObjects).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    // Error lain tetap dilempar (bukan disamarkan BUSY).
    deleteMany.mockRejectedValueOnce(
      new Prisma.PrismaClientUnknownRequestError("connection reset", { clientVersion: "6.12.0" }),
    );
    await expect(deleteDataset("owner1", ID, "penjualan cabang", IP, deps)).rejects.toThrow(
      "connection reset",
    );
  });

  it("audit gagal → transaksi gagal, storage tidak disentuh (tidak ada penghapusan tanpa jejak)", async () => {
    auditCreate.mockRejectedValueOnce(new Error("db down"));
    await expect(deleteDataset("owner1", ID, "penjualan cabang", IP, deps)).rejects.toThrow(
      "db down",
    );
    expect(deps.deleteObjects).not.toHaveBeenCalled();
  });

  it("dataset hilang bersamaan (0 baris) → NOT_FOUND tanpa audit dan tanpa hapus storage", async () => {
    deleteMany.mockResolvedValueOnce({ count: 0 });
    const r = await deleteDataset("owner1", ID, "penjualan cabang", IP, deps);
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(auditCreate).not.toHaveBeenCalled();
    expect(deps.deleteObjects).not.toHaveBeenCalled();
  });

  it("salinan lokal typed.parquet di cache mesin query dibuang setelah DB terhapus (T-009 F12)", async () => {
    const forgetParquet = vi.fn(async (_keys: string[]) => {
      order.push("forget");
    });
    const r = await deleteDataset("owner1", ID, "penjualan cabang", IP, { ...deps, forgetParquet });
    expect(r).toMatchObject({ ok: true });
    expect(forgetParquet).toHaveBeenCalledWith(["parquet/d/v/s/typed-1.parquet"]);
    expect(order.indexOf("db")).toBeLessThan(order.indexOf("forget"));
  });

  it("nama lama berbentuk terurai (sebelum NFC) tetap bisa dikonfirmasi dengan ketikan biasa", async () => {
    findFirst.mockResolvedValue({ id: ID, name: "Café Bandung", versions: [] });
    const r = await deleteDataset("owner1", ID, "café bandung", IP, deps);
    expect(r).toEqual({ ok: true, data: { id: ID } });
  });

  it("konfirmasi salah → CONFIRM_MISMATCH, tidak ada yang dihapus", async () => {
    const r = await deleteDataset("owner1", ID, "salah", IP, deps);
    expect(r).toMatchObject({ ok: false, code: "CONFIRM_MISMATCH", field: "confirm" });
    expect(order).toEqual([]);
  });

  it("bukan pemilik / tidak ada → NOT_FOUND tanpa efek samping", async () => {
    findFirst.mockResolvedValue(null);
    const r = await deleteDataset("owner2", ID, "penjualan cabang", IP, deps);
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(order).toEqual([]);
  });

  it("id berbentuk aneh ditolak sebelum menyentuh DB", async () => {
    const r = await deleteDataset("owner1", "../x", "a", IP, deps);
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("storage gagal tidak membatalkan penghapusan (dicatat)", async () => {
    deps.deleteObjects.mockRejectedValueOnce(new Error("S3 down"));
    const r = await deleteDataset("owner1", ID, "penjualan cabang", IP, deps);
    expect(r.ok).toBe(true);
    expect(order).toEqual(["cancel:v1", "db", "audit"]);
  });
});

describe("datasetShareImpact (dialog hapus, T-016)", () => {
  it("dashboard dibagikan, orang berbeda (unik lintas dashboard), dan share organisasi", async () => {
    dashboardFindMany.mockResolvedValueOnce([
      { orgShared: false, shares: [{ userId: "u1" }, { userId: "u2" }] },
      { orgShared: true, shares: [{ userId: "u2" }] },
      { orgShared: false, shares: [] },
    ]);
    expect(await datasetShareImpact("owner1", ID)).toEqual({
      sharedDashboards: 2,
      people: 2,
      orgShared: true,
    });
    expect(dashboardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { datasetId: ID, dataset: { ownerId: "owner1" } } }),
    );
  });

  it("tanpa share → semua nol", async () => {
    dashboardFindMany.mockResolvedValueOnce([{ orgShared: false, shares: [] }]);
    expect(await datasetShareImpact("owner1", ID)).toEqual({
      sharedDashboards: 0,
      people: 0,
      orgShared: false,
    });
  });
});
