import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import yazl from "yazl";
import {
  defaultSelection,
  needsPicker,
  selectionToSend,
  sheetNote,
} from "@/features/uploads/sheet-selection";
import { readXlsxSheets, type XlsxSheetInfo } from "@/features/uploads/xlsx-sheets";
import { openSharedBook } from "@/lib/xlsx/parser";

/*
 * Daftar sheet dibaca di browser sebelum unggah (T-85tb): jenis/status/PivotTable, nama identik dengan
 * parser server (entitas XML, prefix namespace, unicode), zip64, deflate/stored, dan file aneh → null.
 */
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const root = mkdtempSync(join(tmpdir(), "dd-xlsx-sheets-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

interface Spec {
  /** Atribut name apa adanya di XML (boleh berisi entitas). */
  raw: string;
  type?: "worksheet" | "chartsheet";
  state?: "hidden" | "veryHidden";
  pivot?: boolean;
}

async function book(
  specs: Spec[],
  opts: { zip64?: boolean; store?: boolean; prefix?: boolean } = {},
): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  const add = (name: string, body: string) =>
    zip.addBuffer(Buffer.from(body), name, {
      compress: !opts.store,
      forceZip64Format: !!opts.zip64,
    });
  const x = opts.prefix ? "x:" : "";
  add(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add(
    "xl/workbook.xml",
    `<?xml version="1.0"?><${x}workbook xmlns${opts.prefix ? ":x" : ""}="${NS}" xmlns:r="${REL}"><${x}sheets>${specs
      .map(
        (s, i) =>
          `<${x}sheet name="${s.raw}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ""} r:id="rId${i + 1}"/>`,
      )
      .join("")}</${x}sheets></${x}workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="${PKG}">${specs
      .map((s, i) => {
        const type = s.type ?? "worksheet";
        const dir = type === "worksheet" ? "worksheets" : "chartsheets";
        return `<Relationship Id="rId${i + 1}" Type="${REL}/${type}" Target="${dir}/sheet${i + 1}.xml"/>`;
      })
      .join("")}</Relationships>`,
  );
  specs.forEach((s, i) => {
    if ((s.type ?? "worksheet") === "worksheet") {
      add(
        `xl/worksheets/sheet${i + 1}.xml`,
        `<worksheet xmlns="${NS}"><sheetData><row r="1"><c><v>1</v></c></row></sheetData></worksheet>`,
      );
      if (s.pivot) {
        add(
          `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
          `<?xml version="1.0"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/pivotTable" Target="../pivotTables/pivotTable1.xml"/></Relationships>`,
        );
      }
    } else {
      add(`xl/chartsheets/sheet${i + 1}.xml`, `<chartsheet xmlns="${NS}"/>`);
    }
  });
  zip.end();
  const chunks: Buffer[] = [];
  for await (const c of zip.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const blob = (b: Buffer) => new Blob([new Uint8Array(b)]);

/** Nama sheet menurut parser server (jalur yang sama dengan ingest). */
async function serverNames(b: Buffer, name: string): Promise<string[]> {
  const path = join(root, name);
  writeFileSync(path, b);
  const { book, close } = await openSharedBook(path, root);
  close();
  return book.sheets.map((s) => s.name);
}

const SPECS: Spec[] = [
  { raw: "Data Penjualan" },
  { raw: "Pivot &amp; Ringkas", pivot: true },
  { raw: "Arsip", state: "hidden" },
  { raw: "Grafik", type: "chartsheet" },
  { raw: "Cabang &lt;Timur&gt; &#x2014; Q1 &quot;2026&quot; ü" },
];

describe("readXlsxSheets", () => {
  it("jenis, status, PivotTable; nama identik dengan parser server", async () => {
    const b = await book(SPECS);
    const got = await readXlsxSheets(blob(b));
    expect(got).toEqual<XlsxSheetInfo[]>([
      { name: "Data Penjualan", kind: "worksheet", state: "visible", pivot: false },
      { name: "Pivot & Ringkas", kind: "worksheet", state: "visible", pivot: true },
      { name: "Arsip", kind: "worksheet", state: "hidden", pivot: false },
      { name: "Grafik", kind: "chartsheet", state: "visible", pivot: false },
      {
        name: 'Cabang <Timur> — Q1 "2026" ü',
        kind: "worksheet",
        state: "visible",
        pivot: false,
      },
    ]);
    expect(got!.map((s) => s.name)).toEqual(await serverNames(b, "paritas.xlsx"));
  });

  it("zip64, entri stored, dan prefix namespace tetap terbaca sama", async () => {
    for (const [i, opts] of [{ zip64: true }, { store: true }, { prefix: true }].entries()) {
      const b = await book(SPECS, opts);
      const got = await readXlsxSheets(blob(b));
      expect(got?.map((s) => s.name)).toEqual(await serverNames(b, `varian-${i}.xlsx`));
    }
  });

  it("bukan zip / terpotong / tanpa workbook → null (unggah tanpa pilihan)", async () => {
    expect(await readXlsxSheets(new Blob(["bukan xlsx"]))).toBeNull();
    const b = await book(SPECS);
    expect(await readXlsxSheets(blob(b.subarray(0, b.length - 30)))).toBeNull();
    expect(await readXlsxSheets(blob(b.subarray(0, 200)))).toBeNull();
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from("x"), "lain.txt");
    zip.end();
    const chunks: Buffer[] = [];
    for await (const c of zip.outputStream) chunks.push(c as Buffer);
    expect(await readXlsxSheets(blob(Buffer.concat(chunks)))).toBeNull();
  });
});

