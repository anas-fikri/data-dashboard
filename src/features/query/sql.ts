/*
 * SQL dari rencana query (T-009). Identifier hanya c<pos> buatan program (dikutip ganda), fungsi dan
 * arah urut dari enum tertutup, semua nilai user lewat parameter binding ($p1, $p2, …). Path parquet
 * juga parameter. Murni (tanpa I/O).
 */
import type { ColumnType } from "@/features/ingest/infer";
import { ident } from "@/lib/duckdb";
import type { DashClause } from "./filters";
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
 * Angka JS → teks desimal 6 digit pecahan, untuk dibandingkan dengan kolom DECIMAL(38,6) secara tepat
 * (tanpa lewat DOUBLE yang bisa meleset 1 ulp pada nilai besar). Dihitung dari representasi terpendek
 * angka (String(n)), bukan nilai biner persisnya: 0.1 tetap "0.100000". "exact": null bila angka punya
 * > 6 digit pecahan (tidak mungkin sama dengan nilai tersimpan); "ceil"/"floor": dibulatkan ke atas/
 * bawah sehingga c >= ceil(b) ⇔ c >= b, c < ceil(b) ⇔ c < b, dan c <= floor(b) ⇔ c <= b.
 */
export function decimal6(n: number, mode: "exact" | "ceil" | "floor"): string | null {
  if (!Number.isFinite(n)) return null;
  const [mant = "0", exp = "0"] = String(Math.abs(n)).split("e");
  const [int = "0", frac = ""] = mant.split(".");
  const digits = BigInt(int + frac);
  // |n| = digits / 10^scale
  const scale = frac.length - Number(exp);
  let q: bigint;
  let rest = false;
  if (scale <= 6) q = digits * 10n ** BigInt(6 - scale);
  else {
    const div = 10n ** BigInt(scale - 6);
    q = digits / div;
    rest = digits % div !== 0n;
  }
  const neg = n < 0;
  if (rest) {
    if (mode === "exact") return null;
    // Pemotongan = ke arah nol; ceil untuk positif / floor untuk negatif menjauh dari nol.
    if ((mode === "ceil") !== neg) q += 1n;
  }
  const s = q.toString().padStart(7, "0");
  return `${neg && q !== 0n ? "-" : ""}${s.slice(0, -6)}.${s.slice(-6)}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Klausa filter dashboard (T-012); nilai lewat parameter $f1, $f2, … (terpisah dari $p filter rencana
 * agar keduanya bisa digabung dalam satu WHERE). Angka dibandingkan dalam tipe kolomnya: DECIMAL(38,6)
 * dengan batas DECIMAL (lihat decimal6), kolom DOUBLE/bilangan bulat dengan DOUBLE. Tanggal naive
 * di-cast tanpa zona. Teks sepanjang DIM_TEXT_MAX dicocokkan dengan awalan (label grafik dipotong
 * sepanjang itu, jadi cross-filter dari batang itu tetap mengenai baris aslinya). null = sel kosong.
 */
export function dashClauses(clauses: DashClause[], params: BuiltSql["params"]): string[] {
  let n = 0;
  const bind = (v: string | number | boolean) => {
    const name = `f${++n}`;
    params[name] = v;
    return `$${name}`;
  };
  const value = (
    cl: DashClause,
    v: string | number | boolean,
    mode: "exact" | "ceil" | "floor",
  ): string | null => {
    switch (cl.type) {
      case "date":
        return `CAST(${bind(v)} AS ${typeof v === "string" && DATE_ONLY.test(v) ? "DATE" : "TIMESTAMP"})`;
      case "timestamp":
        return `CAST(${bind(v)} AS TIMESTAMP)`;
      case "decimal": {
        if (cl.float || typeof v !== "number") return `CAST(${bind(v)} AS DOUBLE)`;
        const d = decimal6(v, mode);
        return d === null ? null : `CAST(${bind(d)} AS DECIMAL(38,6))`;
      }
      case "integer":
      case "duration":
        return `CAST(${bind(v)} AS DOUBLE)`;
      default:
        return bind(v);
    }
  };
  return clauses.map((cl) => {
    const c = ident(cl.col);
    if (cl.op === "range") {
      const cmp = (op: string, b: string | number | undefined, mode: "ceil" | "floor") => {
        if (b === undefined) return [];
        const x = value(cl, b, mode);
        return [x === null ? "FALSE" : `${c} ${op} ${x}`];
      };
      const parts = [
        ...cmp(">=", cl.gte, "ceil"),
        ...cmp("<=", cl.lte, "floor"),
        ...cmp("<", cl.lt, "ceil"),
      ];
      return parts.length ? `(${parts.join(" AND ")})` : "TRUE";
    }
    const vals = cl.values.filter((v): v is string | number | boolean => v !== null);
    const parts: string[] = [];
    if (cl.type === "text") {
      const cut = (v: string | number | boolean) => [...String(v)].length === DIM_TEXT_MAX;
      const full = vals.filter((v) => !cut(v));
      const prefix = vals.filter(cut);
      if (full.length) parts.push(`${c} IN (${full.map(bind).join(", ")})`);
      if (prefix.length) {
        parts.push(`left(${c}, ${DIM_TEXT_MAX}) IN (${prefix.map(bind).join(", ")})`);
      }
    } else {
      // Waktu dibandingkan per detik: nilai di hasil query tidak membawa pecahan detik.
      const target = cl.type === "timestamp" ? `date_trunc('second', ${c})` : c;
      const xs = vals.map((v) => value(cl, v, "exact")).filter((x): x is string => x !== null);
      if (xs.length) parts.push(`${target} IN (${xs.join(", ")})`);
    }
    if (vals.length !== cl.values.length) parts.push(`${c} IS NULL`);
    return parts.length ? `(${parts.join(" OR ")})` : "FALSE";
  });
}

/** Semua klausa WHERE rencana: filter spec/klien (T-009/T-011) + filter dashboard (T-012). */
export function whereClauses(plan: Plan, params: BuiltSql["params"]): string[] {
  return [...filterClauses(plan.filters, params), ...dashClauses(plan.dash ?? [], params)];
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
    // Total seperti SUMIF Excel: grup yang semua nilainya kosong = 0 (bukan NULL), sehingga
    // urutan/top-N ("Terkecil") sama dengan yang digambar grafik (verifikasi T-011 putaran 4).
    const e =
      m.agg === "count"
        ? `count(${c})`
        : m.agg === "count_distinct"
          ? `count(DISTINCT ${c})`
          : m.agg === "sum"
            ? `coalesce(sum(${c}), 0)`
            : `${m.agg}(${c})`;
    select.push(`${e} AS ${ident(m.key)}`);
  }

  const where = whereClauses(plan, params);
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
  const where = whereClauses(plan, params);
  const e = dimensionExpr(d);
  const grand =
    m.agg === "sum"
      ? `coalesce(sum(${ident(m.col!)}), 0)`
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

/** Batas daftar nilai slicer (T-012); diambil satu lebih untuk mendeteksi "lebih dari 1000". */
export const FILTER_VALUES_LIMIT = 1_000;
/** Teks lebih panjang dari ini tidak masuk daftar slicer (tidak praktis dipilih dan dikirim balik). */
export const FILTER_TEXT_MAX = 1_000;

/** Wildcard LIKE (% _) dan karakter escape-nya diperlakukan sebagai huruf biasa. */
export const escapeLikePattern = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/**
 * Nilai unik satu kolom untuk slicer (T-012): kosong (NULL) dulu, lalu teks urut seperti Excel
 * (nocase.noaccent, byte-exact sebagai pemecah seri) atau urutan alami untuk tipe lain; LIMIT 1001.
 * Pencarian `q` di server: teks → mengandung, tidak peka huruf besar/kecil dan aksen; tipe lain →
 * mengandung pada teks bakunya (angka dengan titik desimal — koma dari user dianggap titik, tanggal
 * YYYY-MM-DD). Wildcard di `q` di-escape; nilainya lewat parameter.
 */
export function buildFilterValuesSql(
  col: { col: string; type: ColumnType; float?: boolean },
  q: string | null,
  parquetPath: string,
): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const c = ident(col.col);
  const v = ident("v");
  const text = col.type === "text";
  const where: string[] = [];
  if (text) where.push(`(${c} IS NULL OR length(${c}) <= ${FILTER_TEXT_MAX})`);
  if (q) {
    params.q = escapeLikePattern(text ? q : q.replace(/,/g, "."));
    const hay = text
      ? `strip_accents(lower(${c}))`
      : `lower(CAST(${col.type === "decimal" ? `CAST(${c} AS DOUBLE)` : c} AS VARCHAR))`;
    where.push(`${hay} LIKE '%' || strip_accents(lower($q)) || '%' ESCAPE '\\'`);
  }
  // Waktu per detik: sama dengan nilai yang dikirim balik sebagai filter (tanpa pecahan detik).
  const expr = col.type === "timestamp" ? `date_trunc('second', ${c})` : c;
  const order = text ? `${v} ${TEXT_COLLATE} ASC NULLS FIRST, ${v} ASC` : `${v} ASC NULLS FIRST`;
  const sql = [
    `SELECT ${v} FROM (`,
    `  SELECT DISTINCT ${expr} AS ${v} FROM read_parquet($path)`,
    where.length ? `  WHERE ${where.join(" AND ")}` : "",
    `)`,
    `ORDER BY ${order}`,
    `LIMIT ${FILTER_VALUES_LIMIT + 1}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { sql, params };
}
