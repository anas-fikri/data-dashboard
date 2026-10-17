import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import yazl from "yazl";
import type { IngestOptions, IngestProgress } from "@/features/ingest/ingest";
import { permanentMessage, runIngest } from "@/features/ingest/ingest";
import { RawSheetWriter } from "@/features/ingest/raw-writer";
import { xlsxSheetsParallel } from "@/features/ingest/xlsx-parallel";
import { openDuck } from "@/lib/duckdb";
import { logger } from "@/lib/logger";
import { readSheetInWorker, WorkerStartError } from "@/lib/xlsx/parallel";
import { DEFAULT_LIMITS, type SharedBook } from "@/lib/xlsx/parser";
import { buildXlsx, readParquet, testRoot, VID } from "./fakes";

/*
 * Sheet xlsx paralel saat ingest (T-de1b): hasil identik dengan baca berurutan (raw/typed parquet
 * byte-per-byte, metadata sheet, skema), urutan sheet tetap urutan workbook walau sheet kecil selesai
 * lebih dulu, progres tidak mundur, dan galat satu sheet menghentikan sheet lain.
 */
// Hitung sheet yang dibaca di worker thread (bukti jalur paralel benar-benar dipakai); `entry`
// mengganti skrip worker (uji worker yang gagal dimuat).
const inWorker = vi.hoisted(() => ({ sheets: 0, entry: undefined as URL | undefined }));
vi.mock("@/lib/xlsx/parallel", async (orig) => {
  const m = await orig<typeof import("@/lib/xlsx/parallel")>();
  return {
    ...m,
    readSheetInWorker: (...a: Parameters<typeof m.readSheetInWorker>) => {
      inWorker.sheets++;
      return m.readSheetInWorker(a[0], a[1], a[2], a[3] ?? inWorker.entry);
    },
  };
});

const t = testRoot("ingest-parallel");
afterAll(t.cleanup);
beforeEach(t.resetTmp);
afterEach(() => {
  inWorker.entry = undefined;
  vi.restoreAllMocks();
});

const PARALLEL: Partial<IngestOptions> = { sheetThreads: 3, parallelMinSheetBytes: 0 };

async function ingest(fx: string, extra: Partial<IngestOptions> = {}) {
  const s = t.setup(fx);
  const r = await runIngest(VID, s.repo, s.storage, { ...s.opts, batchRows: 50, ...extra });
  const sheets = s.repo.byIndex();
  return {
    r,
    repo: s.repo,
    storage: s.storage,
    meta: sheets.map(({ rawKey: _r, typedKey: _t, ...rest }) => rest),
    raw: sheets.map((x) => readFileSync(join(s.storage.dir, x.rawKey!))),
    typed: sheets.map((x) => readFileSync(join(s.storage.dir, x.typedKey!))),
  };
}

async function expectSame(fx: string, extra: Partial<IngestOptions> = {}) {
  inWorker.sheets = 0;
  const seq = await ingest(fx, extra);
  expect(inWorker.sheets).toBe(0);
  const par = await ingest(fx, { ...extra, ...PARALLEL });
  expect(inWorker.sheets).toBe(seq.meta.length);
  expect(par.r).toEqual(seq.r);
  expect(par.meta).toEqual(seq.meta);
  expect(par.raw.length).toBe(seq.raw.length);
  par.raw.forEach((b, i) => expect(b.equals(seq.raw[i]!)).toBe(true));
  par.typed.forEach((b, i) => expect(b.equals(seq.typed[i]!)).toBe(true));
  return { seq, par };
}

