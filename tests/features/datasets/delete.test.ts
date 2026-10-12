import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * deleteDataset: urutan pembatalan job → hapus DB → hapus storage, dan konfirmasi nama wajib.
 * Prisma dimock agar test tidak butuh database (AC T-003 #4: hook terpanggil, diverifikasi test).
 */
const findFirst = vi.fn();
const deleteMany = vi.fn();
const sheetFindMany = vi.fn(async () => [{ typedKey: "parquet/d/v/s/typed-1.parquet" }]);
vi.mock("@/lib/db", () => ({
  prisma: { dataset: { findFirst, deleteMany }, sheet: { findMany: sheetFindMany } },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/objects", () => ({ deleteDatasetObjects: vi.fn() }));
vi.mock("@/lib/queue/versions", () => ({ cancelVersionJobs: vi.fn() }));

const { deleteDataset } = await import("@/features/datasets/service");

const ID = "cmv3z0sxg0000ocicnzrwpr0g";
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
  findFirst.mockResolvedValue({ id: ID, nameKey: "penjualan cabang", versions: [{ id: "v1" }] });
  deleteMany.mockImplementation(async () => {
    order.push("db");
    return { count: 1 };
  });
});

describe("deleteDataset", () => {
  it("konfirmasi cocok → batalkan job, hapus DB, hapus storage (berurutan)", async () => {
    const r = await deleteDataset("owner1", ID, "  PENJUALAN cabang ", deps);
    expect(r).toEqual({ ok: true, data: { id: ID } });
    expect(order).toEqual(["cancel:v1", "db", `objects:${ID}`]);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID, ownerId: "owner1" } }),
    );
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: ID, ownerId: "owner1" } });
  });

  it("salinan lokal typed.parquet di cache mesin query dibuang setelah DB terhapus (T-009 F12)", async () => {
    const forgetParquet = vi.fn(async (_keys: string[]) => {
      order.push("forget");
    });
    const r = await deleteDataset("owner1", ID, "penjualan cabang", { ...deps, forgetParquet });
    expect(r).toMatchObject({ ok: true });
    expect(forgetParquet).toHaveBeenCalledWith(["parquet/d/v/s/typed-1.parquet"]);
    expect(order.indexOf("db")).toBeLessThan(order.indexOf("forget"));
  });

  it("konfirmasi salah → CONFIRM_MISMATCH, tidak ada yang dihapus", async () => {
    const r = await deleteDataset("owner1", ID, "salah", deps);
    expect(r).toMatchObject({ ok: false, code: "CONFIRM_MISMATCH", field: "confirm" });
    expect(order).toEqual([]);
  });

  it("bukan pemilik / tidak ada → NOT_FOUND tanpa efek samping", async () => {
    findFirst.mockResolvedValue(null);
    const r = await deleteDataset("owner2", ID, "penjualan cabang", deps);
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(order).toEqual([]);
  });

  it("id berbentuk aneh ditolak sebelum menyentuh DB", async () => {
    const r = await deleteDataset("owner1", "../x", "a", deps);
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("storage gagal tidak membatalkan penghapusan (dicatat)", async () => {
    deps.deleteObjects.mockRejectedValueOnce(new Error("S3 down"));
    const r = await deleteDataset("owner1", ID, "penjualan cabang", deps);
    expect(r.ok).toBe(true);
    expect(order).toEqual(["cancel:v1", "db"]);
  });
});
