import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pivotGrid, writePivotCsv } from "@/features/exports/pivot";
import type { PivotData } from "@/features/query/pivot";
import { pivotTable } from "@/features/widgets/pivot-table";
import { parseCsv } from "./fixtures";

/* T-9bc2: grid ekspor pivot — kolom label per kolom baris, subtotal, Total, catatan batas, CSV aman. */
const dir = mkdtempSync(join(tmpdir(), "dd-pivot-grid-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const two = (over: Partial<PivotData> = {}): PivotData => ({
  rowFields: [
    { label: "Customer", type: "text" },
    { label: "Layanan", type: "text" },
  ],
  columnField: { label: "Tanggal", type: "date", grain: "month" },
  values: [{ label: "Total No.", type: "integer" }],
  rows: [
    { labels: ["=Alfa", "Darat"], group: 0 },
    { labels: ["=Alfa", "Laut"], group: 0 },
  ],
  groups: ["=Alfa"],
  columns: ["2026-01-01"],
  cells: [[[5]], [[7]]],
  subtotals: [[[12]]],
  rowTotals: [[5], [7]],
  subtotalTotals: [[12]],
  columnTotals: [[12]],
  grandTotal: [12],
  rowCount: 300,
  columnCount: 1,
  ...over,
});

describe("pivotGrid", () => {
  it("dua kolom baris: label kelompok diulang, baris Subtotal, Total, catatan batas", () => {
    const g = pivotGrid(pivotTable(two()), ["Customer", "Layanan"]);
    expect(g.columns.map((c) => [c.label, c.kind])).toEqual([
      ["Customer", "text"],
      ["Layanan", "text"],
      ["Jan 2026", "number"],
      ["Total No.", "number"],
    ]);
    expect(g.rows).toEqual([
      ["=Alfa", "Subtotal", 12, 12],
      ["=Alfa", "Darat", 5, 5],
      ["=Alfa", "Laut", 7, 7],
      ["Total", null, 12, 12],
      ["Menampilkan 2 dari 300 baris. Persempit dengan filter; total tetap mencakup semua data."],
    ]);
  });

  it("tanpa subtotal: baris kelompok tidak ditulis (labelnya ada di baris rincian)", () => {
    const g = pivotGrid(pivotTable(two({ subtotals: null, subtotalTotals: null })), [
      "Customer",
      "Layanan",
    ]);
    expect(g.rows.slice(0, 2)).toEqual([
      ["=Alfa", "Darat", 5, 5],
      ["=Alfa", "Laut", 7, 7],
    ]);
  });

  it("nilai tanggal (Terkecil/Terbesar): Date untuk XLSX, YYYY-MM-DD / tanpa T di CSV", async () => {
    const data = two({
      values: [
        { label: "Terkecil Tanggal", type: "date" },
        { label: "Terbesar Waktu", type: "timestamp" },
      ],
      columnField: null,
      columns: [],
      cells: [[["2026-01-05", "2026-01-05T08:30:00"]], [[null, null]]],
      subtotals: null,
      subtotalTotals: null,
      rowTotals: null,
      columnTotals: null,
      grandTotal: ["2026-01-05", "2026-01-05T08:30:00"],
      rowCount: 2,
    });
    const g = pivotGrid(pivotTable(data), ["Customer", "Layanan"]);
    expect(g.columns.slice(2).map((c) => c.kind)).toEqual(["date", "timestamp"]);
    expect(g.rows[0]).toEqual([
      "=Alfa",
      "Darat",
      new Date("2026-01-05T00:00:00Z"),
      new Date("2026-01-05T08:30:00Z"),
    ]);
    const out = join(dir, "d.csv");
    await writePivotCsv(out, g);
    expect(readFileSync(out, "utf8")).toContain(`"'=Alfa","Darat",2026-01-05,2026-01-05 08:30:00`);
  });

  it("CSV: BOM + header, teks dikutip dan dinetralkan, angka apa adanya, null kosong", async () => {
    const out = join(dir, "p.csv");
    const g = pivotGrid(pivotTable(two()), ["Customer", "Layanan"]);
    expect(await writePivotCsv(out, g)).toBe(5);
    const text = readFileSync(out, "utf8");
    expect(text.startsWith("﻿")).toBe(true);
    expect(text).toContain(`"'=Alfa","Subtotal",12,12`);
    expect(text).toContain(`"Total",,12,12`);
    expect(parseCsv(text.slice(1))[0]).toEqual(["Customer", "Layanan", "Jan 2026", "Total No."]);
  });
});
