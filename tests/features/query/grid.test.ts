import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/features/ingest/infer";
import { buildSortedWindowSql, planGrid, windowParts, type RowsBody } from "@/features/query/grid";
import {
  runGridCell,
  runGridRows,
  type GridDeps,
  type GridSegment,
  type GridSheet,
} from "@/features/query/grid-service";
import { QueryEngine } from "@/lib/duckdb/engine";
import { ParquetCache } from "@/lib/duckdb/parquet-cache";
import { ResultCache } from "@/features/query/cache";
import type { CachedQuery } from "@/features/query/service";

/*
 * T-041: jendela baris "Lihat data" atas manifest 3 segmen (legacy `_row INTEGER`, segmen tanpa c3,
 * segmen dengan peta kolom raw tertukar) dengan mesin DuckDB + cache parquet sungguhan.
 */
const SHEET = "cmv4kljx40009oczvdgridsh1";
const VER = "cmv4kljx40009oczvdgridve1";
const OLD = "cmv4kljx40009oczvdgridve0";
const OWNER = "pemilik";
const EDITOR = "editor";
const SECRET_COL = "KolomRahasiaGaji";

const col = (pos: number, name: string, type: ColumnSchema["type"], hidden = false) =>
  ({
    pos,
    name,
    original: name,
    type,
    hidden,
    nullPct: 0,
    distinctCount: 0,
    castFailCount: 0,
  }) as ColumnSchema;
const SCHEMA: ColumnSchema[] = [
  col(1, "Cabang", "text"),
  col(2, "Jumlah", "integer"),
  col(3, "Tanggal", "date"),
  col(4, SECRET_COL, "text", true),
];

/** Segmen: jumlah baris, rowBase, legacy?, punya c3?, raw tertukar (c1↔c2)? */
const SEGS = [
  { rows: 40, rowBase: 0, legacy: true, c3: true, swap: false },
  { rows: 30, rowBase: 1000, legacy: false, c3: false, swap: false },
  { rows: 50, rowBase: 2000, legacy: false, c3: true, swap: true },
];
const TOTAL = SEGS.reduce((a, s) => a + s.rows, 0);
const LONG = "x".repeat(600);

let root: string;
let engine: QueryEngine;
let leased: string[] = [];
const segments: GridSegment[] = [];

/** Nilai baris i (0-based dalam segmen k): teks, angka (NULL bila raw 'abc'), tanggal. */
const c1 = (k: number, i: number) => (k === 2 && i === 5 ? LONG : `Cabang ${(i * 7 + k) % 4}`);
const c2Raw = (k: number, i: number) => (i % 9 === 4 ? "abc" : String((i * 13 + k * 5) % 17));

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dd-grid-"));
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  for (const [k, s] of SEGS.entries()) {
    const values = Array.from({ length: s.rows }, (_, i) => {
      const t = c1(k, i).replace(/'/g, "''");
      return `(${i}, '${t}', '${c2Raw(k, i)}', DATE '2026-01-01' + ${i % 20})`;
    }).join(", ");
    await c.run(`CREATE OR REPLACE TABLE d AS SELECT * FROM (VALUES ${values}) v(i, t, n, dt)`);
    // Baris fisik = i + 2 (judul di baris 1).
    const row = s.legacy
      ? "(i + 2)::INTEGER AS _row"
      : `(${s.rowBase} + i + 2)::BIGINT AS _row, (i + 2)::INTEGER AS _src_row`;
    const c3 = s.c3 ? ", dt AS c3" : "";
    await c.run(
      `COPY (SELECT ${row}, t AS c1, TRY_CAST(n AS BIGINT) AS c2${c3}, 'rahasia' AS c4 FROM d ORDER BY i)
       TO '${join(root, `typed-${k}.parquet`)}' (FORMAT parquet)`,
    );
    const [r1, r2] = s.swap ? ["n", "t"] : ["t", "n"];
    await c.run(
      `COPY (SELECT (i + 2)::INTEGER AS _row, ${r1} AS c1, ${r2} AS c2, CAST(dt AS VARCHAR) AS c3, 'rahasia' AS c4 FROM d ORDER BY i)
       TO '${join(root, `raw-${k}.parquet`)}' (FORMAT parquet)`,
    );
    segments.push({
      typedKey: `typed-${k}.parquet`,
      legacyRow: s.legacy,
      columns: s.c3 ? [1, 2, 3, 4] : [1, 2, 4],
      dataRows: s.rows,
      rowBase: s.rowBase,
      maxSrcRow: s.rows + 1,
      rawKey: `raw-${k}.parquet`,
      colMap: s.swap ? [2, 1, 3, 4] : [],
      fileName: `file-${k}.xlsx`,
    });
  }
  c.closeSync();
  db.closeSync();
  engine = await QueryEngine.create({
    dataDir: join(root, "cache"),
    tmpDir: join(root, "duck-tmp"),
    memoryLimit: "256MB",
    threads: 2,
    maxTempSize: "1GB",
    maxConcurrency: 4,
    perUser: 4,
    queueWaitMs: 2_000,
  });
});
afterAll(() => {
  engine?.close();
  rmSync(root, { recursive: true, force: true });
});

