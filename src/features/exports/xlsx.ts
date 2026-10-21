/*
 * Penulis XLSX streaming sendiri (T-017, E2) di atas yazl: baris dari DuckDB (potongan ± 2.048 baris)
 * langsung ditulis sebagai XML worksheet ke entri zip — memori tetap kecil untuk 1 juta baris, tanpa
 * exceljs (dependensi berat) dan tanpa ekstensi excel DuckDB (tidak tersedia offline).
 *
 *  - Teks selalu inlineStr (tanpa sharedStrings): "=1+1" tetap string, tidak pernah formula (AC5).
 *    Karakter yang tidak sah di XML dibuang; CR dan "_xHHHH_" literal di-escape seperti Excel sehingga
 *    terbaca kembali persis; sel dipotong di 32.767 karakter (batas Excel) tanpa membelah surrogate.
 *  - Angka di <v>; boolean t="b"; DATE/TIMESTAMP nomor seri 1900 dengan numFmt 14/22 (koreksi bug
 *    kabisat 1900 Excel; sebelum 1900-01-01 → teks tanpa zona); durasi (detik) nomor seri dengan format
 *    [h]:mm:ss.
 *  - Part minimal yang dibutuhkan Excel: [Content_Types].xml, _rels/.rels, workbook (+ rels), styles,
 *    sheet1. Dibaca ulang di uji lewat parser xlsx proyek (src/lib/xlsx/parser.ts).
 */
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { PassThrough, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";

/** percent: angka rasio (0,125) bergaya persen 1 desimal ("12,5%"), "Tampilkan nilai sebagai" T-067. */
export type XlsxKind =
  "text" | "number" | "percent" | "boolean" | "date" | "timestamp" | "duration";

export interface XlsxColumn {
  label: string;
  kind: XlsxKind;
}

/** Batas panjang teks satu sel Excel. */
export const XLSX_CELL_MAX = 32_767;

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Indeks cellXfs di styles.xml. */
const STYLE = { header: 1, date: 2, timestamp: 3, duration: 4, percent: 5 } as const;

const CONTENT_TYPES = `${HEAD}<Types xmlns="${NS_CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `${HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK_RELS = `${HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`;
/** cellXfs: 0 umum, 1 header tebal, 2 tanggal (14), 3 tanggal-waktu (22), 4 durasi [h]:mm:ss. */
const xf = (numFmtId: number, fontId = 0) =>
  `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="0" borderId="0" xfId="0"${fontId ? ' applyFont="1"' : ""}${numFmtId ? ' applyNumberFormat="1"' : ""}/>`;
const STYLES = `${HEAD}<styleSheet xmlns="${NS_MAIN}"><numFmts count="2"><numFmt numFmtId="164" formatCode="[h]:mm:ss"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6">${xf(0)}${xf(0, 1)}${xf(14)}${xf(22)}${xf(164)}${xf(165)}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Karakter yang tidak sah di XML 1.0: kendali selain tab/LF/CR, U+FFFE/U+FFFF, surrogate tunggal. */
const ILLEGAL =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** Teks sel: buang karakter tidak sah, potong ≤ 32.767 tanpa membelah pasangan surrogate. */
export function cellText(s: string): string {
  let v = s.replace(ILLEGAL, "");
  if (v.length > XLSX_CELL_MAX) {
    v = v.slice(0, XLSX_CELL_MAX);
    const last = v.charCodeAt(v.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) v = v.slice(0, -1);
  }
  return v;
}

/**
 * Isi <t>: "_xHHHH_" literal → "_x005F_xHHHH_" (agar tidak didekode jadi karakter lain), CR →
 * "_x000D_" (parser XML menormalkan CR mentah jadi LF), lalu escape XML.
 */
function inlineText(s: string): string {
  const v = s.replace(/_(x[0-9a-fA-F]{4}_)/g, "_x005F_$1").replace(/\r/g, "_x000D_");
  const space = /^\s|\s$|[\t\n]/.test(v) ? ' xml:space="preserve"' : "";
  return `<is><t${space}>${escapeXml(v)}</t></is>`;
}

/** Nama sel kolom ke-i (0-based): A, B, …, Z, AA, … */
export function columnRef(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const EPOCH_1900 = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

/**
 * Nomor seri sistem tanggal 1900 Excel (review T-017 INT-2). Excel menganggap 1900 tahun kabisat (seri 60
 * = 29/02/1900 yang tidak ada, ECMA-376 §18.17.4.1): seri 1 = 1900-01-01, 59 = 1900-02-28, 61 =
 * 1900-03-01. Dari epoch 1899-12-30 hitungan baru benar mulai 1900-03-01, jadi seri < 61 digeser satu.
 * null = sebelum 1900-01-01 (tidak punya nomor seri) atau tanggal tidak valid.
 */
export function excelSerial(d: Date): number | null {
  const raw = (d.getTime() - EPOCH_1900) / DAY_MS;
  if (!Number.isFinite(raw)) return null;
  const serial = raw < 61 ? raw - 1 : raw;
  return serial < 1 ? null : serial;
}

/**
 * Tanggal sebelum 1900 sebagai teks tanpa zona (data naif, D8): "YYYY-MM-DD" untuk tanggal,
 * "YYYY-MM-DD HH:MM:SS" untuk tanggal-waktu — sama dengan layar dan CSV, bukan ISO UTC berakhiran Z.
 */
function naiveDateText(d: Date, kind: XlsxKind): string {
  const iso = d.toISOString();
  const t = iso.indexOf("T");
  return kind === "date" ? iso.slice(0, t) : `${iso.slice(0, t)} ${iso.slice(t + 1, t + 9)}`;
}

function stringCell(ref: string, v: string, style = 0): string {
  const t = cellText(v);
  if (!t) return "";
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}>${inlineText(t)}</c>`;
}

const numberCell = (ref: string, v: string, style = 0) =>
  `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${v}</v></c>`;

/** Satu sel; null/undefined/NaN → tidak ditulis (sel kosong). Nilai bertipe lain jatuh ke tipe JS-nya. */
function cell(ref: string, v: unknown, kind: XlsxKind): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    const serial = excelSerial(v);
    // Sebelum 1900 tidak bisa jadi nomor seri Excel: ditulis sebagai teks tanpa zona.
    if (serial === null) return stringCell(ref, naiveDateText(v, kind));
    return numberCell(ref, String(serial), kind === "date" ? STYLE.date : STYLE.timestamp);
  }
  if (typeof v === "boolean") return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
  if (typeof v === "number" || typeof v === "bigint") {
    if (kind === "duration") {
      const serial = Number(v) / 86_400;
      return Number.isFinite(serial) ? numberCell(ref, String(serial), STYLE.duration) : "";
    }
    const style = kind === "percent" ? STYLE.percent : 0;
    if (typeof v === "bigint") return numberCell(ref, v.toString(), style);
    return Number.isFinite(v) ? numberCell(ref, String(v), style) : "";
  }
  return stringCell(ref, String(v));
}

