import { closeSync, mkdtempSync, openSync, readSync, rmSync, statSync, writeSync } from "node:fs";
import { join, posix } from "node:path";
import type { Readable } from "node:stream";
import { SaxesParser } from "saxes";
import yauzl from "yauzl";
import type { Parser, ParseSummary, RawValue } from "./types";

/*
 * Parser xlsx streaming sendiri (ADR-0005): yauzl (akses acak via central directory) + saxes (SAX,
 * DOCTYPE ditolak). Batas eksplisit melawan zip-bomb dan input rusak; sharedStrings di-spill ke file
 * sementara bila melewati spillBytes, dengan indeks ± 4 byte per string.
 * Nama tag dibandingkan tanpa prefix namespace (ekspor .NET OpenXML SDK menulis <x:row>).
 */

export interface SaxLimits {
  maxEntries: number;
  /** Batas mutlak total ukuran tak terkompresi entri zip. */
  maxUncompressedBytes: number;
  /** Total tak terkompresi ≤ maxExpansion × ukuran file (melawan entri yang berbagi byte). */
  maxExpansion: number;
  /** Rasio uncompressed/compressed per entri > 1 MB (worksheet nyata 6–8x). */
  maxRatio: number;
  /** Ambang memori sharedStrings sebelum spill ke disk. */
  spillBytes: number;
  /** Panjang maksimum satu sel/string (Excel: 32.767); lebih panjang dipotong + dihitung. */
  maxCellChars: number;
  maxRows: number;
  maxCols: number;
  maxSheets: number;
  /** Jumlah entri sharedStrings (indeks ± 4 byte/string; fixture 1 GB teks-berat: 40 juta). */
  maxSharedStrings: number;
  /** File spill sharedStrings ≤ min(maxSpillBytes, maxSpillFactor × ukuran file) di disk temp. */
  maxSpillBytes: number;
  maxSpillFactor: number;
  /** Excel: ≤ 64.000 format sel dan beberapa ratus format angka kustom. */
  maxCellXfs: number;
  maxNumFmts: number;
  /** Batas waktu absolut (epoch ms); lewat → XlsxLimitError. */
  deadline?: number;
}

export const DEFAULT_LIMITS: SaxLimits = {
  maxEntries: 10_000,
  maxUncompressedBytes: 24 * 1024 ** 3,
  maxExpansion: 100,
  maxRatio: 100,
  // Eksperimen benchmark: SAX_SPILL_MB mengubah ambang spill (0 = selalu spill).
  spillBytes: Number(process.env.SAX_SPILL_MB ?? 128) * 1024 ** 2,
  maxCellChars: 32_767,
  maxRows: 1_048_576,
  maxCols: 16_384,
  maxSheets: 50,
  maxSharedStrings: 64 * 1024 * 1024,
  maxSpillBytes: 8 * 1024 ** 3,
  maxSpillFactor: 4,
  maxCellXfs: 65_536,
  maxNumFmts: 1_000,
};

export class XlsxLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxLimitError";
  }
}

type ZipFile = yauzl.ZipFile;
type Entry = yauzl.Entry;

/** Nama lokal tanpa prefix namespace ("x:row" → "row"). */
const ln = (name: string) => {
  const i = name.indexOf(":");
  return i < 0 ? name : name.slice(i + 1);
};

/** Atribut id relasi (r:id / prefix lain). */
function relId(attrs: Record<string, string>): string {
  for (const [k, v] of Object.entries(attrs)) if (k.endsWith(":id")) return v;
  return attrs.id ?? "";
}

/**
 * Salinan mandiri string. Substring V8 (≥ 13 karakter) menunjuk ke string induknya, di sini potongan
 * stream ± 16 KB, sehingga nilai pendek bisa menahan seluruh potongan (review T-005 putaran 5).
 * (" " + s).slice(1) meratakan string gabungan baru lalu memotongnya: induk barunya hanya s + 1.
 */
export const own = (s: string): string => (s.length >= 13 ? (" " + s).slice(1) : s);

/** Dekode escape OOXML _xHHHH_ (mis. _x000D_ = CR). _x005F_ = garis bawah literal. */
const decodeOoxml = (s: string) =>
  s.includes("_x")
    ? s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    : s;

function openZip(path: string): Promise<ZipFile> {
  return new Promise((res, rej) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (e, z) =>
      e || !z ? rej(e ?? new Error("zip")) : res(z),
    ),
  );
}

