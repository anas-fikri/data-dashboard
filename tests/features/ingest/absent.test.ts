import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { openDuck } from "@/lib/duckdb";
import type { ColumnSchema, ColumnType } from "@/features/ingest/infer";
import { runIngest } from "@/features/ingest/ingest";
import { planColumns, type ActiveSnapshot } from "@/features/ingest/refresh";
import { writeTyped, type AbsentColumn } from "@/features/ingest/typed";
import { parquetTypes, readParquet, testRoot, VID } from "./fakes";

/*
 * Kolom kosong (absent, T-014): kolom fisik NULL bertipe sama dengan kolom nyata bertipe sama (NULL
 * tanpa tipe membuat date_trunc/perbandingan gagal), dan refresh berikutnya yang tetap tidak memuat
 * kolom itu menulisnya ulang kosong tanpa menunggu pemetaan.
 */
const t = testRoot("ingest-absent");
afterAll(t.cleanup);
beforeEach(t.resetTmp);

const csv = (rows: string[][]) => `${rows.map((r) => r.join(";")).join("\n")}\n`;
const range = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

async function ingest(rows: string[][], active: ActiveSnapshot | null = null) {
  const s = t.setup(t.file(`a-${Math.random().toString(36).slice(2)}.csv`, csv(rows)));
  s.repo.active = active;
  const out = await runIngest(VID, s.repo, s.storage, s.opts);
  return { ...s, out, sheet: s.repo.byIndex()[0]! };
}

describe("writeTyped: kolom kosong", () => {
  it("tipe parquet sama dengan kolom nyata bertipe sama (semua tipe); skema absent + nonEmpty", async () => {
    const r = await ingest([
      ["a", "b", "c", "d", "e", "f", "g", "h"],
      ...range(5, () => ["x", "1", "1.5", "1.1234567", "ya", "1", "01/02/2026", "x"]),
      ["", "2", "", "", "", "", "", ""],
    ]);
    expect(r.out.outcome).toBe("done");
    const s = r.sheet;
    const types: [ColumnType, boolean?][] = [
      ["text"],
      ["integer"],
      ["decimal"],
      ["decimal", true],
      ["boolean"],
      ["duration"],
      ["date"],
      ["timestamp"],
    ];
    const absent: AbsentColumn[] = types.map(([type, float], i) => ({
      name: `Kosong ${i + 1}`,
      original: `Asli ${i + 1}`,
      type,
      float,
      hidden: false,
    }));
    const work = join(t.root, "tmp");
    const duck = await openDuck({
      path: join(work, "w.duckdb"),
      tmpDir: work,
      memoryLimit: "256MB",
    });
    const outPath = join(work, "typed.parquet");
    const typed = await (async () => {
      try {
        return await writeTyped(duck, {
          rawPath: join(r.storage.dir, s.rawKey!),
          outPath,
          source: "csv",
          headerRow: s.headerRow,
          colCount: s.colCount,
          columns: s.columns,
          overrides: types.map(([type], i) => ({ pos: i + 1, type })),
          absent,
          watch: async () => {},
        });
      } finally {
        duck.close();
      }
    })();
    expect(typed.schema[3]!.float).toBe(true); // "1.1234567" → DOUBLE
    const pq = await parquetTypes(outPath);
    for (let i = 1; i <= 8; i++) expect([i, pq[`c${i + 8}`]]).toEqual([i, pq[`c${i}`]]);
    expect(pq.c12).toBe("DOUBLE");
    expect(pq.c11).toBe("DECIMAL(38,6)");
    expect(typed.schema.slice(8)).toEqual(
      absent.map((a, i): ColumnSchema => ({
        pos: 9 + i,
        name: a.name,
        original: a.original,
        type: a.type,
        ...(a.type === "integer" || a.type === "decimal" ? { numberLocale: "us" } : {}),
        ...(a.type === "date" || a.type === "timestamp" ? { dateFormat: "yyyy-mm-dd" } : {}),
        ...(a.float ? { float: true } : {}),
        hidden: false,
        nullPct: 1,
        distinctCount: 0,
        castFailCount: 0,
        nonEmpty: 0,
        absent: true,
      })),
    );
    // nonEmpty tersimpan per kolom nyata (penyebut rasio cast) dan sejajar dengan array hasil.
    expect(typed.schema[0]!.nonEmpty).toBe(5);
    expect(typed.schema[1]!.nonEmpty).toBe(6);
    expect(typed.nonEmpty).toEqual(typed.schema.map((c) => c.nonEmpty));
    const rows = await readParquet(outPath);
    expect(rows.every((row) => row.slice(9).every((v) => v === null))).toBe(true);
    // date_trunc pada kolom tanggal kosong tidak error (NULL tanpa tipe = Binder Error).
    const { DuckDBInstance } = await import("@duckdb/node-api");
    const db = await DuckDBInstance.create(":memory:");
    const c = await db.connect();
    try {
      const q = await c.runAndReadAll(
        `SELECT date_trunc('month', c15) AS m, count(*) AS n FROM read_parquet('${outPath}') GROUP BY 1`,
      );
      expect(q.getRowObjects()).toEqual([{ m: null, n: 6n }]);
    } finally {
      c.closeSync();
      db.closeSync();
    }
  });
});

