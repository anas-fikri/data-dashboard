import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-043 data halaman Lihat data: pemilik dan editor dashboard dataset boleh; viewer/asing → null (404);
 * kolom yang disembunyikan di skema tidak dikirim ke klien; sheet tanpa typed → kolom null (belum siap).
 */
const db = vi.hoisted(() => ({
  dataset: { findUnique: vi.fn() },
  dashboard: { findFirst: vi.fn() },
  sheet: { findFirst: vi.fn() },
  datasetVersion: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

const { gridPageView, visibleColumns } = await import("@/features/query/grid-page");

const schema = [
  { pos: 1, name: "Kode", original: "Kode", type: "text", hidden: false },
  { pos: 2, name: "Rahasia", original: "Rahasia", type: "text", hidden: true },
  { pos: 3, name: "Nilai", original: "Nilai Asli", type: "integer", hidden: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.dataset.findUnique.mockResolvedValue({
    id: "d1",
    name: "Penjualan",
    ownerId: "owner",
    activeVersion: {
      id: "v1",
      originalName: "jual.xlsx",
      sheets: [
        { id: "s0", index: 0, name: "Jan" },
        { id: "s1", index: 1, name: "Feb" },
      ],
    },
  });
  db.sheet.findFirst.mockResolvedValue({
    id: "s1",
    index: 1,
    name: "Feb",
    schemaRevision: 4,
    schema,
    typedKey: "typed.parquet",
  });
});

describe("gridPageView", () => {
  it("pemilik: sheet pilihan, kolom tersembunyi tidak dikirim", async () => {
    const v = await gridPageView("owner", "d1", 1);
    expect(db.dashboard.findFirst).not.toHaveBeenCalled();
    expect(db.sheet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1", versionId: "v1" } }),
    );
    expect(v).toMatchObject({
      role: "OWNER",
      version: { id: "v1", fileName: "jual.xlsx" },
      tabs: [
        { index: 0, name: "Jan" },
        { index: 1, name: "Feb" },
      ],
      sheet: { id: "s1", schemaRevision: 4 },
    });
    expect(v!.sheet!.columns).toEqual([
      { pos: 1, name: "Kode", original: "Kode", type: "text" },
      { pos: 3, name: "Nilai", original: "Nilai Asli", type: "integer" },
    ]);
    expect(JSON.stringify(v)).not.toContain("Rahasia");
  });

  it("editor dashboard dataset boleh; viewer/asing → null", async () => {
    db.dashboard.findFirst.mockResolvedValueOnce({ id: "dash" });
    expect((await gridPageView("editor", "d1", null))!.role).toBe("EDITOR");
    expect(db.dashboard.findFirst.mock.calls[0]![0].where).toMatchObject({ datasetId: "d1" });
    db.dashboard.findFirst.mockResolvedValueOnce(null);
    expect(await gridPageView("viewer", "d1", null)).toBeNull();
    expect(db.sheet.findFirst).toHaveBeenCalledTimes(1);
  });

  it("dataset tidak ada → null; indeks sheet tak dikenal → sheet pertama; typed belum ada → kolom null", async () => {
    db.dataset.findUnique.mockResolvedValueOnce(null);
    expect(await gridPageView("owner", "dx", 0)).toBeNull();
    db.sheet.findFirst.mockResolvedValueOnce({
      id: "s0",
      index: 0,
      name: "Jan",
      schemaRevision: 1,
      schema: null,
      typedKey: null,
    });
    const v = await gridPageView("owner", "d1", 9);
    expect(db.sheet.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "s0", versionId: "v1" } }),
    );
    expect(v!.sheet!.columns).toBeNull();
  });

  it("T-047: id sheet versi aktif memilih tab itu; id asing → sheet pertama", async () => {
    await gridPageView("owner", "d1", "s1");
    expect(db.sheet.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "s1", versionId: "v1" } }),
    );
    await gridPageView("owner", "d1", "lama");
    expect(db.sheet.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "s0", versionId: "v1" } }),
    );
  });

  it("T-054: ?version= versi tertunda hanya untuk pemilik; versi tidak lagi menunggu → gone", async () => {
    db.datasetVersion.findFirst.mockResolvedValueOnce({
      id: "v2",
      status: "AWAITING_CONFIRM",
      originalName: "feb.csv",
      sheets: [{ id: "s9", index: 0, name: "Jan" }],
    });
    const v = await gridPageView("owner", "d1", null, "v2");
    expect(db.datasetVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "v2", datasetId: "d1" } }),
    );
    expect(db.sheet.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "s9", versionId: "v2" } }),
    );
    expect(v).toMatchObject({ preview: "pending", version: { id: "v2", fileName: "feb.csv" } });

    db.datasetVersion.findFirst.mockResolvedValueOnce({
      id: "v3",
      status: "READY",
      originalName: "x.csv",
      sheets: [{ id: "s8", index: 0, name: "Jan" }],
    });
    expect(await gridPageView("owner", "d1", null, "v3")).toMatchObject({
      preview: "gone",
      version: null,
      tabs: [],
      sheet: null,
    });
    db.datasetVersion.findFirst.mockResolvedValueOnce(null);
    expect((await gridPageView("owner", "d1", null, "vx"))!.preview).toBe("gone");

    // Editor dashboard tidak boleh membuka versi tertunda (404), versi aktif tetap boleh.
    db.dashboard.findFirst.mockResolvedValueOnce({ id: "dash" });
    expect(await gridPageView("editor", "d1", null, "v2")).toBeNull();
    expect(db.datasetVersion.findFirst).toHaveBeenCalledTimes(3);
    expect((await gridPageView("owner", "d1", null))!.preview).toBeNull();
  });

  it("visibleColumns menolak skema bukan larik", () => {
    expect(visibleColumns(null)).toBeNull();
    expect(visibleColumns({})).toBeNull();
  });
});
