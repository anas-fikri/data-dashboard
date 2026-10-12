/*
 * SQL halaman widget tabel (T-011): baris mentah (bukan agregat), 100 baris per halaman, urut menurut
 * satu kolom tabel lalu _row (nomor baris asli) sebagai pemecah seri sehingga halaman deterministik dan
 * tanpa urutan: urutan file. Total baris dari count(*) dengan filter yang sama. Identifier hanya c<pos>
 * dan _row buatan program; nilai filter lewat parameter. Murni (tanpa I/O).
 */
import { ident } from "@/lib/duckdb";
import { TABLE_PAGE_SIZE } from "@/features/widgets/spec";
import type { Plan } from "./spec";
import { DIM_TEXT_MAX, filterClauses, type BuiltSql } from "./sql";

export function buildTableSql(
  plan: Plan,
  sort: { index: number; dir: "asc" | "desc" } | null,
  page: number,
  parquetPath: string,
): { page: BuiltSql; count: BuiltSql } {
  const params: BuiltSql["params"] = { path: parquetPath };
  const where = filterClauses(plan.filters, params);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const select = plan.dimensions.map((d) => {
    const c = ident(d.col);
    return `${d.type === "text" ? `left(${c}, ${DIM_TEXT_MAX})` : c} AS ${ident(d.key)}`;
  });
  const by = sort ? plan.dimensions[sort.index] : undefined;
  const order = [
    ...(by ? [`${ident(by.col)} ${sort!.dir === "desc" ? "DESC" : "ASC"} NULLS LAST`] : []),
    `${ident("_row")} ASC`,
  ];
  const pageSql = [
    `SELECT ${select.join(", ")}`,
    `FROM read_parquet($path)`,
    whereSql,
    `ORDER BY ${order.join(", ")}`,
    `LIMIT ${TABLE_PAGE_SIZE} OFFSET ${Math.trunc(page) * TABLE_PAGE_SIZE}`,
  ]
    .filter(Boolean)
    .join("\n");
  const countSql = [`SELECT count(*) AS n`, `FROM read_parquet($path)`, whereSql]
    .filter(Boolean)
    .join("\n");
  return { page: { sql: pageSql, params }, count: { sql: countSql, params } };
}
