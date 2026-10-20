/*
 * Jendela baris "Lihat data" (T-041, rencana G-6 §3.4): validasi body, rencana jendela per segmen, dan
 * SQL. Murni (tanpa I/O). Kolom selalu dirujuk lewat posisi skema; identifier SQL hanya c<pos>, _row,
 * _src_row, dan file_row_number buatan program; semua nilai (teks cari, batas saringan, path, posisi
 * jendela) lewat parameter binding.
 *
 * Dua jalur:
 *  1. Tanpa urut/saring/cari dan jumlah baris tiap segmen diketahui: posisi global → (segmen,
 *     file_row_number). Typed ditulis urut `_row` dan hanya berisi baris data, jadi file_row_number =
 *     indeks baris data 0..N-1; hanya segmen yang beririsan dengan jendela yang disewa.
 *  2. Selain itu: late materialization ala table.ts atas seluruh sumber (`read_parquet($path)` diganti
 *     daftar/proyeksi segmen oleh source.ts) dengan `_row` sebagai pemutus seri → jendela deterministik.
 */
import { z } from "zod";
import { sqlType, type ColumnSchema } from "@/features/ingest/infer";
import { ident } from "@/lib/duckdb";
import { columnClause, dashFilterSchema, type DashClause } from "./filters";
import type { SegmentFile } from "./source";
import { dashClauses, measureExpr, TEXT_COLLATE, type BuiltSql } from "./sql";

export const GRID_ROWS_MAX = 500;
export const GRID_COLS_MAX = 64;
export const GRID_SORT_MAX = 3;
export const GRID_FILTERS_MAX = 20;
export const GRID_SEARCH_TEXT_MAX = 100;
export const GRID_SEARCH_COLS_MAX = 10;
/** Teks sel di jendela dipotong di sini (`cut` menandai); isi penuh lewat GET …/cell. */
export const GRID_CELL_TEXT_MAX = 500;
export const GRID_BODY_MAX = 64 * 1024;
/** Batas waktu jendela dengan cari (T-044 AC3): lebih pendek dari QUERY_TIMEOUT_MS. */
export const GRID_SEARCH_MAX_MS = 10_000;
/** Batas waktu daftar nilai menu saring (sama dengan slicer dashboard). */
export const GRID_VALUES_MAX_MS = 10_000;

const id = z.string().regex(/^[a-z0-9]{20,32}$/);
const pos = z.number().int().min(1).max(100_000);

export const rowsBodySchema = z
  .object({
    versionId: id,
    rowStart: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    rowCount: z.number().int().min(1).max(GRID_ROWS_MAX),
    cols: z.array(pos).min(1).max(GRID_COLS_MAX),
    sort: z
      .array(z.object({ pos, dir: z.enum(["asc", "desc"]) }).strict())
      .max(GRID_SORT_MAX)
      .optional(),
    // Bentuk filters.ts (dashFilterSchema) dengan `pos` sebagai pengganti `column`; dicek per item.
    filters: z.array(z.object({ pos }).passthrough()).max(GRID_FILTERS_MAX).optional(),
    search: z
      .object({
        text: z.string().min(1).max(GRID_SEARCH_TEXT_MAX),
        cols: z.array(pos).min(1).max(GRID_SEARCH_COLS_MAX),
      })
      .strict()
      .optional(),
    /** Pemilih periode (G-6 Bagian B) belum ada: hanya daftar kosong yang diterima. */
    period: z.array(z.string().max(64)).max(0).optional(),
  })
  .strict();

export type RowsBody = z.infer<typeof rowsBodySchema>;

/** POST /api/sheets/:id/values (T-044): daftar nilai satu kolom untuk menu saring, cari opsional. */
export const valuesBodySchema = z
  .object({
    versionId: id,
    pos,
    q: z.string().max(GRID_SEARCH_TEXT_MAX).optional(),
  })
  .strict();

/**
 * POST /api/sheets/:id/stats (T-045): ringkasan satu kolom angka di bawah saringan/cari yang sama
 * dengan jendela baris (bentuk `filters`/`search` = rowsBodySchema).
 */
export const statsBodySchema = z
  .object({
    versionId: id,
    pos,
    filters: rowsBodySchema.shape.filters,
    search: rowsBodySchema.shape.search,
  })
  .strict();

type SchemaCol = Pick<ColumnSchema, "pos" | "type" | "float" | "hidden">;

/** Permintaan jendela yang sudah dicocokkan dengan skema (hanya kolom terlihat). */
export interface GridPlan {
  rowStart: number;
  rowCount: number;
  cols: SchemaCol[];
  sort: { col: SchemaCol; dir: "asc" | "desc" }[];
  clauses: DashClause[];
  search: { text: string; cols: SchemaCol[] } | null;
}

export type GridPlanResult = { ok: true; plan: GridPlan } | { ok: false; message: string };

