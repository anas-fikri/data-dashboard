import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  CsvFormatError,
  detectDelimiter,
  detectEncoding,
  sampleRecords,
  scanCsv,
} from "@/features/ingest/csv-sniff";
import { columnNames, guessHeaderRow, headerText } from "@/features/ingest/header";
import { rawText } from "@/features/ingest/raw-writer";

const tmp = mkdtempSync(join(tmpdir(), "dd-ingest-pure-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("header", () => {
  it("melewati judul (1 sel) dan baris data (angka/tanggal), memilih baris label", () => {
    const sample = [
      { row: 1, vals: ["Laporan Penjualan Oktober"] },
      { row: 3, vals: ["Dicetak 01/10/2026"] },
      { row: 4, vals: ["No Resi", "Tanggal", "Ongkir", "Kota", "Kota", null] },
      {
        row: 5,
        vals: ["PCP001", new Date(Date.UTC(2026, 0, 1)), 12000, "Jakarta", "Bandung", "x"],
      },
    ];
    expect(guessHeaderRow(sample)).toBe(4);
  });

  it("header dengan banyak nama duplikat tetap terpilih (bukan baris data pertama)", () => {
    const header = [
      "No Resi",
      "Tanggal",
      ...Array.from({ length: 20 }, () => "Keterangan"),
      "Kota",
      "",
    ];
    const data = (i: number) => [
      `PCP${i}`,
      new Date(Date.UTC(2026, 0, i)),
      ...Array.from({ length: 20 }, (_, k) => `teks unik ${i}-${k}`),
      i % 2 ? "Jakarta" : "Medan",
      1000 * i,
    ];
    const sample = [
      { row: 1, vals: ["Judul laporan"] },
      { row: 3, vals: header },
      { row: 4, vals: data(1) },
      { row: 5, vals: data(2) },
    ];
    expect(guessHeaderRow(sample)).toBe(3);
  });

  it("sheet seluruhnya teks: header (baris paling awal) menang saat skor sama", () => {
    expect(
      guessHeaderRow([
        { row: 1, vals: ["Nama", "Kota"] },
        { row: 2, vals: ["Ani", "Bandung"] },
      ]),
    ).toBe(1);
  });

  it("tanpa header (semua angka) → baris terisi pertama yang cukup lebar", () => {
    expect(
      guessHeaderRow([
        { row: 2, vals: [1, 2, 3] },
        { row: 3, vals: [4, 5, 6] },
      ]),
    ).toBe(2);
    expect(guessHeaderRow([])).toBe(1);
  });

  it("nama kolom: kosong → kolom_<pos>, duplikat tidak peka kapital → _2/_3, nama asli apa adanya", () => {
    const cols = columnNames(["Total", " total ", "", 'Harga "net";\nPPN', "Total_2", null], 7);
    expect(cols.map((c) => c.name)).toEqual([
      "Total",
      "total_2",
      "kolom_3",
      'Harga "net"; PPN',
      "Total_2_2",
      "kolom_6",
      "kolom_7",
    ]);
    expect(cols[1]!.original).toBe(" total ");
    expect(cols[3]!.original).toBe('Harga "net";\nPPN');
    expect(columnNames(["Total", " total "], 2)).toEqual(columnNames(["Total", " total "], 2)); // deterministik
  });

  it("teks header dari angka/tanggal", () => {
    expect(headerText(2026)).toBe("2026");
    expect(headerText(new Date(Date.UTC(2026, 4, 1)))).toBe("2026-05-01");
  });
});

describe("raw text", () => {
  it("tanggal naive ISO; angka dan boolean jadi teks; string kosong = NULL", () => {
    expect(rawText(new Date(Date.UTC(2026, 0, 2)))).toBe("2026-01-02");
    expect(rawText(new Date(Date.UTC(2026, 0, 2, 13, 5, 9)))).toBe("2026-01-02T13:05:09");
    expect(rawText(1234.5)).toBe("1234.5");
    expect(rawText(true)).toBe("TRUE");
    expect(rawText("")).toBeNull();
    expect(rawText(Number.NaN)).toBeNull();
  });
});

describe("sniff CSV", () => {
  it("encoding: UTF-8 (dengan/ tanpa BOM), Windows-1252, UTF-16 ditolak", () => {
    expect(detectEncoding(new TextEncoder().encode("a;b\ncafé;2\n"))).toEqual({
      encoding: "utf-8",
      bom: false,
    });
    expect(detectEncoding(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]))).toEqual({
      encoding: "utf-8",
      bom: true,
    });
    expect(detectEncoding(Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x0a]))).toEqual({
      encoding: "windows-1252",
      bom: false,
    });
    // multi-byte terpotong di ujung sampel tetap UTF-8
    expect(detectEncoding(new TextEncoder().encode("abc café").subarray(0, 8)).encoding).toBe(
      "utf-8",
    );
    expect(() => detectEncoding(Uint8Array.from([0xff, 0xfe, 0x61, 0]))).toThrow(CsvFormatError);
  });

  it("delimiter dari modus jumlah field (judul lebih sempit tidak mengacaukan)", () => {
    expect(detectDelimiter("Laporan bulanan\n\nNo;Nama;Nilai\n1;A;1,5\n2;B;2,5\n")).toBe(";");
    expect(detectDelimiter('a,b,c\n1,"x,y",3\n')).toBe(",");
    expect(detectDelimiter("a\tb\n1\t2\n")).toBe("\t");
    expect(sampleRecords('a,"b ""q"" c",d\r\n1,"multi\nline",3\n', ",")).toEqual([
      ["a", 'b "q" c', "d"],
      ["1", "multi\nline", "3"],
    ]);
  });

  it("scanCsv: kolom maksimum, record, posisi baris kosong; kutip berisi baris baru", async () => {
    const p = join(tmp, "a.csv");
    writeFileSync(p, 'Judul\n\nNo;Nama;"Catatan\nmulti"\n1;A;x\n\n2;B;y;z');
    const s = await scanCsv(p, ";", 16_384);
    expect(s).toMatchObject({ maxFields: 4, records: 4, blanksBefore: [1, 3], utf8: true, crOnly: false });
    await expect(scanCsv(p, ";", 3)).rejects.toThrow(/lebih dari 3 kolom/);
  });
});
