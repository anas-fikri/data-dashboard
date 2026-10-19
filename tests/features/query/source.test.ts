import { DuckDBListValue } from "@duckdb/node-api";
import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import {
  SOURCE_TOKEN,
  sheetSource,
  sourceKeys,
  withSegments,
  type SegmentFile,
} from "@/features/query/source";

/* T-037 (ADR-0008): penggantian read_parquet($path) dengan sumber segmen. Murni. */
const schema = [
  { pos: 1, type: "text", float: false },
  { pos: 2, type: "decimal", float: false },
  { pos: 3, type: "date", float: false },
] as Pick<ColumnSchema, "pos" | "type" | "float">[];
const file = (typedKey: string, over: Partial<SegmentFile> = {}): SegmentFile => ({
  typedKey,
  legacyRow: false,
  columns: [1, 2, 3],
  ...over,
});
const built = {
  sql: `SELECT count(*) FROM ${SOURCE_TOKEN} WHERE c1 = $v0 UNION ALL SELECT 1 FROM ${SOURCE_TOKEN}`,
  params: { path: "/cache/a.parquet", v0: "x" },
};

describe("sheetSource", () => {
  it("≤ 1 segmen → kunci typed (jalur lama); lebih → daftar segmen", () => {
    expect(sheetSource({ typedKey: "k", schema })).toBe("k");
    expect(sheetSource({ typedKey: "k", schema, segments: [file("k")] })).toBe("k");
    const s = sheetSource({ typedKey: "a", schema, segments: [file("a"), file("b")] });
    expect(sourceKeys(s)).toEqual(["a", "b"]);
  });
});

describe("withSegments", () => {
  it("satu file → SQL dan parameter tidak berubah", () => {
    expect(withSegments(built, [file("a")], ["/cache/a.parquet"], schema)).toBe(built);
  });

  it("skema sama → $path = listValue (satu parameter), SQL tetap", () => {
    const r = withSegments(built, [file("a"), file("b")], ["/c/a", "/c/b"], schema);
    expect(r.sql).toBe(built.sql);
    expect(r.params.v0).toBe("x");
    expect(r.params.path).toBeInstanceOf(DuckDBListValue);
    expect((r.params.path as DuckDBListValue).items).toEqual(["/c/a", "/c/b"]);
  });

  it("skema campuran → proyeksi per kelompok: _row BIGINT, _src_row, NULL AS c<pos> bertipe skema", () => {
    const r = withSegments(
      built,
      [file("a", { legacyRow: true }), file("b", { columns: [1, 2] }), file("c")],
      ["/c/a", "/c/b", "/c/c"],
      schema,
    );
    expect(r.params.path).toBeUndefined();
    expect(Object.keys(r.params).sort()).toEqual(["s0", "s1", "s2", "v0"]);
    expect(r.sql).not.toContain(SOURCE_TOKEN);
    // 1 UNION ALL asli + 2 per sumber (3 kelompok) × 2 kemunculan token.
    expect(r.sql.split("UNION ALL").length - 1).toBe(1 + 2 * 2);
    const parts = r.sql.match(/SELECT CAST\(_row AS BIGINT\).*?FROM read_parquet\(\$s\d\)/g)!;
    expect(parts[0]).toContain("CAST(_row AS INTEGER) AS _src_row");
    expect(parts[0]).toContain("FROM read_parquet($s0)");
    expect(parts[1]).toContain("_src_row AS _src_row");
    expect(parts[1]).toContain("CAST(NULL AS DATE) AS c3");
    expect(parts[2]).toContain("CAST(c3 AS DATE) AS c3");
  });

  it("jumlah path tidak cocok → galat (tidak pernah membaca file yang salah)", () => {
    expect(() => withSegments(built, [file("a"), file("b")], ["/c/a"], schema)).toThrow();
  });
});
