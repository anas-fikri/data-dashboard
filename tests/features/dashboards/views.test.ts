import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * T-tf88: tampilan tersimpan — siapa pun yang bisa melihat dashboard membuat tampilan pribadi; bersama hanya
 * pemilik/editor; daftar = pribadi user + bersama; ubah/hapus: pembuat, atau pemilik/editor untuk bersama;
 * status divalidasi skema ?f= (dan ulang saat dibaca); batas per user/bersama di bawah lock; nama unik.
 */
const tx = {
  $executeRaw: vi.fn(async () => 1),
  dashboardView: { count: vi.fn(async () => 0), create: vi.fn() },
};
const prisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  dashboardView: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
};
vi.mock("@/lib/db", () => ({ prisma }));
const access = vi.hoisted(() => ({ dashboardAccess: vi.fn() }));
vi.mock("@/features/sharing/access", async (orig) => ({
  ...(await orig<typeof import("@/features/sharing/access")>()),
  dashboardAccess: access.dashboardAccess,
}));

const views = await import("@/features/dashboards/views");

const D = "cmv4kljx40009oczvdmpurrd0";
const V = "cmv4kljx40009oczvdmpurrv1";
const STATE = { filters: [{ column: "Kota", op: "in", values: ["Jakarta"] }] };
const role = (r: "OWNER" | "EDITOR" | "VIEWER" | null) =>
  access.dashboardAccess.mockResolvedValue(
    r && { role: r, datasetId: "ds", activeVersionId: null },
  );
const row = (over: Record<string, unknown> = {}) => ({
  id: V,
  name: "Jakarta",
  shared: false,
  state: STATE,
  userId: "me",
  ...over,
});
const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "6.12.0" });

beforeEach(() => {
  vi.clearAllMocks();
  tx.dashboardView.count.mockResolvedValue(0);
  tx.dashboardView.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    row({ name: data.name, shared: data.shared, state: data.state }),
  );
});

describe("tampilan tersimpan (T-tf88)", () => {
  it("daftar: pribadi user + bersama; boleh kelola = pembuat, atau editor untuk bersama; status rusak dilewati", async () => {
    role("EDITOR");
    prisma.dashboardView.findMany.mockResolvedValue([
      row({ id: "a", shared: true, userId: "pemilik" }),
      row({ id: "b" }),
      row({ id: "c", state: { filters: "rusak" } }),
    ]);
    const r = await views.listViews("me", D);
    expect(prisma.dashboardView.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dashboardId: D, OR: [{ userId: "me" }, { shared: true }] },
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      data: [
        { id: "a", shared: true, mine: false, canManage: true },
        { id: "b", shared: false, mine: true, canManage: true },
      ],
    });
    role("VIEWER");
    const v = await views.listViews("me", D);
    expect(v.ok && v.data[0]).toMatchObject({ id: "a", canManage: false });
    role(null);
    expect(await views.listViews("me", D)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("simpan: viewer pribadi boleh, bersama hanya pemilik/editor; status/nama divalidasi", async () => {
    role("VIEWER");
    expect(await views.createView("me", D, { name: " Jakarta ", state: STATE })).toMatchObject({
      ok: true,
      data: { name: "Jakarta", shared: false, mine: true },
    });
    expect(
      await views.createView("me", D, { name: "Semua", state: STATE, shared: true }),
    ).toMatchObject({ code: "FORBIDDEN" });
    role("EDITOR");
    expect(
      await views.createView("me", D, { name: "Semua", state: STATE, shared: true }),
    ).toMatchObject({ ok: true, data: { shared: true } });
    expect(await views.createView("me", D, { name: "", state: STATE })).toMatchObject({
      code: "INVALID",
      field: "name",
    });
    expect(
      await views.createView("me", D, { name: "X", state: { filters: [{ column: "K" }] } }),
    ).toMatchObject({ code: "INVALID", field: "state" });
    const huge = {
      filters: [
        { column: "K", op: "in", values: Array.from({ length: 500 }, (_, i) => `n${i}-panjang`) },
      ],
    };
    expect(await views.createView("me", D, { name: "X", state: huge })).toMatchObject({
      code: "INVALID",
      field: "state",
    });
  });

  it("batas per user dan bersama → LIMIT_REACHED; nama ganda → NAME_TAKEN; lock habis → BUSY", async () => {
    role("OWNER");
    tx.dashboardView.count.mockResolvedValueOnce(views.VIEWS_PER_USER);
    expect(await views.createView("me", D, { name: "A", state: STATE })).toMatchObject({
      code: "LIMIT_REACHED",
    });
    tx.dashboardView.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(views.SHARED_VIEWS_PER_DASHBOARD);
    expect(
      await views.createView("me", D, { name: "A", state: STATE, shared: true }),
    ).toMatchObject({
      code: "LIMIT_REACHED",
    });
    tx.dashboardView.create.mockRejectedValueOnce(known("P2002"));
    expect(await views.createView("me", D, { name: "A", state: STATE })).toMatchObject({
      code: "NAME_TAKEN",
      field: "name",
    });
    prisma.$transaction.mockRejectedValueOnce(known("P2028"));
    expect(await views.createView("me", D, { name: "A", state: STATE })).toMatchObject({
      code: "BUSY",
    });
  });

  it("ubah/hapus: pembuat; bersama juga pemilik/editor; viewer tidak bisa mengubah milik orang lain", async () => {
    role("VIEWER");
    prisma.dashboardView.findFirst.mockResolvedValue(row({ shared: true, userId: "pemilik" }));
    expect(await views.updateView("me", D, V, { name: "Baru" })).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await views.deleteView("me", D, V)).toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.dashboardView.deleteMany).not.toHaveBeenCalled();

    role("EDITOR");
    prisma.dashboardView.update.mockResolvedValue(
      row({ name: "Baru", shared: true, userId: "pemilik" }),
    );
    expect(await views.updateView("me", D, V, { name: " Baru " })).toMatchObject({
      ok: true,
      data: { name: "Baru", canManage: true },
    });
    expect(prisma.dashboardView.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Baru", nameKey: "baru" } }),
    );
    expect(await views.deleteView("me", D, V)).toEqual({ ok: true, data: null });

    // Pribadi milik orang lain tidak pernah terbaca (findFirst disaring userId/shared) → NOT_FOUND.
    prisma.dashboardView.findFirst.mockResolvedValue(null);
    expect(await views.deleteView("me", D, V)).toMatchObject({ code: "NOT_FOUND" });
    expect(await views.updateView("me", D, "bukan-id", {})).toMatchObject({ code: "NOT_FOUND" });
  });

  it("viewer tidak bisa menjadikan tampilan pribadinya bersama; pembuat bisa memperbarui filter", async () => {
    role("VIEWER");
    prisma.dashboardView.findFirst.mockResolvedValue(row());
    expect(await views.updateView("me", D, V, { shared: true })).toMatchObject({
      code: "FORBIDDEN",
    });
    prisma.dashboardView.update.mockResolvedValue(row());
    expect(await views.updateView("me", D, V, { state: STATE })).toMatchObject({ ok: true });
  });
});
