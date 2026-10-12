import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import yazl from "yazl";
import { runIngest } from "@/features/ingest/ingest";
import { DEFAULT_LIMITS } from "@/lib/xlsx/parser";
import { DS, readParquet, testRoot, VID } from "./fakes";

/*
 * Ingest tahap raw (T-006) end-to-end di dalam proses: parser + DuckDB sungguhan, database dan storage
 * dipalsukan (in-memory + direktori lokal). AC: header baris 4, CSV Windows-1252, idempoten setelah
 * worker mati, dataset dihapus di tengah, file rusak/berbahaya → FAILED tanpa objek tersisa.
 */
const t = testRoot("ingest-test");
const { root, setup } = t;
afterAll(t.cleanup);
beforeEach(t.resetTmp);

const manifest = (p: string) =>
  JSON.parse(readFileSync(`${p}.manifest.json`, "utf8")) as {
    sheets: { name: string; nonEmptyRows: number; lastRow: number }[];
  };

describe("ingest raw: xlsx", () => {
  it("3 sheet, header baris 4 (judul + baris kosong di atasnya), header kosong/duplikat → nama unik + asli", async () => {
    const fx = "tests/fixtures/tiga-sheet.xlsx";
    const { storage, repo, opts } = setup(fx);
    const r = await runIngest(VID, repo, storage, opts);
    expect(r).toEqual({ outcome: "done", sheets: 3 });
    expect(repo.stage).toBe("typed");
    expect(repo.status).toBe("READY");
    expect(repo.sha256).toBe(createHash("sha256").update(readFileSync(fx)).digest("hex"));

    const m = manifest(fx);
    const sheets = repo.byIndex();
    expect(sheets.map((s) => s.name)).toEqual(m.sheets.map((s) => s.name));
    for (const [i, s] of sheets.entries()) {
      expect(s.headerRow).toBe(4);
      // raw = semua baris terisi: baris data + judul/keterangan di atas header + header itu sendiri
      expect(s.rawRows).toBe(m.sheets[i]!.nonEmptyRows);
      expect(s.colCount).toBe(12);
      expect(s.rawKey).toBe(`parquet/${DS}/${VID}/${[...repo.sheets.keys()][i]}/raw.parquet`);
      const rows = await readParquet(join(storage.dir, s.rawKey!));
      expect(rows).toHaveLength(s.rawRows);
      expect(rows.slice(0, 3).map((r) => r[0])).toEqual([1, 3, 4]); // _row fisik, baris 2 kosong
      expect(rows.at(-1)![0]).toBe(m.sheets[i]!.lastRow);
    }
    const names = sheets[0]!.columns.map((c) => c.name);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(12);
    expect(names).toContain("Keterangan_2");
    expect(sheets[0]!.columns.at(-1)).toEqual({ pos: 12, name: "kolom_12", original: "" });
    expect(sheets[0]!.columns.find((c) => c.name === "Keterangan_2")!.original).toBe("Keterangan");
    expect(repo.progressLog.at(-1)!.stage).toBe("simpan");
  });

  it("sel tanggal xlsx disimpan ISO naive; angka sebagai teks apa adanya", async () => {
    const { storage, repo, opts } = setup("tests/fixtures/kecil.xlsx");
    await runIngest(VID, repo, storage, opts);
    const s = repo.byIndex()[0]!;
    const rows = await readParquet(join(storage.dir, s.rawKey!));
    const dates = rows
      .slice(4)
      .map((r) => r[2])
      .filter((v) => typeof v === "string");
    expect(dates.some((d) => /^\d{4}-\d{2}-\d{2}$/.test(d as string))).toBe(true);
    expect(dates.some((d) => /^\d{2}\/\d{2}\/\d{4}$/.test(d as string))).toBe(true); // teks asli dipertahankan
  });
});

