/*
 * SQL dari rencana query (T-009). Identifier hanya c<pos> buatan program (dikutip ganda), fungsi dan
 * arah urut dari enum tertutup, semua nilai user lewat parameter binding ($p1, $p2, …). Path parquet
 * juga parameter. Murni (tanpa I/O).
 */
import { ident } from "@/lib/duckdb";
import type { Plan, PlanFilter } from "./spec";

export interface BuiltSql {
  sql: string;
  params: Record<string, string | number | boolean>;
}

const OP_SQL = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
/** Panjang maksimum teks dimensi di hasil. */
export const DIM_TEXT_MAX = 500;

/**
 * Klausa WHERE dari filter rencana; nilai masuk `params` sebagai $p1, $p2, … (dipakai query agregat
 * dan halaman tabel T-011 agar aturan filter persis sama).
 */
export function filterClauses(filters: PlanFilter[], params: BuiltSql["params"]): string[] {
  let n = 0;
  const bind = (v: string | number | boolean, type: PlanFilter["type"]) => {
    const name = `p${++n}`;
    params[name] = v;
    // Tanggal dikirim sebagai teks ISO lalu di-cast; tipe lain sesuai nilai JS.
    if (type === "date") return `CAST($${name} AS DATE)`;
    if (type === "timestamp") return `CAST($${name} AS TIMESTAMP)`;
    if (type === "decimal" || type === "integer" || type === "duration") {
      return `CAST($${name} AS DOUBLE)`;
    }
    return `$${name}`;
  };
  return filters.map((f) => {
    const c = ident(f.col);
    switch (f.op) {
      case "is_null":
        return `${c} IS NULL`;
      case "not_null":
        return `${c} IS NOT NULL`;
      // "Bukan X" menyertakan sel kosong: eq X + neq X = semua baris (review T-009 F7).
      case "in":
        return `${c} IN (${f.values.map((v) => bind(v, f.type)).join(", ")})`;
      case "not_in":
        return `(${c} IS NULL OR ${c} NOT IN (${f.values.map((v) => bind(v, f.type)).join(", ")}))`;
      case "neq":
        return `(${c} IS NULL OR ${c} <> ${bind(f.values[0]!, f.type)})`;
      case "between":
        return `${c} BETWEEN ${bind(f.values[0]!, f.type)} AND ${bind(f.values[1]!, f.type)}`;
      case "contains":
        return `contains(lower(${c}), lower(${bind(f.values[0]!, f.type)}))`;
      default:
        return `${c} ${OP_SQL[f.op]} ${bind(f.values[0]!, f.type)}`;
    }
  });
}

/**
 * Urutan teks seperti Excel: tidak peka huruf besar/kecil dan aksen ("Ácehe" sebelum "apel" sebelum
 * "Bandung"), bukan urutan byte (review integritas T-011). Nilai mentah tetap jadi pemecah seri.
 */
export const TEXT_COLLATE = `COLLATE "nocase.noaccent"`;

/** Ekspresi dimensi: teks dipotong, tanggal dikelompokkan per grain. */
function dimensionExpr(d: Plan["dimensions"][number]): string {
  const c = ident(d.col);
  // Teks dimensi dipotong: label grafik tidak butuh 32 ribu karakter, dan hasil 10k baris × sel
  // panjang membengkakkan memori aplikasi (review T-009 F4).
  return d.grain
    ? `date_trunc('${d.grain}', ${c})`
    : d.type === "text"
      ? `left(${c}, ${DIM_TEXT_MAX})`
      : c;
}

export function buildSql(plan: Plan, parquetPath: string): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const select: string[] = [];
  for (const d of plan.dimensions) select.push(`${dimensionExpr(d)} AS ${ident(d.key)}`);
  for (const m of plan.measures) {
    const c = m.col ? ident(m.col) : "*";
    const e =
      m.agg === "count"
        ? `count(${c})`
        : m.agg === "count_distinct"
          ? `count(DISTINCT ${c})`
          : `${m.agg}(${c})`;
    select.push(`${e} AS ${ident(m.key)}`);
  }

  const where = filterClauses(plan.filters, params);
  const group = plan.dimensions.length && plan.measures.length ? "GROUP BY ALL" : "";
  const distinct = plan.dimensions.length && !plan.measures.length ? "DISTINCT " : "";
  // Urutan deterministik: urutan pilihan user lalu dimensi naik sebagai pemecah seri, sehingga baris
  // di batas LIMIT selalu sama (review T-009 F8). Hasil tanpa dimensi hanya satu baris.
  const sorted = new Set(plan.sort.map((x) => x.key));
  const textKeys = new Set(plan.dimensions.filter((d) => d.type === "text").map((d) => d.key));
  const order = [
    ...plan.sort.map(
      (x) =>
        `${ident(x.key)}${textKeys.has(x.key) ? ` ${TEXT_COLLATE}` : ""} ${x.dir === "desc" ? "DESC" : "ASC"} NULLS LAST`,
    ),
    ...plan.dimensions
      .filter((d) => !sorted.has(d.key))
      .map((d) => `${ident(d.key)} ASC NULLS LAST`),
    // Pemecah seri byte-exact untuk kunci teks (urutan deterministik walau collation menyamakan).
    ...plan.sort.filter((x) => textKeys.has(x.key)).map((x) => `${ident(x.key)} ASC`),
  ];

  const sql = [
    `SELECT ${distinct}${select.join(", ")}`,
    `FROM read_parquet($path)`,
    where.length ? `WHERE ${where.join(" AND ")}` : "",
    group,
    order.length ? `ORDER BY ${order.join(", ")}` : "",
    `LIMIT ${Math.trunc(plan.limit)}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { sql, params };
}

/**
 * Total untuk grafik widget, dihitung terpisah dari query N teratas (review T-011): jumlah kategori
 * (termasuk grup kosong) dan total ukuran seluruh kategori — hanya untuk ukuran yang bisa dijumlahkan
 * (Total, Jumlah baris); selain itu NULL (sum() atas tanggal tidak valid). Tanpa GROUP BY / window,
 * jadi tidak menahan seluruh grup di memori.
 */
export function buildTotalsSql(plan: Plan, parquetPath: string): BuiltSql | null {
  const d = plan.dimensions[0];
  const m = plan.measures[0];
  if (!d || !m) return null;
  const params: BuiltSql["params"] = { path: parquetPath };
  const where = filterClauses(plan.filters, params);
  const e = dimensionExpr(d);
  const grand =
    m.agg === "sum"
      ? `sum(${ident(m.col!)})`
      : m.agg === "count"
        ? `count(${m.col ? ident(m.col) : "*"})`
        : "NULL";
  const sql = [
    `SELECT count(DISTINCT ${e}) + coalesce(max(CASE WHEN ${e} IS NULL THEN 1 ELSE 0 END), 0) AS n,`,
    `  ${grand} AS t`,
    `FROM read_parquet($path)`,
    where.length ? `WHERE ${where.join(" AND ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { sql, params };
}
