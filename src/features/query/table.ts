/*
 * SQL halaman widget tabel (T-011): baris mentah (bukan agregat), 100 baris per halaman, urut menurut
 * satu kolom tabel lalu _row (nomor baris asli) sebagai pemecah seri sehingga halaman deterministik dan
 * tanpa urutan: urutan file. Identifier hanya c<pos> dan _row buatan program; nilai filter lewat
 * parameter. Murni (tanpa I/O).
 *
 * Materialisasi terlambat (review T-011 M1): pengurutan + OFFSET hanya membawa kolom urut dan _row;
 * isi 100 baris diambil sesudahnya lewat _row. Tanpa ini DuckDB mengurutkan seluruh muatan baris
 * (hingga 20 kolom × 500 karakter) dan halaman jauh pada tabel lebar memakan belasan detik.
 */
import { ident } from "@/lib/duckdb";
import { TABLE_PAGE_SIZE } from "@/features/widgets/spec";
import type { Plan } from "./spec";
import { DIM_TEXT_MAX, TEXT_COLLATE, whereClauses, type BuiltSql } from "./sql";

/**
 * Pemecah seri baris setelah kolom urut: `_row`, didahului `_period` di sheet periode (T-058) sehingga
 * urutan bawaan kronologis. Dipakai juga ekspor tabel widget (exports/sql.ts).
 */
export const rowOrder = (periodic: boolean | undefined): string[] =>
  periodic ? [`${ident("_period")} ASC`, `${ident("_row")} ASC`] : [`${ident("_row")} ASC`];

function where(plan: Plan, params: BuiltSql["params"]): string {
  const clauses = whereClauses(plan, params);
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

/** Jumlah baris dengan filter yang sama dengan halaman. */
export function buildTableCount(plan: Plan, parquetPath: string): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const sql = [`SELECT count(*) AS n`, `FROM read_parquet($path)`, where(plan, params)]
    .filter(Boolean)
    .join("\n");
  return { sql, params };
}

export function buildTablePage(
  plan: Plan,
  sort: { index: number; dir: "asc" | "desc" } | null,
  page: number,
  parquetPath: string,
): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const row = ident("_row");
  const by = sort ? plan.dimensions[sort.index] : undefined;
  const order = [
    ...(by
      ? [
          `${ident(by.col)}${by.type === "text" ? ` ${TEXT_COLLATE}` : ""} ${sort!.dir === "desc" ? "DESC" : "ASC"} NULLS LAST`,
        ]
      : []),
    ...rowOrder(plan.periodic),
  ].join(", ");
  const select = plan.dimensions.map((d) => {
    const c = ident(d.col);
    return `${d.type === "text" ? `left(${c}, ${DIM_TEXT_MAX})` : c} AS ${ident(d.key)}`;
  });
  const sql = [
    `WITH ids AS (`,
    `  SELECT ${row} FROM read_parquet($path)`,
    `  ${where(plan, params)}`,
    `  ORDER BY ${order}`,
    `  LIMIT ${TABLE_PAGE_SIZE} OFFSET ${Math.trunc(page) * TABLE_PAGE_SIZE}`,
    `)`,
    `SELECT ${select.join(", ")}`,
    `FROM read_parquet($path)`,
    `WHERE ${row} IN (SELECT ${row} FROM ids)`,
    `ORDER BY ${order}`,
  ].join("\n");
  return { sql, params };
}
