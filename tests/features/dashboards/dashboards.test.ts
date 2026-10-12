import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARDS_PER_DATASET,
  WIDGETS_PER_DASHBOARD,
  bottomOf,
  cleanName,
  layoutBodySchema,
  reconcileLayout,
} from "@/features/dashboards/validation";

/*
 * T-010: validasi tata letak (murni) dan service dashboard dengan Prisma palsu: batas 10 dashboard per
 * dataset, nama unik, simpan otomatis dengan CAS revisi, tambah/hapus widget.
 */
const tx = {
  $executeRaw: vi.fn(async () => 1),
  dataset: { findFirst: vi.fn() },
  dashboard: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(async () => ({})) },
  widget: { create: vi.fn(), delete: vi.fn(async () => ({})) },
};
const prisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  dashboard: { findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  widget: { updateMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma }));

const svc = await import("@/features/dashboards/service");

const OWNER = "owner1";
const DS = "cmv4klj5r0007oczvgiofocpg";
const DB = "cmv4kljx40009oczvdmpurrd0";
const WA = "cmv4kljx40009oczvdmpurrwa";
const WB = "cmv4kljx40009oczvdmpurrwb";
const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "6.12.0" });

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (fn) => fn(tx));
});

describe("validasi tata letak", () => {
  it("nama: wajib, tanpa karakter kontrol/format, ≤ 80; spasi dirapatkan", () => {
    expect(cleanName("  Penjualan   Harian ", 80, "dashboard")).toEqual({
      ok: true,
      value: "Penjualan Harian",
    });
    expect(cleanName(" ", 80, "dashboard")).toMatchObject({ ok: false });
    expect(cleanName("abc‮def", 80, "dashboard")).toMatchObject({ ok: false });
    expect(cleanName("x".repeat(81), 80, "dashboard")).toMatchObject({ ok: false });
  });

  it("grid 12 kolom: x + w ≤ 12, bilangan bulat, id unik, ≤ 50 widget", () => {
    const item = (o: Partial<{ i: string; x: number; y: number; w: number; h: number }>) => ({
      i: WA,
      x: 0,
      y: 0,
      w: 4,
      h: 4,
      ...o,
    });
    const ok = (items: unknown[]) => layoutBodySchema.safeParse({ baseRevision: 1, items }).success;
    expect(ok([item({}), item({ i: WB, x: 4 })])).toBe(true);
    expect(ok([item({ x: 10, w: 4 })])).toBe(false);
    expect(ok([item({ x: 1.5 })])).toBe(false);
    expect(ok([item({}), item({})])).toBe(false);
    expect(ok([item({ i: "../x" })])).toBe(false);
    expect(ok([item({ h: 0 })])).toBe(false);
    expect(
      ok(
        Array.from({ length: WIDGETS_PER_DASHBOARD + 1 }, (_, n) =>
          item({ i: `cmv4kljx40009oczvdmpu${String(n).padStart(4, "0")}` }),
        ),
      ),
    ).toBe(false);
  });

  it("layout tersimpan direkonsiliasi: item tanpa widget dibuang, widget tanpa item ditaruh di bawah", () => {
    const stored = [
      { i: WA, x: 0, y: 0, w: 6, h: 3 },
      { i: "cmv4kljx40009oczvdmpurrzz", x: 6, y: 0, w: 6, h: 9 },
    ];
    expect(reconcileLayout(stored, [WA, WB])).toEqual([
      { i: WA, x: 0, y: 0, w: 6, h: 3 },
      { i: WB, x: 0, y: 3, w: 4, h: 4 },
    ]);
    expect(reconcileLayout("rusak", [WA])).toEqual([{ i: WA, x: 0, y: 0, w: 4, h: 4 }]);
    // Satu item rusak tidak menghapus posisi widget lain.
    expect(
      reconcileLayout(
        [
          { i: WA, x: 2, y: 1, w: 6, h: 3 },
          { i: WB, x: 50, y: 0, w: 6, h: 3 },
        ],
        [WA, WB],
      ),
    ).toEqual([
      { i: WA, x: 2, y: 1, w: 6, h: 3 },
      { i: WB, x: 0, y: 4, w: 4, h: 4 },
    ]);
    expect(bottomOf([])).toBe(0);
  });
});

