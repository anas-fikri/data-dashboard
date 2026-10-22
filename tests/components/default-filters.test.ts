import { describe, expect, it } from "vitest";
import {
  checkFilterColumns,
  filterColumnViews,
  storedFilterColumns,
  type ActiveSheet,
  type FilterColumnView,
} from "@/features/dashboards/filter-columns";
import {
  defaultState,
  filterUrlValue,
  isDefaultFilter,
  isDefaultState,
  type DashFilter,
} from "@/components/dashboards/filters/filter-model";

/*
 * T-vb7q: filter bawaan per kolom filter — validasi simpan (cocok dengan kolomnya, ≤ 100 nilai), baca
 * toleran, status bawaan saat dibuka tanpa ?f=, dan nilai ?f= yang ditulis (sama dengan bawaan → tanpa f;
 * kosong padahal ada bawaan → "{}").
 */
const col = (pos: number, name: string, type: string, extra: object = {}) => ({
  pos,
  name,
  original: name,
  type,
  hidden: false,
  nullPct: 0,
  distinctCount: 0,
  castFailCount: 0,
  ...extra,
});
const SHEETS = [
  {
    id: "s1",
    name: "Penjualan",
    schema: [
      col(1, "Cabang", "text"),
      col(2, "Tanggal", "date"),
      col(3, "Omzet", "decimal"),
      col(4, "Periode", "date", { system: "period" }),
    ],
  },
] as ActiveSheet[];

const thisMonth: DashFilter = { column: "Tanggal", op: "preset", preset: "this_month" };
const jakarta: DashFilter = { column: "Cabang", op: "in", values: ["Jakarta"] };

describe("checkFilterColumns: bawaan", () => {
  it("bawaan yang cocok disimpan dengan nama kolom terkini", () => {
    expect(
      checkFilterColumns(
        [
          { sheet: "penjualan", column: "tanggal", default: { ...thisMonth, column: "TANGGAL" } },
          { sheet: "Penjualan", column: "Cabang", default: jakarta },
          {
            sheet: "Penjualan",
            column: "Omzet",
            default: { column: "Omzet", op: "range", gte: 10 },
          },
          {
            sheet: "Penjualan",
            column: "Periode",
            default: { column: "Periode", op: "preset", preset: "latest_period" },
          },
        ],
        SHEETS,
      ),
    ).toEqual({
      ok: true,
      columns: [
        { sheet: "Penjualan", column: "Tanggal", default: thisMonth },
        { sheet: "Penjualan", column: "Cabang", default: jakarta },
        { sheet: "Penjualan", column: "Omzet", default: { column: "Omzet", op: "range", gte: 10 } },
        {
          sheet: "Penjualan",
          column: "Periode",
          default: { column: "Periode", op: "preset", preset: "latest_period" },
        },
      ],
    });
  });

  it.each([
    [
      "preset di kolom teks",
      {
        sheet: "Penjualan",
        column: "Cabang",
        default: { column: "Cabang", op: "preset", preset: "ytd" },
      },
    ],
    [
      "pilih nilai di kolom tanggal",
      {
        sheet: "Penjualan",
        column: "Tanggal",
        default: { column: "Tanggal", op: "in", values: ["x"] },
      },
    ],
    [
      "rentang teks di kolom angka",
      {
        sheet: "Penjualan",
        column: "Omzet",
        default: { column: "Omzet", op: "range", gte: "2026-01-01" },
      },
    ],
    [
      "Periode terbaru di kolom tanggal biasa",
      {
        sheet: "Penjualan",
        column: "Tanggal",
        default: { column: "Tanggal", op: "preset", preset: "latest_period" },
      },
    ],
    [
      "kolom bawaan berbeda",
      { sheet: "Penjualan", column: "Cabang", default: { ...jakarta, column: "Omzet" } },
    ],
  ])("%s → ditolak", (_name, item) => {
    const r = checkFilterColumns([item], SHEETS);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.message).toContain("tidak cocok");
  });

  it("lebih dari 100 nilai → ditolak dengan pesan batas", () => {
    const values = Array.from({ length: 101 }, (_, i) => `C${i}`);
    const r = checkFilterColumns(
      [{ sheet: "Penjualan", column: "Cabang", default: { column: "Cabang", op: "in", values } }],
      SHEETS,
    );
    expect(!r.ok && r.message).toContain("paling banyak 100 nilai");
  });

  it("bentuk bawaan rusak → daftar tidak valid", () => {
    expect(
      checkFilterColumns([{ sheet: "Penjualan", column: "Cabang", default: { op: "in" } }], SHEETS),
    ).toMatchObject({ ok: false, message: "Daftar kolom filter tidak valid." });
  });
});

