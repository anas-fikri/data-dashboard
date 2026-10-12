import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { permanentMessage, runIngest } from "@/features/ingest/ingest";
import { MAX_RAW_COLS, dictionaryPageLimit } from "@/features/ingest/raw-writer";
import { buildXlsx, colLetter, readParquet, testRoot, VID } from "./fakes";

/*
 * Lebar maksimum (MAX_RAW_COLS) di memory_limit produksi 1 GB (D7), review T-006 putaran 2 (M3):
 * nilai berulang (kamus Parquet per kolom) dan string unik (segmen tabel per kolom) dulu OOM jauh
 * di bawah 2.048 kolom.
 */
const t = testRoot("ingest-wide");
afterAll(t.cleanup);
beforeEach(t.resetTmp);

async function ingest(path: string) {
  const s = t.setup(path);
  const r = await runIngest(VID, s.repo, s.storage, { ...s.opts, duckMemory: "1GB" });
  const sheet = s.repo.byIndex()[0];
  return { r, repo: s.repo, storage: s.storage, sheet };
}

function csv(rows: number, cell: (r: number, c: number) => string) {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    lines.push(Array.from({ length: MAX_RAW_COLS }, (_, c) => cell(r, c)).join(";"));
  }
  return `${lines.join("\n")}\n`;
}

describe(`${MAX_RAW_COLS} kolom di memory_limit 1 GB`, () => {
  it("CSV nilai berulang (kode, Y/N, angka kecil)", async () => {
    const { r, sheet } = await ingest(
      t.file(
        "mod10.csv",
        csv(3_000, (r, c) => String((r + c) % 10)),
      ),
    );
    expect(r).toEqual({ outcome: "done", sheets: 1 });
    expect(sheet).toMatchObject({ colCount: MAX_RAW_COLS, rawRows: 3_000 });
  }, 120_000);

  it("CSV string unik per sel", async () => {
    const { r, sheet, storage } = await ingest(
      t.file(
        "unik.csv",
        csv(2_000, (r, c) => `nilai unik ${r}-${c}`),
      ),
    );
    expect(r).toEqual({ outcome: "done", sheets: 1 });
    expect(sheet).toMatchObject({ colCount: MAX_RAW_COLS, rawRows: 2_000 });
    const rows = await readParquet(join(storage.dir, sheet!.rawKey!));
    expect(rows.at(-1)!.at(-1)).toBe(`nilai unik 1999-${MAX_RAW_COLS - 1}`);
  }, 120_000);

  it("xlsx angka berulang", async () => {
    let xml = "";
    for (let r = 1; r <= 300; r++) {
      let row = "";
      for (let c = 1; c <= MAX_RAW_COLS; c++) {
        row += `<c r="${colLetter(c)}${r}"><v>${(r + c) % 10}</v></c>`;
      }
      xml += `<row r="${r}">${row}</row>`;
    }
    const { r, sheet } = await ingest(
      t.file("angka.xlsx", await buildXlsx([{ name: "Lebar", xml }])),
    );
    expect(r).toEqual({ outcome: "done", sheets: 1 });
    expect(sheet).toMatchObject({ colCount: MAX_RAW_COLS, rawRows: 300 });
  }, 120_000);

  it("xlsx banyak baris sempit + satu sel di kolom terakhir (tabel melebar di tengah)", async () => {
    let xml = "";
    for (let r = 1; r <= 20_000; r++) {
      xml += `<row r="${r}"><c r="A${r}"><v>${r}</v></c><c r="B${r}" t="inlineStr"><is><t>Y</t></is></c></row>`;
    }
    xml += `<row r="20001"><c r="${colLetter(MAX_RAW_COLS)}20001"><v>1</v></c></row>`;
    const { r, sheet } = await ingest(
      t.file("melebar.xlsx", await buildXlsx([{ name: "Lebar", xml }])),
    );
    expect(r).toEqual({ outcome: "done", sheets: 1 });
    expect(sheet).toMatchObject({ colCount: MAX_RAW_COLS, rawRows: 20_001 });
  }, 120_000);
});

describe("klasifikasi kegagalan", () => {
  it("memori DuckDB habis → permanen dengan pesan yang bisa ditindaklanjuti", () => {
    for (const m of [
      "Out of Memory Error: failed to pin block of size 256.0 KiB (953.6 MiB/953.6 MiB used)",
      "Invalid Input Error: Failed to append: Failed to commit: could not allocate block of size 256.0 KiB",
    ]) {
      expect(permanentMessage(new Error(m))).toMatch(/memori pemrosesan tidak cukup/);
    }
  });

  it("disk temp penuh tetap sementara (diulang BullMQ)", () => {
    expect(
      permanentMessage(
        new Error(
          "Out of Memory Error: failed to offload data block: could not write file, the temporary directory is full",
        ),
      ),
    ).toBeNull();
  });

  it("batas halaman kamus mengikuti lebar (lembar ≤ 128 kolom memakai default DuckDB)", () => {
    expect(dictionaryPageLimit(30)).toBeNull();
    expect(dictionaryPageLimit(128)).toBeNull();
    expect(dictionaryPageLimit(1_000)).toBe(134_217);
    expect(dictionaryPageLimit(MAX_RAW_COLS)).toBe(65_536);
  });
});
