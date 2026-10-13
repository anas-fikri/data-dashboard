import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  crossFilterColumnsOf,
  filterColumnKey,
  filterColumnViews,
  storedFilterColumns,
  type ActiveSheet,
} from "@/features/dashboards/filter-columns";

/*
 * T-012: kolom filter dashboard — validasi pengaturan pemilik (≤ 8, unik, ada dan tampil di versi
 * aktif), tampilan terhadap versi aktif, dan kolom cross-filter dari widget grafik. Prisma palsu.
 */
const prisma = {
  dashboard: { findFirst: vi.fn(), updateMany: vi.fn() },
  sheet: { findMany: vi.fn(), groupBy: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma }));

const svc = await import("@/features/dashboards/service");

const OWNER = "owner1";
const DS = "cmv4klj5r0007oczvgiofocpg";
const DB = "cmv4kljx40009oczvdmpurrd0";
const WA = "cmv4kljx40009oczvdmpurrwa";
const VER = "cmv4kljx40009oczvdmpurrve";
const S1 = "cmv4kljx40009oczvdmpurrs1";
const S2 = "cmv4kljx40009oczvdmpurrs2";

const col = (pos: number, name: string, type: string, hidden = false) => ({
  pos,
  name,
  original: name,
  type,
  hidden,
  nullPct: 0,
  distinctCount: 0,
  castFailCount: 0,
});
const SHEETS = [
  {
    id: S1,
    name: "Penjualan",
    schema: [col(1, "Cabang", "text"), col(2, "Tanggal", "date"), col(3, "Gaji", "decimal", true)],
  },
  { id: S2, name: "Target", schema: [col(1, "Wilayah", "text")] },
] as ActiveSheet[];

const owned = () =>
  prisma.dashboard.findFirst.mockResolvedValueOnce({ dataset: { activeVersionId: VER } });

beforeEach(() => vi.clearAllMocks());

describe("setDashboardFilterColumns", () => {
  it("disimpan dengan nama terkini dari skema; hasil = tampilan kolom filter", async () => {
    owned();
    prisma.sheet.findMany.mockResolvedValueOnce(SHEETS);
    prisma.dashboard.updateMany.mockResolvedValueOnce({ count: 1 });
    const r = await svc.setDashboardFilterColumns(OWNER, DB, [
      { sheet: " penjualan", column: "CABANG " },
      { sheet: "Target", column: "Wilayah" },
    ]);
    expect(r).toEqual({
      ok: true,
      data: {
        filterColumns: [
          {
            key: "penjualan\u0000cabang",
            sheet: "Penjualan",
            column: "Cabang",
            type: "text",
            available: true,
          },
          {
            key: "target\u0000wilayah",
            sheet: "Target",
            column: "Wilayah",
            type: "text",
            available: true,
          },
        ],
      },
    });
    expect(prisma.dashboard.updateMany).toHaveBeenCalledWith({
      where: { id: DB, dataset: { ownerId: OWNER } },
      data: {
        filterColumns: [
          { sheet: "Penjualan", column: "Cabang" },
          { sheet: "Target", column: "Wilayah" },
        ],
      },
    });
    expect(prisma.sheet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { versionId: VER, typedKey: { not: null } } }),
    );
  });

  it("> 8, ganda, sheet/kolom tidak ada, kolom tersembunyi, bentuk salah → INVALID tanpa menulis", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ sheet: "Penjualan", column: `K${i}` }));
    const cases: [unknown, string][] = [
      [many, "Maksimal 8 kolom filter per dashboard."],
      [
        [
          { sheet: "Penjualan", column: "Cabang" },
          { sheet: "penjualan", column: "cabang" },
        ],
        'Kolom "cabang" dipilih lebih dari sekali.',
      ],
      [[{ sheet: "Biaya", column: "Cabang" }], 'Sheet "Biaya" tidak ada di data aktif.'],
      [
        [{ sheet: "Penjualan", column: "Gaji" }],
        'Kolom "Gaji" tidak ada atau disembunyikan di sheet "Penjualan".',
      ],
      [
        [{ sheet: "Penjualan", column: "Kota" }],
        'Kolom "Kota" tidak ada atau disembunyikan di sheet "Penjualan".',
      ],
      [[{ sheet: "Penjualan" }], "Daftar kolom filter tidak valid."],
      [[{ sheet: "Penjualan", column: "Cabang", x: 1 }], "Daftar kolom filter tidak valid."],
      [{ sheet: "Penjualan", column: "Cabang" }, "Daftar kolom filter tidak valid."],
    ];
    for (const [input, message] of cases) {
      owned();
      prisma.sheet.findMany.mockResolvedValueOnce(SHEETS);
      expect(await svc.setDashboardFilterColumns(OWNER, DB, input)).toEqual({
        ok: false,
        code: "INVALID",
        message,
      });
    }
    expect(prisma.dashboard.updateMany).not.toHaveBeenCalled();
  });

  it("bukan pemilik / id rusak → NOT_FOUND; data belum siap → hanya daftar kosong yang boleh", async () => {
    prisma.dashboard.findFirst.mockResolvedValueOnce(null);
    expect(await svc.setDashboardFilterColumns("orang-lain", DB, [])).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await svc.setDashboardFilterColumns(OWNER, "../x", [])).toMatchObject({
      code: "NOT_FOUND",
    });
    prisma.dashboard.findFirst.mockResolvedValueOnce({ dataset: { activeVersionId: null } });
    expect(
      await svc.setDashboardFilterColumns(OWNER, DB, [{ sheet: "Penjualan", column: "Cabang" }]),
    ).toMatchObject({ code: "INVALID" });
    expect(prisma.dashboard.updateMany).not.toHaveBeenCalled();
    prisma.dashboard.findFirst.mockResolvedValueOnce({ dataset: { activeVersionId: null } });
    prisma.dashboard.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await svc.setDashboardFilterColumns(OWNER, DB, [])).toEqual({
      ok: true,
      data: { filterColumns: [] },
    });
    expect(prisma.sheet.findMany).not.toHaveBeenCalled();
  });
});