/**
 * Cocokkan body dengan skema. Posisi tidak ada/tersembunyi, saringan yang tidak cocok tipe, dan cari di
 * kolom bukan teks → pesan umum tanpa nama kolom.
 */
export function planGrid(body: RowsBody, schema: ColumnSchema[], now: Date): GridPlanResult {
  const visible = new Map(schema.filter((c) => !c.hidden).map((c) => [c.pos, c]));
  const pick = (p: number) => visible.get(p);
  const cols: SchemaCol[] = [];
  for (const p of body.cols) {
    const c = pick(p);
    if (!c) return { ok: false, message: "Kolom yang diminta tidak tersedia." };
    cols.push(c);
  }
  if (new Set(body.cols).size !== body.cols.length) {
    return { ok: false, message: "Kolom yang diminta ganda." };
  }
  const sort: GridPlan["sort"] = [];
  for (const s of body.sort ?? []) {
    const c = pick(s.pos);
    if (!c) return { ok: false, message: "Kolom urutan tidak tersedia." };
    if (sort.some((x) => x.col.pos === c.pos)) {
      return { ok: false, message: "Kolom urutan ganda." };
    }
    sort.push({ col: c, dir: s.dir });
  }
  const clauses: DashClause[] = [];
  for (const raw of body.filters ?? []) {
    const { pos: p, ...rest } = raw;
    const c = pick(p);
    const f = dashFilterSchema.safeParse({ ...rest, column: "_" });
    const clause = c && f.success ? columnClause(f.data, c, now) : null;
    if (!clause) return { ok: false, message: "Saringan tidak valid untuk kolom itu." };
    clauses.push(clause);
  }
  let search: GridPlan["search"] = null;
  if (body.search) {
    const sc: SchemaCol[] = [];
    for (const p of new Set(body.search.cols)) {
      const c = pick(p);
      if (!c || c.type !== "text") return { ok: false, message: "Kolom pencarian tidak valid." };
      sc.push(c);
    }
    search = { text: body.search.text, cols: sc };
  }
  return {
    ok: true,
    plan: { rowStart: body.rowStart, rowCount: body.rowCount, cols, sort, clauses, search },
  };
}

/** Jalur 1 berlaku: tanpa urut/saring/cari. */
export const isPlainWindow = (p: GridPlan) =>
  p.sort.length === 0 && p.clauses.length === 0 && p.search === null;

/** Potongan jendela pada satu segmen: indeks segmen + file_row_number [from, to] inklusif. */
export interface WindowPart {
  seg: number;
  from: number;
  to: number;
}

/**
 * Jendela global [start, start + count) → potongan per segmen dari jumlah baris kumulatif (urut
 * manifest). Segmen yang tidak beririsan tidak muncul (tidak disewa).
 */
export function windowParts(counts: number[], start: number, count: number): WindowPart[] {
  const out: WindowPart[] = [];
  const end = start + count;
  let base = 0;
  counts.forEach((n, seg) => {
    const lo = Math.max(start, base);
    const hi = Math.min(end, base + n);
    if (lo < hi) out.push({ seg, from: lo - base, to: hi - base - 1 });
    base += n;
  });
  return out;
}

const cid = (c: Pick<ColumnSchema, "pos">) => ident(`c${Math.trunc(c.pos)}`);

/** Kolom keluaran: teks dipotong + penanda potong; tipe lain apa adanya. */
function outputCols(cols: SchemaCol[]): string[] {
  return cols.flatMap((c, i) =>
    c.type === "text"
      ? [
          `left(${cid(c)}, ${GRID_CELL_TEXT_MAX}) AS v${i}`,
          `coalesce(length(${cid(c)}) > ${GRID_CELL_TEXT_MAX}, false) AS k${i}`,
        ]
      : [`${cid(c)} AS v${i}`],
  );
}

/**
 * Jalur 1: satu SELECT per potongan (UNION ALL), proyeksi eksplisit per file (kolom yang tidak ada di
 * segmen → NULL bertipe skema; `_row` legacy INTEGER → BIGINT). Path dan batas jendela = parameter.
 */
export function buildWindowSql(
  parts: WindowPart[],
  files: SegmentFile[],
  paths: string[],
  cols: SchemaCol[],
): BuiltSql {
  const params: BuiltSql["params"] = {};
  const selects = parts.map((part, k) => {
    const f = files[part.seg]!;
    const has = new Set(f.columns.length ? f.columns : cols.map((c) => c.pos));
    params[`s${k}`] = paths[k]!;
    params[`a${k}`] = part.from;
    params[`b${k}`] = part.to;
    const proj = cols.map(
      (c) => `CAST(${has.has(c.pos) ? cid(c) : "NULL"} AS ${sqlType(c)}) AS ${cid(c)}`,
    );
    return [
      `SELECT ${k} AS _part, file_row_number AS _fr, CAST(_row AS BIGINT) AS _row, ${proj.join(", ")}`,
      `FROM read_parquet($s${k}, file_row_number = true)`,
      `WHERE file_row_number BETWEEN $a${k} AND $b${k}`,
    ].join("\n");
  });
  const sql = [
    `SELECT _row, ${outputCols(cols).join(", ")}`,
    `FROM (${selects.join("\nUNION ALL\n")})`,
    `ORDER BY _part, _fr`,
  ].join("\n");
  return { sql, params };
}

