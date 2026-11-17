import { describe, expect, it } from "vitest";
import { alsoFilters } from "@/components/dashboards/filter-columns-settings";
import type { FilterColumnView, SourceSheet } from "@/features/dashboards/service";

/* T-4q8n (review T-k2ec #6): kolom filter bernama sama di sheet lain ikut menyaring widget sheet itu. */
const src = (name: string, cols: [string, SourceSheet["columns"][number]["type"]][]) =>
  ({
    id: name,
    name,
    columns: cols.map(([n, type], i) => ({ pos: i + 1, name: n, type })),
  }) as SourceSheet;
const col = (sheet: string, column: string, type: FilterColumnView["type"]): FilterColumnView => ({
  key: `${sheet}\u0000${column}`,
  sheet,
  column,
  type,
  available: true,
});

describe("alsoFilters", () => {
  const sources = [
    src("Penjualan", [
      ["Cabang", "text"],
      ["Omzet", "decimal"],
    ]),
    src("Target", [
      ["cabang ", "text"],
      ["Omzet", "text"],
    ]),
    src("Biaya", [["Wilayah", "text"]]),
  ];
  it("sheet lain dengan nama kolom sama (ternormalisasi) dan kelompok tipe sama", () => {
    expect(alsoFilters(col("Penjualan", "Cabang", "text"), sources)).toEqual(["Target"]);
  });
  it("tipe berbeda kelompok tidak ikut; sheet sumber sendiri tidak disebut", () => {
    expect(alsoFilters(col("Penjualan", "Omzet", "decimal"), sources)).toEqual([]);
    expect(alsoFilters(col("Biaya", "Wilayah", "text"), sources)).toEqual([]);
  });
});

describe("filter-columns-store (review T-4q8n #7)", () => {
  it("jawaban simpan dipakai sampai props baru dari server tiba", async () => {
    const { knownColumns, rememberSavedColumns } =
      await import("@/components/dashboards/filter-columns-store");
    const props = [col("Penjualan", "Cabang", "text")];
    const saved = [...props, col("Target", "Wilayah", "text")];
    expect(knownColumns("d1", props)).toBe(props);
    rememberSavedColumns("d1", props, saved);
    expect(knownColumns("d1", props)).toBe(saved);
    const fresh = [...saved];
    expect(knownColumns("d1", fresh)).toBe(fresh);
    expect(knownColumns("d2", props)).toBe(props);
  });
});