describe("storedFilterColumns / filterColumnViews: bawaan", () => {
  it("bawaan rusak di DB → kolom tetap, tanpa bawaan", () => {
    expect(
      storedFilterColumns([{ sheet: "Penjualan", column: "Cabang", default: { op: "nope" } }]),
    ).toEqual([{ sheet: "Penjualan", column: "Cabang" }]);
  });

  it("bawaan yang tidak cocok lagi (tipe kolom diubah) tidak dikirim; kolom lain tetap bisa disimpan", () => {
    const stored = [
      {
        sheet: "Penjualan",
        column: "Tanggal",
        default: { column: "Tanggal", op: "in" as const, values: ["Jakarta"] },
      },
      { sheet: "Penjualan", column: "Cabang", default: jakarta },
    ];
    const views = filterColumnViews(stored, SHEETS);
    expect(views[0]).not.toHaveProperty("default");
    expect(views[1]).toMatchObject({ default: jakarta });
    // Klien mengirim ulang tampilan (tanpa bawaan basi) + kolom baru → diterima.
    const resend = [
      ...views.map((v) => ({
        sheet: v.sheet,
        column: v.column,
        ...(v.default ? { default: v.default } : {}),
      })),
      { sheet: "Penjualan", column: "Omzet" },
    ];
    expect(checkFilterColumns(resend, SHEETS)).toMatchObject({ ok: true });
  });

  it("tampilan membawa bawaan dengan nama kolom terkini", () => {
    const [v] = filterColumnViews(
      [{ sheet: "Penjualan", column: "cabang", default: { ...jakarta, column: "cabang" } }],
      SHEETS,
    );
    expect(v).toMatchObject({ column: "Cabang", default: jakarta });
  });
});

const view = (
  column: string,
  type: FilterColumnView["type"],
  d?: DashFilter,
): FilterColumnView => ({
  key: column,
  sheet: "Penjualan",
  column,
  type,
  available: true,
  ...(d ? { default: d } : {}),
});

describe("status bawaan di klien", () => {
  const columns = [
    view("Tanggal", "date", thisMonth),
    view("Cabang", "text", jakarta),
    view("Omzet", "decimal"),
  ];
  const defaults = defaultState(columns);

  it("defaultState: bawaan kolom yang tersedia; kolom tidak tersedia atau tanpa bawaan dilewati", () => {
    expect(defaults).toEqual({ filters: [thisMonth, jakarta] });
    expect(defaultState([{ ...columns[0]!, available: false }])).toEqual({ filters: [] });
  });

  it("isDefaultFilter: sama persis (urutan nilai bebas) → true; nilai lain → false", () => {
    expect(isDefaultFilter({ column: "cabang", op: "in", values: ["Jakarta"] }, columns)).toBe(
      true,
    );
    expect(isDefaultFilter({ column: "Cabang", op: "in", values: ["Bandung"] }, columns)).toBe(
      false,
    );
    expect(isDefaultFilter({ column: "Omzet", op: "range", gte: 1 }, columns)).toBe(false);
  });

  it("filterUrlValue: sama dengan bawaan → tanpa f; kosong → {}; lain → JSON", () => {
    expect(filterUrlValue({ filters: [jakarta, thisMonth] }, defaults)).toBe("");
    expect(filterUrlValue({ filters: [] }, defaults)).toBe("{}");
    expect(filterUrlValue({ filters: [jakarta] }, defaults)).toBe(
      JSON.stringify({ filters: [jakarta] }),
    );
    // Tanpa bawaan: perilaku lama (kosong = tanpa f).
    expect(filterUrlValue({ filters: [] }, { filters: [] })).toBe("");
  });

  it("filterUrlValue: bawaan + saringan pivot → f tetap ditulis (pivot tidak hilang)", () => {
    const pivot = {
      ["p".repeat(24)]: [
        { field: "row0" as const, column: "Cabang", op: "in" as const, values: ["A"] },
      ],
    };
    expect(filterUrlValue({ filters: [thisMonth, jakarta], pivot }, defaults)).not.toBe("");
  });

  it("isDefaultState: filter silang membuat status berbeda dari bawaan", () => {
    expect(
      isDefaultState(
        { filters: [thisMonth, jakarta], cross: { widgetId: "w".repeat(24), filter: jakarta } },
        defaults,
      ),
    ).toBe(false);
  });
});
