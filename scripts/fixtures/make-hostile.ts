/*
 * Fixture xlsx berbahaya berukuran kecil (T-005, catatan keamanan):
 *   doctype.xlsx  — worksheet dengan DOCTYPE + entitas bersarang ("billion laughs" mini)
 *   zipbomb.xlsx  — worksheet 128 MB berisi pengulangan, terkompresi ± 1 MB (± 117x)
 * Pakai: npx tsx scripts/fixtures/make-hostile.ts <direktori-keluaran>
 */
import { createWriteStream, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import yazl from "yazl";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function base(zip: yazl.ZipFile) {
  const add = (name: string, body: string) =>
    zip.addBuffer(Buffer.from(body), name, { mtime: new Date(0) });
  add(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  );
  add(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
}

async function write(zip: yazl.ZipFile, path: string) {
  zip.end();
  const out = createWriteStream(path);
  zip.outputStream.pipe(out);
  await finished(out);
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("pakai: make-hostile.ts <direktori>");

  // 1) DOCTYPE + entitas bersarang: 10 level × 10 = 10^10 'lol' bila diekspansi.
  const ents = ['<!ENTITY lol0 "lol">'];
  for (let i = 1; i <= 9; i++) ents.push(`<!ENTITY lol${i} "${`&lol${i - 1};`.repeat(10)}">`);
  const doc = new yazl.ZipFile();
  base(doc);
  doc.addBuffer(
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE worksheet [${ents.join("")}]><worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&lol9;</t></is></c></row></sheetData></worksheet>`,
    ),
    "xl/worksheets/sheet1.xml",
    { mtime: new Date(0) },
  );
  await write(doc, join(dir, "doctype.xlsx"));

  // 2) Zip-bomb: worksheet 128 MB yang sangat repetitif (± 117x).
  const bomb = new yazl.ZipFile();
  base(bomb);
  const text = "A".repeat(1000);
  const target = 128 * 1024 * 1024;
  function* body() {
    yield `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${NS}"><sheetData>`;
    let n = 0;
    let r = 0;
    while (n < target) {
      let chunk = "";
      for (let i = 0; i < 64; i++) {
        r++;
        chunk += `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${text}</t></is></c></row>`;
      }
      n += chunk.length;
      yield chunk;
    }
    yield "</sheetData></worksheet>";
  }
  bomb.addReadStream(Readable.from(body()), "xl/worksheets/sheet1.xml", {
    compressionLevel: 9,
    mtime: new Date(0),
  });
  await write(bomb, join(dir, "zipbomb.xlsx"));
  writeFileSync(
    join(dir, "hostile.manifest.json"),
    `${JSON.stringify({ "doctype.xlsx": "DOCTYPE + entitas bersarang 10^10", "zipbomb.xlsx": "worksheet 128 MB berulang (± 117x)" }, null, 2)}\n`,
  );
  console.log("ok");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