describe("AC 4: batas dashboard per dataset", () => {
  it("dataset sudah punya 10 dashboard → LIMIT_REACHED tanpa membuat", async () => {
    tx.dataset.findFirst.mockResolvedValueOnce({ _count: { dashboards: DASHBOARDS_PER_DATASET } });
    const r = await svc.createDashboard(OWNER, DS, "Ke-11");
    expect(r).toMatchObject({ ok: false, code: "LIMIT_REACHED", field: "datasetId" });
    expect(tx.dashboard.create).not.toHaveBeenCalled();
    // Hitung dan buat di bawah lock per dataset.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("di bawah batas → dibuat dengan nameKey; nama ganda → NAME_TAKEN; lock habis waktu → BUSY", async () => {
    tx.dataset.findFirst.mockResolvedValue({ _count: { dashboards: 3 } });
    tx.dashboard.create.mockResolvedValueOnce({ id: DB });
    expect(await svc.createDashboard(OWNER, DS, " Penjualan  Harian ")).toEqual({
      ok: true,
      data: { id: DB },
    });
    expect(tx.dashboard.create).toHaveBeenCalledWith({
      data: { datasetId: DS, name: "Penjualan Harian", nameKey: "penjualan harian" },
      select: { id: true },
    });
    tx.dashboard.create.mockRejectedValueOnce(known("P2002"));
    expect(await svc.createDashboard(OWNER, DS, "Penjualan Harian")).toMatchObject({
      code: "NAME_TAKEN",
    });
    prisma.$transaction.mockRejectedValueOnce(known("P2028"));
    expect(await svc.createDashboard(OWNER, DS, "Lain")).toMatchObject({ code: "BUSY" });
  });

  it("dataset bukan milik user atau input rusak → ditolak tanpa transaksi yang membuat", async () => {
    tx.dataset.findFirst.mockResolvedValueOnce(null);
    expect(await svc.createDashboard(OWNER, DS, "X")).toMatchObject({ code: "NOT_FOUND" });
    expect(await svc.createDashboard(OWNER, "bukan-id", "X")).toMatchObject({ code: "INVALID" });
    expect(await svc.createDashboard(OWNER, DS, "")).toMatchObject({
      code: "INVALID",
      field: "name",
    });
    expect(tx.dashboard.create).not.toHaveBeenCalled();
  });
});

describe("AC 1: simpan otomatis tata letak (CAS revisi)", () => {
  const items = [
    { i: WA, x: 0, y: 0, w: 6, h: 4 },
    { i: WB, x: 6, y: 0, w: 6, h: 5 },
  ];
  beforeEach(() => {
    prisma.dashboard.findFirst.mockResolvedValue({
      layoutRevision: 3,
      widgets: [{ id: WA }, { id: WB }],
    });
  });

  it("revisi cocok → disimpan dan revisi naik", async () => {
    prisma.dashboard.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await svc.saveLayout(OWNER, DB, { baseRevision: 3, items })).toEqual({
      ok: true,
      data: { layoutRevision: 4 },
    });
    expect(prisma.dashboard.updateMany).toHaveBeenCalledWith({
      where: { id: DB, layoutRevision: 3 },
      data: { layout: items, layoutRevision: { increment: 1 } },
    });
  });

  it("tab lama (revisi beda), himpunan widget beda, atau kalah balapan → STALE tanpa menimpa", async () => {
    expect(await svc.saveLayout(OWNER, DB, { baseRevision: 2, items })).toMatchObject({
      code: "STALE",
    });
    expect(await svc.saveLayout(OWNER, DB, { baseRevision: 3, items: [items[0]] })).toMatchObject({
      code: "STALE",
    });
    prisma.dashboard.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await svc.saveLayout(OWNER, DB, { baseRevision: 3, items })).toMatchObject({
      code: "STALE",
    });
  });

  it("bukan pemilik → NOT_FOUND; bentuk salah → INVALID", async () => {
    prisma.dashboard.findFirst.mockResolvedValueOnce(null);
    expect(await svc.saveLayout(OWNER, DB, { baseRevision: 3, items })).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      await svc.saveLayout(OWNER, DB, { baseRevision: 3, items: [{ ...items[0], x: 11 }] }),
    ).toMatchObject({ code: "INVALID" });
  });
});