/** xlsx dengan sharedStrings: sel `t="s"` berisi indeks ke `strings`. */
async function sstXlsx(strings: string[], sheets: { name: string; rows: number[][] }[]) {
  const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const zip = new yazl.ZipFile();
  const add = (name: string, body: string) => zip.addBuffer(Buffer.from(body), name);
  add(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="${PKG}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdS" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  );
  add(
    "xl/sharedStrings.xml",
    `<sst xmlns="${NS}">${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`,
  );
  sheets.forEach((s, i) =>
    add(
      `xl/worksheets/sheet${i + 1}.xml`,
      `<worksheet xmlns="${NS}"><sheetData>${s.rows
        .map(
          (r, ri) =>
            `<row r="${ri + 1}">${r.map((v) => `<c t="s"><v>${v}</v></c>`).join("")}</row>`,
        )
        .join("")}</sheetData></worksheet>`,
    ),
  );
  zip.end();
  const chunks: Buffer[] = [];
  for await (const c of zip.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** Sheet XML berisi `rows` baris × 3 kolom (teks inline + angka). */
const plainRows = (rows: number, tag: string) => {
  const out: string[] = [
    `<row r="1"><c t="inlineStr"><is><t>Kode</t></is></c><c t="inlineStr"><is><t>Nilai</t></is></c><c t="inlineStr"><is><t>Catatan</t></is></c></row>`,
  ];
  for (let r = 2; r <= rows + 1; r++) {
    out.push(
      `<row r="${r}"><c t="inlineStr"><is><t>${tag}-${r}</t></is></c><c><v>${r * 3}</v></c><c t="inlineStr"><is><t>baris ${r}</t></is></c></row>`,
    );
  }
  return out.join("");
};

describe("sheet paralel: hasil identik dengan berurutan", () => {
  it("tiga-sheet.xlsx: raw/typed parquet byte-per-byte, metadata dan skema sama", async () => {
    const { par } = await expectSame("tests/fixtures/tiga-sheet.xlsx");
    expect(par.r).toEqual({ outcome: "done", sheets: 3 });
    expect(par.meta.map((s) => s.index)).toEqual([0, 1, 2]);
  }, 60_000);

  it("kecil.xlsx (sel tanggal, header baris 4) dengan sharedStrings di-spill ke disk", async () => {
    await expectSame("tests/fixtures/kecil.xlsx", {
      limits: { ...DEFAULT_LIMITS, spillBytes: 0 },
    });
  }, 60_000);

  it("sharedStrings panjang multibyte melintasi halaman spill, sel terpotong dihitung per sheet", async () => {
    // 64 KiB per halaman: string 20–40 ribu karakter multibyte (2–3 byte, acak agar lolos batas rasio
    // dekompresi) pasti melintasi batas halaman; > 32.767 karakter dipotong dan dihitung per sheet.
    let seed = 7;
    const ALPHA = "éèàüößçñøåжщыэюяαβγδ€₹✓";
    const text = (n: number) =>
      Array.from({ length: n }, () => {
        seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
        return ALPHA[seed % ALPHA.length];
      }).join("");
    const strings = ["Judul", "Isi"];
    for (let i = 0; i < 40; i++) strings.push(`${i}:${text(20_000 + i * 500)}`);
    for (let i = 0; i < 500; i++) strings.push(`pendek ${i}`);
    const rows = (from: number) =>
      [[0, 1]].concat(Array.from({ length: 60 }, (_, r) => [2 + ((from + r) % 40), 42 + r]));
    const fx = t.file(
      "sst-panjang.xlsx",
      await sstXlsx(strings, [
        { name: "A", rows: rows(0) },
        { name: "B", rows: rows(13) },
        { name: "C", rows: rows(27) },
      ]),
    );
    for (const spillBytes of [0, DEFAULT_LIMITS.spillBytes]) {
      const { par } = await expectSame(fx, { limits: { ...DEFAULT_LIMITS, spillBytes } });
      expect(par.r).toEqual({ outcome: "done", sheets: 3 });
      expect(par.meta.every((s) => s.truncatedCells > 0)).toBe(true);
      const cells = (await readParquet(join(par.storage.dir, par.repo.byIndex()[1]!.rawKey!)))
        .slice(1)
        .map((r) => r[1] as string);
      expect(cells[0]!.startsWith("13:")).toBe(true);
      expect(cells[0]!.length).toBe(20_000 + 13 * 500 + 3);
    }
  }, 60_000);

  it("sheet kecil tetap berurutan (di bawah ambang ukuran XML sheet)", async () => {
    inWorker.sheets = 0;
    const r = await ingest("tests/fixtures/tiga-sheet.xlsx", { sheetThreads: 3 });
    expect(r.r).toEqual({ outcome: "done", sheets: 3 });
    expect(inWorker.sheets).toBe(0);
  }, 60_000);
});

describe("sheet paralel: worker thread gagal dimulai / kehabisan heap", () => {
  it("worker gagal dimuat → warn sekali, file dibaca berurutan dengan hasil identik", async () => {
    const fx = "tests/fixtures/tiga-sheet.xlsx";
    const seq = await ingest(fx);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    // Modul tidak ada ('error' sebelum pesan pertama) dan URL yang ditolak konstruktor Worker.
    for (const entry of [
      new URL("./tidak-ada.ts", import.meta.url),
      new URL("https://contoh.invalid/w.ts"),
    ]) {
      warn.mockClear();
      inWorker.sheets = 0;
      inWorker.entry = entry;
      const par = await ingest(fx, PARALLEL);
      expect(inWorker.sheets).toBeGreaterThan(0);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![1])).toMatch(/berurutan/);
      expect(par.r).toEqual(seq.r);
      expect(par.meta).toEqual(seq.meta);
      par.raw.forEach((b, i) => expect(b.equals(seq.raw[i]!)).toBe(true));
      par.typed.forEach((b, i) => expect(b.equals(seq.typed[i]!)).toBe(true));
    }
  }, 60_000);

  it("ERR_WORKER_OUT_OF_MEMORY bukan galat mulai; dipetakan ke gagal permanen 'terlalu berat'", async () => {
    const job = readSheetInWorker(
      {} as SharedBook,
      0,
      async () => {},
      new URL("./oom-worker.ts", import.meta.url),
    );
    const err = await job.done.then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as { code?: string }).code).toBe("ERR_WORKER_OUT_OF_MEMORY");
    expect(err).not.toBeInstanceOf(WorkerStartError);
    expect(permanentMessage(err)).toMatch(/^File terlalu berat untuk diproses/);
    // Galat mulai sendiri tetap sementara (tidak pernah sampai ke user: jalur berurutan dipakai).
    expect(permanentMessage(new WorkerStartError(new Error("x")))).toBeNull();
  }, 60_000);
});