function listEntries(
  zip: ZipFile,
  limits: SaxLimits,
  fileSize: number,
): Promise<Map<string, Entry>> {
  return new Promise((res, rej) => {
    const map = new Map<string, Entry>();
    const all: Entry[] = [];
    let total = 0;
    const cap = Math.min(limits.maxUncompressedBytes, limits.maxExpansion * Math.max(fileSize, 1));
    zip.on("entry", (e: Entry) => {
      if (all.length >= limits.maxEntries)
        return rej(new XlsxLimitError("terlalu banyak entri zip"));
      // Excel menulis nama pendek tanpa komentar; metadata entri ditahan sepanjang parse.
      if (e.fileNameLength > 1024 || e.extraFieldLength > 4096 || e.fileCommentLength > 1024) {
        return rej(new XlsxLimitError("struktur zip tidak valid (metadata entri berlebihan)"));
      }
      total += e.uncompressedSize;
      const ratio = e.uncompressedSize / Math.max(1, e.compressedSize);
      if (e.uncompressedSize > 1024 * 1024 && ratio > limits.maxRatio) {
        return rej(new XlsxLimitError(`rasio dekompresi ${Math.round(ratio)}x pada ${e.fileName}`));
      }
      if (total > cap) {
        return rej(new XlsxLimitError("ukuran isi file setelah dekompresi melebihi batas"));
      }
      all.push(e);
      map.set(e.fileName, e);
      zip.readEntry();
    });
    zip.on("end", () => {
      // Entri yang berbagi/menimpa byte terkompresi (bypass rasio) ditolak.
      const sorted = [...all].sort(
        (a, b) => a.relativeOffsetOfLocalHeader - b.relativeOffsetOfLocalHeader,
      );
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!;
        if (
          sorted[i]!.relativeOffsetOfLocalHeader <
          prev.relativeOffsetOfLocalHeader + 30 + prev.compressedSize
        ) {
          return rej(new XlsxLimitError("struktur zip tidak valid (entri tumpang tindih)"));
        }
      }
      res(map);
    });
    zip.on("error", rej);
    zip.readEntry();
  });
}

function entryStream(zip: ZipFile, e: Entry): Promise<Readable> {
  return new Promise((res, rej) =>
    zip.openReadStream(e, (err, s) => (err || !s ? rej(err) : res(s))),
  );
}

/*
 * Anggaran memori per struktur yang ditahan saxes (SpreadsheetML nyata jauh di bawahnya):
 * kedalaman elemen < 20, atribut per tag < 30, nilai atribut terpanjang ± 260 karakter (Target,
 * formatCode). Total panjang nilai atribut per tag dibatasi sehingga tumpukan elemen terbuka
 * menahan paling banyak 64 × 16.384 karakter (± 2 MB), tanpa biaya mengosongkan atribut per tag.
 */
const MAX_DEPTH = 64;
const MAX_ATTRS = 256;
const MAX_TAG_ATTR_CHARS = 16_384;
/** Total karakter teks sel dalam satu baris (16.384 kolom × 32.767 = ± 1 GB tanpa batas ini). */
const MAX_ROW_CHARS = 4_000_000;
const MAX_SHEET_NAME = 255;

