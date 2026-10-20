import { Prisma } from "@prisma/client";
import { MISSING_COLUMN } from "@/features/widgets/spec";
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
// Simpan pengaturan widget berjalan di transaksi (lock dashboard, T-013): updateMany sama di tx/prisma.
const widgetUpdateMany = vi.fn();
const dashboardUpdateMany = vi.fn();
/** Hapus dashboard berjalan di transaksi + AuditLog (review T-016 R3 CC-2): deleteMany sama di tx/prisma. */
const dashboardDeleteMany = vi.fn();
const tx = {
  $executeRaw: vi.fn(async () => 1),
  dataset: { findFirst: vi.fn() },
  dashboard: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
    updateMany: dashboardUpdateMany,
    deleteMany: dashboardDeleteMany,
  },
  auditLog: { create: vi.fn(async () => ({ id: "audit1" })) },
  widget: { create: vi.fn(), delete: vi.fn(async () => ({})), updateMany: widgetUpdateMany },
  /** Sheet spec masih di versi aktif (dicek ulang di bawah lock). */
  sheet: { count: vi.fn(async () => 1) },
};
const prisma = {
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  dashboard: {
    findFirst: vi.fn(),
    updateMany: dashboardUpdateMany,
    deleteMany: dashboardDeleteMany,
  },
  widget: { updateMany: widgetUpdateMany, findFirst: vi.fn() },
  sheet: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(async () => []),
    /** Sheet spec di versi lain dataset ini (bawaan: tidak). */
    count: vi.fn(async () => 0),
  },
};
vi.mock("@/lib/db", () => ({ prisma }));

const svc = await import("@/features/dashboards/service");
const { canEditWhere } = await import("@/features/sharing/access");

const OWNER = "owner1";
const DS = "cmv4klj5r0007oczvgiofocpg";
const DB = "cmv4kljx40009oczvdmpurrd0";
const WA = "cmv4kljx40009oczvdmpurrwa";
const WB = "cmv4kljx40009oczvdmpurrwb";
const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "6.12.0" });
/** Baris dashboardAccess (T-016) untuk pemilik: penulisan 0 baris → widget/dashboard hilang, bukan FORBIDDEN. */
const ownerAccess = {
  orgShared: false,
  shares: [],
  dataset: { id: DS, ownerId: OWNER, activeVersionId: null },
};
/**
 * Kolom peran (roleSelect) + pemilik yang dibaca getDashboard sejak T-016 (jumlah share + email pemilik:
 * review T-016 R3 CC-1/CC-2).
 */
