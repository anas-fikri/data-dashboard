import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runIngest, type IngestOptions } from "@/features/ingest/ingest";
import { buildXlsx, colLetter, DS, readParquet, testRoot, VID } from "./fakes";

/* Regresi temuan review T-006 putaran 1 (CSV, tabel lebar, file rusak, pembersihan). */
const t = testRoot("ingest-review");
afterAll(t.cleanup);
beforeEach(t.resetTmp);

async function ingest(path: string, extra: Partial<IngestOptions> = {}) {
  const s = t.setup(path);
  const r = await runIngest(VID, s.repo, s.storage, { ...s.opts, ...extra });
  const sheet = s.repo.byIndex()[0];
  const rows = sheet?.rawKey ? await readParquet(join(s.storage.dir, sheet.rawKey)) : [];
  return { r, repo: s.repo, storage: s.storage, sheet, rows };
}

const wideRow = (r: number, cols: number) =>
  `<row r="${r}">${Array.from({ length: cols }, (_, c) => `<c r="${colLetter(c + 1)}${r}" t="inlineStr"><is><t>v${r}-${c}</t></is></c>`).join("")}</row>`;

describe("CSV", () => {
  it("> satu buffer dengan baris baru di dalam kutip (tanpa pemindai paralel)", async () => {
    const lines = ["kode;alamat;nilai"];
    for (let i = 0; i < 25_000; i++) {
      lines.push(`${i};"Jl. Mawar ${i}\nRT 01/RW 02 ${"x".repeat(80)}";${i * 3}`);
    }
    const { r, sheet, rows } = await ingest(t.file("qnl.csv", `${lines.join("\n")}\n`), {
      csvBufferSize: 1024 * 1024,
    });
    expect(r).toEqual({ outcome: "done", sheets: 1 });
    expect(sheet!.rawRows).toBe(25_001);
    expect(String(rows[1]![2])).toContain("\n");
    expect(rows.at(-1)![0]).toBe(25_001);
  }, 60_000);

  it("50 ribu baris kosong diproses linear; nomor fisik tetap benar", async () => {
    const parts = ["a;b"];
    for (let i = 0; i < 50_000; i++) parts.push(`${i};x`, "");
    const t0 = Date.now();
    const { r, rows } = await ingest(t.file("kosong.csv", `${parts.join("\n")}\n`));
    expect(r).toEqual({ outcome: "done", sheets: 1 });
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(rows.slice(0, 3).map((x) => x[0])).toEqual([1, 2, 4]);
    expect(rows.at(-1)![0]).toBe(100_000);
  }, 60_000);

  it("1.100 kolom ditulis (hitung sel terpotong tanpa rantai ekspresi); 2.100 kolom ditolak", async () => {
    const row = (p: string) => Array.from({ length: 1_100 }, (_, i) => `${p}${i}`).join(";");
    const ok = await ingest(t.file("lebar.csv", `${row("h")}\n${row("v")}\n`));
    expect(ok.r).toEqual({ outcome: "done", sheets: 1 });
    expect(ok.sheet!.colCount).toBe(1_100);
    const bad = await ingest(
      t.file("terlalu-lebar.csv", `${Array.from({ length: 2_100 }, () => "x").join(";")}\n`),
    );
    expect(bad.r).toMatchObject({ outcome: "failed" });
    expect(bad.repo.error).toMatch(/punya 2\.100 kolom di baris 1; maksimal 2\.048 kolom/);
  }, 60_000);

  it("encoding diputuskan dari seluruh file: ASCII > 64 KB lalu aksen Windows-1252 → utuh", async () => {
    const ascii = Array.from({ length: 4_000 }, (_, i) => `${i};nama biasa nomor ${i}`).join("\n");
    const tail = Buffer.from("\n9001;café señal\n9002;über\n", "latin1");
    const { r, rows } = await ingest(
      t.file("campur.csv", Buffer.concat([Buffer.from(`no;nama\n${ascii}`), tail])),
    );
    expect(r).toEqual({ outcome: "done", sheets: 1 });
    expect(rows.at(-2)![2]).toBe("café señal");
    expect(rows.at(-1)![2]).toBe("über");
  });

  it('kutip di tengah field (3" PVC) bukan pembuka kutip; delimiter tetap terdeteksi', async () => {
    const { r, sheet, rows } = await ingest(
      t.file("inci.csv", 'Laporan pipa 3" per gudang\nNo;Nama;Qty\n1;Pipa 3" PVC;2\n\n2;Lem;5\n'),
    );
    expect(r).toEqual({ outcome: "done", sheets: 1 });
    expect(sheet!.colCount).toBe(3);
    expect(rows.map((x) => x[0])).toEqual([1, 2, 3, 5]);
    expect(rows[2]![2]).toBe('Pipa 3" PVC');
  });

  it("satu kolom dengan baris kosong; akhir baris CR saja", async () => {
    const one = await ingest(t.file("satu.csv", "A\n\nB\n\nC\n"));
    expect(one.rows.map((x) => x[0])).toEqual([1, 3, 5]);
    const cr = await ingest(t.file("cr.csv", "a;b\r1;2\r3;4\r"));
    expect(cr.r).toEqual({ outcome: "done", sheets: 1 });
    expect(cr.sheet!.colCount).toBe(2);
    expect(cr.sheet!.rawRows).toBe(3);
  });
});