describe("ingest raw: csv", () => {
  it("Windows-1252 + titik koma terdeteksi; karakter aksen utuh", async () => {
    const fx = "tests/fixtures/kecil-win1252.csv";
    const { storage, repo, opts } = setup(fx);
    expect(await runIngest(VID, repo, storage, opts)).toEqual({ outcome: "done", sheets: 1 });
    const s = repo.byIndex()[0]!;
    expect(s.rawRows).toBe(manifest(fx).sheets[0]!.nonEmptyRows);
    expect(s.colCount).toBe(10);
    const text = (await readParquet(join(storage.dir, s.rawKey!))).flat().join("|");
    expect(text).toMatch(/café|señal|über/);
    expect(text).not.toContain("�");
  });

  it("UTF-8 BOM + titik koma + 2 baris pembuka; koma/kutip/baris baru di dalam sel (RFC 4180)", async () => {
    const id = setup("tests/fixtures/kecil-id-titikkoma.csv");
    await runIngest(VID, id.repo, id.storage, id.opts);
    const s = id.repo.byIndex()[0]!;
    expect(s.headerRow).toBe(3);
    expect(s.columns[0]!.name).toBe("No Resi");
    const idRows = await readParquet(join(id.storage.dir, s.rawKey!));
    expect(idRows.slice(0, 2).map((r) => r[0])).toEqual([1, 3]); // baris kosong 2 tetap terhitung
    expect(idRows.at(-1)![0]).toBe(
      manifest("tests/fixtures/kecil-id-titikkoma.csv").sheets[0]!.lastRow,
    );
    const us = setup("tests/fixtures/kecil-us.csv");
    await runIngest(VID, us.repo, us.storage, us.opts);
    const su = us.repo.byIndex()[0]!;
    expect(su.rawRows).toBe(manifest("tests/fixtures/kecil-us.csv").sheets[0]!.nonEmptyRows);
    const cells = (await readParquet(join(us.storage.dir, su.rawKey!))).flat();
    expect(cells.some((v) => typeof v === "string" && v.includes("\n"))).toBe(true);
    expect(cells.some((v) => typeof v === "string" && v.includes('"catatan"'))).toBe(true);
  });

  it("UTF-16 ditolak dengan pesan simpan ulang UTF-8; tidak ada objek tersisa", async () => {
    const { storage, repo, opts } = setup("tests/fixtures/utf16.csv");
    const r = await runIngest(VID, repo, storage, opts);
    expect(r).toMatchObject({ outcome: "failed" });
    expect(repo.error).toMatch(/UTF-16/);
    expect(storage.keys().filter((k) => k.startsWith("parquet/"))).toEqual([]);
  });
});

