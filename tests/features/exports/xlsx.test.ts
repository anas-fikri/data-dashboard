import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yauzl from "yauzl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  columnRef,
  excelSerial,
  writeXlsx,
  XLSX_CELL_MAX,
  type XlsxColumn,
} from "@/features/exports/xlsx";
import { createSaxParser } from "@/lib/xlsx/parser";
import type { RawValue } from "@/lib/xlsx/types";

/*
 * T-017 E2/AC5: penulis XLSX sendiri dibaca ulang lewat parser xlsx proyek (ADR-0005) — teks berawalan
 * formula tetap string, angka/tanggal/durasi bertipe, NULL kosong, karakter ilegal XML dibuang, sel
 * > 32.767 karakter dipotong, struktur paket lengkap.
 */

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "dd-xlsx-test-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function* chunks(rows: unknown[][], size = 2): AsyncIterable<unknown[][]> {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
}

async function readBack(path: string, sheet: string): Promise<RawValue[][]> {
  const out: RawValue[][] = [];
  await createSaxParser().parse(path, { sheetNames: [sheet], tmpDir: dir }, (_s, _r, values) => {
    out.push([...values]);
  });
  return out;
}

function entries(path: string): Promise<string[]> {
  return new Promise((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("zip"));
      const names: string[] = [];
      zip.on("entry", (e: yauzl.Entry) => {
        names.push(e.fileName);
        zip.readEntry();
      });
      zip.on("end", () => resolve(names));
      zip.on("error", reject);
      zip.readEntry();
    }),
  );
}

/** Isi mentah xl/worksheets/sheet1.xml (nomor seri apa adanya, tanpa tafsiran parser proyek). */
function sheetXml(path: string): Promise<string> {
  return new Promise((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("zip"));
      zip.on("entry", (e: yauzl.Entry) => {
        if (e.fileName !== "xl/worksheets/sheet1.xml") return zip.readEntry();
        zip.openReadStream(e, (err2, s) => {
          if (err2 || !s) return reject(err2 ?? new Error("entry"));
          const parts: Buffer[] = [];
          s.on("data", (b: Buffer) => parts.push(b));
          s.on("end", () => {
            zip.close();
            resolve(Buffer.concat(parts).toString("utf8"));
          });
          s.on("error", reject);
        });
      });
      zip.on("end", () => reject(new Error("sheet1.xml tidak ada")));
      zip.on("error", reject);
      zip.readEntry();
    }),
  );
}

/** Sel per ref: { s: gaya, v: nilai <v> } atau { t: teks inlineStr }. */
function cellsOf(xml: string): Record<string, { s?: string; v?: string; t?: string }> {
  const out: Record<string, { s?: string; v?: string; t?: string }> = {};
  for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*)>(.*?)<\/c>/g)) {
    const s = /s="(\d+)"/.exec(m[2]!)?.[1];
    const v = /<v>(.*?)<\/v>/.exec(m[3]!)?.[1];
    const t = /<t[^>]*>(.*?)<\/t>/.exec(m[3]!)?.[1];
    out[m[1]!] = { ...(s ? { s } : {}), ...(v !== undefined ? { v } : {}), ...(t ? { t } : {}) };
  }
  return out;
}

const COLS: XlsxColumn[] = [
  { label: "=Nama", kind: "text" },
  { label: "Omzet", kind: "number" },
  { label: "Tanggal", kind: "date" },
  { label: "Waktu", kind: "timestamp" },
  { label: "Aktif", kind: "boolean" },
  { label: "Durasi", kind: "duration" },
  { label: "Jumlah", kind: "number" },
];