const roleCols = { orgShared: false, shares: [], _count: { shares: 0 } };
const ownerCols = { ownerId: OWNER, owner: { name: "Pemilik", email: "pemilik@pcpexpress.com" } };
/** Widget.updatedAt = versi pengaturan widget (review T-016 DI-1). */
const AT = new Date("2026-10-15T01:02:03.004Z");
const VERSION = AT.toISOString();
/** Baris configureWidget: dataset + kolom peran (pemilik → pesan validasi rinci, review SEC-1). */
const editable = { dashboard: { datasetId: DS, ...roleCols, dataset: { ownerId: OWNER } } };

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
    // Lock advisory + lock baris Dashboard (review T-016 R2 DI-1).
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
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
    tx.widget.create.mockResolvedValueOnce({ id: WB, type: "empty", title: "", updatedAt: AT });
    const layout = [
      { i: WA, x: 0, y: 0, w: 12, h: 5 },
      { i: WB, x: 0, y: 5, w: 4, h: 4 },
    ];
    expect(await svc.addWidget(OWNER, DB, { baseRevision: 7 })).toEqual({
      ok: true,
      data: {
        // Widget baru membawa versi pengaturannya (review T-016 DI-1).
        widget: { id: WB, type: "empty", title: "", version: VERSION },
        layout,
        layoutRevision: 8,
      },
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
    tx.widget.create.mockResolvedValueOnce({
      id: WA,
      type: "empty",
      title: "Omzet",
      updatedAt: AT,
    });
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

  it("urungkan hapus: widget kembali ke posisi semula, yang sempat naik turun lagi", async () => {
    // Setelah A (0,0) dihapus, B naik ke (0,0); memulihkan A di (0,0) menurunkan B, bukan A.
    tx.dashboard.findFirst.mockResolvedValueOnce(
      dash([{ i: WB, x: 0, y: 0, w: 6, h: 4 }], 5, [WB]),
    );
    tx.widget.create.mockResolvedValueOnce({ id: WA, type: "empty", title: "", updatedAt: AT });
    const r = await svc.addWidget(OWNER, DB, { baseRevision: 5, at: { x: 0, y: 0, w: 12, h: 4 } });
    expect(r.ok && Object.fromEntries(r.data.layout.map((it) => [it.i, it.y]))).toEqual({
      [WA]: 0,
      [WB]: 4,
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

  it("ganti judul: pemilik/editor saja, ikut menyegarkan waktu 'diperbarui' dashboard", async () => {
    prisma.widget.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await svc.renameWidget(OWNER, DB, WA, "  Omzet   cabang ")).toEqual({
      ok: true,
      data: { title: "Omzet cabang", version: expect.any(String) },
    });
    // Tanpa versi dari klien: tanpa CAS; versi baru tetap ditulis eksplisit dan dikembalikan.
    expect(prisma.widget.updateMany).toHaveBeenCalledWith({
      where: { id: WA, dashboardId: DB, dashboard: canEditWhere(OWNER) },
      data: { title: "Omzet cabang", updatedAt: expect.any(Date) },
    });
    expect(prisma.dashboard.updateMany).toHaveBeenCalledTimes(1);
    // Pemilik, widget tidak ada → "Widget tidak ditemukan." (satu cek akses memilih kodenya).
    prisma.widget.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.dashboard.findFirst.mockResolvedValueOnce(ownerAccess);
    expect(await svc.renameWidget(OWNER, DB, WA, "X")).toMatchObject({
      code: "NOT_FOUND",
      message: "Widget tidak ditemukan.",
    });
    // Tanpa akses ke dashboard → NOT_FOUND dashboard.
    prisma.widget.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await svc.renameWidget(OWNER, DB, WA, "X")).toMatchObject({
      code: "NOT_FOUND",
      message: "Dashboard tidak ditemukan.",
    });
  });
});

describe("T-011: atur isi widget dan pulihkan tipe/spec", () => {
  const SHEET = "cmv4kljx40009oczvdmpurrsh";
  const schema = [
    { pos: 1, name: "Cabang", original: "Cabang", type: "text", hidden: false },
    { pos: 2, name: "Omzet", original: "Omzet", type: "decimal", hidden: false },
    { pos: 3, name: "Gaji", original: "Gaji", type: "decimal", hidden: true },
  ];
  const fmt = { style: "rupiah", decimals: 0 };
  const bar = {
    sheetId: SHEET,
    dimension: { column: 1 },
    measure: { agg: "sum", column: 2 },
    sort: "value_desc",
    topN: 12,
    format: fmt,
  };

  it("spec valid terhadap data aktif → disimpan; sheet dicari di versi aktif dataset widget", async () => {
    prisma.widget.findFirst.mockResolvedValueOnce(editable);
    prisma.sheet.findFirst.mockResolvedValueOnce({ schema });
    prisma.widget.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await svc.configureWidget(OWNER, DB, WA, "bar", bar)).toEqual({
      ok: true,
      data: { type: "bar", spec: bar, version: expect.any(String) },
    });
    expect(prisma.sheet.findFirst).toHaveBeenCalledWith({
      where: { id: SHEET, version: { activeFor: { id: DS } } },
      // Sumber periode + satuan versi: kolom sistem Periode (T-058).
      select: { schema: true, periodSource: true, version: { select: { periodGrain: true } } },
    });
    // Pengaturan baru menghapus catatan kolom hilang dari aktivasi versi (T-013). Cek akses edit
    // (T-016) ada di where penulisan di dalam transaksi lock.
    expect(prisma.widget.updateMany).toHaveBeenCalledWith({
      where: { id: WA, dashboardId: DB, dashboard: canEditWhere(OWNER) },
      data: { type: "bar", spec: bar, missingColumns: [], updatedAt: expect.any(Date) },
    });
  });

  it("T-013: versi aktif berganti setelah validasi → STALE, tidak ditulis; urungkan hapus → kosong", async () => {
    prisma.widget.findFirst.mockResolvedValueOnce(editable);
    prisma.sheet.findFirst.mockResolvedValueOnce({ schema });
    tx.sheet.count.mockResolvedValueOnce(0);
    expect(await svc.configureWidget(OWNER, DB, WA, "bar", bar)).toMatchObject({
      ok: false,
      code: "STALE",
    });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.sheet.count).toHaveBeenCalledWith({
      where: { id: SHEET, version: { activeFor: { id: DS } } },
    });
    expect(widgetUpdateMany).not.toHaveBeenCalled();

    prisma.dashboard.findFirst.mockResolvedValueOnce({ datasetId: DS });
    prisma.sheet.findFirst.mockResolvedValueOnce({ schema });
    tx.dashboard.findFirst.mockResolvedValueOnce(dash([], 2, []));
    tx.sheet.count.mockResolvedValueOnce(0);
    tx.widget.create.mockResolvedValueOnce({
      id: WA,
      type: "empty",
      title: "",
      spec: {},
      updatedAt: AT,
    });
    expect(
      await svc.addWidget(OWNER, DB, { baseRevision: 2, type: "bar", spec: bar }),
    ).toMatchObject({ ok: true, data: { configDropped: true } });
    expect(tx.widget.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dashboardId: DB, title: "", type: "empty", spec: {} } }),
    );
  });

  it("R5-CC-2: sheet versi lain dataset ini (versi berganti saat panel terbuka) → STALE muat ulang; urungkan hapus → kosong", async () => {
    prisma.widget.findFirst.mockResolvedValueOnce(editable);
    prisma.sheet.findFirst.mockResolvedValueOnce(null);
    prisma.sheet.findFirst.mockResolvedValueOnce({ version: { datasetId: DS } });
    expect(await svc.configureWidget(OWNER, DB, WA, "bar", bar)).toEqual({
      ok: false,
      code: "STALE",
      message:
        "Data dataset ini baru saja berganti versi. Muat ulang halaman, lalu atur lagi widget ini.",
    });
    // Sheet di luar versi aktif dicari di mana pun: dataset ini → STALE; dataset lain → NOT_FOUND.
    expect(prisma.sheet.findFirst).toHaveBeenLastCalledWith({
      where: { id: SHEET },
      select: { version: { select: { datasetId: true } } },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(widgetUpdateMany).not.toHaveBeenCalled();

    // Sheet aktif yang belum punya skema bukan tanda versi berganti: tetap INVALID.
    prisma.widget.findFirst.mockResolvedValueOnce(editable);
    prisma.sheet.findFirst.mockResolvedValueOnce({ schema: null });
    expect(await svc.configureWidget(OWNER, DB, WA, "bar", bar)).toMatchObject({
      code: "INVALID",
      message: "Sheet tidak ditemukan di data aktif dataset ini.",
    });
    expect(prisma.sheet.findFirst).toHaveBeenCalledTimes(3);

    // Urungkan hapus tetap memulihkan widget kosong (configDropped), bukan STALE.
    prisma.dashboard.findFirst.mockResolvedValueOnce({ datasetId: DS });
    prisma.sheet.findFirst.mockResolvedValueOnce(null);
    prisma.sheet.findFirst.mockResolvedValueOnce({ version: { datasetId: DS } });
    tx.dashboard.findFirst.mockResolvedValueOnce(dash([], 2, []));
    tx.widget.create.mockResolvedValueOnce({
      id: WA,
      type: "empty",
      title: "",
      spec: {},
      updatedAt: AT,
    });
    expect(
      await svc.addWidget(OWNER, DB, { baseRevision: 2, type: "bar", spec: bar }),
    ).toMatchObject({ ok: true, data: { configDropped: true } });
    expect(tx.widget.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dashboardId: DB, title: "", type: "empty", spec: {} } }),
    );
  });

  it("T-013: sheet lama sudah dihapus + kolom hilang tercatat → semua kolom ditandai hilang di tampilan, satu sheet aktif → spec pindah ke sheet itu", async () => {
    const OLD = "cmv4kljx40009oczvdmpurrol";
    const VER = "cmv4kljx40009oczvdmpurrve";
    const kpi = { sheetId: OLD, measure: { agg: "sum", column: 2 }, format: fmt };
    const widget = (missingColumns: string[]) => ({
      id: WA,
      type: "kpi",
      title: "",
      spec: kpi,
      missingColumns,
      updatedAt: AT,
    });
    const dashboard = (widgets: unknown[]) => ({
      id: DB,
      name: "Penjualan",
      layout: [],
      layoutRevision: 0,
      filterColumns: [],
      updatedAt: new Date(),
      ...roleCols,
      dataset: { id: DS, name: "Data", activeVersionId: VER, ...ownerCols },
      widgets,
    });
    prisma.dashboard.findFirst.mockResolvedValueOnce(dashboard([widget(["Omzet"])]));
    // Sheet lama tidak ada lagi; versi aktif punya satu sheet lain.
    prisma.sheet.findMany.mockResolvedValueOnce([]);
    prisma.sheet.findMany.mockResolvedValueOnce([{ id: SHEET, name: "Sheet1", index: 0 }]);
    prisma.sheet.findMany.mockResolvedValueOnce([]);
    const view = await svc.getDashboard(OWNER, DB);
    // Dataset satu sheet tidak punya pilihan sheet: panel harus menampilkan kolom sheet aktif. Widget
    // yang diarahkan ulang tetap membawa versi pengaturan tersimpan (review T-016 DI-1).
    expect(view?.widgets).toEqual([
      {
        id: WA,
        type: "kpi",
        title: "",
        spec: { ...kpi, sheetId: SHEET, measure: { agg: "sum", column: MISSING_COLUMN } },
        version: VERSION,
        retargeted: true,
      },
    ]);
    // Lebih dari satu sheet aktif → sheet lama tetap (panel memberi pilihan sheet).
    prisma.dashboard.findFirst.mockResolvedValueOnce(dashboard([widget(["Omzet"])]));
    prisma.sheet.findMany.mockResolvedValueOnce([]);
    prisma.sheet.findMany.mockResolvedValueOnce([
      { id: SHEET, name: "Sheet1", index: 0 },
      { id: OLD.replace("rol", "rs2"), name: "Sheet2", index: 1 },
    ]);
    prisma.sheet.findMany.mockResolvedValueOnce([]);
    expect((await svc.getDashboard(OWNER, DB))?.widgets).toEqual([
      {
        id: WA,
        type: "kpi",
        title: "",
        spec: { ...kpi, measure: { agg: "sum", column: MISSING_COLUMN } },
        version: VERSION,
      },
    ]);
    // Lebih dari satu sheet aktif, tanpa catatan kolom hilang: spec apa adanya (pilihan sheet di panel).
    prisma.dashboard.findFirst.mockResolvedValueOnce(dashboard([widget([])]));
    prisma.sheet.findMany.mockResolvedValueOnce([]);
    prisma.sheet.findMany.mockResolvedValueOnce([
      { id: SHEET, name: "Sheet1", index: 0 },
      { id: OLD.replace("rol", "rs2"), name: "Sheet2", index: 1 },
    ]);
    prisma.sheet.findMany.mockResolvedValueOnce([]);
    expect((await svc.getDashboard(OWNER, DB))?.widgets).toEqual([
      { id: WA, type: "kpi", title: "", spec: kpi, version: VERSION },
    ]);
  });

  it("R2-CC-1a: sheet tidak bisa ditentukan tanpa catatan kolom hilang + satu sheet aktif → spec pindah ke sheet itu, semua kolom ditandai", async () => {
    const OLD = "cmv4kljx40009oczvdmpurrol";
    const VER = "cmv4kljx40009oczvdmpurrve";
    const kpi = { sheetId: OLD, measure: { agg: "sum", column: 2 }, format: fmt };
    const dashboard = () => ({
      id: DB,
      name: "Penjualan",
      layout: [],
      layoutRevision: 0,
      filterColumns: [],
      updatedAt: new Date(),
      ...roleCols,
      dataset: { id: DS, name: "Data", activeVersionId: VER, ...ownerCols },
      widgets: [{ id: WA, type: "kpi", title: "", spec: kpi, missingColumns: [], updatedAt: AT }],
    });
    const retargeted = {
      id: WA,
      type: "kpi",
      title: "",
      spec: { ...kpi, sheetId: SHEET, measure: { agg: "sum", column: MISSING_COLUMN } },
      version: VERSION,
      retargeted: true,
    };
    // Sheet lama sudah dihapus retensi, catatan kosong (sheet tanpa pasangan saat rollback).
    prisma.dashboard.findFirst.mockResolvedValueOnce(dashboard());
    prisma.sheet.findMany.mockResolvedValueOnce([]);
    prisma.sheet.findMany.mockResolvedValueOnce([{ id: SHEET, name: "Data", index: 0 }]);
    prisma.sheet.findMany.mockResolvedValueOnce([]);
    expect((await svc.getDashboard(OWNER, DB))?.widgets).toEqual([retargeted]);
    // Sheet lama masih ada (versi lain) tetapi tanpa pasangan di versi aktif (sheet baru "Extra").
    prisma.dashboard.findFirst.mockResolvedValueOnce(dashboard());
    prisma.sheet.findMany.mockResolvedValueOnce([
      { id: OLD, name: "Extra", index: 1, schema: [], versionId: "cmv4kljx40009oczvdmpurrv2" },
    ]);
    prisma.sheet.findMany.mockResolvedValueOnce([{ id: SHEET, name: "Data", index: 0 }]);
    prisma.sheet.groupBy.mockResolvedValueOnce([
      { versionId: "cmv4kljx40009oczvdmpurrv2", _count: { _all: 2 } },
    ] as never);
    prisma.sheet.findMany.mockResolvedValueOnce([]);
    expect((await svc.getDashboard(OWNER, DB))?.widgets).toEqual([retargeted]);
  });

  it("R3-CC-2: KPI Jumlah baris (tanpa kolom) yang diarahkan ke satu-satunya sheet aktif → ditandai retargeted; widget biasa tidak", async () => {
    const OLD = "cmv4kljx40009oczvdmpurrol";
    const VER = "cmv4kljx40009oczvdmpurrve";
    const WB = WA.replace(/.$/, "b");
    const count = (sheetId: string) => ({ sheetId, measure: { agg: "count" }, format: fmt });
    prisma.dashboard.findFirst.mockResolvedValueOnce({
      id: DB,
      name: "Penjualan",
      layout: [],
      layoutRevision: 0,
      filterColumns: [],
      updatedAt: new Date(),
      ...roleCols,
      dataset: { id: DS, name: "Data", activeVersionId: VER, ...ownerCols },
      widgets: [
        { id: WA, type: "kpi", title: "", spec: count(OLD), missingColumns: [], updatedAt: AT },
        { id: WB, type: "kpi", title: "", spec: count(SHEET), missingColumns: [], updatedAt: AT },
      ],
    });
    // Sheet lama sudah dihapus retensi; sheet widget kedua ada di versi aktif.
    prisma.sheet.findMany.mockResolvedValueOnce([
      { id: SHEET, name: "Data", index: 0, schema, versionId: VER },
    ]);
    prisma.sheet.findMany.mockResolvedValueOnce([{ id: SHEET, name: "Data", index: 0 }]);
    prisma.sheet.findMany.mockResolvedValueOnce([]);
    // Tidak ada kolom yang bisa ditandai: spec tampilan lengkap, hanya flag yang memberi tahu panel.
    expect((await svc.getDashboard(OWNER, DB))?.widgets).toEqual([
      { id: WA, type: "kpi", title: "", spec: count(SHEET), version: VERSION, retargeted: true },
      { id: WB, type: "kpi", title: "", spec: count(SHEET), version: VERSION },
    ]);
  });

  it("kolom tersembunyi, agregasi tidak cocok, sheet lain, atau bentuk salah → INVALID tanpa menulis", async () => {
    const cases: [unknown, unknown][] = [
      ["bar", { ...bar, measure: { agg: "sum", column: 3 } }],
      ["bar", { ...bar, measure: { agg: "sum", column: 1 } }],
      ["kpi", { sheetId: SHEET, measure: { agg: "avg" }, format: fmt }],
      ["radar", bar],
    ];
    prisma.sheet.findFirst.mockResolvedValue({ schema });
    for (const [type, spec] of cases) {
      prisma.widget.findFirst.mockResolvedValueOnce(editable);
      expect(await svc.configureWidget(OWNER, DB, WA, type, spec)).toMatchObject({
        ok: false,
        code: "INVALID",
      });
    }
    // Sheet yang tidak ada di dataset ini (dataset lain / sudah tidak ada) → NOT_FOUND (AC6, T-016).
    prisma.widget.findFirst.mockResolvedValueOnce(editable);
    prisma.sheet.findFirst.mockReset();
    prisma.sheet.findFirst.mockResolvedValueOnce(null);
    prisma.sheet.findFirst.mockResolvedValueOnce(null);
    expect(await svc.configureWidget(OWNER, DB, WA, "bar", bar)).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Sheet tidak ditemukan.",
    });
    prisma.widget.findFirst.mockResolvedValueOnce(editable);
    prisma.sheet.findFirst.mockResolvedValueOnce(null);
    prisma.sheet.findFirst.mockResolvedValueOnce({ version: { datasetId: "dataset-lain" } });
    expect(await svc.configureWidget(OWNER, DB, WA, "bar", bar)).toMatchObject({
      code: "NOT_FOUND",
      message: "Sheet tidak ditemukan.",
    });
    expect(prisma.widget.updateMany).not.toHaveBeenCalled();
    prisma.widget.findFirst.mockResolvedValueOnce(null);
    expect(await svc.configureWidget(OWNER, DB, WA, "bar", bar)).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("urungkan hapus memulihkan tipe dan spec (divalidasi seperti simpan)", async () => {
    prisma.dashboard.findFirst.mockResolvedValueOnce({ datasetId: DS });
    prisma.sheet.findFirst.mockResolvedValueOnce({ schema });
    tx.dashboard.findFirst.mockResolvedValueOnce(dash([], 2, []));
    tx.widget.create.mockResolvedValueOnce({
      id: WA,
      type: "bar",
      title: "Omzet",
      spec: bar,
      updatedAt: AT,
    });
    const r = await svc.addWidget(OWNER, DB, {
      baseRevision: 2,
      title: "Omzet",
      at: { x: 0, y: 0, w: 6, h: 4 },
      type: "bar",
      spec: bar,
    });
    expect(r).toMatchObject({ ok: true, data: { widget: { type: "bar", spec: bar } } });
    expect(tx.widget.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { dashboardId: DB, title: "Omzet", type: "bar", spec: bar },
      }),
    );
    prisma.dashboard.findFirst.mockResolvedValueOnce({ datasetId: DS });
    prisma.sheet.findFirst.mockResolvedValueOnce({ schema });
    // Spec yang tidak lagi valid → widget tetap dipulihkan, kosong, dengan tanda untuk klien.
    tx.dashboard.findFirst.mockResolvedValueOnce(dash([], 3, []));
    tx.widget.create.mockResolvedValueOnce({
      id: WB,
      type: "empty",
      title: "Omzet",
      spec: {},
      updatedAt: AT,
    });
    expect(
      await svc.addWidget(OWNER, DB, { baseRevision: 3, type: "bar", spec: { ...bar, topN: 0 } }),
    ).toMatchObject({ ok: true, data: { configDropped: true, widget: { type: "empty" } } });
    expect(tx.widget.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { dashboardId: DB, title: "", type: "empty", spec: {} } }),
    );
  });

  it("widget tabel yang dipulihkan di bawah ukuran minimum disimpan 3x4 (verifikasi T-011 putaran 5)", async () => {
    const table = { sheetId: SHEET, columns: [1], format: fmt };
    prisma.dashboard.findFirst.mockResolvedValueOnce({ datasetId: DS });
    prisma.sheet.findFirst.mockResolvedValueOnce({ schema });
    tx.dashboard.findFirst.mockResolvedValueOnce(dash([], 4, []));
    tx.widget.create.mockResolvedValueOnce({
      id: WA,
      type: "table",
      title: "Detail",
      spec: table,
      updatedAt: AT,
    });
    const r = await svc.addWidget(OWNER, DB, {
      baseRevision: 4,
      title: "Detail",
      at: { x: 0, y: 0, w: 1, h: 1 },
      type: "table",
      spec: table,
    });
    expect(r).toMatchObject({ ok: true, data: { layout: [{ i: WA, w: 3, h: 4 }] } });
  });

  it("sumber data panel: sheet siap di versi aktif dataset dashboard yang boleh diubah user, tanpa kolom tersembunyi", async () => {
    prisma.sheet.findMany.mockResolvedValueOnce([{ id: SHEET, name: "Penjualan", schema }]);
    expect(await svc.getDashboardSources(OWNER, DB)).toEqual([
      {
        id: SHEET,
        name: "Penjualan",
        columns: [
          { pos: 1, name: "Cabang", type: "text" },
          { pos: 2, name: "Omzet", type: "decimal" },
        ],
      },
    ]);
    // Akses (pemilik/editor dashboard ini) dan sheet dalam satu query (T-016).
    expect(prisma.sheet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          typedKey: { not: null },
          version: {
            activeFor: { dashboards: { some: { id: DB, ...canEditWhere(OWNER) } } },
          },
        },
      }),
    );
  });
});

