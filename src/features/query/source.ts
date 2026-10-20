/*
 * Sumber data sheet = daftar segmen typed dari manifest (ADR-0008, T-037). Pembangun SQL tetap menulis
 * `read_parquet($path)`; saat dieksekusi token itu diganti di sini:
 *  - satu file → tidak berubah (`$path` = path file, persis seperti sebelum segmen);
 *  - beberapa file berskema sama (set kolom + jenis `_row` sama) → `$path` = listValue([...]) — satu
 *    parameter, bukan larik JS atau literal SQL (ADR-0008 butir 1);
 *  - skema campuran, atau file yang tidak memuat semua kolom skema (kolom ditambahkan unggahan periode
 *    berikutnya, T-057) → proyeksi eksplisit per kelompok skema: `(SELECT CAST(_row AS BIGINT) AS _row,
 *    <_src_row>, CAST(c<pos> | NULL AS <tipe skema>) AS c<pos> … FROM read_parquet($s0) UNION ALL …)`.
 *    Daftar polos dan union_by_name dilarang untuk skema campuran (ADR-0008 butir 4–5).
 * Sheet periode (T-058): sumber SELALU diproyeksikan dan membawa `_period` serta kolom sistem Periode
 * `_period AS c<PERIOD_COLUMN>` — juga untuk satu file dan untuk skema campuran (review T-049 L3: proyeksi
 * NULL dulu membuang `_period`). Filter/dimensi Periode dan urutan (_period, _row) bergantung padanya.
 * Daftar path hanya berisi file cache lokal hasil sewa (sandbox allowed_directories tetap berlaku).
 * Murni (kecuali listValue dari node-api).
 */
import { listValue, type DuckDBValue } from "@duckdb/node-api";
import { sqlType } from "@/features/ingest/infer";
import type { ColumnSchema } from "@/features/ingest/infer";
import { PERIOD_COLUMN, withoutPeriodColumn } from "./period-column";
import type { BuiltSql } from "./sql";

/**
 * Periode satu segmen (T-058, pemangkasan): awal periode (= `_period` semua barisnya) dan, untuk sumber
 * KOLOM, tanggal terkecil/terbesar kolom periode (Segment.minDate/maxDate, ISO naive). Segmen berlabel
 * (T-054) tidak membawa min/max: di sana min/max = kolom tanggal acuan, bukan rentang periode.
 */
export interface SegmentPeriod {
  key: string;
  start: string;
  min: string | null;
  max: string | null;
}

/** Satu file typed segmen di manifest sheet, urut ordinal. */
export interface SegmentFile {
  typedKey: string;
  /** Typed lama (T-036): `_row INTEGER` = baris fisik, tanpa `_src_row`. */
  legacyRow: boolean;
  /** Posisi c<pos> di file; kosong = tidak diketahui (dianggap semua kolom skema). */
  columns: number[];
  /** Sheet periode: periode segmen ini. */
  period?: SegmentPeriod;
}

/** Sheet periode: posisi kolom periode (sumber KOLOM) atau null (LABEL). */
export interface SourcePeriod {
  column: number | null;
}

type SourceSchema = Pick<ColumnSchema, "pos" | "type" | "float">[];

/**
 * Sumber query: satu kunci typed (perilaku lama) atau daftar segmen + skema sheet untuk proyeksi
 * (`period` = sheet periode, proyeksi `_period` + kolom sistem Periode).
 */
export type ParquetSource =
  string | { files: SegmentFile[]; schema: SourceSchema; period?: SourcePeriod };
export type SegmentSource = Exclude<ParquetSource, string>;

/** Token sumber yang ditulis semua pembangun SQL (sql.ts, table.ts, pivot.ts, ekspor, sampel). */
export const SOURCE_TOKEN = "read_parquet($path)";

/**
 * File memuat semua kolom skema sheet (kolom kosong = tidak diketahui → dianggap lengkap). Sheet periode
 * bisa punya kolom yang ditambahkan setelah file ini ditulis (T-057): kolom itu NULL lewat proyeksi.
 */
const covers = (f: SegmentFile, schema: Pick<ColumnSchema, "pos">[]) => {
  if (!f.columns.length) return true;
  const has = new Set(f.columns);
  return schema.every((c) => has.has(c.pos));
};

