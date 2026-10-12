/*
 * Sniff CSV (flow-kerja B3): delimiter dari 64 KB pertama, lalu pemindai byte seluruh file untuk
 * jumlah kolom maksimum, record, posisi baris kosong, gaya akhir baris, dan validitas UTF-8.
 * Aturan kutip mengikuti DuckDB/RFC 4180: tanda kutip hanya membuka field bila menjadi karakter
 * pertama field; kutip di tengah field tak berkutip (mis. 3" PVC) adalah karakter biasa.
 */
import { createReadStream } from "node:fs";

export type CsvEncoding = "utf-8" | "windows-1252";

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvFormatError";
  }
}

const DELIMS = [",", ";", "\t", "|"];

export function rejectUtf16(head: Uint8Array) {
  if ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff)) {
    throw new CsvFormatError(
      "File CSV memakai encoding UTF-16. Simpan ulang sebagai CSV UTF-8 (Excel: CSV UTF-8 (Comma delimited)).",
    );
  }
}

export const hasUtf8Bom = (head: Uint8Array) =>
  head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;

/** Encoding dari sampel saja (dipakai untuk menebak delimiter; keputusan akhir dari scanCsv). */
export function detectEncoding(head: Uint8Array): { encoding: CsvEncoding; bom: boolean } {
  rejectUtf16(head);
  const bom = hasUtf8Bom(head);
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

/** Pecah record CSV dari teks sampel (kutip hanya di awal field); record terakhir terpotong dibuang. */
export function sampleRecords(text: string, delimiter: string, max = 50): string[][] {
  const out: string[][] = [];
  let rec: string[] = [];
  let field = "";
  let start = true;
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
      continue;
    }
    if (ch === '"' && start) {
      inQ = true;
      start = false;
    } else if (ch === delimiter) {
      rec.push(field);
      field = "";
      start = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      rec.push(field);
      out.push(rec);
      rec = [];
      field = "";
      start = true;
    } else {
      field += ch;
      start = false;
    }
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
  return best.score <= 0 ? "," : best.d;
}

/** Delimiter dari 64 KB pertama (encoding sampel hanya untuk dekode teks sampel). */
export function sniffDelimiter(head: Uint8Array): string {
  const { encoding, bom } = detectEncoding(head);
  const text = new TextDecoder(encoding).decode(head.subarray(bom ? 3 : 0));
  if (text.includes("\u0000")) {
    throw new CsvFormatError("Isi file bukan teks CSV. Ekspor ulang data sebagai CSV UTF-8.");
  }
  return detectDelimiter(text);
}

export const MAX_BLANK_RECORDS = 1_000_000;

export interface CsvScan {
  maxFields: number;
  /** Record berisi (bukan baris kosong). */
  records: number;
  /**
   * Untuk setiap baris kosong: jumlah record berisi sebelumnya (naik). DuckDB melewati baris kosong
   * (CSV > 1 kolom), jadi nomor fisik record ke-n = n + jumlah nilai < n (sama dengan tampilan Excel).
   */
  blanksBefore: number[];
  /** Seluruh file UTF-8 valid (BOM diabaikan); false → Windows-1252. */
  utf8: boolean;
  bom: boolean;
  /** Akhir baris hanya CR (Mac lama) — DuckDB perlu new_line eksplisit. */
  crOnly: boolean;
}

// Status pemindai: awal field, field tanpa kutip, di dalam kutip, kutip terlihat di dalam kutip.
const START = 0;
const PLAIN = 1;
const QUOTED = 2;
const QUOTE_SEEN = 3;

/**
 * Pindai seluruh file byte demi byte. Delimiter, kutip, CR/LF selalu ASCII sehingga aman untuk
 * UTF-8 maupun Windows-1252; validitas UTF-8 diperiksa sambil jalan (TextDecoder fatal, streaming).
 */
export async function scanCsv(path: string, delimiter: string, maxCols: number): Promise<CsvScan> {
  const d = delimiter.charCodeAt(0);
  let state = START;
  let fields = 1;
  let maxFields = 0;
  let records = 0;
  let any = false;
  let afterCr = false;
  let crOnly = 0;
  let lf = 0;
  const blanksBefore: number[] = [];
  const dec = new TextDecoder("utf-8", { fatal: true });
  let utf8 = true;
  let first = true;
  let bom = false;

  const endRecord = () => {
    if (any) {
      records++;
      if (fields > maxFields) maxFields = fields;
      if (fields > maxCols) {
        // Nomor baris = nomor record termasuk baris kosong (sama dengan _row di raw.parquet).
        const id = (x: number) => x.toLocaleString("id-ID");
        throw new CsvFormatError(
          `File CSV punya ${id(fields)} kolom di baris ${id(records + blanksBefore.length)}; maksimal ${id(maxCols)} kolom per sheet. Hapus kolom yang tidak dipakai lalu unggah lagi.`,
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
    state = START;
  };

  for await (const chunk of createReadStream(path, { highWaterMark: 1 << 20 })) {
    let b = chunk as Buffer;
    if (first) {
      first = false;
      bom = hasUtf8Bom(b);
      if (bom) b = b.subarray(3);
    }
    if (utf8) {
      try {
        dec.decode(b, { stream: true });
      } catch {
        utf8 = false;
      }
    }
    for (let i = 0; i < b.length; i++) {
      const c = b[i]!;
      if (afterCr) {
        afterCr = false;
        if (c === 0x0a) continue; // CRLF
        crOnly++;
      }
      if (state === QUOTED) {
        if (c === 0x22) state = QUOTE_SEEN;
        continue;
      }
      if (state === QUOTE_SEEN) {
        if (c === 0x22) {
          state = QUOTED; // "" = kutip literal
          continue;
        }
        state = PLAIN; // kutip penutup; karakter ini diproses sebagai bagian luar kutip
      }
      if (c === d) {
        fields++;
        any = true;
        state = START;
      } else if (c === 0x0a) {
        lf++;
        endRecord();
      } else if (c === 0x0d) {
        afterCr = true;
        endRecord();
      } else if (c === 0x22 && state === START) {
        state = QUOTED;
        any = true;
      } else {
        any = true;
        state = PLAIN;
      }
    }
  }
  if (utf8) {
    try {
      dec.decode();
    } catch {
      utf8 = false;
    }
  }
  if (any) endRecord();
  return {
    maxFields: Math.max(maxFields, 1),
    records,
    blanksBefore,
    utf8,
    bom,
    crOnly: crOnly > 0 && lf === 0,
  };
}
