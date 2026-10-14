import { describe, expect, it } from "vitest";
import {
  filterKey,
  oneControlPerName,
  parseFilterParam,
  sanitize,
  SELECTED_MAX,
  type DashFilter,
  type FilterColumnView,
  type FilterValue,
} from "@/components/dashboards/filters/filter-model";
import { filterText, parseNumber } from "@/components/dashboards/filters/filter-text";
import { slicerModel, type SlicerInput } from "@/components/dashboards/filters/slicer-model";
import { bodyState } from "@/components/widgets/body-state";

/* T-012 review putaran 1: mode kecualikan (not_in), satu kontrol per nama, angka, data basi. */

const col = (column: string, sheet = "Transaksi", available = true): FilterColumnView => ({
  key: `${sheet.toLowerCase()}\u0000${column.toLowerCase()}`,
  sheet,
  column,
  type: "text",
  available,
});
const values = (n: number) => Array.from({ length: n }, (_, i) => `K${String(i).padStart(4, "0")}`);
const slicer = (over: Partial<SlicerInput>) =>
  slicerModel({
    column: "Kode",
    value: undefined,
    allMode: false,
    results: values(6),
    truncated: false,
    searching: false,
    ...over,
  });

describe("mode kecualikan (not_in)", () => {
  it("URL, sanitize, kunci, dan teks chip", () => {
    const f: DashFilter = { column: "cabang", op: "not_in", values: ["Jakarta", "Jakarta", null] };
    const state = parseFilterParam(JSON.stringify({ filters: [f] }));
    expect(state.filters).toHaveLength(1);
    const clean = sanitize(state, { columns: [col("Cabang")], crossColumns: [], widgetIds: [] });
    expect(clean.filters).toEqual([{ column: "Cabang", op: "not_in", values: ["Jakarta", null] }]);
    expect(filterKey(f)).not.toBe(filterKey({ ...f, op: "in" }));
    expect(filterText({ column: "Cabang", op: "not_in", values: ["Jakarta"] })).toBe(
      "Kecuali Jakarta",
    );
    expect(
      parseFilterParam(JSON.stringify({ filters: [{ column: "C", op: "not_in", values: [] }] })),
    ).toEqual({ filters: [] });
  });

  it("Pilih semua (tanpa kata cari) → semua tercentang tanpa filter; lepas satu → not_in", () => {
    const all = slicer({}).selectAll;
    expect(all).toMatchObject({ label: "Pilih semua", next: null, allMode: true, blocked: null });
    const m = slicer({ allMode: true });
    expect(m.exclude).toBe(true);
    expect(m.isOn("K0002")).toBe(true);
    expect(m.toggle("K0002")).toEqual({ column: "Kode", op: "not_in", values: ["K0002"] });
    const ex = slicer({ value: { column: "Kode", op: "not_in", values: ["K0002"] } });
    expect(ex.isOn("K0002")).toBe(false);
    expect(ex.summary).toBe("Semua kecuali 1 nilai.");
    // Centang lagi yang terakhir dikecualikan → kembali "Semua" (tanpa filter).
    expect(ex.toggle("K0002")).toBeNull();
  });

  it("daftar terpotong (> 1.000 nilai): Pilih semua tetap = semua nilai, tidak dibatasi 500", () => {
    const m = slicer({ results: values(1000), truncated: true });
    expect(m.selectAll).toMatchObject({ next: null, allMode: true, blocked: null, off: false });
    const ex = slicer({ results: values(1000), truncated: true, allMode: true });
    expect(ex.toggle("K0001")).toEqual({ column: "Kode", op: "not_in", values: ["K0001"] });
  });

  it("Pilih semua hasil tidak pernah diam-diam memotong ke 500", () => {
    // Hasil pencarian belum lengkap → nonaktif dengan alasan.
    const cut = slicer({ results: values(1000), truncated: true, searching: true });
    expect(cut.selectAll.label).toBe("Pilih semua hasil");
    expect(cut.selectAll.blocked).toMatch(/belum lengkap/);
    // Lengkap tetapi > 500 → nonaktif, menawarkan mode kecualikan.
    const many = slicer({ results: values(600), searching: true });
    expect(many.selectAll.blocked).toMatch(/Pilih semua/);
    // ≤ 500 → semua hasil ditambahkan utuh.
    const few = slicer({
      results: values(3),
      searching: true,
      value: { column: "Kode", op: "in", values: ["X"] },
    });
    expect(few.selectAll.blocked).toBeNull();
    expect(few.selectAll.next).toEqual({ column: "Kode", op: "in", values: ["X", ...values(3)] });
  });

  it("batas 500: hanya centang yang menambah daftar yang dikunci", () => {
    const full = values(SELECTED_MAX) as FilterValue[];
    const inc = slicer({ value: { column: "Kode", op: "in", values: full } });
    expect(inc.full).toBe(true);
    expect(inc.locked("baru")).toBe(true);
    expect(inc.locked(full[0]!)).toBe(false);
    const ex = slicer({ value: { column: "Kode", op: "not_in", values: full } });
    expect(ex.locked("baru")).toBe(true);
    expect(ex.fullText).toMatch(/dikecualikan/);
  });
});

describe("satu kontrol per nama kolom", () => {
  it("nama sama dari sheet lain tidak menjadi kontrol kedua; yang tersedia didahulukan", () => {
    const a = col("Cabang", "Transaksi", false);
    const b = col(" cabang ", "Target");
    const c = col("Status");
    expect(oneControlPerName([a, b, c])).toEqual([b, c]);
  });
});

describe("angka ketikan", () => {
  it("'0.500' = 0,5 (bukan 500); ribuan tetap", () => {
    expect(parseNumber("0.500")).toBe(0.5);
    expect(parseNumber("0.123")).toBe(0.123);
    expect(parseNumber("-0.250")).toBe(-0.25);
    expect(parseNumber("1.500")).toBe(1500);
    expect(parseNumber("12.345.678")).toBe(12_345_678);
  });

  it("chip memuat batas apa adanya (tidak dibulatkan ke 6 desimal)", () => {
    expect(filterText({ column: "R", op: "range", gte: 0.1234567 }, "decimal")).toBe("≥ 0,1234567");
  });
});

describe("data lama setelah query gagal", () => {
  it("tabel menampilkan data lama hanya bila filternya sama", () => {
    const data = { columns: [], rows: [[1]] };
    const err = { status: "error" as const, code: "QUERY_TIMEOUT", message: "x", data };
    expect(bodyState(err, true)).toBe("rows");
    expect(bodyState(err, false)).toBe("none");
  });
});