describe("tambah dan hapus widget", () => {
  it("widget baru ditaruh di baris kosong terbawah, revisi naik", async () => {
    tx.dashboard.findFirst.mockResolvedValueOnce({
      layout: [{ i: WA, x: 0, y: 0, w: 12, h: 5 }],
      layoutRevision: 7,
      widgets: [{ id: WA }],
    });
    tx.widget.create.mockResolvedValueOnce({ id: WB, type: "empty", title: "" });
    const r = await svc.addWidget(OWNER, DB, {});
    expect(r).toEqual({
      ok: true,
      data: {
        widget: { id: WB, type: "empty", title: "" },
        item: { i: WB, x: 0, y: 5, w: 4, h: 4 },
        layoutRevision: 8,
      },
    });
    expect(tx.dashboard.update).toHaveBeenCalledWith({
      where: { id: DB },
      data: {
        layout: [
          { i: WA, x: 0, y: 0, w: 12, h: 5 },
          { i: WB, x: 0, y: 5, w: 4, h: 4 },
        ],
        layoutRevision: 8,
      },
    });
  });

  it("pulihkan di posisi semula (urungkan hapus); posisi rusak → INVALID; 50 widget → LIMIT_REACHED", async () => {
    tx.dashboard.findFirst.mockResolvedValueOnce({ layout: [], layoutRevision: 1, widgets: [] });
    tx.widget.create.mockResolvedValueOnce({ id: WA, type: "empty", title: "Omzet" });
    const r = await svc.addWidget(OWNER, DB, { title: "Omzet", at: { x: 6, y: 2, w: 6, h: 3 } });
    expect(r).toMatchObject({ ok: true, data: { item: { i: WA, x: 6, y: 2, w: 6, h: 3 } } });
    expect(await svc.addWidget(OWNER, DB, { at: { x: 10, y: 0, w: 6, h: 3 } })).toMatchObject({
      code: "INVALID",
    });
    tx.dashboard.findFirst.mockResolvedValueOnce({
      layout: [],
      layoutRevision: 1,
      widgets: Array.from({ length: WIDGETS_PER_DASHBOARD }, (_, n) => ({ id: `w${n}` })),
    });
    expect(await svc.addWidget(OWNER, DB, {})).toMatchObject({ code: "LIMIT_REACHED" });
  });

  it("hapus widget membuang itemnya dari layout; widget dashboard lain → NOT_FOUND", async () => {
    tx.dashboard.findFirst.mockResolvedValueOnce({
      layout: [
        { i: WA, x: 0, y: 0, w: 6, h: 4 },
        { i: WB, x: 6, y: 0, w: 6, h: 4 },
      ],
      layoutRevision: 4,
      widgets: [{ id: WA }, { id: WB }],
    });
    expect(await svc.deleteWidget(OWNER, DB, WA)).toEqual({
      ok: true,
      data: { layoutRevision: 5 },
    });
    expect(tx.dashboard.update).toHaveBeenCalledWith({
      where: { id: DB },
      data: { layout: [{ i: WB, x: 6, y: 0, w: 6, h: 4 }], layoutRevision: 5 },
    });
    tx.dashboard.findFirst.mockResolvedValueOnce({
      layout: [],
      layoutRevision: 1,
      widgets: [{ id: WB }],
    });
    expect(await svc.deleteWidget(OWNER, DB, WA)).toMatchObject({ code: "NOT_FOUND" });
    prisma.$transaction.mockRejectedValueOnce(known("P2028"));
    expect(await svc.deleteWidget(OWNER, DB, WA)).toMatchObject({ code: "BUSY" });
  });
});
