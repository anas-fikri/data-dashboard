import { describe, expect, it } from "vitest";
import { absentText, bodyState, chartEmpty } from "@/components/widgets/body-state";
import type { WidgetData } from "@/components/widgets/widget-query";

/*
 * T-014 AC 3: widget yang memakai kolom kosong (absent) — catatan redup "Kolom “X” kosong di versi data
 * ini." dan grafik yang ukurannya kosong semua = "Tidak ada data" (bukan batang/irisan nol).
 */
const data = (rows: unknown[][], absent?: string[]): WidgetData => ({
  columns: [],
  rows,
  ...(absent ? { absent } : {}),
});

describe("absentText", () => {
  it("satu, dua, dan tiga kolom", () => {
    expect(absentText(["Diskon"])).toBe("Kolom “Diskon” kosong di versi data ini.");
    expect(absentText(["Diskon", "Kantor"])).toBe(
      "Kolom “Diskon” dan “Kantor” kosong di versi data ini.",
    );
    expect(absentText(["A", "B", "C"])).toBe("Kolom “A”, “B”, dan “C” kosong di versi data ini.");
  });
});

describe("chartEmpty", () => {
  it("tanpa baris → kosong; tanpa kolom absent, nilai 0 tetap data", () => {
    expect(chartEmpty(data([]))).toBe(true);
    expect(chartEmpty(data([["Jakarta", 0]]))).toBe(false);
  });

  it("ukuran di kolom absent: semua null/0 → kosong; dimensi absent dengan jumlah baris → tetap grafik", () => {
    expect(
      chartEmpty(
        data(
          [
            ["Jakarta", 0],
            ["Bandung", null],
          ],
          ["Diskon"],
        ),
      ),
    ).toBe(true);
    expect(chartEmpty(data([["Jakarta", "0"]], ["Diskon"]))).toBe(true);
    expect(chartEmpty(data([[null, 120]], ["Kantor"]))).toBe(false);
  });
});

describe("bodyState untuk grafik", () => {
  it("grafik yang ukurannya kosong semua → none (tanpa tombol tabel data); KPI/tabel tetap rows", () => {
    const state = { status: "ok" as const, data: data([["Jakarta", 0]], ["Diskon"]) };
    expect(bodyState(state, false, true)).toBe("none");
    expect(bodyState(state, false)).toBe("rows");
  });
});
