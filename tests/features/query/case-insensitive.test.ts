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
 * GROUP BY tidak peka huruf, label = variasi paling sering, filter "bandung" mengenai ketiga variasi.
 * SQL builder dijalankan langsung di DuckDB atas parquet kecil.
 */
// [Cabang, Omzet]: Bandung ×3 (paling sering), BANDUNG ×1, bandung ×2, Jakarta ×2, Bándung (aksen) ×1.
const ROWS: [string | null, number][] = [
  ["Bandung", 10],
  ["BANDUNG", 20],
  ["bandung", 30],
  ["Bandung", 40],
  ["bandung", 50],
  ["Bandung", 60],
  ["Jakarta", 5],
  ["jakarta", 5],
  ["Bándung", 1],
  [null, 7],
];

let root: string;
let path: string;
let db: DuckDBInstance;
let conn: DuckDBConnection;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-ci-test-"));
  path = join(root, "typed.parquet");
  db = await DuckDBInstance.create(":memory:", { threads: "4" });
  conn = await db.connect();
  const values = ROWS.map(
    ([c, o], i) => `(${i + 2}, ${c === null ? "NULL" : `'${c}'`}, CAST(${o} AS DECIMAL(38,6)))`,
  ).join(", ");
  await conn.run(
    `COPY (SELECT * FROM (VALUES ${values}) t(_row, c1, c2)) TO '${path}' (FORMAT parquet)`,
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

  it("AC2: filter widget dan filter dashboard 'bandung' mengenai ketiga variasi", async () => {
    const spec = await rows(
      buildSql(
        bar({ filters: [{ col: "c1", type: "text", op: "in", values: ["bandung"] }] }),
        path,
      ),
    );
    expect(spec).toEqual([["Bandung", expect.anything()]]);
    expect(Number(spec[0]![1])).toBe(210);
    const dash = await rows(
      buildSql(
        bar({ dash: [{ col: "c1", type: "text", float: false, op: "in", values: ["BANDUNG"] }] }),
        path,
      ),
    );
    expect(Number(dash[0]![1])).toBe(210);
    const not = await rows(
      buildSql(
        bar({ filters: [{ col: "c1", type: "text", op: "not_in", values: ["bandung"] }] }),
        path,
      ),
    );
    expect(not.map((r) => r[0])).toEqual(["Jakarta", null, "Bándung"]);
  });

  it("daftar nilai slicer: satu opsi per kategori, label variasi paling sering", async () => {
    const out = await rows(buildFilterValuesSql({ col: "c1", type: "text" }, null, path));
    expect(out.map((r) => r[0])).toEqual([null, "Bandung", "Bándung", "Jakarta"]);
  });
});
