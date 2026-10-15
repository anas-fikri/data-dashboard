import { describe, expect, it } from "vitest";
import {
  asciiFileName,
  cleanTitle,
  contentDisposition,
  exportFileName,
  jakartaStamp,
  sheetName,
} from "@/features/exports/filename";

/*
 * T-017 E14: nama file dari judul widget (teks user) disanitasi sebelum masuk Content-Disposition dan
 * nama sheet Excel — tidak bisa menyisipkan parameter/header (" ; CR LF \), tanpa path (/ \).
 */

describe("nama file ekspor", () => {
  it("<judul>-<YYYYMMDD-HHmm WIB>.<ext>; judul kosong → widget", () => {
    const at = new Date("2026-10-15T17:30:00.000Z"); // 16 Okt 00:30 WIB
    expect(jakartaStamp(at)).toBe("20261016-0030");
    expect(exportFileName("Omzet Cabang", at, "csv")).toBe("Omzet Cabang-20261016-0030.csv");
    expect(exportFileName("   ", at, "xlsx")).toBe("widget-20261016-0030.xlsx");
    expect(exportFileName("...", at, "xlsx")).toBe("widget-20261016-0030.xlsx");
  });

  it('karakter berbahaya dibuang: " \\ / ; CR LF kendali < > : | ? *', () => {
    expect(cleanTitle('a"b\\c/d;e\r\nf\u0000g<h>i:j|k?l*m')).toBe("a b c d e f g h i j k l m");
    expect(cleanTitle("../../etc/passwd")).toBe("etc passwd");
    expect(cleanTitle("x".repeat(200))).toHaveLength(80);
    expect(cleanTitle("Penjualan\u2028Baru")).toBe("Penjualan Baru");
  });

  it("Content-Disposition: attachment + ASCII cadangan + filename* UTF-8 (RFC 5987/6266)", () => {
    expect(contentDisposition("Omzet Cabang-20261016-0030.csv")).toBe(
      "attachment; filename=\"Omzet Cabang-20261016-0030.csv\"; filename*=UTF-8''Omzet%20Cabang-20261016-0030.csv",
    );
    expect(contentDisposition("Penjualan Śląsk 東京 (100%)'s-20261016-0030.xlsx")).toBe(
      "attachment; filename=\"Penjualan Slask _ (100_)'s-20261016-0030.xlsx\"; filename*=UTF-8''Penjualan%20%C5%9Al%C4%85sk%20%E6%9D%B1%E4%BA%AC%20%28100%25%29%27s-20261016-0030.xlsx",
    );
    // Nama dari sumber mana pun tetap tidak bisa memecah header.
    const h = contentDisposition('x"; filename=evil.exe\r\nSet-Cookie: a=b.csv');
    expect(h).not.toMatch(/[\r\n]/);
    expect(h.match(/"/g)).toHaveLength(2);
    expect(h).toMatch(/^attachment; filename="[^";]*"; filename\*=UTF-8''[A-Za-z0-9%._~!-]*$/);
    expect(asciiFileName("Ünïcödé")).toBe("Unicode");
  });

  it("R1-D-3: judul 67/80 karakter — cap waktu utuh, nama Content-Disposition = fileName status", () => {
    const at = new Date("2026-10-15T16:38:00.000Z"); // 15 Okt 23:38 WIB
    const title67 = "Tabel transaksi omzet harian per cabang untuk tim keuangan regional";
    const title80 = `${title67} dan pusat!`.padEnd(80, "x");
    expect([...title67]).toHaveLength(67);
    expect([...title80]).toHaveLength(80);
    const fromHeader = (h: string) => ({
      ascii: /filename="([^"]*)"/.exec(h)![1],
      utf8: decodeURIComponent(/filename\*=UTF-8''(.*)$/.exec(h)![1]!),
    });
    for (const [title, ext] of [
      [title67, "csv"],
      [title80, "xlsx"],
    ] as const) {
      const name = exportFileName(title, at, ext);
      expect(name).toBe(`${title}-20261015-2338.${ext}`);
      expect(fromHeader(contentDisposition(name))).toEqual({ ascii: name, utf8: name });
    }
    // Judul > 80 dipotong dulu, cap waktu tetap utuh; non-ASCII juga utuh di filename*.
    const long = exportFileName("y".repeat(200), at, "csv");
    expect(long).toBe(`${"y".repeat(80)}-20261015-2338.csv`);
    expect(fromHeader(contentDisposition(long)).utf8).toBe(long);
    const emoji = exportFileName("😀".repeat(90), at, "xlsx");
    expect(emoji).toBe(`${"😀".repeat(80)}-20261015-2338.xlsx`);
    expect(fromHeader(contentDisposition(emoji)).utf8).toBe(emoji);
    // Nama dari sumber lain tetap dibatasi (judul + cap waktu) dan disanitasi.
    const huge = fromHeader(contentDisposition(`${"z".repeat(300)}.csv`)).utf8;
    expect(huge).toBe(`${"z".repeat(94)}.csv`);
  });

  it("nama sheet Excel: ≤ 31, tanpa [ ] : * ? / \\, bukan History, tidak diawali/diakhiri '", () => {
    expect(sheetName("Omzet [2026]: Q1/Q2?")).toBe("Omzet 2026 Q1 Q2");
    expect(sheetName("x".repeat(40))).toHaveLength(31);
    expect(sheetName("'kutip'")).toBe("kutip");
    expect(sheetName("History")).toBe("Data");
    expect(sheetName("")).toBe("Data");
    // Tidak membelah pasangan surrogate di batas 31.
    expect(sheetName("a".repeat(30) + "😀")).toBe("a".repeat(30));
  });
});