function sheet(over: Partial<GridSheet> = {}): GridSheet {
  return {
    versionId: VER,
    versionStatus: "READY",
    activeVersionId: VER,
    role: "OWNER",
    typedKey: "typed-0.parquet",
    rawKey: "raw-0.parquet",
    fileName: "file-0.xlsx",
    schemaRevision: 3,
    schema: SCHEMA,
    segments,
    ...over,
  };
}

function deps(
  s: (userId: string) => GridSheet | null = (u) =>
    u === OWNER ? sheet() : u === EDITOR ? sheet({ role: "EDITOR" }) : null,
): GridDeps {
  const parquet = new ParquetCache({
    dir: join(root, "cache"),
    maxBytes: 1 << 30,
    maxDownloads: 2,
    download: async (key, dest) => copyFileSync(join(root, key), dest),
  });
  return {
    repo: { sheet: async (userId) => s(userId) },
    parquet: {
      acquire: (key, opts) => {
        leased.push(key);
        return parquet.acquire(key, opts);
      },
    },
    engine,
    timeoutMs: 30_000,
    now: () => new Date("2026-03-15T03:00:00Z"),
  };
}

/** Isi semua baris (urut manifest) sebagai harapan: [_row, c1, c2, c3]. */
function expected(): { _row: number; cells: unknown[] }[] {
  return SEGS.flatMap((s, k) =>
    Array.from({ length: s.rows }, (_, i) => {
      const n = Number(c2Raw(k, i));
      const d = new Date(Date.UTC(2026, 0, 1 + (i % 20))).toISOString().slice(0, 10);
      return {
        _row: s.rowBase + i + 2,
        cells: [c1(k, i).slice(0, 500), Number.isNaN(n) ? null : n, s.c3 ? d : null],
      };
    }),
  );
}

const body = (over: Partial<RowsBody> = {}): RowsBody => ({
  versionId: VER,
  rowStart: 0,
  rowCount: 200,
  cols: [1, 2, 3],
  ...over,
});

describe("windowParts", () => {
  it("memetakan jendela global ke potongan segmen yang beririsan saja", () => {
    expect(windowParts([40, 30, 50], 35, 10)).toEqual([
      { seg: 0, from: 35, to: 39 },
      { seg: 1, from: 0, to: 4 },
    ]);
    expect(windowParts([40, 30, 50], 75, 200)).toEqual([{ seg: 2, from: 5, to: 49 }]);
    expect(windowParts([40, 30, 50], 120, 5)).toEqual([]);
  });
});

