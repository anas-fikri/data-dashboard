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

export function buildSql(plan: Plan, parquetPath: string): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
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

  const select: string[] = [];
  for (const d of plan.dimensions) {
    const c = ident(d.col);
    select.push(`${d.grain ? `date_trunc('${d.grain}', ${c})` : c} AS ${ident(d.key)}`);
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

  const where = plan.filters.map((f) => {
    const c = ident(f.col);
    switch (f.op) {
      case "is_null":
        return `${c} IS NULL`;
      case "not_null":
        return `${c} IS NOT NULL`;
      case "in":
      case "not_in":
        return `${c} ${f.op === "in" ? "IN" : "NOT IN"} (${f.values.map((v) => bind(v, f.type)).join(", ")})`;
      case "between":
        return `${c} BETWEEN ${bind(f.values[0]!, f.type)} AND ${bind(f.values[1]!, f.type)}`;
      case "contains":
        return `contains(lower(${c}), lower(${bind(f.values[0]!, f.type)}))`;
      default:
        return `${c} ${OP_SQL[f.op]} ${bind(f.values[0]!, f.type)}`;
    }
  });

  const group = plan.dimensions.length && plan.measures.length ? "GROUP BY ALL" : "";
  const distinct = plan.dimensions.length && !plan.measures.length ? "DISTINCT " : "";
  // Urutan default deterministik: dimensi naik (hasil tanpa dimensi hanya satu baris).
  const order = plan.sort.length
    ? plan.sort.map((s) => `${ident(s.key)} ${s.dir === "desc" ? "DESC" : "ASC"} NULLS LAST`)
    : plan.dimensions.map((d) => `${ident(d.key)} ASC NULLS LAST`);

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