/** Tulis teks ke stream sheet dengan backpressure; galat zip (mis. disk penuh) membatalkan tunggu. */
async function put(s: PassThrough, text: string, failed: Promise<never>): Promise<void> {
  if (!s.write(text)) await Promise.race([once(s, "drain"), failed]);
}

/**
 * Tulis workbook satu sheet ke `outPath`: baris 1 = label kolom (tebal), lalu baris dari `chunks`
 * (larik baris per potongan). Mengembalikan jumlah baris data.
 */
export async function writeXlsx(
  outPath: string,
  o: { sheetName: string; columns: XlsxColumn[] },
  chunks: AsyncIterable<unknown[][]>,
): Promise<number> {
  const zip = new yazl.ZipFile();
  const out = zip.outputStream as Readable;
  const sheet = new PassThrough();
  // Galat stream entri dipancarkan ZipFile; tanpa pendengar EventEmitter melempar (proses mati).
  // Galat sheet sendiri sudah dilempar ke pemanggil lewat catch di bawah.
  zip.on("error", (e: Error) => out.destroy(e));
  sheet.on("error", () => {});
  const add = (name: string, body: string) => zip.addBuffer(Buffer.from(body, "utf8"), name);
  add("[Content_Types].xml", CONTENT_TYPES);
  add("_rels/.rels", ROOT_RELS);
  add(
    "xl/workbook.xml",
    `${HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets><sheet name="${escapeXml(cellText(o.sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  add("xl/_rels/workbook.xml.rels", WORKBOOK_RELS);
  add("xl/styles.xml", STYLES);
  zip.addReadStream(sheet, "xl/worksheets/sheet1.xml");
  zip.end();
  const done = pipeline(out, createWriteStream(outPath));
  const failed = done.then(() => new Promise<never>(() => {}));
  failed.catch(() => {});

  const refs = o.columns.map((_, i) => columnRef(i));
  const kinds = o.columns.map((c) => c.kind);
  let rows = 0;
  try {
    await put(sheet, `${HEAD}<worksheet xmlns="${NS_MAIN}"><sheetData>`, failed);
    await put(
      sheet,
      `<row r="1">${o.columns.map((c, i) => stringCell(`${refs[i]}1`, c.label, STYLE.header)).join("")}</row>`,
      failed,
    );
    for await (const chunk of chunks) {
      let buf = "";
      for (const row of chunk) {
        const r = ++rows + 1;
        let cells = "";
        for (let i = 0; i < refs.length; i++) cells += cell(`${refs[i]}${r}`, row[i], kinds[i]!);
        buf += `<row r="${r}">${cells}</row>`;
      }
      await put(sheet, buf, failed);
    }
    await put(sheet, "</sheetData></worksheet>", failed);
    sheet.end();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    sheet.destroy(err);
    out.destroy(err);
    await done.catch(() => {});
    throw e;
  }
  await done;
  return rows;
}