describe("writeXlsx", () => {
  it("round-trip: formula sebagai string, angka/tanggal/boolean/durasi bertipe, NULL kosong", async () => {
    const path = join(dir, "a.xlsx");
    const rows: unknown[][] = [
      [
        "=1+1",
        1.5,
        new Date(Date.UTC(2024, 0, 2)),
        new Date(Date.UTC(2024, 0, 2, 3, 4, 5)),
        true,
        3661n,
        42n,
      ],
      ["+62 812", -2, null, null, false, 90, 0n],
      ["@SUM(A1)", null, null, null, null, null, null],
      ["-tanda", 0.1, null, null, null, null, 9007199254740993n],
      ["\tTab", null, null, null, null, null, null],
      ["\rCR", null, null, null, null, null, null],
      ["<b>&amp;\"'</b>", null, null, null, null, null, null],
      ["harfiah _x0041_ tetap", null, null, null, null, null, null],
      ["  spasi di ujung  ", null, null, null, null, null, null],
      ["baris\nbaru", null, null, null, null, null, null],
    ];
    const n = await writeXlsx(path, { sheetName: "Data", columns: COLS }, chunks(rows));
    expect(n).toBe(rows.length);
    const back = await readBack(path, "Data");
    expect(back[0]).toEqual(COLS.map((c) => c.label));
    // Teks berawalan = + - @ tab CR tetap string (inlineStr), tidak diberi awalan '.
    expect(back.slice(1).map((r) => r[0])).toEqual([
      "=1+1",
      "+62 812",
      "@SUM(A1)",
      "-tanda",
      "\tTab",
      "\rCR",
      "<b>&amp;\"'</b>",
      "harfiah _x0041_ tetap",
      "  spasi di ujung  ",
      "baris\nbaru",
    ]);
    const first = back[1]!;
    expect(first[1]).toBe(1.5);
    expect(first[2]).toEqual(new Date(Date.UTC(2024, 0, 2)));
    expect((first[3] as Date).toISOString()).toBe("2024-01-02T03:04:05.000Z");
    expect(first[4]).toBe(true);
    // Durasi 3661 detik = 1:01:01 (format [h]:mm:ss bergaya tanggal; seri < 61 → teks ISO ber-T, T-065).
    expect(first[5]).toBe("1899-12-30T01:01:01");
    expect(first[6]).toBe(42);
    expect(back[2]!.slice(1, 7)).toEqual([
      -2,
      undefined,
      undefined,
      false,
      expect.stringMatching(/^1899-12-30T\d\d:\d\d:\d\d$/),
      0,
    ]);
    // NULL → sel tidak ditulis.
    expect(back[3]!.slice(1)).toEqual([]);
    // BIGINT ditulis dengan semua digitnya; Excel/parser membacanya sebagai double.
    expect(back[4]![6]).toBe(Number(9007199254740993n));
  });

  it("karakter ilegal XML dibuang dan sel > 32.767 karakter dipotong tanpa membelah surrogate", async () => {
    const path = join(dir, "b.xlsx");
    const long = "x".repeat(XLSX_CELL_MAX - 1) + "😀" + "y".repeat(10);
    const rows = [["a\u0000b\u0007c\u000bd\ufffee"], [long], ["\ud800tunggal"]];
    await writeXlsx(
      path,
      { sheetName: "Data", columns: [{ label: "T", kind: "text" }] },
      chunks(rows, 10),
    );
    const back = await readBack(path, "Data");
    expect(back[1]![0]).toBe("abcde");
    const cut = back[2]![0] as string;
    expect(cut.length).toBe(XLSX_CELL_MAX - 1);
    expect(cut.endsWith("x")).toBe(true);
    expect(back[3]![0]).toBe("tunggal");
  });

  it("paket lengkap (Content_Types, rels, workbook, styles, sheet1) dan nama sheet di-escape", async () => {
    const path = join(dir, "c.xlsx");
    await writeXlsx(
      path,
      { sheetName: 'A&B "x"', columns: [{ label: "K", kind: "number" }] },
      chunks([[1], [2], [3]]),
    );
    expect((await entries(path)).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(await readBack(path, 'A&B "x"')).toEqual([["K"], [1], [2], [3]]);
  });

  it("tanpa baris data: hanya header; galat sumber baris dilempar", async () => {
    const path = join(dir, "d.xlsx");
    expect(
      await writeXlsx(
        path,
        { sheetName: "Data", columns: [{ label: "K", kind: "number" }] },
        chunks([]),
      ),
    ).toBe(0);
    expect(await readBack(path, "Data")).toEqual([["K"]]);
    async function* broken(): AsyncIterable<unknown[][]> {
      yield [[1]];
      throw new Error("duckdb putus");
    }
    await expect(
      writeXlsx(
        join(dir, "e.xlsx"),
        { sheetName: "Data", columns: [{ label: "K", kind: "number" }] },
        broken(),
      ),
    ).rejects.toThrow("duckdb putus");
  });

  it("INT-2: nomor seri sistem 1900 Excel (bug kabisat 1900) dan tanggal < 1900 sebagai teks tanpa zona", async () => {
    const d = (y: number, m: number, day: number, h = 0, mi = 0, s = 0) =>
      new Date(Date.UTC(y, m - 1, day, h, mi, s));
    // Nomor seri langsung (bukan lewat parser proyek, yang memakai epoch 1899-12-30 yang sama).
    expect(excelSerial(d(1899, 12, 31))).toBeNull();
    expect(excelSerial(d(1900, 1, 1))).toBe(1);
    expect(excelSerial(d(1900, 2, 28))).toBe(59);
    expect(excelSerial(d(1900, 2, 28, 12))).toBe(59.5);
    expect(excelSerial(d(1900, 3, 1))).toBe(61);
    expect(excelSerial(d(1850, 5, 1))).toBeNull();
    expect(excelSerial(d(2024, 1, 2))).toBe(45293);
    expect(excelSerial(d(2024, 1, 2, 6))).toBe(45293.25);
    expect(excelSerial(new Date(Number.NaN))).toBeNull();

    const path = join(dir, "dates.xlsx");
    const rows: unknown[][] = [
      [d(1899, 12, 31), d(1899, 12, 31, 23, 59, 58)],
      [d(1900, 1, 1), d(1900, 1, 1, 6)],
      [d(1900, 2, 28), d(1900, 2, 28, 12)],
      [d(1900, 3, 1), d(1900, 3, 1, 18)],
      [d(1850, 5, 1), d(1850, 5, 1, 13, 45, 30)],
      [d(2024, 1, 2), d(2024, 1, 2, 3, 4, 5)],
      [new Date(Number.NaN), null],
    ];
    await writeXlsx(
      path,
      {
        sheetName: "Data",
        columns: [
          { label: "Tanggal", kind: "date" },
          { label: "Waktu", kind: "timestamp" },
        ],
      },
      chunks(rows),
    );
    const c = cellsOf(await sheetXml(path));
    // Tanggal (gaya 2 = numFmt 14) / tanggal-waktu (gaya 3 = numFmt 22).
    expect([c.A2, c.B2]).toEqual([{ t: "1899-12-31" }, { t: "1899-12-31 23:59:58" }]);
    expect([c.A3, c.B3]).toEqual([
      { s: "2", v: "1" },
      { s: "3", v: "1.25" },
    ]);
    expect([c.A4, c.B4]).toEqual([
      { s: "2", v: "59" },
      { s: "3", v: "59.5" },
    ]);
    expect([c.A5, c.B5]).toEqual([
      { s: "2", v: "61" },
      { s: "3", v: "61.75" },
    ]);
    expect([c.A6, c.B6]).toEqual([{ t: "1850-05-01" }, { t: "1850-05-01 13:45:30" }]);
    expect(c.A7).toEqual({ s: "2", v: "45293" });
    expect(Number(c.B7!.v)).toBeCloseTo(45293 + (3 * 3600 + 4 * 60 + 5) / 86_400, 9);
    expect(c.B7!.s).toBe("3");
    // Tanggal tidak valid → sel kosong (tidak melempar RangeError dari toISOString).
    expect(c.A8).toBeUndefined();
  });

  it("columnRef: A, Z, AA, AZ, BA, XFD", () => {
    expect([0, 25, 26, 51, 52, 16_383].map(columnRef)).toEqual(["A", "Z", "AA", "AZ", "BA", "XFD"]);
  });
});
