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
    // Teks dibandingkan tidak peka huruf besar/kecil, seperti filter/SUMIF Excel (T-029).
    const text = f.type === "text";
    const k = text ? `lower(${c})` : c;
    const val = (v: string | number | boolean) =>
      text ? `lower(${bind(v, f.type)})` : bind(v, f.type);
    switch (f.op) {
      case "is_null":
        return `${c} IS NULL`;
      case "not_null":
        return `${c} IS NOT NULL`;
      // "Bukan X" menyertakan sel kosong: eq X + neq X = semua baris (review T-009 F7).
      case "in":
        return `${k} IN (${f.values.map(val).join(", ")})`;
      case "not_in":
        return `(${c} IS NULL OR ${k} NOT IN (${f.values.map(val).join(", ")}))`;
      case "neq":
        return `(${c} IS NULL OR ${k} <> ${val(f.values[0]!)})`;
      case "between":
        return `${c} BETWEEN ${bind(f.values[0]!, f.type)} AND ${bind(f.values[1]!, f.type)}`;
      case "contains":
        return `contains(lower(${c}), lower(${bind(f.values[0]!, f.type)}))`;
      default:
        return `${k} ${OP_SQL[f.op]} ${val(f.values[0]!)}`;
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
 * di-cast tanpa zona; tanggal saja pada kolom TIMESTAMP = sehari penuh (CAST(c AS DATE)), sama dengan
 * kolom DATE. Teks sepanjang DIM_TEXT_MAX dicocokkan dengan awalan (label grafik dipotong sepanjang itu,
 * jadi cross-filter dari batang itu tetap mengenai baris aslinya). null = sel kosong. not_in = kebalikan
 * in: sel kosong ikut kecuali (Kosong) termasuk yang dikecualikan.
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
    const hasNull = vals.length !== cl.values.length;
    // Kecocokan nilai non-kosong (OR); kosong ditangani terpisah agar NOT IN tidak tertukar NULL.
    const parts: string[] = [];
    if (cl.type === "text") {
      const cut = (v: string | number | boolean) => [...String(v)].length === DIM_TEXT_MAX;
      const full = vals.filter((v) => !cut(v));
      const prefix = vals.filter(cut);
      // Tidak peka huruf besar/kecil: label kategori mewakili semua variasinya (T-029).
      const low = (xs: (string | number | boolean)[]) => xs.map((v) => `lower(${bind(v)})`);
      if (full.length) parts.push(`lower(${c}) IN (${low(full).join(", ")})`);
      if (prefix.length) {
        parts.push(`lower(left(${c}, ${DIM_TEXT_MAX})) IN (${low(prefix).join(", ")})`);
      }
    } else if (cl.type === "timestamp") {
      const day = vals.filter((v) => typeof v === "string" && DATE_ONLY.test(v));
      const exact = vals.filter((v) => !day.includes(v));
      if (day.length) {
        parts.push(
          `CAST(${c} AS DATE) IN (${day.map((v) => `CAST(${bind(v)} AS DATE)`).join(", ")})`,
        );
      }
      // Waktu dibandingkan per detik: nilai di hasil query tidak membawa pecahan detik.
      const xs = exact.map((v) => value(cl, v, "exact")).filter((x): x is string => x !== null);
      if (xs.length) parts.push(`date_trunc('second', ${c}) IN (${xs.join(", ")})`);
    } else {
      const xs = vals.map((v) => value(cl, v, "exact")).filter((x): x is string => x !== null);
      if (xs.length) parts.push(`${c} IN (${xs.join(", ")})`);
    }
    const match = parts.length ? parts.join(" OR ") : null;
    if (cl.op === "not_in") {
      if (!match) return hasNull ? `${c} IS NOT NULL` : "TRUE";
      return hasNull ? `(${c} IS NOT NULL AND NOT (${match}))` : `(${c} IS NULL OR NOT (${match}))`;
    }
    if (!match) return hasNull ? `${c} IS NULL` : "FALSE";
    return hasNull ? `(${match} OR ${c} IS NULL)` : `(${match})`;
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

/**
 * Kunci kelompok dimensi: teks tidak peka huruf besar/kecil seperti PivotTable/UNIQUE Excel ("Bandung",
 * "BANDUNG", "bandung" = satu kategori; T-029). Aksen dan spasi tetap membedakan, sama dengan Excel.
 */
const groupKey = (d: Plan["dimensions"][number]) =>
  d.type === "text" ? `lower(${dimensionExpr(d)})` : dimensionExpr(d);

/**
 * Label kategori teks: variasi paling sering; seri → urutan byte terkecil ("BANDUNG" < "Bandung" <
 * "bandung"). Deterministik lintas thread/row group, jadi grafik, ekspor, dan slicer memberi label sama
 * (mode() DuckDB tidak: seri bergantung urutan thread — review T-029 TF3).
 */
const textLabel = (e: string) =>
  `list_sort(list_transform(map_entries(histogram(${e})), lambda x: {'n': -CAST(x.value AS BIGINT), 'k': x.key}))[1].k`;

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
  for (const d of plan.dimensions) {
    const e = dimensionExpr(d);
    select.push(`${d.type === "text" ? textLabel(e) : e} AS ${ident(d.key)}`);
  }
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
  // Dimensi tanpa ukuran = nilai unik; GROUP BY yang sama menggantikan DISTINCT.
  const group = plan.dimensions.length
    ? `GROUP BY ${plan.dimensions.map(groupKey).join(", ")}`
    : "";
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
    `SELECT ${select.join(", ")}`,
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
  const e = groupKey(d);
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

/** Label tampil boolean di slicer (klien: "Ya"/"Tidak") + nama bakunya, untuk pencarian. */
const BOOL_LABELS: [boolean, string[]][] = [
  [true, ["ya", "true"]],
  [false, ["tidak", "false"]],
];

/**
 * Kata cari angka → teks baku (titik desimal, tanpa pemisah ribuan) untuk dicocokkan dengan
 * CAST(c AS VARCHAR): "1.234,5" → "1234.5", "1,5" → "1.5", "1.234" / "12.345.678" (grup ribuan, tidak
 * diawali 0) → tanpa titik; selain itu titik dianggap desimal ("0.5", "12.5").
 */
export function numberNeedle(q: string): string {
  const s = q.replace(/\s/g, "");
  if (s.includes(",")) return s.replace(/\./g, "").replace(/,/g, ".");
  return /^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
}

/** Wildcard LIKE (% _) dan karakter escape-nya diperlakukan sebagai huruf biasa. */
export const escapeLikePattern = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/**
 * Nilai unik satu kolom untuk slicer (T-012): kosong (NULL) dulu, lalu teks urut seperti Excel
 * (nocase.noaccent, byte-exact sebagai pemecah seri) atau urutan alami untuk tipe lain; LIMIT 1001.
 * Pencarian `q` di server: teks → mengandung, tidak peka huruf besar/kecil dan aksen; boolean → label
 * tampil "Ya"/"Tidak" (atau true/false) yang mengandung `q`; tipe lain → mengandung pada teks bakunya
 * (angka dengan titik desimal — format Indonesia diterima, lihat numberNeedle; tanggal YYYY-MM-DD).
 * Wildcard di `q` di-escape; nilainya lewat parameter.
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
  if (q && col.type === "boolean") {
    // Konstanta TRUE/FALSE dari program, bukan nilai user.
    const hit = BOOL_LABELS.filter(([, labels]) => labels.some((l) => l.includes(q.toLowerCase())));
    where.push(
      hit.length ? `${c} IN (${hit.map(([b]) => (b ? "TRUE" : "FALSE")).join(", ")})` : "FALSE",
    );
  } else if (q) {
    const numeric = col.type === "integer" || col.type === "decimal" || col.type === "duration";
    params.q = escapeLikePattern(text ? q : numeric ? numberNeedle(q) : q.replace(/,/g, "."));
    const hay = text
      ? `strip_accents(lower(${c}))`
      : `lower(CAST(${col.type === "decimal" ? `CAST(${c} AS DOUBLE)` : c} AS VARCHAR))`;
    where.push(`${hay} LIKE '%' || strip_accents(lower($q)) || '%' ESCAPE '\\'`);
  }
  // Waktu per detik: sama dengan nilai yang dikirim balik sebagai filter (tanpa pecahan detik).
  const expr = col.type === "timestamp" ? `date_trunc('second', ${c})` : c;
  const order = text ? `${v} ${TEXT_COLLATE} ASC NULLS FIRST, ${v} ASC` : `${v} ASC NULLS FIRST`;
  // Teks: satu opsi per kategori tidak peka huruf besar/kecil (label = variasi paling sering, T-029).
  const pick = text ? textLabel(c) : `DISTINCT ${expr}`;
  const sql = [
    `SELECT ${v} FROM (`,
    `  SELECT ${pick} AS ${v} FROM read_parquet($path)`,
    where.length ? `  WHERE ${where.join(" AND ")}` : "",
    text ? `  GROUP BY lower(${c})` : "",
    `)`,
    `ORDER BY ${order}`,
    `LIMIT ${FILTER_VALUES_LIMIT + 1}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { sql, params };
}
