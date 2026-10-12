import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARDS_PER_DATASET,
  WIDGETS_PER_DASHBOARD,
  bottomOf,
  cleanName,
  compactLayout,
  layoutBodySchema,
  reconcileLayout,
} from "@/features/dashboards/validation";

/*
 * T-010: validasi tata letak (murni) dan service dashboard dengan Prisma palsu: batas 10 dashboard per
 * dataset, nama unik, dan semua perubahan kanvas (simpan otomatis, tambah/hapus widget) di bawah lock
 * per dashboard dengan revisi wajib — tab yang tertinggal mendapat STALE, layout selalu dipadatkan.
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
    // NFC: "é" terurai dan tersusun menjadi nama yang sama (kunci unik tidak bisa diakali).
    expect(cleanName("Cafe\u0301", 80, "dashboard")).toEqual({ ok: true, value: "Caf\u00e9" });
    // ZWJ boleh (emoji keluarga), pengisi Hangul/zero-width saja = tidak terbaca → ditolak.
    expect(cleanName("Tim 👨\u200D👩\u200D👧", 80, "dashboard")).toMatchObject({ ok: true });
    expect(cleanName("\u3164\u3164", 80, "dashboard")).toMatchObject({ ok: false });
    expect(cleanName("\u200B", 80, "dashboard")).toMatchObject({ ok: false });
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
    // Satu item rusak tidak menghapus posisi widget lain; kunci tambahan (versi mendatang) diabaikan.
    expect(
      reconcileLayout(
        [
          { i: WA, x: 2, y: 0, w: 6, h: 3, static: true },
          { i: WB, x: 50, y: 0, w: 6, h: 3 },
        ],
        [WA, WB],
      ),
    ).toEqual([
      { i: WA, x: 2, y: 0, w: 6, h: 3 },
      { i: WB, x: 0, y: 3, w: 4, h: 4 },
    ]);
    expect(bottomOf([])).toBe(0);
  });

  it("pemadatan: lubang vertikal hilang, tumpang tindih diurai, urutan item tetap", () => {
    expect(
      compactLayout([
        { i: WB, x: 0, y: 9, w: 6, h: 2 },
        { i: WA, x: 0, y: 0, w: 12, h: 3 },
      ]),
    ).toEqual([
      { i: WB, x: 0, y: 3, w: 6, h: 2 },
      { i: WA, x: 0, y: 0, w: 12, h: 3 },
    ]);
    const overlapped = compactLayout([
      { i: WA, x: 0, y: 0, w: 6, h: 4 },
      { i: WB, x: 3, y: 1, w: 6, h: 4 },
    ]);
    expect(overlapped[1]).toMatchObject({ i: WB, y: 4 });
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

const dash = (layout: unknown[], layoutRevision: number, ids: string[]) => ({
  layout,
  layoutRevision,
  widgets: ids.map((id) => ({ id })),
});

describe("AC 1: simpan otomatis tata letak (lock + revisi)", () => {
  const items = [
    { i: WA, x: 0, y: 0, w: 6, h: 4 },
    { i: WB, x: 6, y: 0, w: 6, h: 5 },
  ];
  beforeEach(() => {
    tx.dashboard.findFirst.mockResolvedValue(dash(items, 3, [WA, WB]));
  });

  it("revisi cocok → disimpan (dipadatkan) di bawah lock dashboard dan revisi naik", async () => {
    const gappy = [items[0], { ...items[1], y: 12 }];
    expect(await svc.saveLayout(OWNER, DB, { baseRevision: 3, items: gappy })).toEqual({
      ok: true,
      data: { layoutRevision: 4 },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.dashboard.update).toHaveBeenCalledWith({
      where: { id: DB },
      data: { layout: items, layoutRevision: 4 },
    });
  });

  it("tab lama (revisi beda) atau himpunan widget beda → STALE tanpa menimpa; lock habis → BUSY", async () => {
    expect(await svc.saveLayout(OWNER, DB, { baseRevision: 2, items })).toMatchObject({
      code: "STALE",
    });
    expect(await svc.saveLayout(OWNER, DB, { baseRevision: 3, items: [items[0]] })).toMatchObject({
      code: "STALE",
    });
    expect(tx.dashboard.update).not.toHaveBeenCalled();
    prisma.$transaction.mockRejectedValueOnce(known("P2028"));
    expect(await svc.saveLayout(OWNER, DB, { baseRevision: 3, items })).toMatchObject({
      code: "BUSY",
    });
  });

  it("bukan pemilik → NOT_FOUND; bentuk salah → INVALID", async () => {
    tx.dashboard.findFirst.mockResolvedValueOnce(null);
    expect(await svc.saveLayout(OWNER, DB, { baseRevision: 3, items })).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      await svc.saveLayout(OWNER, DB, { baseRevision: 3, items: [{ ...items[0], x: 11 }] }),
    ).toMatchObject({ code: "INVALID" });
  });
});

describe("tambah dan hapus widget (revisi wajib)", () => {
  it("widget baru ditaruh di baris terbawah; hasil = layout padat lengkap + revisi baru", async () => {
    tx.dashboard.findFirst.mockResolvedValueOnce(
      dash([{ i: WA, x: 0, y: 0, w: 12, h: 5 }], 7, [WA]),
    );
    tx.widget.create.mockResolvedValueOnce({ id: WB, type: "empty", title: "" });
    const layout = [
      { i: WA, x: 0, y: 0, w: 12, h: 5 },
      { i: WB, x: 0, y: 5, w: 4, h: 4 },
    ];
    expect(await svc.addWidget(OWNER, DB, { baseRevision: 7 })).toEqual({
      ok: true,
      data: { widget: { id: WB, type: "empty", title: "" }, layout, layoutRevision: 8 },
    });
    expect(tx.dashboard.update).toHaveBeenCalledWith({
      where: { id: DB },
      data: { layout, layoutRevision: 8 },
    });
  });

  it("tanpa revisi → INVALID; revisi lama → STALE tanpa membuat; dashboard terhapus bersamaan → NOT_FOUND", async () => {
    expect(await svc.addWidget(OWNER, DB, {})).toMatchObject({ code: "INVALID" });
    expect(await svc.addWidget(OWNER, DB, { baseRevision: -1 })).toMatchObject({
      code: "INVALID",
    });
    tx.dashboard.findFirst.mockResolvedValueOnce(dash([], 5, []));
    expect(await svc.addWidget(OWNER, DB, { baseRevision: 4 })).toMatchObject({ code: "STALE" });
    expect(tx.widget.create).not.toHaveBeenCalled();
    prisma.$transaction.mockRejectedValueOnce(known("P2003"));
    expect(await svc.addWidget(OWNER, DB, { baseRevision: 5 })).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("pulihkan di posisi semula (urungkan hapus); posisi rusak → INVALID; 50 widget → LIMIT_REACHED", async () => {
    tx.dashboard.findFirst.mockResolvedValueOnce(dash([], 1, []));
    tx.widget.create.mockResolvedValueOnce({ id: WA, type: "empty", title: "Omzet" });
    const r = await svc.addWidget(OWNER, DB, {
      baseRevision: 1,
      title: "Omzet",
      at: { x: 6, y: 2, w: 6, h: 3 },
    });
    // Posisi kolom dipertahankan; baris dipadatkan ke atas (tidak ada widget lain).
    expect(r).toMatchObject({ ok: true, data: { layout: [{ i: WA, x: 6, y: 0, w: 6, h: 3 }] } });
    expect(
      await svc.addWidget(OWNER, DB, { baseRevision: 1, at: { x: 10, y: 0, w: 6, h: 3 } }),
    ).toMatchObject({ code: "INVALID" });
    tx.dashboard.findFirst.mockResolvedValueOnce(
      dash(
        [],
        1,
        Array.from({ length: WIDGETS_PER_DASHBOARD }, (_, n) => `w${n}`),
      ),
    );
    expect(await svc.addWidget(OWNER, DB, { baseRevision: 1 })).toMatchObject({
      code: "LIMIT_REACHED",
    });
  });

  it("hapus widget: item dibuang dan sisanya dipadatkan; revisi lama → STALE; widget lain → NOT_FOUND", async () => {
    const two = [
      { i: WA, x: 0, y: 0, w: 12, h: 4 },
      { i: WB, x: 0, y: 4, w: 6, h: 4 },
    ];
    tx.dashboard.findFirst.mockResolvedValueOnce(dash(two, 4, [WA, WB]));
    expect(await svc.deleteWidget(OWNER, DB, WA, 4)).toEqual({
      ok: true,
      data: { layout: [{ i: WB, x: 0, y: 0, w: 6, h: 4 }], layoutRevision: 5 },
    });
    expect(tx.widget.delete).toHaveBeenCalledWith({ where: { id: WA } });

    tx.dashboard.findFirst.mockResolvedValueOnce(dash(two, 6, [WA, WB]));
    expect(await svc.deleteWidget(OWNER, DB, WA, 4)).toMatchObject({ code: "STALE" });
    expect(tx.widget.delete).toHaveBeenCalledTimes(1);

    expect(await svc.deleteWidget(OWNER, DB, WA, null)).toMatchObject({ code: "INVALID" });
    tx.dashboard.findFirst.mockResolvedValueOnce(dash([], 1, [WB]));
    expect(await svc.deleteWidget(OWNER, DB, WA, 1)).toMatchObject({
      code: "NOT_FOUND",
      message: "Widget tidak ditemukan.",
    });
    prisma.$transaction.mockRejectedValueOnce(known("P2028"));
    expect(await svc.deleteWidget(OWNER, DB, WA, 1)).toMatchObject({ code: "BUSY" });
  });

  it("ganti judul: milik user saja, ikut menyegarkan waktu 'diperbarui' dashboard", async () => {
    prisma.widget.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await svc.renameWidget(OWNER, DB, WA, "  Omzet   cabang ")).toEqual({
      ok: true,
      data: { title: "Omzet cabang" },
    });
    expect(prisma.widget.updateMany).toHaveBeenCalledWith({
      where: { id: WA, dashboardId: DB, dashboard: { dataset: { ownerId: OWNER } } },
      data: { title: "Omzet cabang" },
    });
    expect(prisma.dashboard.updateMany).toHaveBeenCalledTimes(1);
    prisma.widget.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await svc.renameWidget(OWNER, DB, WA, "X")).toMatchObject({
      code: "NOT_FOUND",
      message: "Widget tidak ditemukan.",
    });
  });
});
