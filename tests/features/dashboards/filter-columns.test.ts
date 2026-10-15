import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  crossFilterColumnsOf,
  filterColumnKey,
  filterColumnViews,
  filterSourcesOf,
  overlappingFilterColumns,
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
      // Satu nama kolom = satu kontrol filter, walau dari sheet lain.
      [
        [
          { sheet: "Penjualan", column: "Cabang" },
          { sheet: "Target", column: "CABANG" },
        ],
        'Kolom "CABANG" sudah dipilih dari sheet "Penjualan". Satu nama kolom hanya bisa menjadi satu filter.',
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
  it("terhadap versi aktif: kolom disembunyikan/hilang tampil tidak tersedia dengan nama tersimpan dan tipe netral", () => {
    const stored = storedFilterColumns([
      { sheet: "Penjualan", column: "Cabang" },
      { sheet: "Penjualan", column: "cabang" },
      // Nama sama dari sheet lain (data lama sebelum aturan satu kontrol per nama) → dibuang.
      { sheet: "Target", column: "CABANG" },
      { sheet: "Penjualan", column: "gaji" },
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
      // Kolom tersembunyi: nama tersimpan ("gaji", bukan nama terkini) + tipe netral, bukan DECIMAL.
      {
        key: "penjualan\u0000gaji",
        sheet: "Penjualan",
        column: "gaji",
        type: "text",
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

  it("sumber filter: kolom filter + tipe (null bila tidak tersedia) dan dimensi grafik cross-filter", () => {
    const stored = storedFilterColumns([
      { sheet: "Penjualan", column: "Cabang" },
      { sheet: "Penjualan", column: "Gaji" },
    ]);
    expect(filterSourcesOf(stored, [{ type: "bar", spec: chart(2) }], SHEETS)).toEqual([
      { name: "Cabang", type: "text" },
      { name: "Gaji", type: null },
      { name: "Tanggal", type: "date" },
    ]);
  });

  it("filterSourcesFor membaca kolom filter + widget grafik dashboard di versi aktif", async () => {
    prisma.dashboard.findFirst.mockResolvedValueOnce({
      datasetId: DS,
      filterColumns: [],
      dataset: { activeVersionId: VER },
      widgets: [{ id: WA, type: "bar", title: "", spec: chart(2) }],
    });
    // remapToActive: sheet widget sudah di versi aktif → tidak dipetakan ulang.
    prisma.sheet.findMany.mockResolvedValueOnce([{ ...SHEETS[0], index: 0, versionId: VER }]);
    prisma.sheet.findMany.mockResolvedValueOnce([SHEETS[0]]);
    expect(await svc.filterSourcesFor(DB)).toEqual([{ name: "Tanggal", type: "date" }]);
    // Tanpa kolom filter cukup sheet grafik.
    expect(prisma.sheet.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { versionId: VER, typedKey: { not: null }, id: { in: [S1] } },
      }),
    );
    expect(prisma.dashboard.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DB } }),
    );
    // Data belum siap: nama kolom filter tetap diizinkan, tanpa tipe (filternya dilewati).
    prisma.dashboard.findFirst.mockResolvedValueOnce({
      datasetId: DS,
      filterColumns: [{ sheet: "Penjualan", column: "Cabang" }],
      dataset: { activeVersionId: null },
      widgets: [],
    });
    expect(await svc.filterSourcesFor(DB)).toEqual([{ name: "Cabang", type: null }]);
  });
});

describe("peringatan share: kolom filter yang juga menyaring sheet lain (T-016, catatan T-012)", () => {
  const S3 = "cmv4kljx40009oczvdmpurrs3";
  const sheets = [
    {
      id: S1,
      name: "Penjualan",
      schema: [col(1, "Cabang", "text"), col(2, "Tanggal", "date"), col(3, "Kode", "text")],
    },
    {
      id: S2,
      name: "Stok",
      // "tanggal " (spasi/kapital beda) sekelompok tipe (waktu); "Kode" angka = kelompok lain.
      schema: [
        col(1, "CABANG", "text"),
        col(2, "tanggal ", "timestamp"),
        col(3, "Kode", "integer"),
      ],
    },
    {
      id: S3,
      name: "Rahasia",
      schema: [col(1, "Cabang", "text", true), col(2, "Tanggal", "date")],
    },
  ] as ActiveSheet[];
  const kpiOn = (sheetId: string) => ({
    type: "kpi",
    spec: { sheetId, measure: { agg: "count" }, format: { style: "auto", decimals: 0 } },
  });
  const barOn = (sheetId: string, dim: number, extra: object = {}) => ({
    type: "bar",
    spec: {
      sheetId,
      dimension: { column: dim },
      measure: { agg: "count" },
      sort: "value_desc",
      topN: 5,
      format: { style: "auto", decimals: 0 },
      ...extra,
    },
  });
  const stored = (...cols: [string, string][]) =>
    storedFilterColumns(cols.map(([sheet, column]) => ({ sheet, column })));

  it("nama + kelompok tipe sama di > 1 sheet (sheet widget + sheet sumber) → diperingatkan", () => {
    expect(
      overlappingFilterColumns(
        stored(["Penjualan", "Cabang"], ["Penjualan", "Tanggal"], ["Penjualan", "Kode"]),
        [kpiOn(S1), kpiOn(S2)],
        sheets,
      ),
    ).toEqual(["Cabang", "Tanggal"]);
  });

  it("sheet sumber kolom filter tidak dipakai widget, tetapi sheet widget punya kolom itu → tetap diperingatkan", () => {
    expect(overlappingFilterColumns(stored(["Penjualan", "Cabang"]), [kpiOn(S2)], sheets)).toEqual([
      "Cabang",
    ]);
  });

  it("hanya satu sheet; kolom tersembunyi di sheet lain; kolom filter tidak tersedia → tanpa peringatan", () => {
    expect(overlappingFilterColumns(stored(["Penjualan", "Cabang"]), [kpiOn(S1)], sheets)).toEqual(
      [],
    );
    expect(
      overlappingFilterColumns(stored(["Penjualan", "Cabang"]), [kpiOn(S1), kpiOn(S3)], sheets),
    ).toEqual([]);
    expect(
      overlappingFilterColumns(stored(["Penjualan", "Hilang"]), [kpiOn(S1), kpiOn(S2)], sheets),
    ).toEqual([]);
  });

  it("dimensi grafik cross-filter ikut; crossFilter:false tidak", () => {
    expect(overlappingFilterColumns([], [barOn(S1, 1), kpiOn(S2)], sheets)).toEqual(["Cabang"]);
    expect(
      overlappingFilterColumns([], [barOn(S1, 1, { crossFilter: false }), kpiOn(S2)], sheets),
    ).toEqual([]);
    // Nama yang sama dari kolom filter dan dimensi grafik hanya sekali.
    expect(
      overlappingFilterColumns(stored(["Penjualan", "Cabang"]), [barOn(S1, 1), kpiOn(S2)], sheets),
    ).toEqual(["Cabang"]);
  });
});
