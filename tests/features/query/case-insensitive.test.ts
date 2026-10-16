import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Plan } from "@/features/query/spec";
import {
  buildFilterValuesSql,
  buildSql,
  buildTotalsSql,
  type BuiltSql,
} from "@/features/query/sql";

/*
 * T-029: kategori teks yang hanya beda huruf besar/kecil digabung seperti PivotTable/SUMIF Excel —
 * GROUP BY tidak peka huruf, label = variasi paling sering (seri → urutan byte terkecil), filter
 * "bandung" mengenai ketiga variasi. SQL builder dijalankan langsung di DuckDB atas parquet kecil.
 */
// [Cabang, Omzet]: Bandung ×3 (paling sering, bukan baris pertama), bandung ×2, BANDUNG ×1,
// jakarta/Jakarta seri ×1 (baris pertama "jakarta"; label seri = "Jakarta"), Bándung (aksen) ×1.
const ROWS: [string | null, number][] = [
  ["bandung", 30],
  ["jakarta", 5],
  ["BANDUNG", 20],
  ["Bandung", 10],
  ["Bandung", 40],
  ["bandung", 50],
  ["Bandung", 60],
  ["Jakarta", 5],
  ["Bándung", 1],
  [null, 7],
];

let root: string;
let path: string;
let tie: string;
let db: DuckDBInstance;
let conn: DuckDBConnection;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-ci-test-"));
  path = join(root, "typed.parquet");
  tie = join(root, "tie.parquet");
  db = await DuckDBInstance.create(":memory:", { threads: "4" });
  conn = await db.connect();
  const values = ROWS.map(
    ([c, o], i) => `(${i + 2}, ${c === null ? "NULL" : `'${c}'`}, CAST(${o} AS DECIMAL(38,6)))`,
  ).join(", ");
  await conn.run(
    `COPY (SELECT * FROM (VALUES ${values}) t(_row, c1, c2)) TO '${path}' (FORMAT parquet)`,
  );
  // Seri persis tersebar di banyak row group (dibaca paralel): mode() DuckDB bergantung urutan thread.
  await conn.run(
    `COPY (SELECT i + 2 AS _row, CASE WHEN i % 2 = 0 THEN 'jakarta' ELSE 'Jakarta' END AS c1, CAST(1 AS DECIMAL(38,6)) AS c2 FROM range(131072) r(i)) TO '${tie}' (FORMAT parquet, ROW_GROUP_SIZE 4096)`,
  );
});
afterAll(() => {
  conn?.closeSync();
  db?.closeSync();
  rmSync(root, { recursive: true, force: true });
});

const rows = async (b: BuiltSql) => (await conn.runAndReadAll(b.sql, b.params)).getRows();

const bar = (over: Partial<Plan> = {}): Plan => ({
  dimensions: [{ key: "d1", col: "c1", type: "text" }],
  measures: [{ key: "m1", agg: "sum", col: "c2" }],
  filters: [],
  sort: [{ key: "m1", dir: "desc" }],
  limit: 20,
  columns: [],
  ...over,
});

const text = (op: "in" | "not_in" | "eq" | "neq", v: string) =>
  bar({ filters: [{ col: "c1", type: "text", op, values: [v] }] });

describe("T-029: kategori tidak peka huruf besar/kecil", () => {
  it("AC1: Bandung/bandung/BANDUNG = satu kategori, total gabungan, label variasi paling sering", async () => {
    const out = await rows(buildSql(bar(), path));
    const sum = (k: unknown) => Number(out.find((r) => r[0] === k)?.[1]);
    expect(out.map((r) => r[0])).toEqual(["Bandung", "Jakarta", null, "Bándung"]);
    expect(sum("Bandung")).toBe(210);
    expect(sum("Jakarta")).toBe(10);
    // Aksen tetap membedakan (sama dengan Excel).
    expect(sum("Bándung")).toBe(1);
    // Jumlah kategori (keterangan "N teratas dari M" / irisan Lainnya) ikut digabung: 3 + kosong.
    const totals = await rows(buildTotalsSql(bar({ totals: true }), path)!);
    expect(Number(totals[0]![0])).toBe(4);
  });

  it("review TF3: label seri deterministik lintas row group/thread (urutan byte terkecil)", async () => {
    const seen = new Set<unknown>();
    for (let k = 0; k < 10; k++) seen.add((await rows(buildSql(bar(), tie)))[0]![0]);
    for (let k = 0; k < 5; k++) {
      seen.add((await rows(buildFilterValuesSql({ col: "c1", type: "text" }, null, tie)))[0]![0]);
    }
    expect([...seen]).toEqual(["Jakarta"]);
  });

  it("AC2: filter widget (in/not_in/eq/neq) dan filter dashboard huruf campuran mengenai ketiga variasi", async () => {
    for (const op of ["in", "eq"] as const) {
      const out = await rows(buildSql(text(op, "BaNdUnG"), path));
      expect(out, op).toEqual([["Bandung", expect.anything()]]);
      expect(Number(out[0]![1]), op).toBe(210);
    }
    for (const op of ["not_in", "neq"] as const) {
      const out = await rows(buildSql(text(op, "bANDUNG"), path));
      expect(
        out.map((r) => r[0]),
        op,
      ).toEqual(["Jakarta", null, "Bándung"]);
    }
    const dash = await rows(
      buildSql(
        bar({ dash: [{ col: "c1", type: "text", float: false, op: "in", values: ["bAnDuNg"] }] }),
        path,
      ),
    );
    expect(Number(dash[0]![1])).toBe(210);
  });

  it("filter dashboard label terpotong 500 karakter (cabang awalan) juga tidak peka huruf", async () => {
    const long = join(root, "long.parquet");
    await conn.run(
      `COPY (SELECT * FROM (VALUES (2, repeat('Ab', 300), 1::DECIMAL(38,6)), (3, repeat('aB', 300), 2::DECIMAL(38,6)), (4, 'lain', 4::DECIMAL(38,6))) t(_row, c1, c2)) TO '${long}' (FORMAT parquet)`,
    );
    const out = await rows(
      buildSql(
        bar({
          dash: [{ col: "c1", type: "text", float: false, op: "in", values: ["AB".repeat(250)] }],
        }),
        long,
      ),
    );
    expect(out.map((r) => Number(r[1]))).toEqual([3]);
  });

  it("daftar nilai slicer: satu opsi per kategori, label variasi paling sering", async () => {
    const out = await rows(buildFilterValuesSql({ col: "c1", type: "text" }, null, path));
    expect(out.map((r) => r[0])).toEqual([null, "Bandung", "Bándung", "Jakarta"]);
  });
});
