import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import yazl from "yazl";
import { createSaxParser, DEFAULT_LIMITS, isDateFormat } from "../../scripts/bench/parser-sax";
import type { RawValue } from "../../scripts/bench/types";

/* Kasus tepi OOXML dan input rusak untuk parser xlsx (review T-005). */
const tmp = mkdtempSync(join(tmpdir(), "dd-sax-edge-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

interface Book {
  sheet: string;
  sst?: string[];
  styles?: string;
  workbookPr?: string;
  /** Prefix namespace untuk elemen worksheet (mis. "x"). */
  prefix?: string;
  /** Nama part non-standar untuk workbook/sharedStrings/styles. */
  oddNames?: boolean;
}

let n = 0;
async function book(b: Book): Promise<string> {
  const wb = b.oddNames ? "wb/main.xml" : "xl/workbook.xml";
  const dir = wb.slice(0, wb.lastIndexOf("/"));
  const sstName = b.oddNames ? "strings.xml" : "sharedStrings.xml";
  const stylesName = b.oddNames ? "gaya.xml" : "styles.xml";
  const zip = new yazl.ZipFile();
  const add = (name: string, body: string) => zip.addBuffer(Buffer.from(body), name);
  add(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
  );
  add(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="${wb}"/></Relationships>`,
  );
  add(
    wb,
    `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${REL}">${b.workbookPr ?? ""}<sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  add(
    `${dir}/_rels/${wb.slice(dir.length + 1)}.rels`,
    `<?xml version="1.0"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/sharedStrings" Target="${sstName}"/><Relationship Id="rId3" Type="${REL}/styles" Target="/${dir}/${stylesName}"/></Relationships>`,
  );
  const p = b.prefix ? `${b.prefix}:` : "";
  const xmlns = b.prefix ? `xmlns:${b.prefix}="${NS}"` : `xmlns="${NS}"`;
  add(
    `${dir}/worksheets/sheet1.xml`,
    `<?xml version="1.0"?><${p}worksheet ${xmlns}><${p}sheetData>${b.sheet}</${p}sheetData></${p}worksheet>`,
  );
  add(
    `${dir}/${sstName}`,
    `<?xml version="1.0"?><sst xmlns="${NS}">${(b.sst ?? []).map((s) => `<si>${s}</si>`).join("")}</sst>`,
  );
  add(
    `${dir}/${stylesName}`,
    b.styles ??
      `<?xml version="1.0"?><styleSheet xmlns="${NS}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
  );
  zip.end();
  const chunks: Buffer[] = [];
  for await (const c of zip.outputStream) chunks.push(c as Buffer);
  const path = join(tmp, `b${++n}.xlsx`);
  writeFileSync(path, Buffer.concat(chunks));
  return path;
}

async function rows(path: string, limits = DEFAULT_LIMITS) {
  const out: { row: number; vals: RawValue[] }[] = [];
  const summary = await createSaxParser(limits).parse(
    path,
    { sheetNames: [], tmpDir: tmp },
    (_s, row, vals) => out.push({ row, vals }),
  );
  return { out, summary };
}

describe("parser SAX: kasus tepi OOXML", () => {
  it("tag ber-prefix namespace (ekspor .NET OpenXML SDK) dibaca", async () => {
    const p = await book({
      prefix: "x",
      sheet: `<x:row r="1"><x:c r="A1"><x:v>5</x:v></x:c><x:c r="B1" t="s"><x:v>0</x:v></x:c></x:row>`,
      sst: ["<t>halo</t>"],
    });
    expect((await rows(p)).out).toEqual([{ row: 1, vals: [5, "halo"] }]);
  });

  it("nama part tidak standar ditemukan lewat relasi; Target absolut dan relatif", async () => {
    const p = await book({
      oddNames: true,
      sheet: `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="1"><v>45658</v></c></row>`,
      sst: ["<t>ok</t>"],
    });
    const { out } = await rows(p);
    expect(out[0]!.vals[0]).toBe("ok");
    expect((out[0]!.vals[1] as Date).toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("sistem tanggal 1904: serial 0 = 1904-01-01", async () => {
    const p = await book({
      workbookPr: `<workbookPr date1904="1"/>`,
      sheet: `<row r="1"><c r="A1" s="1"><v>0</v></c></row>`,
    });
    expect(((await rows(p)).out[0]!.vals[0] as Date).toISOString()).toBe(
      "1904-01-01T00:00:00.000Z",
    );
  });

  it("format kustom: escape \\m dan padding _/* bukan tanggal; d/m/yyyy tanggal", () => {
    expect(isDateFormat("0\\ \\m")).toBe(false);
    expect(isDateFormat("0.00\\h")).toBe(false);
    expect(isDateFormat('#,##0_);[Red]"(dm)"')).toBe(false);
    expect(isDateFormat("d/m/yyyy")).toBe(true);
    expect(isDateFormat("[$-421]dd mmmm yyyy")).toBe(true);
    expect(isDateFormat("General")).toBe(false);
  });

  it("escape _xHHHH_ didekode (CR dari Excel), _x005F_ = garis bawah literal; rich text + CDATA", async () => {
    const p = await book({
      sheet: `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t><![CDATA[a<b]]></t></is></c></row>`,
      sst: [
        "<t>Jl. Mawar_x000D_\nNo. 5</t>",
        `<r><t xml:space="preserve">kode </t></r><r><t>_x005F_x0041_</t></r><rPh><t>abaikan</t></rPh>`,
      ],
    });
    expect((await rows(p)).out[0]!.vals).toEqual(["Jl. Mawar\r\nNo. 5", "kode _x0041_", "a<b"]);
  });

  it('sel t="d" (ISO) menjadi tanggal naive; t="s" tanpa <v> = kosong', async () => {
    const p = await book({
      sheet: `<row r="1"><c r="A1" t="d"><v>2025-03-04T10:30:00</v></c><c r="B1" t="s"/><c r="C1"><v>1</v></c></row>`,
      sst: ["<t>pertama</t>"],
    });
    const vals = (await rows(p)).out[0]!.vals;
    expect((vals[0] as Date).toISOString()).toBe("2025-03-04T10:30:00.000Z");
    expect(vals[1]).toBeUndefined();
    expect(vals[2]).toBe(1);
  });

  it("baris yang hanya bergaya (tanpa nilai) tidak dipancarkan", async () => {
    const p = await book({
      sheet: `<row r="1"><c r="A1"><v>1</v></c></row><row r="2" ht="30" customHeight="1"/><row r="3"><c r="A3" s="0"/></row><row r="4"><c r="A4"><v>4</v></c></row>`,
    });
    expect((await rows(p)).out.map((r) => r.row)).toEqual([1, 4]);
  });

  it("sel lebih dari 32.767 karakter dipotong dan dihitung", async () => {
    const long = "x".repeat(40_000);
    const p = await book({
      sheet: `<row r="1"><c r="A1" t="inlineStr"><is><t>${long}</t></is></c><c r="B1" t="s"><v>0</v></c></row>`,
      sst: [`<t>${long}</t>`],
    });
    const { out, summary } = await rows(p);
    expect((out[0]!.vals[0] as string).length).toBe(32_767);
    expect((out[0]!.vals[1] as string).length).toBe(32_767);
    expect(summary).toEqual({ truncatedCells: 2 });
  });
});

describe("parser SAX: batas panjang teks", () => {
  it("shared string terpotong yang dipakai 2 sel dihitung 2; surrogate tidak terbelah; escape tidak memicu potong", async () => {
    const emoji = "\u{1F600}"; // 2 unit UTF-16
    const nearEscape = "x".repeat(32_760) + "_x0041__x0042__x0043_"; // didekode = 32.763 karakter
    const p = await book({
      sheet: `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>`,
      sst: [
        `<t>${"y".repeat(40_000)}</t>`,
        `<t>${"z".repeat(32_766)}${emoji}</t>`,
        `<t>${nearEscape}</t>`,
      ],
    });
    const { out, summary } = await rows(p);
    const [a, b, c, d] = out[0]!.vals as string[];
    expect(a!.length).toBe(32_767);
    expect(b).toBe(a);
    expect(c).toBe("z".repeat(32_766)); // high surrogate yang tersisa dibuang
    expect(d).toBe("x".repeat(32_760) + "ABC");
    expect(summary).toEqual({ truncatedCells: 3 });
  });

  it("satu node teks raksasa ditolak tanpa ditampung utuh (melawan file buatan)", async () => {
    const huge = "q".repeat(2_000_000);
    const p = await book({
      sheet: `<row r="1"><c r="A1" t="inlineStr"><is><t>${huge}</t></is></c></row>`,
    });
    // Batas rasio/ekspansi dilonggarkan agar yang diuji batas buffer node (file nyata bisa lolos rasio).
    const loose = { ...DEFAULT_LIMITS, maxRatio: 1e9, maxExpansion: 1e9 };
    await expect(rows(p, loose)).rejects.toThrow(/melebihi batas panjang/);
  });
});

describe("parser SAX: struktur XML buatan yang menghabiskan memori ditolak", () => {
  const loose = { ...DEFAULT_LIMITS, maxRatio: 1e9, maxExpansion: 1e9 };

  it("nesting sangat dalam ditolak sebelum tumpukan tag membesar", async () => {
    const deep = "<xy>".repeat(10_000) + "</xy>".repeat(10_000);
    const p = await book({ sheet: `<row r="1"><c r="A1"><v>1</v></c></row>${deep}` });
    await expect(rows(p, loose)).rejects.toThrow(/terlalu dalam/);
  });

  it("tag dengan ribuan atribut ditolak", async () => {
    const attrs = Array.from({ length: 5_000 }, (_, i) => `a${i}="1"`).join(" ");
    const p = await book({ sheet: `<row r="1"><c r="A1" ${attrs}><v>1</v></c></row>` });
    await expect(rows(p, loose)).rejects.toThrow(/atribut berlebihan/);
  });

  it("nilai atribut panjang pada elemen bersarang ditolak (tidak ditahan di tumpukan)", async () => {
    const v = "v".repeat(20_000);
    const open = Array.from({ length: 10 }, (_, i) => `<n${i} a="${v}">`).join("");
    const close = Array.from({ length: 10 }, (_, i) => `</n${9 - i}>`).join("");
    const p = await book({ sheet: `<row r="1"><c r="A1"><v>1</v></c></row>${open}${close}` });
    await expect(rows(p, loose)).rejects.toThrow(/nilai atribut .* terlalu panjang/);
  });

  it("baris dengan total isi > 4 juta karakter ditolak", async () => {
    const cell = (i: number) =>
      `<c r="${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}1" t="inlineStr"><is><t>${"w".repeat(30_000)}</t></is></c>`;
    const cells = Array.from({ length: 140 }, (_, i) => cell(i)).join("");
    const p = await book({ sheet: `<row r="1">${cells}</row>` });
    await expect(rows(p, loose)).rejects.toThrow(/isi satu baris melebihi/);
  });

  it("fixture nyata tetap lolos batas kedalaman/atribut", async () => {
    const out: number[] = [];
    await createSaxParser().parse(
      "tests/fixtures/kecil.xlsx",
      { sheetNames: [], tmpDir: tmp },
      (_s, r) => out.push(r),
    );
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("parser SAX: input rusak/berbahaya ditolak dengan pesan", () => {
  it.each([
    [
      "indeks shared string di luar rentang",
      `<row r="1"><c r="A1" t="s"><v>9</v></c></row>`,
      /referensi teks tidak valid/,
    ],
    [
      "indeks shared string bukan angka",
      `<row r="1"><c r="A1" t="s"><v>x</v></c></row>`,
      /referensi teks tidak valid/,
    ],
    ["kolom melebihi XFD", `<row r="1"><c r="ZZZZZZ1"><v>1</v></c></row>`, /kolom melebihi batas/],
    [
      "baris melebihi 1.048.576",
      `<row r="99999999999"><c r="A1"><v>1</v></c></row>`,
      /melebihi batas/,
    ],
    [
      "nomor baris mundur",
      `<row r="5"><c r="A5"><v>1</v></c></row><row r="3"><c r="A3"><v>1</v></c></row>`,
      /nomor baris tidak valid/,
    ],
  ])("%s", async (_name, sheet, msg) => {
    const p = await book({ sheet, sst: ["<t>satu</t>"] });
    await expect(rows(p)).rejects.toThrow(msg);
  });

  it("workbook dengan 2.500 sheet ditolak saat sheet ke-51 dibaca; nama sheet raksasa ditolak", async () => {
    const zip = new yazl.ZipFile();
    const sheetsXml = Array.from(
      { length: 2_500 },
      (_, i) => `<sheet name="S${i}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    ).join("");
    zip.addBuffer(
      Buffer.from(
        `<?xml version="1.0"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
      "_rels/.rels",
    );
    zip.addBuffer(
      Buffer.from(
        `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${sheetsXml}</sheets></workbook>`,
      ),
      "xl/workbook.xml",
    );
    zip.end();
    const chunks: Buffer[] = [];
    for await (const c of zip.outputStream) chunks.push(c as Buffer);
    const path = join(tmp, "banyak-sheet.xlsx");
    writeFileSync(path, Buffer.concat(chunks));
    await expect(rows(path)).rejects.toThrow(/lebih dari 50 sheet/);

    const longName = "N".repeat(1_000);
    const zip2 = new yazl.ZipFile();
    zip2.addBuffer(
      Buffer.from(
        `<?xml version="1.0"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
      "_rels/.rels",
    );
    zip2.addBuffer(
      Buffer.from(
        `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="${longName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      "xl/workbook.xml",
    );
    zip2.end();
    const c2: Buffer[] = [];
    for await (const c of zip2.outputStream) c2.push(c as Buffer);
    const path2 = join(tmp, "nama-panjang.xlsx");
    writeFileSync(path2, Buffer.concat(c2));
    await expect(rows(path2)).rejects.toThrow(/nama sheet terlalu panjang/);
  });

  it("jumlah sheet melebihi batas ditolak", async () => {
    const p = await book({ sheet: `<row r="1"><c r="A1"><v>1</v></c></row>` });
    await expect(rows(p, { ...DEFAULT_LIMITS, maxSheets: 0 })).rejects.toThrow(/sheet; maksimal 0/);
  });
});

describe("parser SAX: spill sharedStrings", () => {
  it("dua parse paralel dengan spill tidak saling menimpa, file spill dihapus", async () => {
    const limits = { ...DEFAULT_LIMITS, spillBytes: 0 };
    const make = (tag: string) =>
      book({
        sheet: Array.from(
          { length: 300 },
          (_, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="s"><v>${i}</v></c></row>`,
        ).join(""),
        sst: Array.from({ length: 300 }, (_, i) => `<t>${tag}-${i}</t>`),
      });
    const [a, b] = await Promise.all([make("a"), make("b")]);
    const dir = mkdtempSync(join(tmp, "spill-"));
    const run = async (p: string) => {
      const out: RawValue[] = [];
      await createSaxParser(limits).parse(p, { sheetNames: [], tmpDir: dir }, (_s, _r, v) =>
        out.push(v[0]),
      );
      return out;
    };
    const [ra, rb] = await Promise.all([run(a), run(b)]);
    expect(ra).toEqual(Array.from({ length: 300 }, (_, i) => `a-${i}`));
    expect(rb).toEqual(Array.from({ length: 300 }, (_, i) => `b-${i}`));
    expect(readdirSync(dir)).toEqual([]);
  });
});