/** SAX atas satu entri; DOCTYPE/ENTITY ditolak (tanpa ekspansi entitas). Handler boleh melempar. */
async function sax(
  zip: ZipFile,
  e: Entry,
  handlers: {
    open?: (local: string, attrs: Record<string, string>) => void;
    close?: (local: string) => void;
    text?: (t: string) => void;
  },
  guard: { maxBuffer: number; deadline?: number },
): Promise<void> {
  const p = new SaxesParser({ xmlns: false });
  // saxes menampung satu node teks/nilai atribut (`text`) atau nama tag (`name`) utuh sebelum
  // memanggil handler; dibatasi per potongan stream agar satu node raksasa tidak menghabiskan memori.
  // saxes juga menyimpan semua atribut satu tag (`attribList`) dan satu objek per elemen terbuka
  // (`tags`); keduanya diperiksa per potongan (murah, tanpa callback per atribut). Satu potongan
  // ≤ 64 KB sehingga pertumbuhan di antara dua pemeriksaan terikat.
  // SpreadsheetML nyata: kedalaman < 20, atribut per tag < 30.
  const internal = p as unknown as {
    text: string;
    name: string;
    tags: unknown[];
    attribList: { value: string }[];
  };
  let failure: Error | null = null;
  const tooLongAttr = () =>
    new XlsxLimitError(`nilai atribut di ${e.fileName} terlalu panjang (file bukan buatan Excel)`);
  const attrChars = (list: { value: string }[]) => {
    let n = 0;
    for (let i = 0; i < list.length; i++) n += list[i]!.value.length;
    return n;
  };
  p.on("doctype", () => {
    throw new XlsxLimitError("file xlsx berisi DOCTYPE (ditolak)");
  });
  p.on("error", (err) => {
    failure ??= err;
  });
  // Selalu terdaftar: elemen terbuka di tumpukan saxes menahan atributnya sampai ditutup, jadi
  // total panjang nilai atribut setiap tag dibatasi di sini.
  p.on("opentag", (t) => {
    const attrs = t.attributes as Record<string, string>;
    let n = 0;
    for (const k in attrs) n += attrs[k]!.length;
    if (n > MAX_TAG_ATTR_CHARS) throw tooLongAttr();
    handlers.open?.(ln(t.name), attrs);
  });
  if (handlers.close) p.on("closetag", (t) => handlers.close!(ln(t.name)));
  if (handlers.text) {
    p.on("text", handlers.text);
    p.on("cdata", handlers.text);
  }
  const s = await entryStream(zip, e);
  s.setEncoding("utf8");
  try {
    for await (const chunk of s) {
      p.write(chunk as string);
      if (failure) throw failure;
      if (internal.text.length > guard.maxBuffer || internal.name.length > guard.maxBuffer) {
        throw new XlsxLimitError(
          `isi teks di ${e.fileName} melebihi batas panjang (file bukan buatan Excel)`,
        );
      }
      if (internal.tags.length > MAX_DEPTH) {
        throw new XlsxLimitError(
          `struktur XML di ${e.fileName} terlalu dalam (file bukan buatan Excel)`,
        );
      }
      if (internal.attribList.length > MAX_ATTRS) {
        throw new XlsxLimitError(
          `tag dengan atribut berlebihan di ${e.fileName} (file bukan buatan Excel)`,
        );
      }
      // Atribut tag yang belum tertutup (melintasi potongan).
      if (attrChars(internal.attribList) > MAX_TAG_ATTR_CHARS) {
        throw tooLongAttr();
      }
      if (guard.deadline && Date.now() > guard.deadline) {
        throw new XlsxLimitError("waktu pemrosesan file melebihi batas");
      }
    }
    p.close();
  } finally {
    s.destroy();
  }
  if (failure) throw failure;
}

const BLOCK = 1024; // string per blok indeks
const CHUNK = 1 << 20; // entri per chunk Uint32Array

/**
 * Shared strings: memori sampai spillBytes, lalu file sementara. Indeks = basis Float64 per 1024
 * string + offset relatif Uint32 per string (± 4 byte/string; 40 juta string ≈ 160 MB).
 */
class SstStore {
  private mem: string[] = [];
  private memBytes = 0;
  private fd: number | null = null;
  private dir: string | null = null;
  private rel: Uint32Array[] = [];
  private base: number[] = [];
  private count = 0;
  private filePos = 0;
  private cache = new Map<number, string>();
  constructor(
    private readonly tmpDir: string,
    private readonly spillBytes: number,
    private readonly maxStrings: number,
    private readonly maxFileBytes: number,
  ) {}
  get size() {
    return this.count;
  }
  push(s: string) {
    if (this.count >= this.maxStrings) {
      throw new XlsxLimitError("jumlah teks unik di file melebihi batas");
    }
    if (this.fd === null) {
      this.mem.push(own(s));
      this.memBytes += s.length * 2 + 40;
      this.count++;
      if (this.memBytes > this.spillBytes) this.spill();
      return;
    }
    this.append(s);
  }
  private spill() {
    this.dir = mkdtempSync(join(this.tmpDir, "sst-"));
    this.fd = openSync(join(this.dir, "strings.bin"), "w+");
    const all = this.mem;
    this.mem = [];
    this.count = 0;
    this.filePos = 0;
    for (const s of all) this.append(s);
  }
  private offsetOf(i: number): number {
    return this.base[Math.floor(i / BLOCK)]! + this.rel[Math.floor(i / CHUNK)]![i % CHUNK]!;
  }
  private append(s: string) {
    const i = this.count;
    if (i % BLOCK === 0) this.base.push(this.filePos);
    if (i % CHUNK === 0) this.rel.push(new Uint32Array(CHUNK));
    this.rel[Math.floor(i / CHUNK)]![i % CHUNK] = this.filePos - this.base[Math.floor(i / BLOCK)]!;
    const b = Buffer.from(s, "utf8");
    if (this.filePos + b.length > this.maxFileBytes) {
      throw new XlsxLimitError("isi teks file terlalu besar untuk diproses");
    }
    for (let w = 0; w < b.length;) w += writeSync(this.fd!, b, w, b.length - w, this.filePos + w);
    this.filePos += b.length;
    this.count++;
  }
  get(i: number): string {
    if (this.fd === null) return this.mem[i]!;
    const hit = this.cache.get(i);
    if (hit !== undefined) return hit;
    const start = this.offsetOf(i);
    const end = i + 1 < this.count ? this.offsetOf(i + 1) : this.filePos;
    const buf = Buffer.allocUnsafe(end - start);
    for (let r = 0; r < buf.length;) {
      const n = readSync(this.fd, buf, r, buf.length - r, start + r);
      if (n === 0) throw new Error("file sementara sharedStrings terpotong");
      r += n;
    }
    const s = buf.toString("utf8");
    // Hanya string pendek (kosakata berulang) yang di-cache: ≤ 50k × 512 karakter ≈ 50 MB.
    if (s.length <= 512) {
      if (this.cache.size >= 50_000) this.cache.clear();
      this.cache.set(i, s);
    }
    return s;
  }
  close() {
    if (this.fd !== null) closeSync(this.fd);
    if (this.dir) rmSync(this.dir, { recursive: true, force: true });
    this.fd = null;
    this.dir = null;
  }
}