describe("review T-016 R2 DI-1: baris Dashboard dikunci sebelum Widget; deadlock → BUSY", () => {
  const SHEET = "cmv4kljx40009oczvdmpurrsh";
  const schema = [
    { pos: 1, name: "Cabang", original: "Cabang", type: "text", hidden: false },
    { pos: 2, name: "Omzet", original: "Omzet", type: "decimal", hidden: false },
  ];
  const bar = {
    sheetId: SHEET,
    dimension: { column: 1 },
    measure: { agg: "sum", column: 2 },
    sort: "value_desc",
    topN: 12,
    format: { style: "rupiah", decimals: 0 },
  };
  const ROW_LOCK = 'SELECT 1 FROM "Dashboard" WHERE "id" = ? FOR NO KEY UPDATE';
  /** Teks SQL panggilan $executeRaw: Prisma.sql (objek strings) atau template tag (array strings). */
  const sqlOf = (call: unknown[]) => {
    const q = call[0];
    return (Array.isArray(q) ? q : ((q as { strings?: string[] }).strings ?? [])).join("?");
  };
  /** Nilai pertama panggilan $executeRaw (Prisma.sql: values; template tag: argumen kedua). */
  const valueOf = (call: unknown[]) =>
    Array.isArray(call[0]) ? call[1] : (call[0] as { values: unknown[] }).values[0];
  type Mocked = { mock: { invocationCallOrder: number[] } };
  /** Urutan global panggilan mock. */
  const at = (fn: Mocked, i = 0) => fn.mock.invocationCallOrder[i]!;

  function expectLockedFirst(firstWidgetWrite: Mocked) {
    const calls = tx.$executeRaw.mock.calls as unknown[][];
    expect(calls.map(sqlOf)).toEqual([expect.stringContaining("pg_advisory_xact_lock"), ROW_LOCK]);
    expect(valueOf(calls[0]!)).toBe(`dashboard:${DB}`);
    expect(valueOf(calls[1]!)).toBe(DB);
    // Advisory → baris Dashboard → baris Widget: urutan yang sama dengan hapus dashboard/dataset.
    expect(at(tx.$executeRaw, 0)).toBeLessThan(at(tx.$executeRaw, 1));
    expect(at(tx.$executeRaw, 1)).toBeLessThan(at(firstWidgetWrite));
  }

  it("hapus widget (lockedDashboard): baris Dashboard dikunci sebelum Widget dihapus", async () => {
    tx.dashboard.findFirst.mockResolvedValueOnce(
      dash([{ i: WA, x: 0, y: 0, w: 6, h: 4 }], 2, [WA]),
    );
    expect(await svc.deleteWidget(OWNER, DB, WA, 2)).toMatchObject({ ok: true });
    expectLockedFirst(tx.widget.delete);
    // Akses dibaca setelah kedua lock (tanpa TOCTOU).
    expect(at(tx.$executeRaw, 1)).toBeLessThan(at(tx.dashboard.findFirst));
  });

  it("tambah widget dan simpan tata letak (lockedDashboard): baris Dashboard dikunci lebih dulu", async () => {
    tx.dashboard.findFirst.mockResolvedValueOnce(dash([], 0, []));
    tx.widget.create.mockResolvedValueOnce({ id: WA, type: "empty", title: "", updatedAt: AT });
    expect(await svc.addWidget(OWNER, DB, { baseRevision: 0 })).toMatchObject({ ok: true });
    expectLockedFirst(tx.widget.create);

    vi.clearAllMocks();
    const one = [{ i: WA, x: 0, y: 0, w: 6, h: 4 }];
    tx.dashboard.findFirst.mockResolvedValueOnce(dash(one, 1, [WA]));
    expect(await svc.saveLayout(OWNER, DB, { baseRevision: 1, items: one })).toMatchObject({
      ok: true,
    });
    expectLockedFirst(tx.dashboard.update);
  });

  it("atur isi widget: baris Dashboard dikunci sebelum Widget ditulis (bukan lagi Widget → Dashboard)", async () => {
    prisma.widget.findFirst.mockResolvedValueOnce(editable);
    prisma.sheet.findFirst.mockResolvedValueOnce({ schema });
    widgetUpdateMany.mockResolvedValueOnce({ count: 1 });
    expect(await svc.configureWidget(OWNER, DB, WA, "bar", bar, VERSION)).toMatchObject({
      ok: true,
    });
    expectLockedFirst(widgetUpdateMany);
    expect(at(widgetUpdateMany)).toBeLessThan(at(dashboardUpdateMany));
  });

  it("dashboard dihapus pemilik selagi editor menunggu lock baris → 0 baris → NOT_FOUND, bukan 500", async () => {
    prisma.widget.findFirst.mockResolvedValueOnce(editable);
    prisma.sheet.findFirst.mockResolvedValueOnce({ schema });
    tx.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    widgetUpdateMany.mockResolvedValueOnce({ count: 0 });
    // denied(): dashboard sudah tidak ada → tanpa akses.
    prisma.dashboard.findFirst.mockResolvedValueOnce(null);
    expect(await svc.configureWidget(OWNER, DB, WA, "bar", bar, VERSION)).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "Dashboard tidak ditemukan.",
    });
    expect(dashboardUpdateMany).not.toHaveBeenCalled();
  });

  /** Bentuk deadlock yang teramati (review): tanpa `code`, SQLSTATE hanya di pesan. */
  const deadlock = () =>
    new Prisma.PrismaClientUnknownRequestError(
      'Error occurred during query execution: ConnectorError(ConnectorError { kind: QueryError(PostgresError { code: "40P01", message: "deadlock detected" }) })',
      { clientVersion: "6.12.0" },
    );
  /** Deadlock di query mentah (lock baris/advisory): P2010 dengan SQLSTATE di meta. */
  const rawDeadlock = () =>
    new Prisma.PrismaClientKnownRequestError("Raw query failed. Code: `40P01`.", {
      code: "P2010",
      clientVersion: "6.12.0",
      meta: { code: "40P01", message: "deadlock detected" },
    });
  const conflict = () => known("P2034");

  it("isTxConflict: 40P01/40001 (tanpa code atau P2010 query mentah) dan P2034 saja", async () => {
    const { isTxConflict } = await import("@/features/dashboards/tx-conflict");
    expect(isTxConflict(deadlock())).toBe(true);
    expect(isTxConflict(rawDeadlock())).toBe(true);
    expect(isTxConflict(conflict())).toBe(true);
    const unknown = (m: string) =>
      new Prisma.PrismaClientUnknownRequestError(m, { clientVersion: "6.12.0" });
    expect(isTxConflict(unknown('PostgresError { code: "40001" }'))).toBe(true);
    expect(isTxConflict(unknown("connection reset"))).toBe(false);
    expect(isTxConflict(known("P2028"))).toBe(false);
    expect(isTxConflict(known("P2002"))).toBe(false);
    const otherRaw = new Prisma.PrismaClientKnownRequestError("Raw query failed.", {
      code: "P2010",
      clientVersion: "6.12.0",
      meta: { code: "23505" },
    });
    expect(isTxConflict(otherRaw)).toBe(false);
    expect(isTxConflict(new Error("40P01"))).toBe(false);
  });

  it("penulis widget/tata letak: deadlock atau gagal serialisasi → BUSY, bukan 500", async () => {
    const one = [{ i: WA, x: 0, y: 0, w: 6, h: 4 }];
    const ops = [
      () => svc.saveLayout(OWNER, DB, { baseRevision: 1, items: one }),
      () => svc.addWidget(OWNER, DB, { baseRevision: 1 }),
      () => svc.deleteWidget(OWNER, DB, WA, 1),
      () => {
        prisma.widget.findFirst.mockResolvedValueOnce(editable);
        prisma.sheet.findFirst.mockResolvedValueOnce({ schema });
        return svc.configureWidget(OWNER, DB, WA, "bar", bar, VERSION);
      },
    ];
    for (const op of ops) {
      for (const e of [deadlock(), rawDeadlock(), conflict()]) {
        prisma.$transaction.mockRejectedValueOnce(e);
        expect(await op()).toEqual({
          ok: false,
          code: "BUSY",
          message: "Sedang memproses perubahan lain. Coba lagi.",
        });
      }
    }
    // Error lain tetap dilempar (tidak disamarkan BUSY).
    prisma.$transaction.mockRejectedValueOnce(new Error("db down"));
    await expect(ops[2]!()).rejects.toThrow("db down");
  });

  it("hapus dashboard pemilik: korban deadlock/antre lock → BUSY (dashboard tetap ada, coba lagi)", async () => {
    const IP = "203.0.113.9";
    const attempt = () => {
      tx.dashboard.findFirst.mockResolvedValueOnce({
        name: "Penjualan",
        orgShared: true,
        _count: { shares: 3 },
      });
      return svc.deleteDashboard(OWNER, DB, IP);
    };
    prisma.dashboard.deleteMany.mockRejectedValueOnce(deadlock());
    expect(await attempt()).toEqual({
      ok: false,
      code: "BUSY",
      message: "Sedang memproses perubahan lain. Coba lagi.",
    });
    prisma.dashboard.deleteMany.mockRejectedValueOnce(conflict());
    expect(await attempt()).toMatchObject({ code: "BUSY" });
    // Lock advisory dashboard tidak didapat dalam batas waktu transaksi → BUSY juga.
    prisma.$transaction.mockRejectedValueOnce(known("P2028"));
    expect(await svc.deleteDashboard(OWNER, DB, IP)).toMatchObject({ code: "BUSY" });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    prisma.dashboard.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await attempt()).toEqual({ ok: true, data: { id: DB } });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    prisma.dashboard.deleteMany.mockRejectedValueOnce(new Error("db down"));
    await expect(attempt()).rejects.toThrow("db down");
  });
});
