import { describe, expect, it } from "vitest";
import {
  addDays,
  crossColumnsOf,
  encodeFilterParam,
  filterKey,
  filtersFor,
  isIsoDate,
  parseFilterParam,
  sanitize,
  type FilterColumnView,
} from "@/components/dashboards/filters/filter-model";
import {
  crossFilterFor,
  dateBounds,
  dateRange,
  filterText,
  parseNumber,
} from "@/components/dashboards/filters/filter-text";
import { configVersion } from "@/components/widgets/body-state";
import { pickIndex } from "@/components/widgets/chart-option";

/* T-012: model filter dashboard di klien (URL ?f=, penyaringan kolom, filter silang, teks chip). */

const W1 = "a".repeat(25);
const W2 = "b".repeat(25);
const col = (
  column: string,
  type: FilterColumnView["type"],
  available = true,
): FilterColumnView => ({
  key: `csv\u0000${column.toLowerCase()}`,
  sheet: "CSV",
  column,
  type,
  available,
});
const COLUMNS = [
  col("Cabang", "text"),
  col("Tanggal", "date"),
  col("Omzet", "decimal"),
  col("Kota", "text", false),
];

describe("URL ?f=", () => {
  it("rusak, bukan JSON, atau bentuk salah → kosong tanpa galat", () => {
    expect(parseFilterParam(undefined)).toEqual({ filters: [] });
    expect(parseFilterParam("{bukan json")).toEqual({ filters: [] });
    expect(
      parseFilterParam(JSON.stringify({ filters: [{ column: "A", op: "eq", value: 1 }] })),
    ).toEqual({
      filters: [],
    });
    expect(parseFilterParam(JSON.stringify({ filters: [{ column: "A", op: "range" }] }))).toEqual({
      filters: [],
    });
  });

  it("bolak-balik encode/parse, termasuk filter silang dan nilai kosong (null)", () => {
    const state = {
      filters: [{ column: "Cabang", op: "in" as const, values: ["Jakarta", null] }],
      cross: { widgetId: W1, filter: { column: "Cabang", op: "in" as const, values: ["Bandung"] } },
    };
    expect(parseFilterParam(encodeFilterParam(state)!)).toEqual(state);
    expect(encodeFilterParam({ filters: [] })).toBeNull();
    expect(parseFilterParam([encodeFilterParam(state)!, "x"])).toEqual(state);
  });
});

describe("sanitize", () => {
  const opts = { columns: COLUMNS, crossColumns: ["cabang "], widgetIds: [W1] };

  it("membuang kolom yang tidak diizinkan/tidak tersedia, operasi yang tidak cocok tipe, dan ganda", () => {
    const s = sanitize(
      {
        filters: [
          { column: " cabang", op: "in", values: ["Jakarta", "Jakarta", null] },
          { column: "Cabang", op: "in", values: ["Bandung"] },
          { column: "Kota", op: "in", values: ["X"] },
          { column: "Rahasia", op: "in", values: ["X"] },
          { column: "Tanggal", op: "in", values: ["2026-01-01"] },
          { column: "Omzet", op: "range", gte: "abc" },
          { column: "Tanggal", op: "preset", preset: "ytd" },
        ],
      },
      opts,
    );
    expect(s.filters).toEqual([
      { column: "Cabang", op: "in", values: ["Jakarta", null] },
      { column: "Tanggal", op: "preset", preset: "ytd" },
    ]);
  });

  it("filter silang hanya dari widget yang ada dan kolom kategori yang diizinkan", () => {
    const filter = { column: "Cabang", op: "in" as const, values: ["Jakarta"] };
    expect(sanitize({ filters: [], cross: { widgetId: W1, filter } }, opts).cross).toBeDefined();
    expect(sanitize({ filters: [], cross: { widgetId: W2, filter } }, opts).cross).toBeUndefined();
    const other = { ...filter, column: "Kota" };
    expect(
      sanitize({ filters: [], cross: { widgetId: W1, filter: other } }, opts).cross,
    ).toBeUndefined();
  });

  it("widget sumber filter silang tidak menyaring dirinya sendiri", () => {
    const f = { column: "Cabang", op: "in" as const, values: ["Jakarta"] };
    const state = {
      filters: [{ column: "Omzet", op: "range" as const, gte: 10 }],
      cross: { widgetId: W1, filter: f },
    };
    expect(filtersFor(state, W1)).toHaveLength(1);
    expect(filtersFor(state, W2)).toEqual([...state.filters, f]);
  });

  it("kunci filter tidak bergantung urutan nilai/kunci atau besar-kecil nama kolom", () => {
    expect(filterKey({ column: "Cabang", op: "in", values: ["B", "A", "A"] })).toBe(
      filterKey({ column: "cabang", op: "in", values: ["A", "B"] }),
    );
    expect(filterKey({ column: "X", op: "in", values: [null] })).not.toBe(
      filterKey({ column: "X", op: "in", values: [""] }),
    );
  });
});

