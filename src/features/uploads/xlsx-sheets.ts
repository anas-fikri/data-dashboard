/*
 * Daftar sheet xlsx dibaca di browser sebelum unggah (T-85tb), tanpa membaca isi worksheet: akhir file
 * (EOCD, zip64 didukung) → central directory → `_rels/.rels`, workbook, relasi workbook, dan relasi tiap
 * worksheet (deteksi PivotTable). Hanya beberapa KB dibaca walau file 1 GB (Blob.slice). Murni (Blob +
 * DecompressionStream), jadi sama di browser dan Node (uji paritas nama dengan parser server).
 * Apa pun yang tidak terbaca/aneh → null: unggahan berjalan tanpa pilihan (semua sheet, perilaku lama).
 */

export type SheetKind = "worksheet" | "chartsheet" | "other";
export type SheetState = "visible" | "hidden" | "veryHidden";

export interface XlsxSheetInfo {
  /** Nama persis seperti dibaca parser server (entitas XML didekode). */
  name: string;
  kind: SheetKind;
  state: SheetState;
  /** Worksheet berisi PivotTable (ringkasan, bukan data mentah). */
  pivot: boolean;
}

const EOCD_SIG = 0x06054b50;
const Z64_LOC_SIG = 0x07064b50;
const Z64_EOCD_SIG = 0x06064b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
/** Central directory xlsx wajar ≪ 4 MB (ribuan entri); lebih dari ini bukan xlsx biasa. */
const MAX_CD_BYTES = 4 * 1024 * 1024;
/** XML yang dibaca (workbook, relasi) ≪ 2 MB; dibatasi agar zip bom tidak memenuhi memori. */
const MAX_XML_BYTES = 2 * 1024 * 1024;
const MAX_SHEETS = 200;

interface Entry {
  method: number;
  compressed: number;
  uncompressed: number;
  offset: number;
}

class Bad extends Error {}

async function bytes(file: Blob, start: number, end: number): Promise<DataView> {
  if (start < 0 || end > file.size || end < start) throw new Bad("rentang");
  return new DataView(await file.slice(start, end).arrayBuffer());
}

const u64 = (v: DataView, at: number) => {
  const n = v.getUint32(at, true) + v.getUint32(at + 4, true) * 2 ** 32;
  if (!Number.isSafeInteger(n)) throw new Bad("zip64");
  return n;
};

async function centralDirectory(file: Blob): Promise<Map<string, Entry>> {
  // EOCD = 22 byte + komentar ≤ 65535, dicari mundur dari akhir.
  const tailStart = Math.max(0, file.size - 22 - 0xffff);
  const tail = await bytes(file, tailStart, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Bad("eocd");
  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const locAt = eocd - 20;
    if (locAt < 0 || tail.getUint32(locAt, true) !== Z64_LOC_SIG) throw new Bad("zip64 locator");
    const recOff = u64(tail, locAt + 8);
    const rec = await bytes(file, recOff, recOff + 56);
    if (rec.getUint32(0, true) !== Z64_EOCD_SIG) throw new Bad("zip64 eocd");
    count = u64(rec, 32);
    cdSize = u64(rec, 40);
    cdOffset = u64(rec, 48);
  }
  if (cdSize > MAX_CD_BYTES) throw new Bad("cd besar");
  const cd = await bytes(file, cdOffset, cdOffset + cdSize);
  const dec = new TextDecoder();
  const out = new Map<string, Entry>();
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== CEN_SIG) throw new Bad("cen");
    const method = cd.getUint16(p + 10, true);
    let compressed = cd.getUint32(p + 20, true);
    let uncompressed = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let offset = cd.getUint32(p + 42, true);
    const nameStart = p + 46;
    if (nameStart + nameLen + extraLen > cd.byteLength) throw new Bad("cen");
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + nameStart, nameLen));
    // Extra zip64 (0x0001): field 0xFFFFFFFF diganti berurutan (uncompressed, compressed, offset).
    let x = nameStart + nameLen;
    const xEnd = x + extraLen;
    while (x + 4 <= xEnd) {
      const id = cd.getUint16(x, true);
      const len = cd.getUint16(x + 2, true);
      if (id === 0x0001) {
        let q = x + 4;
        const end = x + 4 + len;
        if (uncompressed === 0xffffffff && q + 8 <= end) {
          uncompressed = u64(cd, q);
          q += 8;
        }
        if (compressed === 0xffffffff && q + 8 <= end) {
          compressed = u64(cd, q);
          q += 8;
        }
        if (offset === 0xffffffff && q + 8 <= end) offset = u64(cd, q);
      }
      x += 4 + len;
    }
    out.set(name, { method, compressed, uncompressed, offset });
    p = xEnd + commentLen;
  }
  return out;
}

