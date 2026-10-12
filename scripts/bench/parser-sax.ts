import { closeSync, openSync, readSync, writeSync } from "node:fs";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { SaxesParser } from "saxes";
import yauzl from "yauzl";
import type { Parser, RawValue } from "./types";

/*
 * Parser xlsx streaming sendiri: yauzl (akses acak via central directory, ukuran entri divalidasi)
 * + saxes (SAX, DOCTYPE ditolak). Batas eksplisit melawan zip-bomb; sharedStrings di-spill ke
 * file sementara bila melewati SPILL_BYTES sehingga RSS tidak tumbuh mengikuti jumlah string unik.
 */

export interface SaxLimits {
  maxEntries: number;
  /** Total ukuran tak terkompresi semua entri yang dibaca. */
  maxUncompressedBytes: number;
  /** Rasio uncompressed/compressed per entri (zip-bomb). */
  maxRatio: number;
  /** Ambang memori sharedStrings sebelum spill ke disk. */
  spillBytes: number;
}

export const DEFAULT_LIMITS: SaxLimits = {
  maxEntries: 10_000,
  maxUncompressedBytes: 24 * 1024 ** 3,
  maxRatio: 200,
  // Eksperimen benchmark: SAX_SPILL_MB mengubah ambang spill (0 = selalu spill).
  spillBytes: Number(process.env.SAX_SPILL_MB ?? 128) * 1024 ** 2,
};

export class XlsxLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxLimitError";
  }
}

type ZipFile = yauzl.ZipFile;
type Entry = yauzl.Entry;

function openZip(path: string): Promise<ZipFile> {
  return new Promise((res, rej) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (e, z) =>
      e || !z ? rej(e ?? new Error("zip")) : res(z),
    ),
  );
}

function listEntries(zip: ZipFile, limits: SaxLimits): Promise<Map<string, Entry>> {
  return new Promise((res, rej) => {
    const map = new Map<string, Entry>();
    let total = 0;
    zip.on("entry", (e: Entry) => {
      if (map.size >= limits.maxEntries) return rej(new XlsxLimitError("terlalu banyak entri zip"));
      total += e.uncompressedSize;
      const ratio = e.uncompressedSize / Math.max(1, e.compressedSize);
      if (e.uncompressedSize > 1024 * 1024 && ratio > limits.maxRatio) {
        return rej(new XlsxLimitError(`rasio dekompresi ${Math.round(ratio)}x pada ${e.fileName}`));
      }
      if (total > limits.maxUncompressedBytes) {
        return rej(new XlsxLimitError("ukuran isi file setelah dekompresi melebihi batas"));
      }
      map.set(e.fileName, e);
      zip.readEntry();
    });
    zip.on("end", () => res(map));
    zip.on("error", rej);
    zip.readEntry();
  });
}

function entryStream(zip: ZipFile, e: Entry): Promise<Readable> {
  return new Promise((res, rej) =>
    zip.openReadStream(e, (err, s) => (err || !s ? rej(err) : res(s))),
  );
}

/** Jalankan SAX atas satu entri; DOCTYPE/ENTITY ditolak (tidak ada ekspansi entitas eksternal). */
async function sax(
  zip: ZipFile,
  e: Entry,
  handlers: {
    open?: (name: string, attrs: Record<string, string>) => void;
    close?: (name: string) => void;
    text?: (t: string) => void;
  },
): Promise<void> {
  const p = new SaxesParser({ xmlns: false });
  let failure: Error | null = null;
  p.on("doctype", () => {
    // Lempar langsung dari handler: write() berhenti sebelum elemen berikutnya diproses.
    throw new XlsxLimitError("file xlsx berisi DOCTYPE (ditolak)");
  });
  p.on("error", (err) => {
    failure ??= err;
  });
  if (handlers.open)
    p.on("opentag", (t) => handlers.open!(t.name, t.attributes as Record<string, string>));
  if (handlers.close) p.on("closetag", (t) => handlers.close!(t.name));
  if (handlers.text) p.on("text", handlers.text);
  const s = await entryStream(zip, e);
  s.setEncoding("utf8");
  for await (const chunk of s) {
    p.write(chunk as string);
    if (failure) {
      s.destroy();
      throw failure;
    }
  }
  p.close();
  if (failure) throw failure;
}

/** Penyimpanan shared strings: memori sampai spillBytes, lalu file sementara + indeks offset. */
class SstStore {
  private mem: string[] = [];
  private memBytes = 0;
  private fd: number | null = null;
  private offsets = new Float64Array(1 << 16);
  private count = 0;
  private filePos = 0;
  private cache = new Map<number, string>();
  constructor(
    private readonly path: string,
    private readonly spillBytes: number,
  ) {}
  get size() {
    return this.count;
  }
  get spilled() {
    return this.fd !== null;
  }
  push(s: string) {
    if (this.fd === null) {
      this.mem.push(s);
      this.memBytes += s.length * 2 + 40;
      this.count++;
      if (this.memBytes > this.spillBytes) this.spill();
      return;
    }
    this.append(s);
  }
  private spill() {
    process.stderr.write(`sst spill ke disk setelah ${this.count} string\n`);
    this.fd = openSync(this.path, "w+");
    const all = this.mem;
    this.mem = [];
    this.count = 0;
    this.filePos = 0;
    for (const s of all) this.append(s);
  }
  private append(s: string) {
    if (this.count + 1 >= this.offsets.length) {
      const next = new Float64Array(this.offsets.length * 2);
      next.set(this.offsets);
      this.offsets = next;
    }
    const b = Buffer.from(s, "utf8");
    writeSync(this.fd!, b, 0, b.length, this.filePos);
    this.offsets[this.count] = this.filePos;
    this.filePos += b.length;
    this.count++;
    this.offsets[this.count] = this.filePos;
  }
  get(i: number): string | null {
    if (i < 0 || i >= this.count) return null;
    if (this.fd === null) return this.mem[i] ?? null;
    const hit = this.cache.get(i);
    if (hit !== undefined) return hit;
    const start = this.offsets[i]!;
    const len = this.offsets[i + 1]! - start;
    const buf = Buffer.allocUnsafe(len);
    readSync(this.fd, buf, 0, len, start);
    const s = buf.toString("utf8");
    if (this.cache.size > 50_000) this.cache.clear();
    this.cache.set(i, s);
    return s;
  }
  close() {
    if (this.fd !== null) closeSync(this.fd);
  }
}

