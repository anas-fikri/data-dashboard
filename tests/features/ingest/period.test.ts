import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isIsoDate,
  PERIOD_COLUMN_FROZEN,
  PERIOD_HEADER_FROZEN,
  periodFreezeViolation,
  periodKeyOf,
  periodStartOf,
  sheetPeriod,
} from "@/features/ingest/period";
import { copyTyped, typedFileProblems } from "@/features/ingest/typed";
import type { ColumnSchema } from "@/features/ingest/infer";
import { openDuck, type Duck } from "@/lib/duckdb";

/* Model periode (T-049): kunci/awal periode, aturan beku, dan gerbang `_period` file typed. */

describe("kunci dan awal periode", () => {
  it("bulan/kuartal/tahun → awal periode naive dan kunci stabil", () => {
    expect(periodStartOf("MONTH", "2026-03-31")).toBe("2026-03-01");
    expect(periodStartOf("QUARTER", "2026-05-15")).toBe("2026-04-01");
    expect(periodStartOf("QUARTER", "2026-12-31")).toBe("2026-10-01");
    expect(periodStartOf("YEAR", "2024-02-29")).toBe("2024-01-01");
    expect(periodKeyOf("MONTH", "2026-03-01")).toBe("2026-03");
    expect(periodKeyOf("QUARTER", "2026-04-01")).toBe("2026-Q2");
    expect(periodKeyOf("QUARTER", "2026-12-01")).toBe("2026-Q4");
    expect(periodKeyOf("YEAR", "2026-01-01")).toBe("2026");
  });

  it("tanggal tidak valid ditolak (bukan digeser diam-diam)", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-3-1")).toBe(false);
    expect(isIsoDate("2026-01-01'; DROP")).toBe(false);
    expect(() => periodStartOf("MONTH", "2026-13-01")).toThrow(/tidak valid/);
  });

  it("mode periode hanya bila versi DAN sheet berperiode; LABEL tanpa kolom", () => {
    expect(sheetPeriod(null, "COLUMN", 2)).toBeNull();
    expect(sheetPeriod("MONTH", null, null)).toBeNull();
    expect(sheetPeriod("MONTH", "COLUMN", 2)).toEqual({
      grain: "MONTH",
      source: "COLUMN",
      column: 2,
    });
    expect(sheetPeriod("YEAR", "LABEL", 2)).toEqual({
      grain: "YEAR",
      source: "LABEL",
      column: null,
    });
  });
});

describe("aturan beku (AC3)", () => {
  const col = { grain: "MONTH", source: "COLUMN", column: 3 } as const;
  const schema = [{ pos: 3, type: "date" as const, dateFormat: "dd/mm/yyyy" as const }];
  const base = { currentHeaderRow: 1, schema };

  it("non-periode: tidak ada yang dibekukan", () => {
    expect(
      periodFreezeViolation(null, { ...base, headerRow: 4, columns: [{ pos: 3, type: "text" }] }),
    ).toBeNull();
  });

  it("baris judul baru ditolak (sumber kolom maupun label); baris judul sama boleh", () => {
    expect(periodFreezeViolation(col, { ...base, headerRow: 2 })).toBe(PERIOD_HEADER_FROZEN);
    expect(
      periodFreezeViolation(
        { grain: "MONTH", source: "LABEL", column: null },
        { ...base, headerRow: 2 },
      ),
    ).toBe(PERIOD_HEADER_FROZEN);
    expect(periodFreezeViolation(col, { ...base, headerRow: 1 })).toBeNull();
  });

  it("tipe/locale/format kolom periode ditolak; nama/sembunyi dan kolom lain boleh", () => {
    for (const c of [
      { pos: 3, type: "text" as const },
      { pos: 3, dateFormat: "mm/dd/yyyy" as const },
      { pos: 3, numberLocale: "id" as const },
    ]) {
      expect(periodFreezeViolation(col, { ...base, columns: [c] })).toBe(PERIOD_COLUMN_FROZEN);
    }
    expect(
      periodFreezeViolation(col, {
        ...base,
        columns: [
          { pos: 3, name: "Tanggal Kirim", hidden: true },
          { pos: 3, type: "date", dateFormat: "dd/mm/yyyy" },
          { pos: 1, type: "integer" },
        ],
      }),
    ).toBeNull();
    // Label: tidak ada kolom periode yang dibekukan.
    expect(
      periodFreezeViolation(
        { grain: "MONTH", source: "LABEL", column: null },
        { ...base, columns: [{ pos: 3, type: "text" }] },
      ),
    ).toBeNull();
  });
});