async function entryText(file: Blob, e: Entry): Promise<string> {
  if (e.uncompressed > MAX_XML_BYTES || e.compressed > MAX_XML_BYTES) throw new Bad("xml besar");
  const loc = await bytes(file, e.offset, e.offset + 30);
  if (loc.getUint32(0, true) !== LOC_SIG) throw new Bad("loc");
  const start = e.offset + 30 + loc.getUint16(26, true) + loc.getUint16(28, true);
  const raw = file.slice(start, start + e.compressed);
  if (raw.size !== e.compressed) throw new Bad("terpotong");
  let data: Uint8Array;
  if (e.method === 0) data = new Uint8Array(await raw.arrayBuffer());
  else if (e.method === 8) {
    const stream = raw.stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_XML_BYTES) {
        await reader.cancel();
        throw new Bad("xml besar");
      }
      parts.push(value);
    }
    data = new Uint8Array(total);
    let o = 0;
    for (const part of parts) {
      data.set(part, o);
      o += part.byteLength;
    }
  } else throw new Bad("metode");
  return new TextDecoder().decode(data);
}

/** Entitas XML bawaan + rujukan karakter (sama dengan saxes; DOCTYPE/entitas lain = file aneh). */
function decodeXml(s: string): string {
  // Normalisasi nilai atribut XML: spasi putih literal → spasi (rujukan &#10; tetap baris baru).
  return s
    .replace(/[\t\n\r]/g, " ")
    .replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, ref: string) => {
      if (ref[0] === "#") {
        const cp = ref[1] === "x" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
        if (!Number.isFinite(cp) || cp > 0x10ffff) throw new Bad("entitas");
        return String.fromCodePoint(cp);
      }
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[ref]!;
    });
}

/** Elemen `<[prefix:]local …>` → atribut (nama berawalan dipertahankan, nilai didekode). */
function elements(xml: string, local: string): Record<string, string>[] {
  if (/<!DOCTYPE/i.test(xml)) throw new Bad("doctype");
  const re = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${local}(?=[\\s/>])([^>]*)>`, "g");
  const attrRe = /([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  const out: Record<string, string>[] = [];
  for (const m of xml.matchAll(re)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1]!.matchAll(attrRe)) attrs[a[1]!] = decodeXml(a[3] ?? a[4] ?? "");
    out.push(attrs);
  }
  return out;
}

const relIdOf = (a: Record<string, string>) => {
  for (const [k, v] of Object.entries(a)) if (k.endsWith(":id")) return v;
  return a.id ?? "";
};

/** Path part relatif terhadap folder part asal (sama dengan resolvePart parser). */
function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (baseDir ? `${baseDir}/${target}` : target).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

const dirOf = (part: string) => (part.includes("/") ? part.slice(0, part.lastIndexOf("/")) : "");
const relsPath = (part: string) => {
  const d = dirOf(part);
  const base = part.slice(d ? d.length + 1 : 0);
  return d ? `${d}/_rels/${base}.rels` : `_rels/${base}.rels`;
};

async function rels(
  file: Blob,
  entries: Map<string, Entry>,
  part: string,
): Promise<{ id: string; type: string; target: string }[]> {
  const e = entries.get(relsPath(part));
  if (!e) return [];
  return elements(await entryText(file, e), "Relationship")
    .filter((a) => a.Id && a.Target)
    .map((a) => ({
      id: a.Id!,
      type: a.Type ?? "",
      target: a.TargetMode === "External" ? "" : resolvePart(dirOf(part), a.Target!),
    }));
}

/** Daftar sheet workbook (urut workbook) atau null bila file tidak terbaca sebagai xlsx. */
export async function readXlsxSheets(file: Blob): Promise<XlsxSheetInfo[] | null> {
  try {
    if (typeof DecompressionStream === "undefined") return null;
    const entries = await centralDirectory(file);
    const root = await rels(file, entries, "");
    const wbPath =
      root.find((r) => r.type.endsWith("/officeDocument"))?.target ?? "xl/workbook.xml";
    const wb = entries.get(wbPath);
    if (!wb) return null;
    const sheets = elements(await entryText(file, wb), "sheet");
    if (!sheets.length || sheets.length > MAX_SHEETS) return null;
    const wbRels = new Map((await rels(file, entries, wbPath)).map((r) => [r.id, r]));
    const out: XlsxSheetInfo[] = [];
    for (const a of sheets) {
      const rel = wbRels.get(relIdOf(a));
      const type = rel?.type ?? "";
      const kind: SheetKind = type.endsWith("/worksheet")
        ? "worksheet"
        : type.endsWith("/chartsheet")
          ? "chartsheet"
          : "other";
      const state: SheetState =
        a.state === "hidden" ? "hidden" : a.state === "veryHidden" ? "veryHidden" : "visible";
      const pivot =
        kind === "worksheet" && rel?.target
          ? (await rels(file, entries, rel.target)).some((r) => r.type.endsWith("/pivotTable"))
          : false;
      out.push({ name: a.name ?? "", kind, state, pivot });
    }
    return out;
  } catch {
    return null;
  }
}
