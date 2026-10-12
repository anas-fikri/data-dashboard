/*
 * Sintesis fixture xlsx/csv deterministik (T-005, D9/D10).
 *
 *   npx tsx scripts/make-fixture.ts --kind xlsx --out tests/fixtures/kecil.xlsx --rows 2000 --cols 12
 *   npx tsx scripts/make-fixture.ts --kind csv --out tests/fixtures/perf/besar.csv --rows 8000000 --cols 30
 *
 * Opsi: --seed --sheets --rows --cols --text-ratio --unique-ratio --header-row --dup-headers
 *       --mixed-dates --number-locale id|us --encoding utf8|utf8bom|win1252|utf16le --delimiter , ; tab
 *       --zip-level 0..9 --sst-first (xlsx)
 * Selalu menulis <out>.manifest.json: jumlah baris/sel dan checksum teks per sheet untuk verifikasi parser.
 */
import { createWriteStream, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import yazl from "yazl";
import {
  FLAGS,
  KOTA,
  LAYANAN,
  addText,
  columnKinds,
  dataCell,
  ddmmyyyy,
  emptySheetManifest,
  headerNames,
  preambleRows,
  sheetName,
  type Cell,
  type FixtureOptions,
  type SheetManifest,
} from "./fixtures/model";

interface CliOptions extends FixtureOptions {
  kind: "xlsx" | "csv";
  out: string;
  encoding: "utf8" | "utf8bom" | "win1252" | "utf16le";
  delimiter: string;
  zipLevel: number;
  sstFirst: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (name: string) => argv.includes(`--${name}`);
  const kind = get("kind");
  const out = get("out");
  if ((kind !== "xlsx" && kind !== "csv") || !out) {
    throw new Error("pakai: --kind xlsx|csv --out <path> [opsi]");
  }
  const delim = get("delimiter") ?? ",";
  return {
    kind,
    out,
    seed: Number(get("seed") ?? 42),
    sheets: kind === "csv" ? 1 : Number(get("sheets") ?? 1),
    rows: Number(get("rows") ?? 1000),
    cols: Number(get("cols") ?? 12),
    textRatio: Number(get("text-ratio") ?? 0.5),
    uniqueRatio: Number(get("unique-ratio") ?? 0.5),
    headerRow: Number(get("header-row") ?? 1),
    dupHeaders: has("dup-headers"),
    mixedDates: has("mixed-dates"),
    numberLocale: get("number-locale") === "us" ? "us" : "id",
    encoding: (get("encoding") as CliOptions["encoding"]) ?? "utf8",
    delimiter: delim === "tab" ? "\t" : delim,
    zipLevel: Number(get("zip-level") ?? 6),
    sstFirst: has("sst-first"),
  };
}

// ---------- xlsx ----------

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

function colLetter(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26))
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const serialOf = (d: Date) => (d.getTime() - EXCEL_EPOCH) / 86_400_000;

/** Kosakata berulang → indeks sst tetap (Excel men-deduplikasi string berulang). */
function vocabulary(opts: FixtureOptions): string[] {
  const v = new Set<string>();
  for (let s = 0; s < opts.sheets; s++) {
    for (const p of preambleRows(opts, s)) if (p) v.add(p);
  }
  for (const h of headerNames(opts)) if (h) v.add(h);
  for (const f of FLAGS) v.add(f);
  for (const k of KOTA) v.add(k);
  for (const l of LAYANAN) v.add(l);
  for (const k of KOTA) for (const l of LAYANAN) v.add(`${k} ${l}`);
  return [...v];
}

function* chunked(parts: Iterable<string>, size = 1 << 16): Generator<string> {
  let buf = "";
  for (const p of parts) {
    buf += p;
    if (buf.length >= size) {
      yield buf;
      buf = "";
    }
  }
  if (buf) yield buf;
}