describe("ingest raw: sel panjang dipotong + dihitung per sheet", () => {
  it("xlsx: sel > 32.767 karakter dipotong, dihitung di sheet yang benar", async () => {
    const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
    const long = "p".repeat(40_000);
    const zip = new yazl.ZipFile();
    zip.addBuffer(
      Buffer.from(
        `<?xml version="1.0"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
      "_rels/.rels",
    );
    zip.addBuffer(
      Buffer.from(
        `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="A" sheetId="1" r:id="rId1"/><sheet name="B" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      ),
      "xl/workbook.xml",
    );
    zip.addBuffer(
      Buffer.from(
        `<?xml version="1.0"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
      ),
      "xl/_rels/workbook.xml.rels",
    );
    zip.addBuffer(
      Buffer.from(
        `<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Catatan</t></is></c></row></sheetData></worksheet>`,
      ),
      "xl/worksheets/sheet1.xml",
    );
    zip.addBuffer(
      Buffer.from(
        `<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Catatan</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>${long}</t></is></c></row></sheetData></worksheet>`,
      ),
      "xl/worksheets/sheet2.xml",
    );
    zip.end();
    const chunks: Buffer[] = [];
    for await (const c of zip.outputStream) chunks.push(c as Buffer);
    const path = join(root, "panjang.xlsx");
    writeFileSync(path, Buffer.concat(chunks));

    const { storage, repo, opts } = setup(path);
    expect(await runIngest(VID, repo, storage, opts)).toEqual({ outcome: "done", sheets: 2 });
    const [a, b] = repo.byIndex();
    expect(a!.truncatedCells).toBe(0);
    expect(b!.truncatedCells).toBe(1);
    const rows = await readParquet(join(storage.dir, b!.rawKey!));
    expect((rows[1]![1] as string).length).toBe(32_767);
  });

  it("csv: sel > 32.767 karakter dipotong dan dihitung", async () => {
    const path = join(root, "panjang.csv");
    writeFileSync(path, `nama;catatan\nA;${"q".repeat(40_000)}\nB;pendek\n`);
    const { storage, repo, opts } = setup(path);
    expect(await runIngest(VID, repo, storage, opts)).toEqual({ outcome: "done", sheets: 1 });
    const s = repo.byIndex()[0]!;
    expect(s.truncatedCells).toBe(1);
    const rows = await readParquet(join(storage.dir, s.rawKey!));
    expect((rows[1]![2] as string).length).toBe(32_767);
  });
});

describe("ingest raw: ketahanan", () => {
  it("worker mati di tengah lalu diulang → objek identik dengan ingest tanpa gangguan, tanpa sisa parsial", async () => {
    const fx = "tests/fixtures/tiga-sheet.xlsx";
    const clean = setup(fx);
    await runIngest(VID, clean.repo, clean.storage, { ...clean.opts, batchRows: 100 });
    const cleanBytes = clean.repo
      .byIndex()
      .map((s) => readFileSync(join(clean.storage.dir, s.rawKey!)));

    const t = setup(fx);
    // Percobaan 1: sheet pertama sudah terunggah lalu "koneksi putus" di unggahan kedua (sementara).
    t.storage.failUploadOnce = 2;
    await expect(runIngest(VID, t.repo, t.storage, { ...t.opts, batchRows: 100 })).rejects.toThrow(
      /ECONNRESET/,
    );
    expect(t.storage.keys().filter((k) => k.startsWith("parquet/")).length).toBe(1); // sisa parsial
    // Percobaan 2 (BullMQ mengulang): mulai bersih, hasil identik.
    expect(await runIngest(VID, t.repo, t.storage, { ...t.opts, batchRows: 100 })).toEqual({
      outcome: "done",
      sheets: 3,
    });
    const keys = t.storage.keys().filter((k) => k.startsWith("parquet/"));
    expect(keys).toHaveLength(6); // raw + typed-1 per sheet
    const bytes = t.repo.byIndex().map((s) => readFileSync(join(t.storage.dir, s.rawKey!)));
    for (let i = 0; i < 3; i++) expect(bytes[i]!.equals(cleanBytes[i]!)).toBe(true);
    const typed = (x: typeof t) =>
      x.repo.byIndex().map((s) => readFileSync(join(x.storage.dir, s.typedKey!)));
    const want = typed(clean);
    typed(t).forEach((b, i) => expect(b.equals(want[i]!)).toBe(true));
    expect(t.repo.sheets.size).toBe(3);
  }, 60_000);

  it("proses terhenti di tengah batch (crash) lalu diulang → identik", async () => {
    const fx = "tests/fixtures/sedang.xlsx";
    const clean = setup(fx);
    await runIngest(VID, clean.repo, clean.storage, { ...clean.opts, batchRows: 2_000 });
    const want = readFileSync(join(clean.storage.dir, clean.repo.byIndex()[0]!.rawKey!));
    const t = setup(fx);
    let crash = true;
    await expect(
      runIngest(VID, t.repo, t.storage, {
        ...t.opts,
        batchRows: 2_000,
        afterBatch: (_s, rows) => {
          if (crash && rows >= 6_000) throw new Error("SIGKILL disimulasikan");
        },
      }),
    ).rejects.toThrow(/SIGKILL/);
    crash = false;
    await runIngest(VID, t.repo, t.storage, { ...t.opts, batchRows: 2_000 });
    expect(readFileSync(join(t.storage.dir, t.repo.byIndex()[0]!.rawKey!)).equals(want)).toBe(true);
  }, 60_000);

  it("dataset dihapus saat ingest berjalan → berhenti di batch berikutnya, objek versi dihapus", async () => {
    const { storage, repo, opts } = setup("tests/fixtures/sedang.xlsx");
    let batches = 0;
    repo.alive = () => batches < 2;
    const r = await runIngest(VID, repo, storage, {
      ...opts,
      batchRows: 1_000,
      afterBatch: () => {
        batches++;
      },
    });
    expect(r).toEqual({ outcome: "gone" });
    expect(batches).toBe(2);
    expect(storage.keys().filter((k) => k.startsWith("parquet/"))).toEqual([]);
  }, 60_000);

  it("dataset dihapus saat unggah raw.parquet → objek yang sudah terunggah ikut dihapus", async () => {
    const { storage, repo, opts } = setup("tests/fixtures/tiga-sheet.xlsx");
    let checks = 0;
    const realUpload = storage.upload.bind(storage);
    storage.upload = async (k: string, p: string, ct?: string) => {
      await realUpload(k, p, ct);
      checks++;
    };
    repo.alive = () => checks < 1;
    expect(await runIngest(VID, repo, storage, opts)).toEqual({ outcome: "gone" });
    expect(storage.keys().filter((k) => k.startsWith("parquet/"))).toEqual([]);
  });

  it("xlsx rusak di tengah sheet → FAILED dengan sheet/baris, tanpa objek/metadata tersisa", async () => {
    const path = join(root, "rusak.xlsx");
    const zip = new yazl.ZipFile();
    const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    zip.addBuffer(
      Buffer.from(
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
      "_rels/.rels",
    );
    zip.addBuffer(
      Buffer.from(
        `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Rusak" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      ),
      "xl/workbook.xml",
    );
    zip.addBuffer(
      Buffer.from(
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
      ),
      "xl/_rels/workbook.xml.rels",
    );
    const rows = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`,
      ).join("");
    zip.addBuffer(
      Buffer.from(`<worksheet xmlns="${NS}"><sheetData>${rows(50)}</sheetData></worksheet>`),
      "xl/worksheets/sheet1.xml",
    );
    zip.addBuffer(
      Buffer.from(
        `<worksheet xmlns="${NS}"><sheetData>${rows(120)}<row r="121"><c r="A121"><v>1</v></c></row><row r="122"><c </bad></sheetData></worksheet>`,
      ),
      "xl/worksheets/sheet2.xml",
    );
    zip.end();
    const chunks: Buffer[] = [];
    for await (const c of zip.outputStream) chunks.push(c as Buffer);
    writeFileSync(path, Buffer.concat(chunks));

    const { storage, repo, opts } = setup(path);
    const r = await runIngest(VID, repo, storage, opts);
    expect(r).toMatchObject({ outcome: "failed" });
    expect(repo.error).toMatch(/sheet "Rusak" baris 12[12]/);
    expect(repo.status).toBe("FAILED");
    expect(repo.sheets.size).toBe(0);
    expect(storage.keys().filter((k) => k.startsWith("parquet/"))).toEqual([]);
  });

  it.each([
    ["zipbomb.xlsx", /rasio dekompresi/],
    ["doctype.xlsx", /DOCTYPE/],
  ])("file berbahaya %s → FAILED cepat dengan pesan", async (f, msg) => {
    const { storage, repo, opts } = setup(`tests/fixtures/hostile/${f}`);
    const t0 = Date.now();
    expect(await runIngest(VID, repo, storage, opts)).toMatchObject({ outcome: "failed" });
    expect(repo.error).toMatch(msg);
    expect(Date.now() - t0).toBeLessThan(5_000);
  });

  it("batas baris per sheet dan deadline → FAILED dengan pesan; versi yang sudah selesai tidak diproses ulang", async () => {
    const a = setup("tests/fixtures/sedang.xlsx");
    await runIngest(VID, a.repo, a.storage, {
      ...a.opts,
      limits: { ...DEFAULT_LIMITS, maxRows: 1_000 },
    });
    expect(a.repo.error).toMatch(/melebihi batas 1\.000 baris/);

    const b = setup("tests/fixtures/sedang.xlsx");
    await runIngest(VID, b.repo, b.storage, { ...b.opts, deadline: Date.now() - 1 });
    expect(b.repo.status).toBe("FAILED");
    expect(b.repo.error).toMatch(/melebihi/);

    const c = setup("tests/fixtures/kecil.xlsx");
    c.repo.status = "READY";
    expect(await runIngest(VID, c.repo, c.storage, c.opts)).toEqual({ outcome: "skipped" });
  });
});