describe("xlsx", () => {
  it("1.000 kolom ditulis; > 2.048 kolom ditolak dengan pesan permanen", async () => {
    const ok = await ingest(
      t.file(
        "lebar.xlsx",
        await buildXlsx([
          { name: "L", xml: Array.from({ length: 50 }, (_, i) => wideRow(i + 1, 1_000)).join("") },
        ]),
      ),
    );
    expect(ok.r).toEqual({ outcome: "done", sheets: 1 });
    expect(ok.sheet!.colCount).toBe(1_000);
    const bad = await ingest(
      t.file("terlalu-lebar.xlsx", await buildXlsx([{ name: "L", xml: wideRow(1, 2_100) }])),
    );
    expect(bad.r).toMatchObject({ outcome: "failed" });
    expect(bad.repo.error).toMatch(/2\.100 kolom; maksimal 2\.048/);
  }, 120_000);

  it("terpotong → FAILED permanen dengan pesan (tidak diulang BullMQ)", async () => {
    const full = readFileSync("tests/fixtures/tiga-sheet.xlsx");
    const cut = await ingest(
      t.file("terpotong.xlsx", full.subarray(0, Math.floor(full.length / 2))),
    );
    expect(cut.r).toMatchObject({ outcome: "failed" });
    expect(cut.repo.error).toMatch(/bukan Buku Kerja Excel yang valid, atau rusak\/terpotong/);
  });
});

describe("pembersihan", () => {
  it("versi sudah terhapus sebelum dimuat → prefix dibersihkan lewat datasetId di data job", async () => {
    const s = t.setup("tests/fixtures/kecil.xlsx");
    const stray = join(s.storage.dir, `parquet/${DS}/${VID}/sisa/raw.parquet`);
    mkdirSync(dirname(stray), { recursive: true });
    writeFileSync(stray, "x");
    s.repo.alive = () => false;
    expect(await runIngest(VID, s.repo, s.storage, { ...s.opts, datasetIdHint: DS })).toEqual({
      outcome: "gone",
    });
    expect(s.storage.parquetKeys()).toEqual([]);
  });

  it("hapus prefix gagal → dicatat untuk job pembersihan", async () => {
    const s = t.setup("tests/fixtures/hostile/doctype.xlsx");
    let calls = 0;
    s.storage.deletePrefix = async () => {
      calls++;
      if (calls > 1) throw new Error("storage mati");
      return 0;
    };
    expect(await runIngest(VID, s.repo, s.storage, s.opts)).toMatchObject({ outcome: "failed" });
    expect(s.repo.cleanups).toEqual([`parquet/${DS}/${VID}/`]);
  });
});

describe("encoding dengan byte rusak (review putaran 2, N1)", () => {
  const utf8 = (s: string) => Buffer.from(s, "utf8");
  const STRAY = Buffer.from([0x96]); // en dash Windows-1252, tidak valid sebagai UTF-8

  it('"CSV UTF-8" Excel (ber-BOM) + satu byte rusak → tetap UTF-8, hanya byte itu menjadi U+FFFD', async () => {
    const body = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      utf8("nama;kota\nJosé;München\nBudi;"),
      STRAY,
      utf8("Bandung\n"),
    ]);
    const { r, rows } = await ingest(t.file("bom-rusak.csv", body));
    expect(r).toEqual({ outcome: "done", sheets: 1 });
    expect(rows[1]!.slice(1)).toEqual(["José", "München"]);
    expect(rows[2]![2]).toBe("�Bandung");
  });

  it("tanpa BOM, mayoritas aksen UTF-8 valid + satu byte rusak → UTF-8", async () => {
    const body = Buffer.concat([
      utf8("nama;kota\nJosé;Zürich\nRenée;Málaga\n"),
      STRAY,
      utf8(";x\n"),
    ]);
    const { rows } = await ingest(t.file("utf8-rusak.csv", body));
    expect(rows[2]!.slice(1)).toEqual(["Renée", "Málaga"]);
  });

  it("Windows-1252 asli (semua aksen tidak valid sebagai UTF-8) → tetap Windows-1252", async () => {
    const body = Buffer.concat([
      Buffer.from("nama;kota\nJosé;München ", "latin1"),
      STRAY,
      Buffer.from(" Pusat\n", "latin1"),
    ]);
    const { rows } = await ingest(t.file("cp1252.csv", body));
    expect(rows[1]!.slice(1)).toEqual(["José", "München – Pusat"]);
  });
});