describe("_period di file typed + gerbang (AC2–AC4)", () => {
  const dir = join(tmpdir(), `period-${process.pid}-${Date.now()}`);
  let duck: Duck;
  const raw = join(dir, "raw.parquet");
  const schema: ColumnSchema[] = [
    { pos: 1, name: "kode", original: "kode", type: "text", hidden: false } as ColumnSchema,
    {
      pos: 2,
      name: "nilai",
      original: "nilai",
      type: "integer",
      numberLocale: "us",
      hidden: false,
    } as ColumnSchema,
  ];
  const write = async (out: string, period?: string | null) =>
    copyTyped(duck, {
      rawPath: raw,
      outPath: out,
      source: "csv",
      headerRow: 1,
      watch: async () => {},
      rowBase: 100n,
      rawCols: 2,
      schema,
      charsPerRow: 4,
      period,
    });
  const columnsOf = async (path: string) =>
    (await duck.conn.runAndReadAll(`DESCRIBE SELECT * FROM read_parquet('${path}')`))
      .getRowObjects()
      .map((r) => `${String(r.column_name)}:${String(r.column_type)}`);

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    duck = await openDuck({ path: join(dir, "w.duckdb"), tmpDir: dir, memoryLimit: "128MB" });
    await duck.conn.run(
      `COPY (SELECT * FROM (VALUES (1, 'kode', 'nilai'), (2, 'A', '1'), (3, 'B', '2'), (5, 'C', '3'))
             AS t(_row, c1, c2)) TO '${raw}' (FORMAT parquet)`,
    );
  });
  afterAll(() => {
    duck?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("AC2: tanpa periode → layout typed sama seperti sebelumnya (tanpa _period)", async () => {
    const out = join(dir, "plain.parquet");
    await write(out);
    expect(await columnsOf(out)).toEqual([
      "_row:BIGINT",
      "_src_row:INTEGER",
      "c1:VARCHAR",
      "c2:BIGINT",
    ]);
    expect(await typedFileProblems(duck, out, 3, "f")).toEqual([]);
  });

  it("AC3: periode → _period DATE konstan setelah _src_row; gerbang lolos", async () => {
    const out = join(dir, "p.parquet");
    await write(out, "2026-03-01");
    expect(await columnsOf(out)).toEqual([
      "_row:BIGINT",
      "_src_row:INTEGER",
      "_period:DATE",
      "c1:VARCHAR",
      "c2:BIGINT",
    ]);
    const rows = (
      await duck.conn.runAndReadAll(
        `SELECT _row, strftime(_period, '%Y-%m-%d') FROM read_parquet('${out}') ORDER BY _row`,
      )
    ).getRowsJS();
    expect(rows).toEqual([
      [102n, "2026-03-01"],
      [103n, "2026-03-01"],
      [105n, "2026-03-01"],
    ]);
    expect(await typedFileProblems(duck, out, 3, "f", "2026-03-01")).toEqual([]);
  });

  it("awal periode bukan tanggal valid → ditolak sebelum masuk SQL", async () => {
    await expect(write(join(dir, "bad.parquet"), "2026-03-01' --")).rejects.toThrow(/tidak valid/);
  });

  it("AC4: _period NULL, baris periode lain, atau kolom hilang → masalah integritas", async () => {
    const mixed = join(dir, "mixed.parquet");
    await duck.conn.run(
      `COPY (SELECT * FROM (VALUES (1::BIGINT, DATE '2026-03-01'), (2, NULL), (3, DATE '2026-04-01'))
             AS t(_row, _period)) TO '${mixed}' (FORMAT parquet)`,
    );
    expect(await typedFileProblems(duck, mixed, 3, "f", "2026-03-01")).toEqual([
      "f: 1 baris data tanpa periode",
      "f: 1 baris periode 2026-03-01, 3 baris di metadata",
    ]);
    const plain = join(dir, "plain2.parquet");
    await write(plain);
    expect(await typedFileProblems(duck, plain, 3, "f", "2026-03-01")).toEqual([
      "f: kolom periode tidak ada di file",
    ]);
  });
});