const v1 = [["Kode", "Nilai"], ...range(10, (i) => [`K${i}`, String(i)])];

/** Versi aktif hasil ingest v1 + kolom kosong "Diskon" (pos 3) seperti hasil pemetaan. */
async function activeWithAbsent(edit: Partial<ColumnSchema> = {}): Promise<ActiveSnapshot> {
  const r = await ingest(v1);
  return {
    versionId: "aktif0000000000000001",
    sheets: [
      {
        id: "sheetaktif00000000001",
        name: r.sheet.name,
        index: 0,
        headerRow: 1,
        schemaRevision: 2,
        schema: [
          ...r.sheet.schema!,
          {
            pos: 3,
            name: "Potongan",
            original: "Diskon",
            type: "decimal",
            numberLocale: "id",
            hidden: false,
            nullPct: 1,
            distinctCount: 0,
            castFailCount: 0,
            nonEmpty: 0,
            absent: true,
            ...edit,
          },
        ],
      },
    ],
  };
}

describe("refresh membawa kolom kosong (carry-forward)", () => {
  it("file baru tetap tanpa kolom itu → aktif, kolom kosong ditulis ulang (bukan menunggu pemetaan)", async () => {
    const r = await ingest(
      [["Kode", "Nilai", "Baru"], ...range(4, (i) => [`K${i}`, String(i), "x"])],
      await activeWithAbsent(),
    );
    expect(r.out).toEqual({ outcome: "done", sheets: 1 });
    expect(r.repo.status).toBe("READY");
    expect(r.sheet.schema!.map((c) => [c.pos, c.name, c.hidden, c.absent ?? false])).toEqual([
      [1, "Kode", false, false],
      [2, "Nilai", false, false],
      [3, "Baru", true, false],
      [4, "Potongan", false, true],
    ]);
    expect(r.sheet.schema![3]).toMatchObject({ original: "Diskon", type: "decimal" });
    expect((await parquetTypes(join(r.storage.dir, r.sheet.typedKey!))).c4).toBe("DECIMAL(38,6)");
  });

  it("kolom itu kembali di file → cocok lewat judul asli, menjadi kolom nyata dengan pilihan aktif", async () => {
    const r = await ingest(
      [["Diskon", "Kode", "Nilai"], ...range(4, (i) => [`${i},5`, `K${i}`, String(i)])],
      await activeWithAbsent(),
    );
    expect(r.out).toEqual({ outcome: "done", sheets: 1 });
    expect(r.sheet.schema).toHaveLength(3);
    expect(r.sheet.schema![0]).toMatchObject({
      pos: 1,
      name: "Potongan",
      type: "decimal",
      numberLocale: "id",
      castFailCount: 0,
      nonEmpty: 4,
    });
    expect(r.sheet.schema![0]!.absent).toBeUndefined();
  });

  it("kolom kosong yang disembunyikan dan tetap hilang → dibuang (seperti kolom tersembunyi lain)", async () => {
    const r = await ingest(v1, await activeWithAbsent({ hidden: true }));
    expect(r.out).toEqual({ outcome: "done", sheets: 1 });
    expect(r.sheet.schema!.map((c) => c.name)).toEqual(["Kode", "Nilai"]);
  });
});

describe("planColumns: nama kolom tambahan unik terhadap semua nama akhir", () => {
  it("nama kolom tambahan tidak bentrok dengan nama kolom aktif yang hilang (nanti dipetakan/kosong)", () => {
    const col = (pos: number, name: string, original = name): ColumnSchema => ({
      pos,
      name,
      original,
      type: "text",
      hidden: false,
      nullPct: 0,
      distinctCount: 0,
      castFailCount: 0,
    });
    const plan = planColumns(
      [
        { pos: 1, name: "Kode", original: "Kode" },
        { pos: 2, name: "Cabang", original: "Cabang" },
      ],
      [col(1, "Kode"), col(2, "Cabang", "Kantor")],
    );
    expect(plan.missing.map((c) => c.name)).toEqual(["Cabang"]);
    expect(plan.overrides[1]).toEqual({ pos: 2, name: "Cabang_2", hidden: true });
  });
});