describe("filter silang dari kategori grafik", () => {
  it("nilai mentah; kosong → null; tanggal berperiode → [awal, awal periode berikutnya)", () => {
    expect(crossFilterFor("Cabang", "text", undefined, "Jakarta")).toEqual({
      column: "Cabang",
      op: "in",
      values: ["Jakarta"],
    });
    expect(crossFilterFor("Cabang", "text", undefined, null)).toEqual({
      column: "Cabang",
      op: "in",
      values: [null],
    });
    expect(crossFilterFor("Tgl", "date", "month", "2026-12-01")).toEqual({
      column: "Tgl",
      op: "range",
      gte: "2026-12-01",
      lt: "2027-01-01",
    });
    expect(crossFilterFor("Tgl", "date", "quarter", "2026-10-01")).toMatchObject({
      lt: "2027-01-01",
    });
    expect(crossFilterFor("Tgl", "date", "week", "2026-12-28")).toMatchObject({ lt: "2027-01-04" });
    expect(crossFilterFor("Tgl", "timestamp", "day", "2026-02-28T00:00:00")).toMatchObject({
      lt: "2026-03-01T00:00:00",
    });
    expect(crossFilterFor("Tgl", "date", undefined, "2026-02-28")).toEqual({
      column: "Tgl",
      op: "in",
      values: ["2026-02-28"],
    });
  });

  it("teks chip periode memakai nama periode grafik", () => {
    const f = crossFilterFor("Tgl", "date", "month", "2026-01-01")!;
    expect(filterText(f, undefined, "month")).toBe("Jan 2026");
    expect(filterText({ column: "C", op: "in", values: [null] })).toBe("(kosong)");
  });

  it("klik irisan Lainnya dan periode kosong yang diisi tidak menjadi filter", () => {
    const pie = { type: "pie" as const, labels: ["A", "B"], values: [3, 2] };
    expect(pickIndex(pie, { index: 1 })).toBe(1);
    expect(pickIndex(pie, { index: 2 })).toBeNull();
    const line = {
      type: "line" as const,
      labels: ["Jan 2026", "Mar 2026"],
      values: [1, 2],
      time: { iso: ["2026-01-01", "2026-03-01"], grain: "month" },
    };
    expect(pickIndex(line, { index: 0 })).toBe(0);
    expect(pickIndex(line, { index: 1 })).toBeNull(); // Feb 2026: diisi, bukan data
    expect(pickIndex(line, { index: 2 })).toBe(1);
  });
});

describe("rentang tanggal dan angka", () => {
  it("kolom cap waktu: hari Sampai ikut utuh (< hari berikutnya); kolom tanggal: ≤ Sampai", () => {
    expect(dateRange("T", "timestamp", "2026-01-01", "2026-10-11")).toEqual({
      column: "T",
      op: "range",
      gte: "2026-01-01",
      lt: "2026-10-12",
    });
    expect(dateRange("T", "date", "", "2026-10-11")).toEqual({
      column: "T",
      op: "range",
      lte: "2026-10-11",
    });
    expect(dateRange("T", "date", "", "")).toBeNull();
    expect(dateBounds({ column: "T", op: "range", gte: "2026-01-01", lt: "2026-03-01" })).toEqual({
      from: "2026-01-01",
      to: "2026-02-28",
    });
  });

  it("tanggal naive tanpa zona", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("angka ketikan id-ID", () => {
    expect(parseNumber("1.500.000")).toBe(1_500_000);
    expect(parseNumber("2,5")).toBe(2.5);
    expect(parseNumber("1.234,5")).toBe(1234.5);
    expect(parseNumber("-3")).toBe(-3);
    expect(parseNumber("")).toBeUndefined();
    expect(parseNumber("12a")).toBeNull();
    expect(filterText({ column: "O", op: "range", gte: 1000, lte: 5000 }, "decimal")).toBe(
      "1.000 – 5.000",
    );
    expect(filterText({ column: "O", op: "range", gte: 1000 }, "decimal")).toBe("≥ 1.000");
  });
});

describe("sakelar filter silang", () => {
  it("tidak mengubah versi isi widget (tidak memuat ulang data)", () => {
    const spec = { sheetId: "x", topN: 5 };
    expect(configVersion({ type: "bar", spec: { ...spec, crossFilter: false } })).toBe(
      configVersion({ type: "bar", spec }),
    );
  });

  it("kolom filter silang mode edit: grafik dengan crossFilter ≠ false, kolom tampil di sheetnya", () => {
    const sheetId = "s".repeat(25);
    const base = {
      sheetId,
      measure: { agg: "count" },
      sort: "value_desc",
      topN: 5,
      format: { style: "auto", decimals: 0 },
    };
    const widgets = [
      { type: "bar", spec: { ...base, dimension: { column: 1 } } },
      { type: "pie", spec: { ...base, dimension: { column: 2 }, crossFilter: false } },
      { type: "line", spec: { ...base, dimension: { column: 9 } } },
      { type: "kpi", spec: { sheetId, measure: { agg: "count" }, format: base.format } },
    ];
    const sources = [
      {
        id: sheetId,
        columns: [
          { pos: 1, name: "Cabang" },
          { pos: 2, name: "Kota" },
        ],
      },
    ];
    expect(crossColumnsOf(widgets, sources)).toEqual(["Cabang"]);
  });
});