describe("sheet paralel: urutan, progres, galat", () => {
  it("urutan hasil = urutan workbook walau sheet kecil selesai lebih dulu; progres tidak mundur", async () => {
    const fx = t.file(
      "urutan.xlsx",
      await buildXlsx([
        { name: "Besar", xml: plainRows(6_000, "B") },
        { name: "Kecil 1", xml: plainRows(5, "K") },
        { name: "Kecil 2", xml: plainRows(5, "L") },
      ]),
    );
    const work = mkdtempSync(join(t.root, "tmp", "par-"));
    const duck = await openDuck({
      path: join(work, "w.duckdb"),
      tmpDir: work,
      memoryLimit: "256MB",
    });
    const finish = vi.spyOn(RawSheetWriter.prototype, "finish");
    const seen: Partial<IngestProgress>[] = [];
    try {
      const out = await xlsxSheetsParallel(
        duck,
        fx,
        work,
        DEFAULT_LIMITS,
        3,
        (p) => seen.push({ ...p }),
        async () => {},
        { batchRows: 100 },
        { row: 0 },
      );
      expect(out.map((s) => [s.rec.index, s.rec.name])).toEqual([
        [0, "Besar"],
        [1, "Kecil 1"],
        [2, "Kecil 2"],
      ]);
      expect(out.map((s) => s.rec.rawRows)).toEqual([6_001, 6, 6]);
      expect(out[0]!.rec.columns.map((c) => c.name)).toEqual(["Kode", "Nilai", "Catatan"]);
      // Sheet kecil selesai (COPY) sebelum sheet besar.
      const order = finish.mock.contexts.map((w) => (w as unknown as { table: string }).table);
      expect(order.at(-1)).toBe("s0");
    } finally {
      duck.close();
    }
    // Progres: indeks sheet tidak pernah mundur; baris/fraksi sheet yang sama tidak pernah mundur.
    for (let i = 1; i < seen.length; i++) {
      const [a, b] = [seen[i - 1]!, seen[i]!];
      expect(b.sheet!).toBeGreaterThanOrEqual(a.sheet!);
      if (a.sheet === b.sheet) {
        expect(b.rows!).toBeGreaterThanOrEqual(a.rows!);
        expect(b.fraction!).toBeGreaterThanOrEqual(a.fraction!);
      }
    }
    expect(seen[0]!.sheet).toBe(0);
    expect(seen.some((p) => p.sheet === 0 && p.rows === 6_001 && p.fraction === 1)).toBe(true);
  }, 60_000);

  it("galat parse di satu sheet → sheet lain dihentikan, FAILED dengan nama sheet, tanpa objek", async () => {
    inWorker.sheets = 0;
    const fx = t.file(
      "rusak.xlsx",
      await buildXlsx([
        { name: "Satu", xml: plainRows(100_000, "S") },
        // Nomor baris mundur → XlsxLimitError di awal sheet.
        { name: "Rusak", xml: `<row r="5"><c><v>1</v></c></row><row r="2"><c><v>2</v></c></row>` },
        { name: "Tiga", xml: plainRows(100_000, "T") },
      ]),
    );
    const s = t.setup(fx);
    const rows = new Map<number, number>();
    const r = await runIngest(VID, s.repo, s.storage, {
      ...s.opts,
      ...PARALLEL,
      batchRows: 500,
      afterBatch: (sheet, n) => void rows.set(sheet, n),
    });
    expect(r).toMatchObject({ outcome: "failed" });
    expect(s.repo.status).toBe("FAILED");
    expect(s.repo.error).toMatch(/sheet "Rusak"/);
    expect(s.repo.error).not.toMatch(/Sheet "Satu"|Sheet "Tiga"/);
    expect(s.storage.parquetKeys()).toEqual([]);
    expect(inWorker.sheets).toBe(3);
    // Sheet besar tidak dibaca sampai habis.
    expect(rows.get(0) ?? 0).toBeLessThan(100_001);
    expect(rows.get(2) ?? 0).toBeLessThan(100_001);
  }, 60_000);

  it("galat konsumen di satu sheet (worker mati disimulasikan) → semua dihentikan, galat asli dilempar", async () => {
    const fx = t.file(
      "konsumen.xlsx",
      await buildXlsx([
        { name: "Satu", xml: plainRows(100_000, "S") },
        { name: "Dua", xml: plainRows(100_000, "D") },
      ]),
    );
    const s = t.setup(fx);
    const rows = new Map<number, number>();
    await expect(
      runIngest(VID, s.repo, s.storage, {
        ...s.opts,
        ...PARALLEL,
        batchRows: 500,
        afterBatch: (sheet, n) => {
          rows.set(sheet, n);
          if (sheet === 1 && n >= 1_000) throw new Error("SIGKILL disimulasikan");
        },
      }),
    ).rejects.toThrow(/SIGKILL/);
    expect(rows.get(0) ?? 0).toBeLessThan(100_001);
    expect(s.repo.sheets.size).toBe(0);
  }, 60_000);

  it("dataset dihapus di tengah baca paralel → gone, objek versi dihapus", async () => {
    const fx = t.file(
      "hapus.xlsx",
      await buildXlsx([
        { name: "Satu", xml: plainRows(20_000, "S") },
        { name: "Dua", xml: plainRows(20_000, "D") },
      ]),
    );
    const s = t.setup(fx);
    let batches = 0;
    s.repo.alive = () => batches < 3;
    const r = await runIngest(VID, s.repo, s.storage, {
      ...s.opts,
      ...PARALLEL,
      batchRows: 500,
      afterBatch: () => {
        batches++;
      },
    });
    expect(r).toEqual({ outcome: "gone" });
    expect(s.storage.parquetKeys()).toEqual([]);
  }, 60_000);
});
