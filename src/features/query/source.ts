/*
 * Sumber data sheet = daftar segmen typed dari manifest (ADR-0008, T-037). Pembangun SQL tetap menulis
 * `read_parquet($path)`; saat dieksekusi token itu diganti di sini:
 *  - satu file → tidak berubah (`$path` = path file, persis seperti sebelum segmen);
 *  - beberapa file berskema sama (set kolom + jenis `_row` sama) → `$path` = listValue([...]) — satu
 *    parameter, bukan larik JS atau literal SQL (ADR-0008 butir 1);
 *  - skema campuran → proyeksi eksplisit per kelompok skema: `(SELECT CAST(_row AS BIGINT) AS _row,
 *    <_src_row>, CAST(c<pos> | NULL AS <tipe skema>) AS c<pos> … FROM read_parquet($s0) UNION ALL …)`.
 *    Daftar polos dan union_by_name dilarang untuk skema campuran (ADR-0008 butir 4–5).
 * Daftar path hanya berisi file cache lokal hasil sewa (sandbox allowed_directories tetap berlaku).
 * Murni (kecuali listValue dari node-api).
 */
import { listValue, type DuckDBValue } from "@duckdb/node-api";
import { sqlType } from "@/features/ingest/infer";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { BuiltSql } from "./sql";

/** Satu file typed segmen di manifest sheet, urut ordinal. */
export interface SegmentFile {
  typedKey: string;
  /** Typed lama (T-036): `_row INTEGER` = baris fisik, tanpa `_src_row`. */
  legacyRow: boolean;
  /** Posisi c<pos> di file; kosong = tidak diketahui (dianggap semua kolom skema). */
  columns: number[];
}

/** Sumber query: satu kunci typed (perilaku lama) atau daftar segmen + skema sheet untuk proyeksi. */
export type ParquetSource =
  string | { files: SegmentFile[]; schema: Pick<ColumnSchema, "pos" | "type" | "float">[] };

/** Token sumber yang ditulis semua pembangun SQL (sql.ts, table.ts, pivot.ts, ekspor, sampel). */
export const SOURCE_TOKEN = "read_parquet($path)";

/** Sumber sheet dari repo: ≤ 1 segmen → kunci typed (tanpa jalur baru), selain itu daftar segmen. */
export function sheetSource(sheet: {
  typedKey: string;
  schema: Pick<ColumnSchema, "pos" | "type" | "float">[];
  segments?: SegmentFile[];
}): ParquetSource {
  const files = sheet.segments ?? [];
  return files.length > 1 ? { files, schema: sheet.schema } : sheet.typedKey;
}

/** Kunci typed semua file sumber (sewa cache, unduh ekspor). */
export const sourceKeys = (s: ParquetSource): string[] =>
  typeof s === "string" ? [s] : s.files.map((f) => f.typedKey);

/** Tanda kelompok skema: jenis `_row` + set kolom. */
const signature = (f: SegmentFile) => `${f.legacyRow ? "L" : "S"}:${f.columns.join(",")}`;

/**
 * Ganti `read_parquet($path)` di `built` dengan sumber segmen. `paths[i]` = file lokal untuk
 * `files[i]`. Parameter `path` milik pembangun diganti (daftar) atau dibuang (proyeksi).
 */
export function withSegments(
  built: BuiltSql,
  files: SegmentFile[],
  paths: string[],
  schema: Pick<ColumnSchema, "pos" | "type" | "float">[],
): BuiltSql {
  if (files.length <= 1 || !built.sql.includes(SOURCE_TOKEN)) return built;
  if (files.length !== paths.length) throw new Error("jumlah path segmen tidak cocok");
  const groups = new Map<string, { file: SegmentFile; paths: string[] }>();
  files.forEach((f, i) => {
    const g = groups.get(signature(f)) ?? { file: f, paths: [] };
    g.paths.push(paths[i]!);
    groups.set(signature(f), g);
  });
  const params: Record<string, DuckDBValue> = { ...built.params };
  if (groups.size === 1) {
    params.path = listValue(paths);
    return { sql: built.sql, params };
  }
  delete params.path;
  const cols = [...schema].sort((a, b) => a.pos - b.pos);
  const parts = [...groups.values()].map((g, k) => {
    const has = new Set(g.file.columns.length ? g.file.columns : cols.map((c) => c.pos));
    params[`s${k}`] = listValue(g.paths);
    const values = cols.map((c) => {
      const id = `c${Math.trunc(c.pos)}`;
      return `CAST(${has.has(c.pos) ? id : "NULL"} AS ${sqlType(c)}) AS ${id}`;
    });
    const src = g.file.legacyRow ? "CAST(_row AS INTEGER)" : "_src_row";
    return `SELECT CAST(_row AS BIGINT) AS _row, ${src} AS _src_row, ${values.join(", ")} FROM read_parquet($s${k})`;
  });
  return { sql: built.sql.replaceAll(SOURCE_TOKEN, `(${parts.join(" UNION ALL ")})`), params };
}
