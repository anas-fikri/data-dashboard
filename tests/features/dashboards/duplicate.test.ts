import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARDS_PER_DATASET } from "@/features/dashboards/validation";

/*
 * T-fcar: duplikat dashboard — pemilik saja (dashboard berada di dataset pemiliknya), salinan berisi widget
 * + tata letak (id dipetakan), kolom filter, dan warna, tanpa berbagi; nama kosong → "X (salinan)"; batas
 * per dataset di bawah lock yang sama dengan buat dashboard; aktivasi versi yang berjalan ditunggu (FOR SHARE).
 */
const tx = {
  $executeRaw: vi.fn(async () => 1),
  $queryRaw: vi.fn(async () => [{ "?column?": 1 }]),
  dashboard: {
    findFirst: vi.fn(),
    findMany: vi.fn(async () => [] as { name: string }[]),
    create: vi.fn(async () => ({ id: "copy1" })),
    update: vi.fn(async () => ({})),
  },
  widget: { create: vi.fn() },
};
const prisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  dashboard: { findFirst: vi.fn(), findMany: vi.fn(async () => [] as { name: string }[]) },
};
vi.mock("@/lib/db", () => ({ prisma }));
const access = vi.hoisted(() => ({ dashboardAccess: vi.fn() }));
vi.mock("@/features/sharing/access", async (orig) => ({
  ...(await orig<typeof import("@/features/sharing/access")>()),
  dashboardAccess: access.dashboardAccess,
}));

const svc = await import("@/features/dashboards/service");

const OWNER = "owner1";
const ID = "cmv4kljx40009oczvdmpurrd0";
const DS = "cmv4klj5r0007oczvgiofocpg";
const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "6.12.0" });

const source = (over: Record<string, unknown> = {}) => ({
  name: "Penjualan",
  layout: [
    { i: "wa", x: 0, y: 0, w: 6, h: 4 },
    { i: "wb", x: 6, y: 0, w: 6, h: 4 },
    { i: "hilang", x: 0, y: 4, w: 4, h: 4 },
  ],
  filterColumns: [{ sheet: "Data", column: "Kota", default: { op: "in", values: ["Jakarta"] } }],
  colors: { template: "lembut", tone: "up" },
  widgets: [
    {
      id: "wa",
      type: "chart",
      title: "Omzet",
      spec: { a: 1 },
      missingColumns: [],
      savedPivotId: null,
    },
    {
      id: "wb",
      type: "pivot",
      title: "Pivot",
      spec: { b: 2 },
      missingColumns: ["Lama"],
      savedPivotId: "sp1",
    },
  ],
  dataset: { _count: { dashboards: 3 } },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.dashboard.findFirst.mockResolvedValue({ datasetId: DS });
  tx.dashboard.findFirst.mockResolvedValue(source());
  tx.dashboard.findMany.mockResolvedValue([{ name: "Penjualan" }, { name: "Penjualan (salinan)" }]);
  let n = 0;
  tx.widget.create.mockImplementation(async () => ({ id: `new${++n}` }));
});

