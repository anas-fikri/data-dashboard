import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-k6k0: cari cepat — dataset milik user, dashboard dengan aturan lihat yang sama dengan halaman
 * (canViewWhere: milik, share langsung, share organisasi), panduan sesuai peran (≥ 2 huruf), wildcard LIKE
 * diperlakukan sebagai huruf, kata kunci kosong = terbaru tanpa panduan.
 */
const prisma = {
  dataset: { findMany: vi.fn(async () => [{ id: "ds1", name: "Kiriman" }]) },
  dashboard: {
    findMany: vi.fn(async () => [
      { id: "db1", name: "Omzet", dataset: { name: "Kiriman", ownerId: "u1" } },
      { id: "db2", name: "Omzet cabang", dataset: { name: "Cabang", ownerId: "rekan" } },
    ]),
  },
};
vi.mock("@/lib/db", () => ({ prisma }));
const guides = vi.hoisted(() => ({
  guideRolesFor: vi.fn(async () => ["OWNER"]),
  searchGuides: vi.fn(async () =>
    Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, slug: `p-${i}`, title: `Panduan ${i}` })),
  ),
}));
vi.mock("@/features/guides/reader", async (orig) => ({
  ...(await orig<typeof import("@/features/guides/reader")>()),
  guideRolesFor: guides.guideRolesFor,
  searchGuides: guides.searchGuides,
}));

const { quickSearch, QUICK_LIMIT } = await import("@/features/search/service");
const USER = { id: "u1", isAdmin: false };

beforeEach(() => vi.clearAllMocks());

describe("quickSearch (T-k6k0)", () => {
  it("kata kunci → dataset milik user + dashboard yang boleh dilihat + panduan sesuai peran", async () => {
    const r = await quickSearch(USER, "  omz%_ ");
    const name = { contains: "omz\\%\\_", mode: "insensitive" };
    expect(prisma.dataset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "u1", name }, take: QUICK_LIMIT.datasets }),
    );
    // Share organisasi hanya dari pemilik aktif (sama dengan halaman Dashboard, review v1.14 #5).
    expect(prisma.dashboard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { dataset: { ownerId: "u1" } },
            { shares: { some: { userId: "u1" } } },
            { orgShared: true, dataset: { owner: { isActive: true } } },
          ],
          name,
        },
        take: QUICK_LIMIT.dashboards,
      }),
    );
    expect(guides.guideRolesFor).toHaveBeenCalledWith("u1", false);
    expect(r.dashboards).toEqual([
      { id: "db1", name: "Omzet", datasetName: "Kiriman", shared: false },
      { id: "db2", name: "Omzet cabang", datasetName: "Cabang", shared: true },
    ]);
    expect(r.guides).toHaveLength(QUICK_LIMIT.guides);
    expect(r.guides[0]).toEqual({ slug: "p-0", title: "Panduan 0" });
  });

  it("kosong → terbaru tanpa saringan nama dan tanpa panduan; 1 huruf → tanpa panduan", async () => {
    const r = await quickSearch(USER, "");
    expect(prisma.dataset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "u1" } }),
    );
    expect(r.guides).toEqual([]);
    expect(guides.searchGuides).not.toHaveBeenCalled();
    await quickSearch(USER, "o");
    expect(guides.searchGuides).not.toHaveBeenCalled();
  });
});