const BUILTIN_DATE_FMTS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57,
]);
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function resolveTarget(target: string): string {
  const t = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  return t.replace(/\/\.\//g, "/");
}

export function createSaxParser(limits: SaxLimits = DEFAULT_LIMITS): Parser {
  return {
    name: "sax-yauzl",
    physicalRowNumbers: true,
    async parse(path, opts, onRow) {
      const zip = await openZip(path);
      const sst = new SstStore(join(opts.tmpDir, `sst-${process.pid}.bin`), limits.spillBytes);
      try {
        const entries = await listEntries(zip, limits);
        const need = (name: string) => {
          const e = entries.get(name);
          if (!e) throw new XlsxLimitError(`bukan xlsx: ${name} tidak ada`);
          return e;
        };

        // workbook + relasi → urutan sheet dan path-nya
        const sheets: { name: string; rid: string }[] = [];
        await sax(zip, need("xl/workbook.xml"), {
          open: (n, a) => {
            if (n === "sheet") sheets.push({ name: a.name ?? "", rid: a["r:id"] ?? "" });
          },
        });
        const rels = new Map<string, string>();
        await sax(zip, need("xl/_rels/workbook.xml.rels"), {
          open: (n, a) => {
            if (n === "Relationship" && a.Id && a.Target) rels.set(a.Id, resolveTarget(a.Target));
          },
        });

        // styles → indeks xf bergaya tanggal
        const dateXf = new Set<number>();
        const styles = entries.get("xl/styles.xml");
        if (styles) {
          const customDate = new Set<number>();
          let inXfs = false;
          let xf = 0;
          await sax(zip, styles, {
            open: (n, a) => {
              if (
                n === "numFmt" &&
                /[dmyhs]/i.test((a.formatCode ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, ""))
              ) {
                customDate.add(Number(a.numFmtId));
              }
              if (n === "cellXfs") inXfs = true;
              if (n === "xf" && inXfs) {
                const id = Number(a.numFmtId ?? 0);
                if (BUILTIN_DATE_FMTS.has(id) || customDate.has(id)) dateXf.add(xf);
                xf++;
              }
            },
            close: (n) => {
              if (n === "cellXfs") inXfs = false;
            },
          });
        }

        // sharedStrings (bisa berada setelah worksheet di zip — akses acak membuatnya tidak masalah)
        const sstEntry = entries.get("xl/sharedStrings.xml");
        if (sstEntry) {
          let inSi = false;
          let inT = false;
          let inRph = false;
          let cur = "";
          await sax(zip, sstEntry, {
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
                sst.push(cur);
              }
            },
            text: (t) => {
              if (inT) cur += t;
            },
          });
        }

        const wanted = opts.sheetNames.length ? opts.sheetNames : sheets.map((s) => s.name);
        for (let si = 0; si < wanted.length; si++) {
          const meta = sheets.find((s) => s.name === wanted[si]);
          const target = meta ? rels.get(meta.rid) : undefined;
          if (!target) throw new XlsxLimitError(`sheet ${wanted[si]} tidak ditemukan`);
          let rowNum = 0;
          let vals: RawValue[] = [];
          let col = -1;
          let type = "";
          let style = 0;
          let inV = false;
          let inIsT = false;
          let text = "";
          await sax(zip, need(target), {
            open: (n, a) => {
              if (n === "row") {
                rowNum = a.r ? Number(a.r) : rowNum + 1;
                vals = [];
                col = -1;
              } else if (n === "c") {
                col = a.r ? colIndex(a.r) : col + 1;
                type = a.t ?? "n";
                style = Number(a.s ?? 0);
                text = "";
              } else if (n === "v") inV = true;
              else if (n === "t" && type === "inlineStr") inIsT = true;
            },
            text: (t) => {
              if (inV || inIsT) text += t;
            },
            close: (n) => {
              if (n === "v") inV = false;
              else if (n === "t") inIsT = false;
              else if (n === "c") {
                let v: RawValue = null;
                if (type === "s") v = sst.get(Number(text));
                else if (type === "inlineStr" || type === "str" || type === "e") v = text;
                else if (type === "b") v = text === "1";
                else if (text !== "") {
                  const num = Number(text);
                  v = dateXf.has(style)
                    ? new Date(EXCEL_EPOCH + Math.round(num * 86_400_000))
                    : num;
                }
                if (v !== null) vals[col] = v;
              } else if (n === "row") onRow(si, rowNum, vals);
            },
          });
        }
      } finally {
        sst.close();
        zip.close();
      }
    },
  };
}
