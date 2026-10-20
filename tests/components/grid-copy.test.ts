import { describe, expect, it } from "vitest";
import { sourceText } from "@/components/grid/grid-cell-panel";
import {
  COPY_MAX_ROWS,
  defaultDecimal,
  excelValue,
  rowsToTsv,
  type CopyColumn,
} from "@/components/grid/grid-copy";
import { FORMULA_START } from "@/features/exports/sql";

/* T-045 AC2–3: nilai salinan terbaca Excel, netralisasi formula hanya untuk teks, TSV + judul. */
describe("excelValue", () => {
  it("angka tanpa pemisah ribuan, desimal sesuai pilihan, negatif tidak diubah", () => {
    expect(excelValue(1234567.89, "decimal", ",")).toBe("1234567,89");
    expect(excelValue(1234567.89, "decimal", ".")).toBe("1234567.89");
    expect(excelValue(-1500, "integer", ",")).toBe("-1500");
    expect(excelValue(-0.5, "decimal", ",")).toBe("-0,5");
    expect(excelValue(1e21, "decimal", ".")).toBe("1000000000000000000000");
    expect(excelValue(1e-7, "decimal", ",")).toBe("0,0000001");
    expect(excelValue(null, "integer", ",")).toBe("");
  });

  it("tanggal ISO, tanggal & jam dengan spasi, durasi [h]:mm:ss, Ya/Tidak", () => {
    expect(excelValue("2026-03-05", "date", ",")).toBe("2026-03-05");
    expect(excelValue("2026-03-05T08:30:15", "timestamp", ",")).toBe("2026-03-05 08:30:15");
    expect(excelValue(90_061, "duration", ",")).toBe("25:01:01");
    expect(excelValue(-61, "duration", ",")).toBe("-0:01:01");
    expect(excelValue(true, "boolean", ",")).toBe("Ya");
    expect(excelValue(false, "boolean", ",")).toBe("Tidak");
  });

  it("teks berawalan = + - @ tab CR dinetralkan dengan ', teks lain apa adanya", () => {
    for (const t of ["=1+1", "+62812", "-5", "@SUM(A1)", "\tx", "\rx"]) {
      expect(excelValue(t, "text", ",")).toBe(`'${t}`);
    }
    expect(excelValue("Jakarta", "text", ",")).toBe("Jakarta");
    expect(excelValue("a=b", "text", ",")).toBe("a=b");
  });

  it("aturan awalan formula sama dengan ekspor CSV (D14)", () => {
    for (const t of ["=", "+", "-", "@", "\t", "\r", "a", "1", " ="]) {
      expect(excelValue(t, "text", ",").startsWith("'")).toBe(FORMULA_START.test(t));
    }
  });
});

describe("rowsToTsv", () => {
  const cols: CopyColumn[] = [
    { id: "c1", name: "Kota", type: "text" },
    { id: "c2", name: "Jumlah", type: "decimal" },
    { id: "c3", name: "Tanggal", type: "date" },
  ];

  it("baris judul + baris, tab sebagai pemisah, CRLF antar baris", () => {
    const tsv = rowsToTsv(
      cols,
      [
        { c1: "=HYPERLINK(1)", c2: -1234.5, c3: "2026-03-01" },
        { c1: null, c2: null, c3: null },
      ],
      ",",
    );
    expect(tsv).toBe("Kota\tJumlah\tTanggal\r\n'=HYPERLINK(1)\t-1234,5\t2026-03-01\r\n\t\t");
  });

  it("teks bertab/baris baru/kutip dikutip gaya Excel; judul berawalan = dinetralkan", () => {
    const tsv = rowsToTsv(
      [{ id: "c1", name: "=Nama", type: "text" }],
      [{ c1: 'a\tb "c"\nd' }],
      ".",
    );
    expect(tsv).toBe(`'=Nama\r\n"a\tb ""c""\nd"`);
  });

  it("batas salin 1.000 baris", () => {
    expect(COPY_MAX_ROWS).toBe(1000);
  });
});

describe("defaultDecimal dan sumber sel", () => {
  it("bahasa peramban menentukan koma/titik", () => {
    expect(defaultDecimal("id-ID")).toBe(",");
    expect(defaultDecimal("en-US")).toBe(".");
    expect(defaultDecimal("bukan-locale-!!")).toMatch(/^[,.]$/);
  });

  it("'file · baris N · periode', periode hanya bila ada", () => {
    expect(sourceText({ fileName: "maret-2026.xlsx", srcRow: 1234, period: "Maret 2026" })).toBe(
      "maret-2026.xlsx · baris 1.234 · Maret 2026",
    );
    expect(sourceText({ fileName: "a.csv", srcRow: 2, period: null })).toBe("a.csv · baris 2");
  });
});