describe("tampilan kolom filter dan kolom cross-filter", () => {
  it("terhadap versi aktif: kolom disembunyikan/hilang tetap tampil sebagai tidak tersedia", () => {
    const stored = storedFilterColumns([
      { sheet: "Penjualan", column: "Cabang" },
      { sheet: "Penjualan", column: "cabang" },
      { sheet: "Penjualan", column: "Gaji" },
      { sheet: "Lama", column: "Kota" },
      { sheet: "x" },
      "rusak",
    ]);
    expect(filterColumnViews(stored, SHEETS)).toEqual([
      {
        key: "penjualan\u0000cabang",
        sheet: "Penjualan",
        column: "Cabang",
        type: "text",
        available: true,
      },
      {
        key: "penjualan\u0000gaji",
        sheet: "Penjualan",
        column: "Gaji",
        type: "decimal",
        available: false,
      },
      { key: "lama\u0000kota", sheet: "Lama", column: "Kota", type: "text", available: false },
    ]);
    expect(filterColumnKey("  Penjualan ", "Cabang  Utama")).toBe("penjualan\u0000cabang utama");
    expect(storedFilterColumns("bukan larik")).toEqual([]);
  });

  const chart = (dim: number, extra: object = {}) => ({
    sheetId: S1,
    dimension: { column: dim },
    measure: { agg: "count" },
    sort: "value_desc",
    topN: 5,
    format: { style: "auto", decimals: 0 },
    ...extra,
  });

  it("dimensi grafik aktif saja (bukan crossFilter:false, KPI/tabel, tersembunyi, sheet lain)", () => {
    const widgets = [
      { type: "bar", spec: chart(1) },
      { type: "pie", spec: chart(1) },
      { type: "line", spec: chart(2, { crossFilter: false }) },
      { type: "bar", spec: chart(3) },
      { type: "kpi", spec: { sheetId: S1, measure: { agg: "count" }, format: {} } },
      { type: "bar", spec: { ...chart(1), sheetId: "cmv4kljx40009oczvdmpurrzz" } },
      { type: "bar", spec: { rusak: true } },
    ];
    expect(crossFilterColumnsOf(widgets, SHEETS)).toEqual(["Cabang"]);
    expect(
      crossFilterColumnsOf([{ type: "line", spec: chart(2, { crossFilter: true }) }], SHEETS),
    ).toEqual(["Tanggal"]);
  });

  it("crossFilterColumnsFor membaca widget grafik dashboard di versi aktif", async () => {
    prisma.dashboard.findFirst.mockResolvedValueOnce({
      datasetId: DS,
      dataset: { activeVersionId: VER },
      widgets: [{ id: WA, type: "bar", title: "", spec: chart(2) }],
    });
    // remapToActive: sheet widget sudah di versi aktif → tidak dipetakan ulang.
    prisma.sheet.findMany.mockResolvedValueOnce([{ ...SHEETS[0], index: 0, versionId: VER }]);
    prisma.sheet.findMany.mockResolvedValueOnce([SHEETS[0]]);
    expect(await svc.crossFilterColumnsFor(DB)).toEqual(["Tanggal"]);
    expect(prisma.sheet.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { versionId: VER, typedKey: { not: null }, id: { in: [S1] } },
      }),
    );
    expect(prisma.dashboard.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DB } }),
    );
  });
});