describe("AC1: jendela tanpa urut lewat file_row_number", () => {
  it("baris lintas batas segmen benar (n, _row, cells, cut) dan hanya segmen beririsan disewa", async () => {
    leased = [];
    const r = await runGridRows(OWNER, SHEET, body({ rowStart: 35, rowCount: 10 }), deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({
      versionId: VER,
      schemaRevision: 3,
      total: TOTAL,
      filteredTotal: TOTAL,
    });
    const exp = expected().slice(35, 45);
    expect(r.rows.map((x) => ({ _row: x._row, cells: x.cells }))).toEqual(exp);
    expect(r.rows.map((x) => x.n)).toEqual(Array.from({ length: 10 }, (_, i) => 36 + i));
    expect(leased).toEqual(["typed-0.parquet", "typed-1.parquet"]);
  });

  it("jendela di ujung: hanya segmen terakhir; teks > 500 dipotong dan ditandai cut", async () => {
    leased = [];
    const r = await runGridRows(OWNER, SHEET, body({ rowStart: 70, rowCount: 500 }), deps());
    if (!r.ok) throw new Error(r.message);
    expect(leased).toEqual(["typed-2.parquet"]);
    expect(r.rows).toHaveLength(50);
    expect(r.rows.map((x) => ({ _row: x._row, cells: x.cells }))).toEqual(expected().slice(70));
    const long = r.rows[5]!;
    expect((long.cells[0] as string).length).toBe(500);
    expect(long.cut).toEqual([0]);
    expect(r.rows.filter((x) => x.cut.length)).toHaveLength(1);
  });

  it("editor juga boleh; di luar total → baris kosong", async () => {
    const r = await runGridRows(EDITOR, SHEET, body({ rowStart: 500 }), deps());
    expect(r).toMatchObject({ ok: true, total: TOTAL, rows: [] });
  });

  it("jumlah baris segmen tidak diketahui → jalur umum, hasil sama", async () => {
    const unknown = segments.map((s) => ({ ...s, dataRows: null }));
    const r = await runGridRows(
      OWNER,
      SHEET,
      body({ rowStart: 35, rowCount: 10 }),
      deps(() => sheet({ segments: unknown })),
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.total).toBe(TOTAL);
    expect(r.rows.map((x) => ({ _row: x._row, cells: x.cells }))).toEqual(expected().slice(35, 45));
  });
});

describe("AC2: akses dan batas", () => {
  it("viewer/pengguna asing/sheet tak dikenal → FORBIDDEN tanpa nama kolom/sheet", async () => {
    for (const u of ["viewer", "asing"]) {
      const r = await runGridRows(
        u,
        SHEET,
        body(),
        deps((x) => (x === "viewer" ? sheet({ role: null }) : null)),
      );
      expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(JSON.stringify(r)).not.toMatch(/Cabang|Jumlah|Tanggal|Rahasia/i);
    }
    const c = await runGridCell(
      "viewer",
      SHEET,
      { versionId: VER, row: "2", pos: "1" },
      deps(() => sheet({ role: null })),
    );
    expect(c).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it.each<[string, Partial<RowsBody> | Record<string, unknown>]>([
    ["rowCount > 500", { rowCount: 501 }],
    ["cols > 64", { cols: Array.from({ length: 65 }, (_, i) => i + 1) }],
    ["sort > 3", { sort: [1, 2, 3, 1].map((pos) => ({ pos, dir: "asc" })) }],
    [
      "filter > 20",
      { filters: Array.from({ length: 21 }, () => ({ pos: 1, op: "in", values: ["a"] })) },
    ],
    ["cari > 100 karakter", { search: { text: "a".repeat(101), cols: [1] } }],
    [
      "cari > 10 kolom",
      { search: { text: "a", cols: Array.from({ length: 11 }, (_, i) => i + 1) } },
    ],
    ["kolom tersembunyi", { cols: [1, 4] }],
    ["urut kolom tersembunyi", { sort: [{ pos: 4, dir: "asc" }] }],
    ["saring kolom tersembunyi", { filters: [{ pos: 4, op: "in", values: ["rahasia"] }] }],
    ["cari kolom tersembunyi", { search: { text: "r", cols: [4] } }],
    ["posisi tidak ada", { cols: [99] }],
    ["field asing", { sql: "SELECT 1" }],
    ["saringan tidak cocok tipe", { filters: [{ pos: 2, op: "range", gte: "2026-01-01" }] }],
  ])("%s → INVALID tanpa nama kolom", async (_n, over) => {
    const r = await runGridRows(OWNER, SHEET, { ...body(), ...over }, deps());
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(JSON.stringify(r)).not.toMatch(/Cabang|Jumlah|Tanggal|Rahasia/i);
  });

  it("SQL hanya memakai identifier c<pos>/_row; nilai cari dan saringan sebagai parameter", () => {
    const p = planGrid(
      body({
        sort: [{ pos: 1, dir: "desc" }],
        filters: [{ pos: 1, op: "in", values: ["x'; DROP TABLE t; --"] }],
        search: { text: "o'reilly\"", cols: [1] },
      }),
      SCHEMA,
      new Date(),
    );
    if (!p.ok) throw new Error(p.message);
    const built = buildSortedWindowSql(p.plan, "/x.parquet");
    expect(built.sql).not.toMatch(/DROP|reilly|Cabang/);
    const idents = [...built.sql.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(idents.filter((x) => x !== "nocase.noaccent"))).toEqual(
      new Set(["c1", "c2", "c3"]),
    );
    expect(Object.values(built.params)).toContain("x'; DROP TABLE t; --");
    expect(built.params.q).toBe("o'reilly\"");
  });
});

describe("AC3: versi", () => {
  it("versionId ≠ versi aktif → VERSION_CHANGED + activeVersionId", async () => {
    const r = await runGridRows(OWNER, SHEET, body({ versionId: OLD }), deps());
    expect(r).toMatchObject({ ok: false, code: "VERSION_CHANGED", activeVersionId: VER });
    const c = await runGridCell(OWNER, SHEET, { versionId: OLD, row: "2", pos: "1" }, deps());
    expect(c).toMatchObject({ ok: false, code: "VERSION_CHANGED", activeVersionId: VER });
  });

  it("sheet versi lama walau versionId cocok → VERSION_CHANGED", async () => {
    const old = () => sheet({ versionId: OLD, activeVersionId: VER });
    const r = await runGridRows(OWNER, SHEET, body({ versionId: OLD }), deps(old));
    expect(r).toMatchObject({ ok: false, code: "VERSION_CHANGED", activeVersionId: VER });
  });

  it("pemilik boleh pratinjau versi AWAITING_CONFIRM miliknya; editor tidak", async () => {
    const pending = (role: "OWNER" | "EDITOR") => () =>
      sheet({ versionId: OLD, versionStatus: "AWAITING_CONFIRM", activeVersionId: VER, role });
    const ok = await runGridRows(
      OWNER,
      SHEET,
      body({ versionId: OLD, rowCount: 3 }),
      deps(pending("OWNER")),
    );
    expect(ok).toMatchObject({ ok: true, versionId: OLD });
    const no = await runGridRows(EDITOR, SHEET, body({ versionId: OLD }), deps(pending("EDITOR")));
    expect(no).toMatchObject({ ok: false, code: "VERSION_CHANGED" });
    const ready = () => sheet({ versionId: OLD, versionStatus: "READY", activeVersionId: VER });
    expect(await runGridRows(OWNER, SHEET, body({ versionId: OLD }), deps(ready))).toMatchObject({
      code: "VERSION_CHANGED",
    });
  });
});

describe("AC4: urut + saring deterministik, isi sel", () => {
  it("urut ≤ 3 kolom + saring: jendela sama dua kali identik dan sesuai urutan (_row pemutus seri)", async () => {
    const b = body({
      rowStart: 5,
      rowCount: 20,
      sort: [
        { pos: 1, dir: "asc" },
        { pos: 2, dir: "desc" },
      ],
      filters: [{ pos: 3, op: "range", gte: "2026-01-03" }],
    });
    const a = await runGridRows(OWNER, SHEET, b, deps());
    const again = await runGridRows(OWNER, SHEET, b, deps());
    if (!a.ok || !again.ok) throw new Error("gagal");
    expect(again.rows).toEqual(a.rows);
    // Harapan dihitung di JS: c3 ≥ 2026-01-03 (segmen tanpa c3 tersaring habis), urut c1 naik (tanpa
    // peka huruf), c2 turun NULLS LAST, lalu _row naik.
    const rows = expected().filter(
      (x) => x.cells[2] !== null && (x.cells[2] as string) >= "2026-01-03",
    );
    const cmpNull = (x: unknown, y: unknown, desc: boolean) =>
      x === y
        ? 0
        : x === null
          ? 1
          : y === null
            ? -1
            : (x as number) < (y as number)
              ? desc
                ? 1
                : -1
              : desc
                ? -1
                : 1;
    rows.sort(
      (x, y) =>
        String(x.cells[0]).toLowerCase().localeCompare(String(y.cells[0]).toLowerCase()) ||
        cmpNull(x.cells[1], y.cells[1], true) ||
        x._row - y._row,
    );
    expect(a.filteredTotal).toBe(rows.length);
    expect(a.total).toBe(TOTAL);
    expect(a.rows.map((x) => ({ _row: x._row, cells: x.cells }))).toEqual(rows.slice(5, 25));
    expect(a.rows[0]!.n).toBe(6);
  });

  it("cari teks sebagai saringan baris", async () => {
    const r = await runGridRows(
      OWNER,
      SHEET,
      body({ search: { text: "CABANG 3", cols: [1] } }),
      deps(),
    );
    if (!r.ok) throw new Error(r.message);
    const exp = expected().filter((x) => String(x.cells[0]).toLowerCase().includes("cabang 3"));
    expect(r.filteredTotal).toBe(exp.length);
    expect(r.rows.map((x) => x._row)).toEqual(exp.map((x) => x._row));
  });

  it("GET cell: isi penuh, nilai raw bila cast gagal (lewat peta kolom), dan sumber", async () => {
    const full = await runGridCell(
      OWNER,
      SHEET,
      { versionId: VER, row: String(2000 + 5 + 2), pos: "1" },
      deps(),
    );
    expect(full).toMatchObject({
      ok: true,
      value: LONG,
      raw: null,
      castFailed: false,
      source: { fileName: "file-2.xlsx", srcRow: 7, period: null },
    });
    // Segmen 2 (raw tertukar): i = 4 → raw 'abc' di raw c1.
    const bad = await runGridCell(
      OWNER,
      SHEET,
      { versionId: VER, row: String(2000 + 4 + 2), pos: "2" },
      deps(),
    );
    expect(bad).toMatchObject({
      ok: true,
      value: null,
      raw: "abc",
      castFailed: true,
      source: { srcRow: 6 },
    });
    // Segmen legacy: _row = baris fisik.
    const leg = await runGridCell(OWNER, SHEET, { versionId: VER, row: "6", pos: "2" }, deps());
    expect(leg).toMatchObject({
      ok: true,
      value: null,
      raw: "abc",
      source: { fileName: "file-0.xlsx", srcRow: 6 },
    });
    // Segmen 1 tidak punya c3 di typed (raw-nya punya): NULL sah, bukan gagal cast.
    const noCol = await runGridCell(
      OWNER,
      SHEET,
      { versionId: VER, row: "1003", pos: "3" },
      deps(),
    );
    expect(noCol).toMatchObject({ ok: true, value: null, raw: null, castFailed: false });
    // Segmen 1 (rowBase 1000): _row 1003 = baris fisik 3 (i = 1).
    const ok = await runGridCell(OWNER, SHEET, { versionId: VER, row: "1003", pos: "2" }, deps());
    expect(ok).toMatchObject({
      ok: true,
      value: 1,
      raw: null,
      source: { fileName: "file-1.xlsx", srcRow: 3 },
    });
    expect(
      await runGridCell(OWNER, SHEET, { versionId: VER, row: "999999", pos: "1" }, deps()),
    ).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      await runGridCell(OWNER, SHEET, { versionId: VER, row: "2", pos: "4" }, deps()),
    ).toMatchObject({
      code: "INVALID",
    });
    expect(
      await runGridCell(OWNER, SHEET, { versionId: VER, row: "-1", pos: "1" }, deps()),
    ).toMatchObject({
      code: "INVALID",
    });
  });
});

describe("review M1/M2: identitas _row", () => {
  it("GET cell menyewa paling banyak satu file typed", async () => {
    leased = [];
    await runGridCell(OWNER, SHEET, { versionId: VER, row: "999999", pos: "1" }, deps());
    expect(leased).toEqual([]);
    leased = [];
    await runGridCell(OWNER, SHEET, { versionId: VER, row: "2010", pos: "2" }, deps());
    expect(leased).toEqual(["typed-2.parquet"]);
  });

  it("dua segmen legacy berbagi _row → ditolak, bukan baris ganda/salah file", async () => {
    const two = () =>
      sheet({ segments: [segments[0]!, { ...segments[0]!, typedKey: "typed-0b.parquet" }] });
    const r = await runGridRows(OWNER, SHEET, body({ sort: [{ pos: 1, dir: "asc" }] }), deps(two));
    expect(r).toMatchObject({ ok: false, code: "QUERY_FAILED" });
    const c = await runGridCell(OWNER, SHEET, { versionId: VER, row: "2", pos: "1" }, deps(two));
    expect(c).toMatchObject({ ok: false, code: "QUERY_FAILED" });
  });
});

describe("T-042: cache hasil hanya untuk count", () => {
  it("blok baris tidak masuk cache; count urut/saring di-cache dan dipakai ulang", async () => {
    const cache = new ResultCache<CachedQuery>(64 * 1024 * 1024);
    const spy: CachedQuery[] = [];
    const set = cache.set.bind(cache);
    cache.set = (k, v, b, t) => {
      spy.push(v);
      set(k, v, b, t);
    };
    // Jalur tanpa urut: tidak ada yang di-cache.
    const plain = await runGridRows(OWNER, SHEET, body({ rowStart: 0, rowCount: 50 }), {
      ...deps(),
      cache,
    });
    expect(plain.ok).toBe(true);
    expect(spy).toEqual([]);
    const b = body({
      rowCount: 10,
      sort: [{ pos: 2, dir: "asc" }],
      search: { text: "cabang 1", cols: [1] },
    });
    const a = await runGridRows(OWNER, SHEET, b, { ...deps(), cache });
    if (!a.ok) throw new Error(a.message);
    expect(spy).toEqual([{ gridCount: { total: TOTAL, filteredTotal: a.filteredTotal } }]);
    expect(cache.totalBytes).toBeLessThan(1024);
    // Halaman lain dengan saringan yang sama: count dari cache, baris tetap dihitung.
    const next = await runGridRows(OWNER, SHEET, { ...b, rowStart: 10 }, { ...deps(), cache });
    if (!next.ok) throw new Error(next.message);
    expect(spy).toHaveLength(1);
    expect(next.filteredTotal).toBe(a.filteredTotal);
    expect(next.rows[0]!.n).toBe(11);
    expect(next.rows.map((r) => r._row)).not.toEqual(a.rows.map((r) => r._row));
  });
});
