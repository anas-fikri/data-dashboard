import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-016: otorisasi SQL repo query produksi (prisma palsu) — widget dan slicer memakai predikat per
 * DASHBOARD (pemilik / share user / share organisasi), peran dihitung di query yang sama, query bebas
 * tetap pemilik dataset saja. SQL sungguhan tidak diuji di sini (lihat e2e).
 */
const widgetFind = vi.fn();
const dashboardFind = vi.fn();
const datasetFind = vi.fn();
const sheetFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    widget: { findFirst: widgetFind },
    dashboard: { findFirst: dashboardFind },
    dataset: { findFirst: datasetFind },
    sheet: { findMany: sheetFindMany },
  },
}));
vi.mock("@/features/dashboards/service", () => ({ filterSourcesFor: vi.fn() }));
vi.mock("@/lib/storage/files", () => ({ downloadToFile: vi.fn(), objectSize: vi.fn() }));

const { prismaQueryRepo } = await import("@/features/query/runtime");
const { canViewWhere, dashboardAccess } = await import("@/features/sharing/access");

const U = "user-b";
const OWNER_ID = "user-a";
const W = "cmv4kljx40009oczvdmpuwid00";
const D = "cmv4kljx40009oczvdmpurrd0";
const DS = "cmv4klj5r0007oczvgiofocpg";
const VER = "cmv4kljx40009oczvdmpurrxf";
const UPDATED = new Date("2026-10-15T00:00:00Z");

const widgetRow = (opts: { owner?: string; shares?: ("VIEWER" | "EDITOR")[]; org?: boolean }) => ({
  type: "kpi",
  spec: { sheetId: "s" },
  missingColumns: [],
  dashboard: {
    id: D,
    datasetId: DS,
    filterColumns: [],
    updatedAt: UPDATED,
    orgShared: opts.org ?? false,
    dataset: { ownerId: opts.owner ?? OWNER_ID, activeVersionId: VER },
    shares: (opts.shares ?? []).map((role) => ({ role })),
  },
});

beforeEach(() => vi.clearAllMocks());

describe("prismaQueryRepo.widget (T-016)", () => {
  it("where per dashboard widget (pemilik/share/organisasi), bukan lewat dataset; share milik peminta saja", async () => {
    widgetFind.mockResolvedValueOnce(null);
    // Widget dashboard lain yang tidak dibagikan (dataset sama): baris tidak cocok → null → 404.
    expect(await prismaQueryRepo.widget(U, W)).toBeNull();
    const arg = widgetFind.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: W, dashboard: canViewWhere(U) });
    expect(arg.where.dashboard).toEqual({
      OR: [{ dataset: { ownerId: U } }, { shares: { some: { userId: U } } }, { orgShared: true }],
    });
    expect(arg.select.dashboard.select).toMatchObject({
      orgShared: true,
      shares: { where: { userId: U }, select: { role: true }, take: 1 },
      dataset: { select: { ownerId: true, activeVersionId: true } },
    });
  });

  it.each([
    ["pemilik dataset", { owner: U }, "OWNER"],
    ["share EDITOR", { shares: ["EDITOR" as const] }, "EDITOR"],
    ["share VIEWER", { shares: ["VIEWER" as const] }, "VIEWER"],
    ["share organisasi", { org: true }, "VIEWER"],
    ["share EDITOR + organisasi", { shares: ["EDITOR" as const], org: true }, "EDITOR"],
  ])("%s → peran %s ikut di hasil", async (_label, opts, role) => {
    widgetFind.mockResolvedValueOnce(widgetRow(opts));
    expect(await prismaQueryRepo.widget(U, W)).toEqual({
      type: "kpi",
      spec: { sheetId: "s" },
      missingColumns: [],
      datasetId: DS,
      activeVersionId: VER,
      dashboardId: D,
      filterColumns: [],
      dashboardUpdatedAt: UPDATED,
      role,
    });
  });

  it("baris tanpa peran yang bisa dihitung → null (deny by default)", async () => {
    widgetFind.mockResolvedValueOnce(widgetRow({}));
    expect(await prismaQueryRepo.widget(U, W)).toBeNull();
  });
});

describe("prismaQueryRepo.filterSource (T-016)", () => {
  it("semua peran yang boleh melihat dashboard; tanpa akses → null tanpa membaca sheet", async () => {
    dashboardFind.mockResolvedValueOnce(null);
    expect(await prismaQueryRepo.filterSource!(U, D)).toBeNull();
    expect(dashboardFind.mock.calls[0]![0].where).toEqual({ id: D, ...canViewWhere(U) });
    expect(sheetFindMany).not.toHaveBeenCalled();

    dashboardFind.mockResolvedValueOnce({
      datasetId: DS,
      filterColumns: [{ sheet: "Data", column: "Cabang" }],
      dataset: { activeVersionId: VER },
    });
    sheetFindMany.mockResolvedValueOnce([{ id: "s1", name: "Data" }]);
    expect(await prismaQueryRepo.filterSource!(U, D)).toEqual({
      datasetId: DS,
      activeVersionId: VER,
      filterColumns: [{ sheet: "Data", column: "Cabang" }],
      sheets: [{ id: "s1", name: "Data" }],
    });
  });
});

describe("prismaQueryRepo: mode editor dan query bebas (T-016)", () => {
  it("dashboardAccess = resolver bersama (satu query, tanpa cache)", () => {
    expect(prismaQueryRepo.dashboardAccess).toBe(dashboardAccess);
  });

  it("query bebas tetap pemilik dataset saja (bukan share)", async () => {
    datasetFind.mockResolvedValueOnce(null);
    expect(await prismaQueryRepo.ownedDataset(U, DS)).toBeNull();
    expect(datasetFind.mock.calls[0]![0].where).toEqual({ id: DS, ownerId: U });
  });
});