const BUILTIN_DATE_FMTS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
]);
const EPOCH_1900 = Date.UTC(1899, 11, 30);
const EPOCH_1904 = Date.UTC(1904, 0, 1);

/** Format kustom bertanggal: buang literal "…", [..], \x, _x, *x lalu cari d/m/y/h/s. */
export function isDateFormat(code: string): boolean {
  const stripped = code.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, "");
  return /[dmyhs]/i.test(stripped) && !/^general$/i.test(stripped.trim());
}

function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i) & ~32; // huruf besar
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
    if (n > 1e6) break;
  }
  return n - 1;
}

/** Path entri dari Target relasi: absolut ("/xl/x.xml") atau relatif terhadap direktori sumber. */
function resolvePart(baseDir: string, target: string): string {
  return target.startsWith("/") ? target.slice(1) : posix.normalize(posix.join(baseDir, target));
}

function parseIsoNaive(s: string): Date | string {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(
      s,
    );
  if (!m) return s;
  const d = new Date(
    m[8]
      ? s
      : `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}${m[7] ?? ""}Z`,
  );
  return Number.isNaN(d.getTime()) ? s : d;
}

export function createSaxParser(limits: SaxLimits = DEFAULT_LIMITS): Parser {
  return {
    name: "sax-yauzl",
    physicalRowNumbers: true,
    async parse(path, opts, onRow): Promise<ParseSummary> {
      const zip = await openZip(path);
      const fileSize = statSync(path).size;
      const sst = new SstStore(
        opts.tmpDir,
        limits.spillBytes,
        limits.maxSharedStrings,
        Math.min(limits.maxSpillBytes, limits.maxSpillFactor * Math.max(fileSize, 1)),
      );
      const summary: ParseSummary = { truncatedCells: 0 };
      const truncatedSst = new Set<number>();
      // Teks mentah ditampung sampai 7× batas (escape _xHHHH_ = 7 karakter → 1), lalu didekode dan
      // dipotong aman (tidak membelah pasangan surrogate). Node > maxBuffer ditolak di sax().
      const rawMax = limits.maxCellChars * 7;
      const guard = { maxBuffer: rawMax + 65_536, deadline: limits.deadline };
      const cap = (cur: string, add: string): string => {
        if (cur.length >= rawMax) return cur;
        const next = cur + add;
        return next.length > rawMax ? next.slice(0, rawMax) : next;
      };
      const finish = (raw: string): { v: string; cut: boolean } => {
        const d = decodeOoxml(raw);
        if (d.length <= limits.maxCellChars && raw.length < rawMax) return { v: d, cut: false };
        let v = d.slice(0, limits.maxCellChars);
        const last = v.charCodeAt(v.length - 1);
        if (last >= 0xd800 && last <= 0xdbff) v = v.slice(0, -1);
        return { v, cut: true };
      };
      try {
        const entries = await listEntries(zip, limits, fileSize);
        const need = (name: string, what: string) => {
          const e = entries.get(name);
          if (!e)
            throw new XlsxLimitError(`file bukan Buku Kerja Excel yang valid (${what} tidak ada)`);
          return e;
        };
        const relsOf = async (part: string) => {
          const dir = posix.dirname(part);
          const relPath = posix.join(dir, "_rels", `${posix.basename(part)}.rels`);
          const out: { id: string; type: string; target: string }[] = [];
          const e = entries.get(relPath);
          if (!e) return out;
          await sax(
            zip,
            e,
            {
              open: (n, a) => {
                if (n === "Relationship" && a.Id && a.Target) {
                  if (out.length >= limits.maxEntries) {
                    throw new XlsxLimitError(`relasi berlebihan di ${relPath} (file rusak)`);
                  }
                  out.push({
                    id: own(a.Id),
                    type: own(a.Type ?? ""),
                    target: own(resolvePart(dir, a.Target)),
                  });
                }
              },
            },
            guard,
          );
          return out;
        };

        // _rels/.rels → workbook (nama part tidak boleh diasumsikan)
        const rootRels = entries.has("_rels/.rels") ? await relsOf("") : [];
        const wbPath =
          rootRels.find((r) => r.type.endsWith("/officeDocument"))?.target.replace(/^\.\//, "") ??
          "xl/workbook.xml";
        const sheets: { name: string; rid: string }[] = [];
        let date1904 = false;
        await sax(
          zip,
          need(wbPath, "workbook"),
          {
            open: (n, a) => {
              if (n === "sheet") {
                // Diperiksa saat elemen dibaca, bukan setelah workbook selesai.
                if (sheets.length >= limits.maxSheets) {
                  throw new XlsxLimitError(
                    `file berisi lebih dari ${limits.maxSheets} sheet; maksimal ${limits.maxSheets}`,
                  );
                }
                const name = a.name ?? "";
                if (name.length > MAX_SHEET_NAME) {
                  throw new XlsxLimitError("nama sheet terlalu panjang (file bukan buatan Excel)");
                }
                sheets.push({ name: own(name), rid: own(relId(a)) });
              } else if (n === "workbookPr") date1904 = a.date1904 === "1" || a.date1904 === "true";
            },
          },
          guard,
        );
        const wbRels = await relsOf(wbPath);
        const byId = new Map(wbRels.map((r) => [r.id, r.target]));
        const epoch = date1904 ? EPOCH_1904 : EPOCH_1900;

        // styles → indeks xf bergaya tanggal
        const dateXf = new Set<number>();
        const stylesPath = wbRels.find((r) => r.type.endsWith("/styles"))?.target;
        const styles = stylesPath ? entries.get(stylesPath) : undefined;
        if (styles) {
          const customDate = new Set<number>();
          let inXfs = false;
          let xf = 0;
          let numFmts = 0;
          await sax(
            zip,
            styles,
            {
              open: (n, a) => {
                if (n === "numFmt") {
                  if (++numFmts > limits.maxNumFmts) {
                    throw new XlsxLimitError("format angka berlebihan (file bukan buatan Excel)");
                  }
                  if (isDateFormat(a.formatCode ?? "")) customDate.add(Number(a.numFmtId));
                } else if (n === "cellXfs") inXfs = true;
                else if (n === "xf" && inXfs) {
                  if (xf >= limits.maxCellXfs) {
                    throw new XlsxLimitError("format sel berlebihan (file bukan buatan Excel)");
                  }
                  const id = Number(a.numFmtId ?? 0);
                  if (BUILTIN_DATE_FMTS.has(id) || customDate.has(id)) dateXf.add(xf);
                  xf++;
                }
              },
              close: (n) => {
                if (n === "cellXfs") inXfs = false;
              },
            },
            guard,
          );
        }

        // sharedStrings (akses acak: boleh berada setelah worksheet)
        const sstPath = wbRels.find((r) => r.type.endsWith("/sharedStrings"))?.target;
        const sstEntry = sstPath ? entries.get(sstPath) : undefined;
        if (sstEntry) {
          let inSi = false;
          let inT = false;
          let inRph = false;
          let cur = "";
          await sax(
            zip,
            sstEntry,
            {
              open: (n) => {
                if (n === "si") {
                  inSi = true;
                  cur = "";
                } else if (n === "rPh") inRph = true;
                else if (n === "t" && inSi && !inRph) inT = true;
              },
              close: (n) => {
                if (n === "t") inT = false;
                else if (n === "rPh") inRph = false;
                else if (n === "si") {
                  inSi = false;
                  const { v, cut } = finish(cur);
                  if (cut) truncatedSst.add(sst.size);
                  sst.push(v);
                }
              },
              text: (t) => {
                if (inT) cur = cap(cur, t);
              },
            },
            guard,
          );
        }

        const wanted = opts.sheetNames.length ? opts.sheetNames : sheets.map((s) => s.name);
        for (let si = 0; si < wanted.length; si++) {
          const sheetLabel = wanted[si]!;
          const meta = sheets.find((s) => s.name === sheetLabel);
          const target = meta ? byId.get(meta.rid) : undefined;
          if (!target) throw new XlsxLimitError(`sheet "${sheetLabel}" tidak ditemukan`);
          let rowNum = 0;
          let prevRow = 0;
          let vals: RawValue[] = [];
          let any = false;
          let rowChars = 0;
          let col = -1;
          let type = "";
          let style = 0;
          let inV = false;
          let inIsT = false;
          let text = "";
          let rowsSeen = 0;
          const where = () => `sheet "${sheetLabel}" baris ${rowNum}`;
          await sax(
            zip,
            need(target, `sheet ${sheetLabel}`),
            {
              open: (n, a) => {
                if (n === "row") {
                  rowNum = a.r ? Number(a.r) : prevRow + 1;
                  if (!Number.isInteger(rowNum) || rowNum <= prevRow) {
                    throw new XlsxLimitError(
                      `nomor baris tidak valid di sheet "${sheetLabel}" (baris ${a.r ?? "?"})`,
                    );
                  }
                  if (rowNum > limits.maxRows) {
                    throw new XlsxLimitError(
                      `${where()}: melebihi batas ${limits.maxRows.toLocaleString("id-ID")} baris per sheet`,
                    );
                  }
                  vals = [];
                  rowChars = 0;
                  any = false;
                  col = -1;
                } else if (n === "c") {
                  col = a.r ? colIndex(a.r) : col + 1;
                  if (col < 0 || col >= limits.maxCols) {
                    throw new XlsxLimitError(
                      `${where()}: kolom melebihi batas ${limits.maxCols.toLocaleString("id-ID")}`,
                    );
                  }
                  type = a.t ?? "n";
                  style = Number(a.s ?? 0);
                  text = "";
                } else if (n === "v") inV = true;
                else if (n === "t" && type === "inlineStr") inIsT = true;
              },
              text: (t) => {
                if (inV || inIsT) text = cap(text, t);
              },
              close: (n) => {
                if (n === "v") inV = false;
                else if (n === "t") inIsT = false;
                else if (n === "c") {
                  let v: RawValue = null;
                  if (type === "s") {
                    if (text !== "") {
                      const idx = Number(text);
                      if (!Number.isInteger(idx) || idx < 0 || idx >= sst.size) {
                        throw new XlsxLimitError(
                          `${where()}: referensi teks tidak valid (file rusak)`,
                        );
                      }
                      v = sst.get(idx);
                      if (truncatedSst.size && truncatedSst.has(idx)) summary.truncatedCells++;
                    }
                  } else if (type === "inlineStr" || type === "str" || type === "e") {
                    if (text !== "") {
                      const f = finish(text);
                      v = own(f.v);
                      if (f.cut) summary.truncatedCells++;
                    }
                  } else if (type === "b") v = text === "" ? null : text === "1";
                  else if (type === "d") {
                    const d = text === "" ? null : parseIsoNaive(text);
                    v = typeof d === "string" ? own(d) : d;
                  } else if (text !== "") {
                    const num = Number(text);
                    if (Number.isNaN(num)) v = own(text);
                    else
                      v = dateXf.has(style) ? new Date(epoch + Math.round(num * 86_400_000)) : num;
                  }
                  if (v !== null) {
                    if (typeof v === "string" && (rowChars += v.length) > MAX_ROW_CHARS) {
                      throw new XlsxLimitError(
                        `${where()}: isi satu baris melebihi ${MAX_ROW_CHARS.toLocaleString("id-ID")} karakter`,
                      );
                    }
                    vals[col] = v;
                    any = true;
                  }
                } else if (n === "row") {
                  prevRow = rowNum;
                  if (any) onRow(si, rowNum, vals); // baris tanpa nilai (hanya gaya) tidak dipancarkan
                  if (limits.deadline && ++rowsSeen % 1000 === 0 && Date.now() > limits.deadline) {
                    throw new XlsxLimitError("waktu pemrosesan file melebihi batas");
                  }
                }
              },
            },
            guard,
          );
        }
        return summary;
      } finally {
        sst.close();
        zip.close();
      }
    },
  };
}