describe("pilihan sheet", () => {
  const info = (name: string, extra: Partial<XlsxSheetInfo> = {}): XlsxSheetInfo => ({
    name,
    kind: "worksheet",
    state: "visible",
    pivot: false,
    ...extra,
  });
  const list = [
    info("Data"),
    info("Pivot", { pivot: true }),
    info("Arsip", { state: "hidden" }),
    info("Grafik", { kind: "chartsheet" }),
    info("Data 2"),
  ];

  it("pemilih hanya bila ≥ 2 worksheet; chartsheet tidak dihitung", () => {
    expect(needsPicker(null)).toBe(false);
    expect(needsPicker([info("A"), info("G", { kind: "chartsheet" })])).toBe(false);
    expect(needsPicker([info("A"), info("B", { state: "hidden" })])).toBe(true);
  });

  it("bawaan: worksheet tampil tanpa PivotTable + sheet aktif yang cocok", () => {
    expect(defaultSelection(list, [])).toEqual(["Data", "Data 2"]);
    expect(defaultSelection(list, ["Pivot", "Lama"])).toEqual(["Data", "Pivot", "Data 2"]);
    expect(defaultSelection(list, ["Arsip"])).toEqual(["Data", "Arsip", "Data 2"]);
    // Semua worksheet tersembunyi/pivot → tetap ada pilihan bawaan.
    expect(
      defaultSelection([info("P", { pivot: true }), info("H", { state: "hidden" })], []),
    ).toEqual(["P", "H"]);
  });

  it("dikirim: [] bila semua worksheet dipilih (perilaku lama), selain itu urut workbook", () => {
    expect(selectionToSend(list, new Set(["Data", "Pivot", "Arsip", "Data 2"]))).toEqual([]);
    expect(selectionToSend(list, new Set(["Data 2", "Data", "Grafik"]))).toEqual([
      "Data",
      "Data 2",
    ]);
    // > 50 worksheet: "semua" tidak boleh menjadi [] (worker menolak buku > 50 sheet tanpa pilihan).
    const many = Array.from({ length: 51 }, (_, i) => info(`S${i}`));
    expect(selectionToSend(many, new Set(many.map((x) => x.name)))).toHaveLength(51);
  });

  it("keterangan alasan tidak dicentang", () => {
    expect(list.map(sheetNote)).toEqual([
      null,
      "berisi PivotTable",
      "tersembunyi",
      "grafik, tidak bisa diimpor",
      null,
    ]);
  });
});
