/*
 * Sniff CSV dari 64 KB pertama (flow-kerja B3): encoding, delimiter, quote. Plus pemindai byte untuk
 * jumlah kolom maksimum dan jumlah record (menghormati kutip), dipakai untuk kolom eksplisit DuckDB.
 */
import { createReadStream } from "node:fs";

export type CsvEncoding = "utf-8" | "windows-1252";

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvFormatError";
  }
}

export interface CsvSniff {
  encoding: CsvEncoding;
  /** Byte BOM UTF-8 di awal file (dilewati saat transcode/baca). */
  bom: boolean;
  delimiter: string;
  quote: '"';
}

const DELIMS = [",", ";", "\t", "|"];

export function detectEncoding(head: Uint8Array): { encoding: CsvEncoding; bom: boolean } {
  if ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff)) {
    throw new CsvFormatError(
      "File CSV memakai encoding UTF-16. Simpan ulang sebagai CSV UTF-8 (Excel: CSV UTF-8 (Comma delimited)).",
    );
  }
  const bom = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
  // Potong urutan multi-byte yang terbelah di ujung sampel sebelum validasi UTF-8.
  let end = head.length;
  for (let k = 1; k <= 3 && end - k >= 0; k++) {
    const b = head[end - k]!;
    if ((b & 0xc0) === 0xc0) {
      end -= k;
      break;
    }
    if ((b & 0x80) === 0) break;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head.subarray(bom ? 3 : 0, end));
    return { encoding: "utf-8", bom };
  } catch {
    return { encoding: "windows-1252", bom: false };
  }
}

/** Pecah record CSV (RFC 4180, kutip ganda) dari teks sampel; record terakhir yang terpotong dibuang. */
export function sampleRecords(text: string, delimiter: string, max = 50): string[][] {
  const out: string[][] = [];
  let rec: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length && out.length < max; i++) {
    const ch = text[i]!;
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delimiter) {
      rec.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      rec.push(field);
      out.push(rec);
      rec = [];
      field = "";
    } else field += ch;
  }
  return out;
}

/**
 * Delimiter = kandidat yang membuat jumlah field paling konsisten (modus > 1) di sampel.
 * Baris pembuka yang lebih sempit (judul) tidak mengacaukan karena yang dihitung modusnya.
 */
export function detectDelimiter(text: string): string {
  let best = { d: ",", score: -1, width: 0 };
  for (const d of DELIMS) {
    const recs = sampleRecords(text, d).filter((r) => !(r.length === 1 && r[0] === ""));
    const counts = new Map<number, number>();
    for (const r of recs) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    let mode = 1;
    let freq = 0;
    for (const [w, f] of counts)
      if (w > 1 && (f > freq || (f === freq && w > mode))) [mode, freq] = [w, f];
    const score = mode > 1 ? freq : 0;
    if (score > best.score || (score === best.score && mode > best.width))
      best = { d, score, width: mode };
  }
  if (best.score <= 0) return ",";
  return best.d;
}

export function sniffCsv(head: Uint8Array): CsvSniff {
  const { encoding, bom } = detectEncoding(head);
  const text = new TextDecoder(encoding).decode(head.subarray(bom ? 3 : 0));
  if (text.includes("\u0000"))
    throw new CsvFormatError("Isi file bukan teks CSV. Ekspor ulang data sebagai CSV UTF-8.");
  return { encoding, bom, delimiter: detectDelimiter(text), quote: '"' };
}

export const MAX_BLANK_RECORDS = 1_000_000;

export interface CsvScan {
  maxFields: number;
  /** Record berisi (bukan baris kosong). */
  records: number;
  /**
   * Untuk setiap baris kosong: jumlah record berisi sebelumnya. DuckDB melewati baris kosong, jadi
   * nomor fisik record ke-n = n + jumlah baris kosong dengan nilai < n (sama dengan tampilan Excel).
   */
  blanksBefore: number[];
}

/**
 * Pindai seluruh file (byte, menghormati kutip) untuk jumlah kolom maksimum, jumlah record, dan posisi
 * baris kosong. Delimiter selalu ASCII sehingga aman untuk UTF-8 maupun Windows-1252.
 */
export async function scanCsv(path: string, delimiter: string, maxCols: number): Promise<CsvScan> {
  const d = delimiter.charCodeAt(0);
  let inQ = false;
  let fields = 1;
  let maxFields = 0;
  let records = 0;
  let any = false;
  const blanksBefore: number[] = [];
  for await (const chunk of createReadStream(path, { highWaterMark: 1 << 20 })) {
    const b = chunk as Buffer;
    for (let i = 0; i < b.length; i++) {
      const c = b[i]!;
      if (c === 0x22) {
        inQ = !inQ; // "" di dalam kutip = dua toggle → tetap di dalam
        any = true;
      } else if (inQ) continue;
      else if (c === d) {
        fields++;
        any = true;
      } else if (c === 0x0a) {
        if (any) {
          records++;
          if (fields > maxFields) maxFields = fields;
          if (fields > maxCols) {
            throw new CsvFormatError(
              `File CSV punya lebih dari ${maxCols.toLocaleString("id-ID")} kolom di baris ${records}.`,
            );
          }
        } else {
          if (blanksBefore.length >= MAX_BLANK_RECORDS) {
            throw new CsvFormatError("File CSV berisi terlalu banyak baris kosong.");
          }
          blanksBefore.push(records);
        }
        fields = 1;
        any = false;
      } else if (c !== 0x0d) any = true;
    }
  }
  if (any) {
    records++;
    if (fields > maxFields) maxFields = fields;
  }
  return { maxFields: Math.max(maxFields, 1), records, blanksBefore };
}
