import { describe, expect, it } from "vitest";
import type { SourceSheet } from "@/features/dashboards/service";
import { relayout, starterPlan } from "@/features/dashboards/starter";
import { GRID_COLS } from "@/features/dashboards/validation";

/*
 * T-zm9k: rencana dashboard contoh dari skema — dataset bertanggal + angka + kategori → ≥ 4 widget dan
 * ≥ 2 kolom filter; tanpa angka/tanggal → KPI jumlah baris + tabel. Tata letak tidak tumpang tindih
 * dan di dalam 12 kolom.
 */
type Col = SourceSheet["columns"][number];
const col = (pos: number, name: string, type: Col["type"], extra: Partial<Col> = {}): Col => ({
  pos,
  name,
  type,
  ...extra,
});

const FULL: SourceSheet = {
  id: "cmv4kljx40009oczvdmpurrs1",
  name: "Pengiriman",
  columns: [
    col(1, "No", "integer", { distinct: 500, filled: 500 }),
    col(2, "Tanggal Kirim", "date", { distinct: 90, filled: 500 }),
    col(3, "Cabang", "text", { distinct: 6, filled: 500 }),
    col(4, "Layanan", "text", { distinct: 3, filled: 500 }),
    col(5, "No Resi", "text", { distinct: 500, filled: 500 }),
    col(6, "Omzet", "decimal", { distinct: 480, filled: 500 }),
  ],
};

function overlaps(items: { x: number; y: number; w: number; h: number }[]) {
  return items.some((a, i) =>
    items.some(
      (b, j) => i < j && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
    ),
  );
}

describe("starterPlan", () => {
  it("tanggal + angka + kategori → KPI total & jumlah baris, garis, batang, tabel; filter tanggal + kategori", () => {
    const plan = starterPlan([FULL]);
    expect(plan.widgets.map((w) => w.type)).toEqual(["kpi", "kpi", "line", "bar", "table"]);
    expect(plan.widgets.map((w) => w.title)).toEqual([
      "Total Omzet",
      "Jumlah baris",
      expect.stringContaining("Tanggal Kirim"),
      expect.stringContaining("Cabang"),
      "Data Pengiriman",
    ]);
    // Ukuran = Omzet (bukan No.), kategori = Cabang (bukan No Resi 500 nilai unik).
    expect(plan.widgets[0]!.spec).toMatchObject({ measure: { agg: "sum", column: 6 } });
    expect(plan.widgets[3]!.spec).toMatchObject({ dimension: { column: 3 } });
    expect(plan.filterColumns).toEqual([
      { sheet: "Pengiriman", column: "Tanggal Kirim" },
      { sheet: "Pengiriman", column: "Cabang" },
      { sheet: "Pengiriman", column: "Layanan" },
    ]);
    const layout = plan.widgets.map((w) => w.layout);
    expect(overlaps(layout)).toBe(false);
    expect(layout.every((l) => l.x >= 0 && l.x + l.w <= GRID_COLS)).toBe(true);
  });

  it("hanya teks → KPI jumlah baris + batang + tabel; tanpa angka/tanggal tetap berhasil", () => {
    const plan = starterPlan([
      {
        id: "cmv4kljx40009oczvdmpurrs2",
        name: "Daftar",
        columns: [
          col(1, "Nama", "text", { distinct: 40 }),
          col(2, "Kota", "text", { distinct: 5 }),
        ],
      },
    ]);
    expect(plan.widgets.map((w) => w.type)).toEqual(["kpi", "bar", "table"]);
    expect(plan.widgets[0]!.spec).toMatchObject({ measure: { agg: "count" } });
    expect(plan.widgets[0]!.layout.w).toBe(GRID_COLS);
    expect(plan.filterColumns.map((f) => f.column)).toEqual(["Nama", "Kota"]);
  });

  it("kolom kategori tanpa nilai yang cocok (semua unik) → KPI + tabel, tanpa filter", () => {
    const plan = starterPlan([
      {
        id: "cmv4kljx40009oczvdmpurrs3",
        name: "Kode",
        columns: [col(1, "Kode", "text", { distinct: 900 })],
      },
    ]);
    expect(plan.widgets.map((w) => w.type)).toEqual(["kpi", "table"]);
    expect(plan.filterColumns).toEqual([]);
  });

  it("tanpa sheet berkolom → rencana kosong", () => {
    expect(starterPlan([])).toEqual({ widgets: [], filterColumns: [] });
    expect(starterPlan([{ id: "s", name: "Kosong", columns: [] }])).toEqual({
      widgets: [],
      filterColumns: [],
    });
  });

  it("relayout: widget yang dibuang validasi tidak meninggalkan lubang mendatar di barisnya", () => {
    const plan = starterPlan([FULL]);
    const withoutLine = relayout(plan.widgets.filter((w) => w.type !== "line"));
    const bar = withoutLine.find((w) => w.type === "bar")!;
    expect(bar.layout).toMatchObject({ x: 0, w: GRID_COLS });
  });
});