/** Urutan semua sel data teks yang BUKAN kosakata (sst ditulis ulang dengan urutan sama). */
function* extraStrings(opts: FixtureOptions, vocab: Map<string, number>): Generator<string> {
  const kinds = columnKinds(opts);
  for (let s = 0; s < opts.sheets; s++) {
    for (let r = 0; r < opts.rows; r++) {
      for (let c = 0; c < opts.cols; c++) {
        const cell = dataCell(opts, s, r, c, kinds[c]!);
        if (cell?.t === "s" && !vocab.has(cell.v)) yield cell.v;
      }
    }
  }
}

async function writeXlsx(opts: CliOptions): Promise<SheetManifest[]> {
  const vocabList = vocabulary(opts);
  const vocab = new Map(vocabList.map((s, i) => [s, i]));
  const kinds = columnKinds(opts);
  const headers = headerNames(opts);
  const manifests: SheetManifest[] = [];
  let nextIndex = vocabList.length;

  function* sheetXml(s: number): Generator<string> {
    const m = emptySheetManifest(sheetName(s), opts.headerRow, opts.cols);
    manifests[s] = m;
    yield '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    const strCell = (ref: string, text: string, row: number, col: number) => {
      addText(m, row, col, text);
      const idx = vocab.get(text) ?? nextIndex++;
      return `<c r="${ref}" t="s"><v>${idx}</v></c>`;
    };
    const pre = preambleRows(opts, s);
    for (let i = 0; i < pre.length; i++) {
      const text = pre[i];
      if (!text) continue; // baris kosong tidak ditulis (seperti Excel)
      const row = i + 1;
      m.nonEmptyRows++;
      m.lastRow = row;
      yield `<row r="${row}">${strCell(`A${row}`, text, row, 1)}</row>`;
    }
    const hr = opts.headerRow;
    let hx = `<row r="${hr}">`;
    headers.forEach((h, c) => {
      if (h) hx += strCell(`${colLetter(c + 1)}${hr}`, h, hr, c + 1);
    });
    m.nonEmptyRows++;
    m.lastRow = hr;
    yield `${hx}</row>`;
    for (let r = 0; r < opts.rows; r++) {
      const row = hr + 1 + r;
      let x = `<row r="${row}">`;
      for (let c = 0; c < opts.cols; c++) {
        const cell: Cell = dataCell(opts, s, r, c, kinds[c]!);
        if (!cell) continue;
        const ref = `${colLetter(c + 1)}${row}`;
        if (cell.t === "s") x += strCell(ref, cell.v, row, c + 1);
        else if (cell.t === "n") {
          m.numberCells++;
          x += `<c r="${ref}"><v>${cell.v}</v></c>`;
        } else {
          m.dateCells++;
          x += `<c r="${ref}" s="1"><v>${serialOf(cell.v)}</v></c>`;
        }
      }
      m.nonEmptyRows++;
      m.lastRow = row;
      yield `${x}</row>`;
    }
    yield "</sheetData></worksheet>";
  }

  function* sstXml(): Generator<string> {
    yield '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    const si = (s: string) => `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`;
    for (const s of vocabList) yield si(s);
    for (const s of extraStrings(opts, vocab)) yield si(s);
    yield "</sst>";
  }

  const sheetEntries = Array.from({ length: opts.sheets }, (_, i) => i);
  const zip = new yazl.ZipFile();
  const add = (name: string, body: string) =>
    zip.addBuffer(Buffer.from(body), name, { compressionLevel: opts.zipLevel, mtime: new Date(0) });
  add(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetEntries
      .map(
        (i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join(
        "",
      )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
  );
  add(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries
      .map(
        (i) => `<sheet name="${xmlEscape(sheetName(i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join("")}</sheets></workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetEntries
      .map(
        (i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join(
        "",
      )}<Relationship Id="rId${opts.sheets + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${opts.sheets + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  );
  // Urutan default seperti Excel: worksheet sebelum styles dan sharedStrings (kasus terberat untuk parser
  // streaming). --sst-first menaruh sharedStrings lebih dulu (kondisi terbaik). Isi sst tidak bergantung
  // urutan karena diturunkan ulang dari model dengan urutan sel yang sama.
  const addSst = () =>
    zip.addReadStream(Readable.from(chunked(sstXml())), "xl/sharedStrings.xml", {
      compressionLevel: opts.zipLevel,
      mtime: new Date(0),
    });
  if (opts.sstFirst) addSst();
  for (const i of sheetEntries) {
    zip.addReadStream(Readable.from(chunked(sheetXml(i))), `xl/worksheets/sheet${i + 1}.xml`, {
      compressionLevel: opts.zipLevel,
      mtime: new Date(0),
    });
  }
  add(
    "xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
  );
  if (!opts.sstFirst) addSst();
  zip.end();
  const out = createWriteStream(opts.out);
  zip.outputStream.pipe(out);
  await finished(out);
  return manifests;
}

// ---------- csv ----------

function csvText(cell: Exclude<Cell, null>, locale: "id" | "us"): string {
  if (cell.t === "s") return cell.v;
  if (cell.t === "d") return ddmmyyyy(cell.v);
  return Number.isInteger(cell.v)
    ? String(cell.v)
    : locale === "id"
      ? cell.v.toFixed(2).replace(".", ",")
      : cell.v.toFixed(2);
}

async function writeCsv(opts: CliOptions): Promise<SheetManifest[]> {
  const m = emptySheetManifest("csv", opts.headerRow, opts.cols);
  const kinds = columnKinds(opts);
  const d = opts.delimiter;
  const quote = (s: string) =>
    s.includes(d) || s.includes('"') || s.includes("\n") || s.includes("\r")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  const enc = (s: string): Buffer =>
    opts.encoding === "win1252"
      ? Buffer.from(s, "latin1")
      : opts.encoding === "utf16le"
        ? Buffer.from(s, "utf16le")
        : Buffer.from(s, "utf8");

  function* lines(): Generator<string> {
    let row = 0;
    for (const p of preambleRows(opts, 0)) {
      row++;
      if (p) {
        addText(m, row, 1, p);
        m.nonEmptyRows++;
        m.lastRow = row;
      }
      yield `${p ? quote(p) : ""}\r\n`;
    }
    row++;
    const headers = headerNames(opts);
    headers.forEach((h, c) => h && addText(m, row, c + 1, h));
    m.nonEmptyRows++;
    m.lastRow = row;
    yield `${headers.map(quote).join(d)}\r\n`;
    for (let r = 0; r < opts.rows; r++) {
      row++;
      const vals: string[] = [];
      for (let c = 0; c < opts.cols; c++) {
        const cell = dataCell(opts, 0, r, c, kinds[c]!);
        if (!cell) {
          vals.push("");
          continue;
        }
        const text = csvText(cell, opts.numberLocale);
        addText(m, row, c + 1, text);
        vals.push(quote(text));
      }
      m.nonEmptyRows++;
      m.lastRow = row;
      yield `${vals.join(d)}\r\n`;
    }
  }

  const out = createWriteStream(opts.out);
  const bom =
    opts.encoding === "utf8bom"
      ? Buffer.from([0xef, 0xbb, 0xbf])
      : opts.encoding === "utf16le"
        ? Buffer.from([0xff, 0xfe])
        : null;
  if (bom) out.write(bom);
  for (const chunk of chunked(lines())) {
    if (!out.write(enc(chunk))) await new Promise<void>((r) => out.once("drain", () => r()));
  }
  out.end();
  await finished(out);
  return [m];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const sheets = opts.kind === "xlsx" ? await writeXlsx(opts) : await writeCsv(opts);
  const { size } = await import("node:fs").then((fs) => fs.statSync(opts.out));
  const { out, ...params } = opts;
  writeFileSync(
    `${out}.manifest.json`,
    `${JSON.stringify({ file: out.split("/").pop(), bytes: size, params, sheets }, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      out,
      bytes: size,
      seconds: Math.round((Date.now() - t0) / 100) / 10,
      sheets: sheets.length,
    }),
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