/** WHERE saringan + cari (nilai $f… dari dashClauses, teks cari $q). */
function whereSql(plan: GridPlan, params: BuiltSql["params"]): string {
  const parts = dashClauses(plan.clauses, params);
  if (plan.search) {
    params.q = plan.search.text;
    parts.push(
      `(${plan.search.cols.map((c) => `contains(lower(${cid(c)}), lower($q))`).join(" OR ")})`,
    );
  }
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}

function orderSql(plan: GridPlan): string {
  return [
    ...plan.sort.map(
      (s) =>
        `${cid(s.col)}${s.col.type === "text" ? ` ${TEXT_COLLATE}` : ""} ${s.dir === "desc" ? "DESC" : "ASC"} NULLS LAST`,
    ),
    `_row ASC`,
  ].join(", ");
}

/**
 * Jalur 2: `_row` + kunci urut saja yang diurutkan dan dipotong LIMIT/OFFSET, lalu isi kolom diambil
 * lewat `_row IN ids` (late materialization, table.ts). LIMIT/OFFSET = bilangan bulat tervalidasi.
 */
export function buildSortedWindowSql(plan: GridPlan, parquetPath: string): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const order = orderSql(plan);
  const sql = [
    `WITH ids AS (`,
    `  SELECT _row FROM read_parquet($path)`,
    `  ${whereSql(plan, params)}`,
    `  ORDER BY ${order}`,
    `  LIMIT ${Math.trunc(plan.rowCount)} OFFSET ${Math.trunc(plan.rowStart)}`,
    `)`,
    `SELECT CAST(_row AS BIGINT) AS _row, ${outputCols(plan.cols).join(", ")}`,
    `FROM read_parquet($path)`,
    `WHERE _row IN (SELECT _row FROM ids)`,
    `ORDER BY ${order}`,
  ].join("\n");
  return { sql, params };
}

/** Jumlah baris di bawah saringan/cari yang sama (tanpa saringan = total sheet). */
export function buildGridCountSql(plan: GridPlan | null, parquetPath: string): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const where = plan ? whereSql(plan, params) : "";
  return { sql: [`SELECT count(*) AS n FROM read_parquet($path)`, where].join("\n"), params };
}

/** Agregat ringkasan kolom (urutan kolom hasil buildGridStatsSql). */
export const GRID_STATS_AGGS = ["count", "sum", "avg", "min", "max"] as const;

/**
 * Ringkasan satu kolom (T-045 AC4): ekspresi agregat sama persis dengan widget KPI (measureExpr:
 * Jumlah = coalesce(sum, 0), Hitung = count(kolom) = sel terisi) di bawah saringan/cari tampilan.
 */
export function buildGridStatsSql(plan: GridPlan, col: SchemaCol, parquetPath: string): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const c = `c${Math.trunc(col.pos)}`;
  const select = GRID_STATS_AGGS.map(
    (agg, i) => `${measureExpr({ key: agg, agg, col: c })} AS a${i}`,
  );
  return {
    sql: [`SELECT ${select.join(", ")}`, `FROM read_parquet($path)`, whereSql(plan, params)]
      .filter(Boolean)
      .join("\n"),
    params,
  };
}

/** Satu sel typed per `_row`: baris fisik sumber + nilai (NULL bila kolom tidak ada di file). */
export function buildTypedCellSql(
  file: SegmentFile,
  col: SchemaCol,
  path: string,
  row: number,
): BuiltSql {
  const has = file.columns.length === 0 || file.columns.includes(col.pos);
  const src = file.legacyRow ? "_row" : "_src_row";
  return {
    sql: [
      `SELECT CAST(${src} AS BIGINT) AS src, ${has ? cid(col) : "NULL"} AS v`,
      `FROM read_parquet($path)`,
      `WHERE _row = $r`,
      `LIMIT 1`,
    ].join("\n"),
    params: { path, r: row },
  };
}

/** Nilai raw (VARCHAR) satu sel: `_row` raw = baris fisik, kolom raw c<n> dari peta kolom. */
export function buildRawCellSql(rawCol: number, path: string, srcRow: number): BuiltSql {
  return {
    sql: `SELECT ${ident(`c${Math.trunc(rawCol)}`)} AS v FROM read_parquet($path) WHERE _row = $r LIMIT 1`,
    params: { path, r: srcRow },
  };
}

/** Kolom raw untuk posisi kanonik: colMap kosong = identitas; 0 = tidak ada di file. */
export const rawColumn = (colMap: number[], p: number): number =>
  colMap.length === 0 ? p : (colMap[p - 1] ?? 0);
