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

export function buildSql(plan: Plan, parquetPath: string): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const select: string[] = [];
  for (const d of plan.dimensions) {
    const c = ident(d.col);
    // Teks dimensi dipotong: label grafik tidak butuh 32 ribu karakter, dan hasil 10k baris × sel
    // panjang membengkakkan memori aplikasi (review T-009 F4).
    const e = d.grain
      ? `date_trunc('${d.grain}', ${c})`
      : d.type === "text"
        ? `left(${c}, ${DIM_TEXT_MAX})`
        : c;
    select.push(`${e} AS ${ident(d.key)}`);
  }
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
  const order = [
    ...plan.sort.map((x) => `${ident(x.key)} ${x.dir === "desc" ? "DESC" : "ASC"} NULLS LAST`),
    ...plan.dimensions
      .filter((d) => !sorted.has(d.key))
      .map((d) => `${ident(d.key)} ASC NULLS LAST`),
  ];

  const base = [
    `SELECT ${distinct}${select.join(", ")}`,
    `FROM read_parquet($path)`,
    where.length ? `WHERE ${where.join(" AND ")}` : "",
    group,
  ].filter(Boolean);
  const tail = [
    order.length ? `ORDER BY ${order.join(", ")}` : "",
    `LIMIT ${Math.trunc(plan.limit)}`,
  ].filter(Boolean);
  if (plan.totals && plan.dimensions.length && plan.measures.length) {
    // Dua kolom tambahan di akhir: jumlah grup dan total ukuran pertama seluruh grup (sebelum LIMIT).
    const m0 = ident(plan.measures[0]!.key);
    const sql = [
      `WITH g AS (`,
      ...base.map((l) => `  ${l}`),
      `)`,
      `SELECT *, count(*) OVER () AS ${ident("__n")}, sum(${m0}) OVER () AS ${ident("__t")}`,
      `FROM g`,
      ...tail,
    ].join("\n");
    return { sql, params };
  }
  return { sql: [...base, ...tail].join("\n"), params };
}
