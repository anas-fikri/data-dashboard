import { DuckDBListValue } from "@duckdb/node-api";
import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { PERIOD_COLUMN } from "@/features/query/period-column";
import {
  PERIOD_IDENT,
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
/** withSegments dengan skema uji; `period` = sheet periode (T-058). */
const seg = (files: SegmentFile[], paths: string[], period?: { column: number | null }) =>
  withSegments(built, { files, schema, ...(period ? { period } : {}) }, paths);
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
    expect(seg([file("a")], ["/cache/a.parquet"])).toBe(built);
  });

  it("skema sama → $path = listValue (satu parameter), SQL tetap", () => {
    const r = seg([file("a"), file("b")], ["/c/a", "/c/b"]);
    expect(r.sql).toBe(built.sql);
    expect(r.params.v0).toBe("x");
    expect(r.params.path).toBeInstanceOf(DuckDBListValue);
    expect((r.params.path as DuckDBListValue).items).toEqual(["/c/a", "/c/b"]);
  });

  it("skema campuran → proyeksi per kelompok: _row BIGINT, _src_row, NULL AS c<pos> bertipe skema", () => {
    const r = seg(
      [file("a", { legacyRow: true }), file("b", { columns: [1, 2] }), file("c")],
      ["/c/a", "/c/b", "/c/c"],
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

  it("T-057: file tanpa kolom yang ditambahkan kemudian (satu file / satu kelompok) → proyeksi NULL, bukan galat kolom", () => {
    const narrow = file("a", { columns: [1, 2] });
    const one = sheetSource({ typedKey: "a", schema, segments: [narrow] });
    expect(typeof one).toBe("object");
    const r1 = seg([narrow], ["/c/a"]);
    expect(r1.sql).toContain("CAST(NULL AS DATE) AS c3");
    expect(r1.params.path).toBeUndefined();
    const r2 = seg([narrow, file("b", { columns: [1, 2] })], ["/c/a", "/c/b"]);
    expect(r2.sql).toContain("CAST(NULL AS DATE) AS c3");
    expect((r2.params.s0 as DuckDBListValue).items).toEqual(["/c/a", "/c/b"]);
  });

  it("jumlah path tidak cocok → galat (tidak pernah membaca file yang salah)", () => {
    expect(() => seg([file("a"), file("b")], ["/c/a"])).toThrow();
  });

  it("T-058: sheet periode satu file / skema sama → proyeksi `*, _period AS c<PERIOD_COLUMN>`", () => {
    const one = sheetSource({
      typedKey: "a",
      schema,
      segments: [file("a")],
      period: { column: null },
    });
    expect(one).toMatchObject({ files: [{ typedKey: "a" }], period: { column: null } });
    const r = seg([file("a"), file("b")], ["/c/a", "/c/b"], { column: 3 });
    expect(r.sql).toContain(
      `(SELECT *, CAST(_period AS DATE) AS ${PERIOD_IDENT} FROM read_parquet($s0))`,
    );
    expect(r.params.path).toBeUndefined();
    expect((r.params.s0 as DuckDBListValue).items).toEqual(["/c/a", "/c/b"]);
  });

  it("T-058 (review T-049 L3): skema campuran sheet periode → setiap kelompok membawa _period + kolom sistem", () => {
    const r = seg([file("a", { columns: [1, 2] }), file("b")], ["/c/a", "/c/b"], { column: null });
    const parts = r.sql.match(/SELECT CAST\(_row AS BIGINT\).*?FROM read_parquet\(\$s\d\)/g)!;
    expect(parts).toHaveLength(4);
    for (const p of parts) {
      expect(p).toContain("CAST(_period AS DATE) AS _period");
      expect(p).toContain(`CAST(_period AS DATE) AS ${PERIOD_IDENT}`);
    }
    expect(parts[0]).toContain("CAST(NULL AS DATE) AS c3");
  });

  it("T-058: kolom sistem Periode di skema tidak pernah diproyeksikan sebagai kolom file", () => {
    const withSys = [
      ...schema,
      { pos: PERIOD_COLUMN, type: "date", float: false },
    ] as typeof schema;
    const src = sheetSource({ typedKey: "a", schema: withSys, segments: [file("a")] });
    expect(src).toBe("a");
    const r = withSegments(
      built,
      { files: [file("a", { columns: [1, 2] }), file("b")], schema: withSys },
      ["/c/a", "/c/b"],
    );
    expect(r.sql).not.toContain(`AS ${PERIOD_IDENT}`);
    expect(r.sql).not.toContain(`CAST(c${PERIOD_COLUMN}`);
  });
});
