import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  dashFilterSchema,
  filterStateSchema,
  pivotFilterSchema,
  type DashClause,
} from "@/features/query/filters";
import { dashClauses, paramValue, type BuiltSql } from "@/features/query/sql";

/*
 * T-rrn1: label grafik/pivot berupa angka di luar ±2^53 (kolom DOUBLE/DECIMAL besar) dipilih di menu
 * saring atau diklik untuk filter silang. Dulu zod menolaknya (widget/PDF "tidak valid") dan node-api
 * mem-bind angka itu sebagai BIGINT ("bigint out of int64 range"). Kini diterima dan menyaring benar.
 */
const BIG = 1e20;
const UNSAFE = 9007199254740994; // 2^53 + 2: genap, persis DOUBLE

let con: DuckDBConnection;
beforeAll(async () => {
  con = await (await DuckDBInstance.create(":memory:")).connect();
  await con.run(`CREATE TABLE t AS SELECT * FROM (VALUES
    (CAST(1e20 AS DOUBLE), CAST('100000000000000000000' AS DECIMAL(38,6)), CAST(9007199254740994 AS BIGINT)),
    (CAST(5 AS DOUBLE), CAST(5 AS DECIMAL(38,6)), CAST(5 AS BIGINT)),
    (NULL, NULL, NULL)) v(c1, c2, c3)`);
});
afterAll(() => con.closeSync());

const count = async (cl: DashClause) => {
  const params: BuiltSql["params"] = {};
  const [where] = dashClauses([cl], params);
  const r = await con.runAndReadAll(`SELECT count(*) FROM t WHERE ${where}`, params);
  return Number(r.getRows()[0]![0]);
};

describe("T-rrn1 AC1: angka di luar batas aman", () => {
  it("zod menerima nilai in/not_in di luar ±2^53 (filter dashboard, silang, saringan pivot, URL/PDF)", () => {
    expect(dashFilterSchema.safeParse({ column: "Omzet", op: "in", values: [BIG] }).success).toBe(
      true,
    );
    expect(
      pivotFilterSchema.safeParse({
        field: "row0",
        column: "Omzet",
        op: "not_in",
        values: [-UNSAFE],
      }).success,
    ).toBe(true);
    expect(
      filterStateSchema.safeParse({
        filters: [],
        cross: {
          widgetId: "cmv4klj5r0007oczvgiofocpg",
          filter: { column: "X", op: "in", values: [BIG] },
        },
      }).success,
    ).toBe(true);
    // Non-finite tetap ditolak; rentang tetap dibatasi ±2^53.
    expect(dashFilterSchema.safeParse({ column: "X", op: "in", values: [Infinity] }).success).toBe(
      false,
    );
    expect(dashFilterSchema.safeParse({ column: "X", op: "range", gte: BIG }).success).toBe(false);
  });

  it("paramValue: bulat tidak aman → teks desimal; nilai lain apa adanya", () => {
    expect(paramValue(BIG)).toBe("100000000000000000000");
    expect(paramValue(-UNSAFE)).toBe("-9007199254740994");
    expect(paramValue(5)).toBe(5);
    expect(paramValue(2.5)).toBe(2.5);
    expect(paramValue("a")).toBe("a");
  });

  it("DOUBLE, DECIMAL, dan bilangan bulat: in/not_in menyaring tanpa galat DuckDB", async () => {
    const base = (col: string, type: DashClause["type"], float = false) => ({ col, type, float });
    expect(await count({ ...base("c1", "decimal", true), op: "in", values: [BIG] })).toBe(1);
    expect(await count({ ...base("c1", "decimal", true), op: "not_in", values: [BIG] })).toBe(2);
    expect(await count({ ...base("c2", "decimal"), op: "in", values: [BIG] })).toBe(1);
    expect(await count({ ...base("c3", "integer"), op: "in", values: [UNSAFE, null] })).toBe(2);
    // Di luar DECIMAL(38,6): tidak mungkin sama — tidak cocok, bukan galat.
    expect(await count({ ...base("c2", "decimal"), op: "in", values: [1e40] })).toBe(0);
    expect(await count({ ...base("c2", "decimal"), op: "not_in", values: [1e40] })).toBe(3);
  });
});