/**
 * Sumber sheet dari repo: satu segmen yang memuat semua kolom skema → kunci typed (tanpa jalur baru),
 * selain itu daftar segmen (proyeksi bila kolomnya tidak lengkap).
 */
export function sheetSource(sheet: {
  typedKey: string;
  schema: SourceSchema;
  segments?: SegmentFile[];
  /** Sheet periode (T-058): sumber selalu daftar segmen dengan proyeksi `_period`. */
  period?: SourcePeriod | null;
}): ParquetSource {
  const files = sheet.segments ?? [];
  // Kolom sistem Periode bukan kolom file: tidak pernah ikut proyeksi c<pos>.
  const schema = withoutPeriodColumn(sheet.schema);
  if (sheet.period && files.length) return { files, schema, period: sheet.period };
  const plain = files.length <= 1 && (!files[0] || covers(files[0], schema));
  return plain ? sheet.typedKey : { files, schema };
}

/** Kunci typed semua file sumber (sewa cache, unduh ekspor). */
export const sourceKeys = (s: ParquetSource): string[] =>
  typeof s === "string" ? [s] : s.files.map((f) => f.typedKey);

/** Tanda kelompok skema: jenis `_row` + set kolom. */
const signature = (f: SegmentFile) => `${f.legacyRow ? "L" : "S"}:${f.columns.join(",")}`;

/** Identifier kolom sistem Periode di sumber yang diproyeksikan. */
export const PERIOD_IDENT = `c${PERIOD_COLUMN}`;

/**
 * Ganti `read_parquet($path)` di `built` dengan sumber segmen. `paths[i]` = file lokal untuk
 * `source.files[i]`. Parameter `path` milik pembangun diganti (daftar) atau dibuang (proyeksi).
 */
export function withSegments(built: BuiltSql, source: SegmentSource, paths: string[]): BuiltSql {
  const { files, period } = source;
  const schema = withoutPeriodColumn(source.schema);
  if (!files.length || !built.sql.includes(SOURCE_TOKEN)) return built;
  if (!period && files.length === 1 && covers(files[0]!, schema)) return built;
  if (files.length !== paths.length) throw new Error("jumlah path segmen tidak cocok");
  const groups = new Map<string, { file: SegmentFile; paths: string[] }>();
  files.forEach((f, i) => {
    const g = groups.get(signature(f)) ?? { file: f, paths: [] };
    g.paths.push(paths[i]!);
    groups.set(signature(f), g);
  });
  const params: Record<string, DuckDBValue> = { ...built.params };
  if (groups.size === 1 && covers(files[0]!, schema)) {
    if (!period) {
      params.path = listValue(paths);
      return { sql: built.sql, params };
    }
    delete params.path;
    params.s0 = listValue(paths);
    const src = `(SELECT *, CAST(_period AS DATE) AS ${PERIOD_IDENT} FROM read_parquet($s0))`;
    return { sql: built.sql.replaceAll(SOURCE_TOKEN, src), params };
  }
  delete params.path;
  // Sheet periode: `_period` + kolom sistem ikut di SETIAP kelompok skema (review T-049 L3).
  const periodCols = period
    ? `, CAST(_period AS DATE) AS _period, CAST(_period AS DATE) AS ${PERIOD_IDENT}`
    : "";
  const cols = [...schema].sort((a, b) => a.pos - b.pos);
  const parts = [...groups.values()].map((g, k) => {
    const has = new Set(g.file.columns.length ? g.file.columns : cols.map((c) => c.pos));
    params[`s${k}`] = listValue(g.paths);
    const values = cols.map((c) => {
      const id = `c${Math.trunc(c.pos)}`;
      return `CAST(${has.has(c.pos) ? id : "NULL"} AS ${sqlType(c)}) AS ${id}`;
    });
    const src = g.file.legacyRow ? "CAST(_row AS INTEGER)" : "_src_row";
    return `SELECT CAST(_row AS BIGINT) AS _row, ${src} AS _src_row${periodCols}, ${values.join(", ")} FROM read_parquet($s${k})`;
  });
  return { sql: built.sql.replaceAll(SOURCE_TOKEN, `(${parts.join(" UNION ALL ")})`), params };
}
