import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import yauzl from "yauzl";
import yazl from "yazl";
import { createSaxParser, DEFAULT_LIMITS } from "../../scripts/bench/parser-sax";
import type { RawValue } from "../../scripts/bench/types";
import { COMMITTED } from "../../scripts/fixtures/build-committed";
import {
  columnKinds,
  dataCell,
  fnv1a,
  headerNames,
  preambleRows,
  type FixtureOptions,
  type SheetManifest,
} from "../../scripts/fixtures/model";

/*
 * T-005: fixture kecil deterministik dan parser SAX (kandidat terpilih ADR-0005) membaca setiap sel
 * persis seperti model; file berbahaya ditolak. Tidak menyentuh tests/fixtures/perf/.
 */
const tmp = mkdtempSync(join(tmpdir(), "dd-fixture-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function manifestOf(path: string) {
  return JSON.parse(readFileSync(`${path}.manifest.json`, "utf8")) as {
    bytes: number;
    params: FixtureOptions;
    sheets: SheetManifest[];
  };
}

/** Isi setiap entri zip (nama → byte). Byte zip utuh bergantung versi zlib Node, isinya tidak. */
function zipEntries(path: string): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const out = new Map<string, Buffer>();
      zip.on("error", reject);
      zip.on("end", () => resolve(out));
      zip.on("entry", (e: yauzl.Entry) =>
        zip.openReadStream(e, (err2, rs) => {
          if (err2) return reject(err2);
          const chunks: Buffer[] = [];
          rs.on("data", (c: Buffer) => chunks.push(c));
          rs.on("end", () => {
            out.set(e.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    });
  });
}

describe("fixture kecil", () => {
  it("deterministik: regenerasi kecil.xlsx berisi entri identik dengan yang di-commit", async () => {
    const spec = COMMITTED.find((f) => f.out.endsWith("kecil.xlsx"))!;
    const out = join(tmp, "kecil.xlsx");
    const r = spawnSync("npx", ["tsx", "scripts/make-fixture.ts", ...spec.args, "--out", out], {
      timeout: 55_000,
    });
    expect(r.status).toBe(0);
    const [got, want] = await Promise.all([zipEntries(out), zipEntries(spec.out)]);
    expect([...got.keys()]).toEqual([...want.keys()]);
    for (const [name, data] of want) expect(got.get(name)!.equals(data), name).toBe(true);
  }, 60_000);

  it("setiap fixture yang di-commit punya manifest", () => {
    for (const f of COMMITTED) expect(manifestOf(f.out).bytes).toBeGreaterThan(0);
  });
});

describe("parser SAX (yauzl + saxes)", () => {
  it("kecil.xlsx: baris fisik, header di baris 4, setiap sel cocok dengan model", async () => {
    const path = "tests/fixtures/kecil.xlsx";
    const m = manifestOf(path);
    const opts = m.params;
    const kinds = columnKinds(opts);
    const rows: { sheet: number; row: number; vals: RawValue[] }[] = [];
    await createSaxParser().parse(
      path,
      { sheetNames: m.sheets.map((s) => s.name), tmpDir: tmp },
      (sheet, row, vals) => rows.push({ sheet, row, vals }),
    );
    expect(rows.filter((r) => r.sheet === 0)).toHaveLength(m.sheets[0]!.nonEmptyRows);
    // Baris 2 kosong tidak dipancarkan; nomor baris tetap fisik (dibutuhkan raw.parquet `_row`).
    expect(rows.slice(0, 3).map((r) => r.row)).toEqual([1, 3, 4]);
    expect(rows[0]!.vals[0]).toBe(preambleRows(opts, 0)[0]);
    expect(rows[2]!.vals.slice(0, 3)).toEqual(headerNames(opts).slice(0, 3));
    let mismatches = 0;
    for (const { sheet, row, vals } of rows) {
      if (row <= opts.headerRow) continue;
      for (let c = 0; c < opts.cols; c++) {
        const exp = dataCell(opts, sheet, row - opts.headerRow - 1, c, kinds[c]!);
        const got = vals[c];
        const ok =
          exp === null
            ? got === undefined || got === null
            : exp.t === "d"
              ? got instanceof Date && got.getTime() === exp.v.getTime()
              : got === exp.v;
        if (!ok) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  it("spill sharedStrings ke disk menghasilkan nilai yang sama", async () => {
    const path = "tests/fixtures/kecil.xlsx";
    const m = manifestOf(path);
    const collect = async (spillBytes: number) => {
      const out: string[] = [];
      await createSaxParser({ ...DEFAULT_LIMITS, spillBytes }).parse(
        path,
        { sheetNames: [m.sheets[0]!.name], tmpDir: tmp },
        (_s, _r, vals) => out.push(JSON.stringify(vals)),
      );
      return out;
    };
    expect(await collect(0)).toEqual(await collect(DEFAULT_LIMITS.spillBytes));
  });

  it("DOCTYPE ditolak sebelum sel apa pun dipancarkan", async () => {
    let cells = 0;
    await expect(
      createSaxParser().parse(
        "tests/fixtures/hostile/doctype.xlsx",
        { sheetNames: ["Sheet1"], tmpDir: tmp },
        () => cells++,
      ),
    ).rejects.toThrow(/DOCTYPE/);
    expect(cells).toBe(0);
  });

  it("zip-bomb (± 117x) ditolak dari central directory dengan batas default, tanpa dekompresi", async () => {
    let cells = 0;
    await expect(
      createSaxParser().parse(
        "tests/fixtures/hostile/zipbomb.xlsx",
        { sheetNames: ["Sheet1"], tmpDir: tmp },
        () => cells++,
      ),
    ).rejects.toThrow(/rasio dekompresi/);
    expect(cells).toBe(0);
    // Rasio per entri dilonggarkan: batas total (100× ukuran file) tetap menolak.
    await expect(
      createSaxParser({ ...DEFAULT_LIMITS, maxRatio: 1000 }).parse(
        "tests/fixtures/hostile/zipbomb.xlsx",
        { sheetNames: ["Sheet1"], tmpDir: tmp },
        () => {},
      ),
    ).rejects.toThrow(/melebihi batas/);
  });

  it("zip tanpa workbook ditolak dengan pesan 'bukan Buku Kerja Excel'", async () => {
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from("halo"), "readme.txt");
    zip.end();
    const chunks: Buffer[] = [];
    for await (const c of zip.outputStream) chunks.push(c as Buffer);
    const path = join(tmp, "bukan.xlsx");
    writeFileSync(path, Buffer.concat(chunks));
    await expect(
      createSaxParser().parse(path, { sheetNames: [], tmpDir: tmp }, () => {}),
    ).rejects.toThrow(/bukan Buku Kerja Excel/);
  });

  it("file bukan zip (csv berganti nama) ditolak", async () => {
    await expect(
      createSaxParser().parse(
        "tests/fixtures/kecil-us.csv",
        { sheetNames: [], tmpDir: tmp },
        () => {},
      ),
    ).rejects.toThrow(/bukan Buku Kerja Excel yang valid, atau rusak\/terpotong/);
  });

  it("sedang.xlsx dengan spill paksa (171 ribu string, indeks lintas blok) = tanpa spill", async () => {
    const path = "tests/fixtures/sedang.xlsx";
    const collect = async (spillBytes: number) => {
      let h = 0;
      let n = 0;
      await createSaxParser({ ...DEFAULT_LIMITS, spillBytes }).parse(
        path,
        { sheetNames: [], tmpDir: tmp },
        (_s, r, vals) => {
          n++;
          h = (h ^ fnv1a(`${r}:${JSON.stringify(vals)}`)) >>> 0;
        },
      );
      return { n, h };
    };
    const spilled = await collect(0);
    expect(spilled).toEqual(await collect(DEFAULT_LIMITS.spillBytes));
    expect(spilled.n).toBe(manifestOf(path).sheets[0]!.nonEmptyRows);
  }, 30_000);
});