describe("duplicateDashboard (T-fcar)", () => {
  it("pemilik, nama kosong → salinan lengkap dengan nama unik, id tata letak dipetakan, tanpa berbagi", async () => {
    const r = await svc.duplicateDashboard(OWNER, ID, "  ");
    expect(r).toEqual({ ok: true, data: { id: "copy1" } });
    // Lock per dataset (sama dengan buat dashboard) lalu tunggu aktivasi versi (FOR SHARE).
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const created = (
      tx.dashboard.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(created).toEqual({
      datasetId: DS,
      name: "Penjualan (salinan 2)",
      nameKey: "penjualan (salinan 2)",
      filterColumns: source().filterColumns,
      colors: source().colors,
    });
    expect(created).not.toHaveProperty("orgShared");
    expect(tx.widget.create).toHaveBeenCalledTimes(2);
    expect(tx.widget.create.mock.calls[1]).toEqual([
      {
        data: {
          dashboardId: "copy1",
          type: "pivot",
          title: "Pivot",
          spec: { b: 2 },
          missingColumns: ["Lama"],
          savedPivotId: "sp1",
        },
        select: { id: true },
      },
    ]);
    expect(tx.dashboard.update).toHaveBeenCalledWith({
      where: { id: "copy1" },
      data: {
        layout: [
          { i: "new1", x: 0, y: 0, w: 6, h: 4 },
          { i: "new2", x: 6, y: 0, w: 6, h: 4 },
        ],
        layoutRevision: 1,
      },
    });
  });

  it("nama diisi → dipakai apa adanya (dirapikan); warna null tidak ditulis", async () => {
    tx.dashboard.findFirst.mockResolvedValue(source({ colors: null }));
    expect(await svc.duplicateDashboard(OWNER, ID, "  Cabang   Bandung ")).toMatchObject({
      ok: true,
    });
    const created = (
      tx.dashboard.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(created).toMatchObject({ name: "Cabang Bandung", nameKey: "cabang bandung" });
    expect(created).not.toHaveProperty("colors");
  });

  it("batas dashboard per dataset → LIMIT_REACHED tanpa membuat; nama ganda → NAME_TAKEN; lock habis → BUSY", async () => {
    tx.dashboard.findFirst.mockResolvedValue(
      source({ dataset: { _count: { dashboards: DASHBOARDS_PER_DATASET } } }),
    );
    expect(await svc.duplicateDashboard(OWNER, ID, "")).toMatchObject({
      ok: false,
      code: "LIMIT_REACHED",
    });
    expect(tx.dashboard.create).not.toHaveBeenCalled();

    tx.dashboard.findFirst.mockResolvedValue(source());
    tx.dashboard.create.mockRejectedValueOnce(known("P2002"));
    expect(await svc.duplicateDashboard(OWNER, ID, "Penjualan")).toMatchObject({
      ok: false,
      code: "NAME_TAKEN",
      field: "name",
    });
    prisma.$transaction.mockRejectedValueOnce(known("P2028"));
    expect(await svc.duplicateDashboard(OWNER, ID, "")).toMatchObject({ ok: false, code: "BUSY" });
  });

  it("bukan pemilik: editor/viewer → FORBIDDEN, tanpa akses → NOT_FOUND; id/nama rusak → ditolak tanpa transaksi", async () => {
    prisma.dashboard.findFirst.mockResolvedValue(null);
    access.dashboardAccess.mockResolvedValueOnce({
      role: "EDITOR",
      datasetId: DS,
      activeVersionId: null,
    });
    expect(await svc.duplicateDashboard("rekan", ID, "")).toMatchObject({ code: "FORBIDDEN" });
    access.dashboardAccess.mockResolvedValueOnce({
      role: "VIEWER",
      datasetId: DS,
      activeVersionId: null,
    });
    expect(await svc.duplicateDashboard("rekan", ID, "")).toMatchObject({ code: "FORBIDDEN" });
    access.dashboardAccess.mockResolvedValueOnce(null);
    expect(await svc.duplicateDashboard("orang-lain", ID, "")).toMatchObject({ code: "NOT_FOUND" });
    expect(await svc.duplicateDashboard(OWNER, "bukan id", "")).toMatchObject({
      code: "NOT_FOUND",
    });
    prisma.dashboard.findFirst.mockResolvedValue({ datasetId: DS });
    expect(await svc.duplicateDashboard(OWNER, ID, "a\u0000b")).toMatchObject({
      code: "INVALID",
      field: "name",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("dashboard terhapus di tengah jalan (tidak ada di bawah lock) → NOT_FOUND", async () => {
    tx.dashboard.findFirst.mockResolvedValue(null);
    expect(await svc.duplicateDashboard(OWNER, ID, "")).toMatchObject({ code: "NOT_FOUND" });
    expect(tx.dashboard.create).not.toHaveBeenCalled();
  });

  it("suggestCopyName: nama salinan pertama yang belum dipakai di dataset", async () => {
    prisma.dashboard.findMany.mockResolvedValue([{ name: "Penjualan" }]);
    expect(await svc.suggestCopyName(DS, "Penjualan")).toBe("Penjualan (salinan)");
  });
});
