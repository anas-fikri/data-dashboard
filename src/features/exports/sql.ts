/*
 * SQL ekspor widget (T-017). Rencana dari resolveWidget (sama dengan query widget di layar):
 *  - tabel: SEMUA baris terfilter (bukan halaman 100), urutan layar (kolom urut tervalidasi) lalu _row
 *    sebagai pemecah seri, teks utuh (tanpa left(…, 500)), LIMIT batas baris sebagai penjaga;
 *  - KPI/grafik: persis baris rencana (query agregat widget, tanpa baris "Lainnya").
 * Identifier hanya c<pos>, _row, dan kunci keluaran d<i>/m<i> buatan program; semua nilai lewat parameter
 * (path parquet juga). Nama tampil kolom (teks user) tidak pernah masuk SQL — header ditulis di Node.
 *
 * Target CSV (E3/E4): teks yang diawali = + - @ tab CR diberi awalan ' (netralisasi formula), boolean
 * TRUE/FALSE, durasi h:mm:ss, desimal tanpa nol di belakang, tanggal YYYY-MM-DD. Target XLSX: nilai
 * bertipe asli (penulis XLSX memberi tipe sel; teks selalu string, jadi tanpa awalan). Murni.
 */
import { ident } from "@/lib/duckdb";
import type { ResolvedWidget } from "@/features/query/service";
import type { OutColumn, Plan } from "@/features/query/spec";
import { buildSql, TEXT_COLLATE, whereClauses, type BuiltSql } from "@/features/query/sql";
import { buildTableCount } from "@/features/query/table";

export type ExportTarget = "csv" | "xlsx";

type Resolved = Pick<ResolvedWidget, "planned" | "dash">;

/** Rencana dengan filter dashboard (sama seperti widgetResult). */
function planOf(r: Resolved): Plan {
  return { ...r.planned.plan, dash: r.dash.clauses };
}

/** Kolom keluaran file (urutan + label header + tipe), sama dengan kolom hasil query widget. */
export function exportColumns(r: Resolved): OutColumn[] {
  return r.planned.plan.columns;
}

/** Karakter awal yang membuat sel CSV dibaca sebagai formula oleh Excel/LibreOffice/Sheets. */
export const FORMULA_START = /^[=+\-@\t\r]/;

/** Netralisasi teks CSV di SQL: konstanta program, tanpa nilai user. */
const neutralise = (x: string) =>
  `CASE WHEN left(${x}, 1) IN ('=', '+', '-', '@', chr(9), chr(13)) THEN '''' || ${x} ELSE ${x} END`;

/** Detik → [-]h:mm:ss (jam tidak dibatasi 24, seperti format [h]:mm:ss Excel). */
function durationText(x: string): string {
  const s = `abs(CAST(round(${x}) AS BIGINT))`;
  return [
    `CASE WHEN ${x} IS NULL THEN NULL ELSE`,
    `(CASE WHEN round(${x}) < 0 THEN '-' ELSE '' END)`,
    `|| CAST(${s} // 3600 AS VARCHAR) || ':'`,
    `|| lpad(CAST((${s} % 3600) // 60 AS VARCHAR), 2, '0') || ':'`,
    `|| lpad(CAST(${s} % 60 AS VARCHAR), 2, '0') END`,
  ].join(" ");
}

/**
 * Nilai satu kolom untuk target file. Desimal: teks titik-tetap tanpa nol di belakang ("1.500000" →
 * "1.5", "100.000000" → "100"); bentuk lain (DOUBLE 1e+20, inf) dibiarkan apa adanya.
 */
function valueExpr(x: string, type: OutColumn["type"], target: ExportTarget): string {
  if (type === "date") return `CAST(${x} AS DATE)`;
  if (target === "xlsx") return x;
  switch (type) {
    case "text":
      return neutralise(x);
    case "boolean":
      return `CASE WHEN ${x} THEN 'TRUE' WHEN NOT ${x} THEN 'FALSE' END`;
    case "duration":
      return durationText(x);
    case "decimal":
      return `regexp_replace(regexp_replace(CAST(${x} AS VARCHAR), '^(-?[0-9]+\\.[0-9]*?)0+$', '\\1'), '^(-?[0-9]+)\\.$', '\\1')`;
    default:
      return x;
  }
}

/**
 * SELECT data ekspor. Tabel: langsung dari parquet dengan WHERE + ORDER BY yang sama dengan halaman
 * tabel; KPI/grafik: query agregat widget dibungkus (proyeksi mempertahankan urutan dengan
 * preserve_insertion_order — openDuck menguncinya true).
 */
export function buildExportSql(
  r: Resolved,
  parquetPath: string,
  target: ExportTarget,
  maxRows: number,
): BuiltSql {
  const plan = planOf(r);
  const cols = plan.columns;
  if (r.planned.kind === "agg") {
    const inner = buildSql(plan, parquetPath);
    const select = cols.map(
      (c) => `${valueExpr(`q.${ident(c.key)}`, c.type, target)} AS ${ident(c.key)}`,
    );
    return {
      sql: [`SELECT ${select.join(", ")}`, `FROM (`, inner.sql, `) AS q`].join("\n"),
      params: inner.params,
    };
  }
  const params: BuiltSql["params"] = { path: parquetPath };
  const where = whereClauses(plan, params);
  const sort = r.planned.sort;
  const by = sort ? plan.dimensions[sort.index] : undefined;
  const row = ident("_row");
  const order = [
    ...(by
      ? [
          `${ident(by.col)}${by.type === "text" ? ` ${TEXT_COLLATE}` : ""} ${sort!.dir === "desc" ? "DESC" : "ASC"} NULLS LAST`,
        ]
      : []),
    `${row} ASC`,
  ].join(", ");
  const select = plan.dimensions.map(
    (d, i) => `${valueExpr(ident(d.col), cols[i]!.type, target)} AS ${ident(d.key)}`,
  );
  const sql = [
    `SELECT ${select.join(", ")}`,
    `FROM read_parquet($path)`,
    where.length ? `WHERE ${where.join(" AND ")}` : "",
    `ORDER BY ${order}`,
    `LIMIT ${Math.max(0, Math.trunc(maxRows))}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { sql, params };
}

/**
 * Jumlah baris hasil sebelum menulis (batas EXPORT_MAX_ROWS, E5). KPI/grafik: null — barisnya sudah
 * dibatasi rencana (1 / top-N ≤ 1.000).
 */
export function buildExportCount(r: Resolved, parquetPath: string): BuiltSql | null {
  return r.planned.kind === "table" ? buildTableCount(planOf(r), parquetPath) : null;
}
