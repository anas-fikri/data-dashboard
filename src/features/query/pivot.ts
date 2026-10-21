/*
 * Widget pivot (T-686n), seperti PivotTable Excel: baris 1–2 kolom, kolom pemisah opsional (mis. periode
 * per bulan), nilai 1–3. Satu query DuckDB (UNION ALL, dibedakan kolom `kind`) mengembalikan baris dan
 * kolom yang tampil (dibatasi), sel, subtotal kelompok pertama, total baris/kolom, dan total keseluruhan;
 * shapePivot menyusunnya jadi tabel. Total dan subtotal dihitung dari SELURUH data yang lolos filter,
 * termasuk baris/kolom di luar batas tampilan. Aturan kunci (teks tidak peka huruf besar/kecil, label =
 * variasi paling sering), agregasi, dan filter sama persis dengan grafik (sql.ts). Murni (tanpa I/O).
 */
import {
  PIVOT_CELLS_MAX,
  PIVOT_COLUMNS_SHOWN,
  PIVOT_ROWS_SHOWN,
  type NumberFormat,
  type ShowAs,
} from "@/features/widgets/spec";
import { isAxisShowAs, shown } from "@/features/widgets/show-as";
import { ident } from "@/lib/duckdb";
import {
  TEXT_COLLATE,
  bindCalc,
  dimensionExpr,
  groupKey,
  measureCols,
  measureExpr,
  paramValue,
  textLabel,
  whereClauses,
  type BuiltSql,
} from "./sql";
import type { Grain, OutColumn, Plan } from "./spec";
import type { PivotLocal, PivotNote, PivotShape } from "./widget";

type Dim = Plan["dimensions"][number];

/** Kolom keluaran query pivot, urut posisi (kind lalu indeks, label, jumlah, lalu ukuran m0..). */
const META = ["kind", "ri", "gi", "ci", "d0", "d1", "dc", "n"] as const;
/**
 * Baris 3–4 kolom (T-070): META + level baris subtotal (`lv`, indeks kelompoknya di `gi`), indeks
 * kelompok level 2–3 per baris tampil, dan label baris 3–4. Baris ≤ 2 kolom tetap META (SQL 1.0.0).
 */
const META_NESTED = [...META, "lv", "g2", "g3", "d2", "d3"] as const;
/**
 * Top N (T-071): META_NESTED + `ox` = bit level baris (bit 0 = baris pertama) yang berisi kelompok
 * "(Lainnya)" pada baris tampil itu. Hanya untuk spec ber-Top N (bentuk lain tidak berubah).
 */
const META_TOP = [...META_NESTED, "ox"] as const;
type Meta = (typeof META_TOP)[number];
const hasTop = (shape: PivotShape) => !!shape.top?.length;
const metaOf = (shape: PivotShape): readonly Meta[] =>
  hasTop(shape) ? META_TOP : shape.rowFields > 2 ? META_NESTED : META;
/** Level baris (0-based, naik) ber-Top N: kuncinya ditambah penanda x<level> ("(Lainnya)"). */
const topLevels = (shape: PivotShape) =>
  (shape.top ?? []).map((t) => t.level).sort((a, b) => a - b);
/** Kolom indeks kelompok level induk L (1 = kelompok baris pertama). */
const groupCol = (level: number): Meta => (level === 1 ? "gi" : (`g${level}` as Meta));
/** Level induk ber-subtotal (1-based, naik); baris 2 kolom: kelompok pertama bila subtotal. */
export const subtotalLevelsOf = (shape: PivotShape): number[] =>
  shape.rowFields > 2 ? (shape.levels ?? []) : shape.subtotals && shape.rowFields === 2 ? [1] : [];
/**
 * Kunci baris k0..k<m-1>, lalu penanda "(Lainnya)" x<i> level ber-Top N di bawah m (T-071): kelompok
 * sisa berkunci NULL + x<i> = true, jadi tidak tertukar dengan kelompok (kosong) sungguhan.
 */
const keysOf = (m: number, x: readonly number[] = []) => [
  ...Array.from({ length: m }, (_, i) => `k${i}`),
  ...x.filter((i) => i < m).map((i) => `x${i}`),
];
/** Kesetaraan kunci k0..k<m-1> antara dua alias (NULL = NULL, seperti GROUP BY). */
const keysOn = (a: string, b: string, m: number, x: readonly number[] = []) =>
  keysOf(m, x)
    .map((c) => `${a}.${c} IS NOT DISTINCT FROM ${b}.${c}`)
    .join(" AND ");
/** Kelompok level L yang tampil (indeks di kolom gi) digabung ke data mentah `s`. */
const groupJoinOf = (level: number, alias = "g", x: readonly number[] = []) =>
  `JOIN (SELECT DISTINCT ${keysOf(level, x).join(", ")}, ${groupCol(level)}${level > 1 ? " AS gi" : ""} FROM rws) ${alias} ON ${keysOn(alias, "s", level, x)}`;
/**
 * Pasangan (baris tampil, kolom tampil) paling banyak bila hanya satu nilai: anggaran sel saja (24.000
 * pasangan) bisa melewati batas hasil 5 MB; 16.000 = batas 1.0.0 (200 baris + 200 subtotal × 40).
 */
const PIVOT_PAIRS_MAX = 16_000;

const keyOrder = (k: string, d: Dim, dir: "ASC" | "DESC") =>
  d.type === "text"
    ? `${k} ${TEXT_COLLATE} ${dir} NULLS LAST, ${k} ${dir}`
    : `${k} ${dir} NULLS LAST`;

/** Urutan kelompok baris: nilai pertama (value_*) atau label (label_*), kunci sebagai pemecah seri. */
function rowOrder(sort: PivotShape["sort"], v: string, k: string, d: Dim): string {
  switch (sort) {
    case "value_desc":
      return `${v} DESC NULLS LAST, ${keyOrder(k, d, "ASC")}`;
    case "value_asc":
      return `${v} ASC NULLS LAST, ${keyOrder(k, d, "ASC")}`;
    case "label_desc":
      return keyOrder(k, d, "DESC");
    default:
      return keyOrder(k, d, "ASC");
  }
}

/**
 * Saringan pembaca (T-f4a7) pada kunci kelompok dimensi; nilai = label mentah hasil pivot ini (teks
 * dicocokkan tanpa peka huruf besar/kecil seperti kuncinya, tanggal/waktu per detik seperti toJson,
 * angka lewat DOUBLE seperti nilai yang dikirim ke klien). null = (kosong); aturan sel kosong pada
 * not_in sama dengan filter dashboard.
 */
function localClauses(plan: Plan, local: PivotLocal[], params: BuiltSql["params"]): string[] {
  let n = 0;
  const bind = (v: string | number | boolean) => {
    const name = `l${++n}`;
    params[name] = paramValue(v);
    return `$${name}`;
  };
  return local.flatMap((f) => {
    const d = plan.dimensions[f.dim];
    if (!d) return [];
    const key = groupKey(d);
    const vals = f.values.filter((v): v is string | number | boolean => v !== null);
    const hasNull = vals.length !== f.values.length;
    let k = key;
    let val = bind;
    if (d.type === "text") val = (v) => `lower(${bind(v)})`;
    else if (d.type === "date" || d.type === "timestamp") {
      k = `date_trunc('second', CAST(${key} AS TIMESTAMP))`;
      val = (v) => `CAST(${bind(v)} AS TIMESTAMP)`;
    } else if (d.type !== "boolean") {
      k = `CAST(${key} AS DOUBLE)`;
      val = (v) => `CAST(${bind(v)} AS DOUBLE)`;
    }
    const match = vals.length ? `${k} IN (${vals.map(val).join(", ")})` : null;
    if (f.op === "not_in") {
      if (!match) return [`${key} IS NOT NULL`];
      return [
        hasNull ? `(${key} IS NOT NULL AND NOT (${match}))` : `(${key} IS NULL OR NOT (${match}))`,
      ];
    }
    if (!match) return [`${key} IS NULL`];
    return [hasNull ? `(${match} OR ${key} IS NULL)` : `(${match})`];
  });
}

/** WHERE pivot: filter rencana + dashboard, Saring tersimpan (satu deret $f), lalu saringan pembaca. */
function pivotWhere(plan: Plan, shape: PivotShape, params: BuiltSql["params"]): string {
  const where = [
    ...whereClauses({ ...plan, dash: [...(shape.saved ?? []), ...(plan.dash ?? [])] }, params),
    ...localClauses(plan, shape.local ?? [], params),
  ];
  return where.length ? ` WHERE ${where.join(" AND ")}` : "";
}

/**
 * Daftar nilai satu field pivot untuk menu saring (T-f4a7): label tampil per kunci kelompok (aturan
 * sama dengan tabel pivot), urut naik, maks. `limit` + 1 baris (baris lebih = terpotong).
 */
export function buildPivotValuesSql(
  plan: Plan,
  shape: PivotShape,
  dim: number,
  limit: number,
  parquetPath: string,
): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const where = pivotWhere(plan, shape, params);
  const d = plan.dimensions[dim]!;
  const key = groupKey(d);
  const label = d.type === "text" ? textLabel(dimensionExpr(d)) : key;
  return {
    sql: `SELECT ${label} AS v FROM read_parquet($path)${where} GROUP BY ${key} ORDER BY ${keyOrder(key, d, "ASC")} LIMIT ${limit + 1}`,
    params,
  };
}

/**
 * Top N per kelompok induk (T-071): rantai CTE dari data mentah tersaring (`base`) sampai `src`. Per
 * level ber-Top N (naik): `top<j>` = N kunci teratas di dalam kunci induknya (termasuk penanda level
 * di atasnya) menurut agregat nilai ke-`by` (nilai dasar, bukan cara tampil), seri dipecah label naik;
 * baris mentah di luar itu diberi kunci (dan label teks) NULL + penanda `x<level>` = true. Semua
 * agregat sesudahnya (sel, subtotal, total, Tampilkan nilai sebagai) dihitung ulang dari baris mentah
 * kelompok "(Lainnya)" — rata-rata/jumlah unik/min/maks/field terhitung tetap benar; kunci induk tidak
 * berubah sehingga subtotal dan total sama dengan tanpa Top N. N = bilangan bulat tervalidasi zod.
 */
function topCtes(plan: Plan, shape: PivotShape, rows: Dim[], base: string): string[] {
  const top = [...(shape.top ?? [])].sort((a, b) => a.level - b.level);
  const ctes = [`s0 AS NOT MATERIALIZED (${base})`];
  top.forEach((t, j) => {
    const i = t.level;
    const d = rows[i]!;
    const prev = `s${j}`;
    const next = j === top.length - 1 ? "src" : `s${j + 1}`;
    const parent = keysOf(
      i,
      top.slice(0, j).map((u) => u.level),
    );
    const keys = [...parent, `k${i}`];
    const m = plan.measures[t.by] ?? plan.measures[0]!;
    const part = parent.length ? `PARTITION BY ${parent.join(", ")} ` : "";
    ctes.push(
      `top${j} AS MATERIALIZED (SELECT ${keys.join(", ")}, true AS hit FROM ` +
        `(SELECT ${keys.join(", ")}, ${measureExpr(m)} AS v FROM ${prev} GROUP BY ${keys.join(", ")}) ` +
        `QUALIFY row_number() OVER (${part}ORDER BY v DESC NULLS LAST, ${keyOrder(`k${i}`, d, "ASC")}) <= ${Math.trunc(t.n)})`,
    );
    const keep = [
      `CASE WHEN t.hit THEN s.k${i} END AS k${i}`,
      ...(d.type === "text" ? [`CASE WHEN t.hit THEN s.t${i} END AS t${i}`] : []),
    ];
    ctes.push(
      `${next} AS NOT MATERIALIZED (SELECT s.* REPLACE (${keep.join(", ")}), t.hit IS NULL AS x${i} ` +
        `FROM ${prev} s LEFT JOIN top${j} t ON ${keys.map((c) => `t.${c} IS NOT DISTINCT FROM s.${c}`).join(" AND ")})`,
    );
  });
  return ctes;
}

export function buildPivotSql(plan: Plan, shape: PivotShape, parquetPath: string): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const where = pivotWhere(plan, shape, params);
  const n = shape.rowFields;
  const rows = plan.dimensions.slice(0, n);
  const col = shape.column ? plan.dimensions[n] : undefined;
  const nested = n > 2;
  const levels = subtotalLevelsOf(shape);
  const meta = metaOf(shape);
  const nv = plan.measures.length;
  // Top N (T-071): penanda "(Lainnya)" per level ber-Top N ikut di setiap kunci kelompok.
  const tops = topLevels(shape);
  const K = (m: number) => keysOf(m, tops);
  const on = (a: string, b: string, m: number) => keysOn(a, b, m, tops);
  const gj = (level: number, alias?: string) => groupJoinOf(level, alias, tops);
  // Bentuk baru T-070 (> 2 baris atau > 3 nilai) dan Top N: anggaran sel + satu pindaian agregat. Spec
  // 1.0.0 tidak pernah masuk sini, jadi SQL dan kunci cache-nya tidak berubah.
  const fresh = nested || nv > 3 || tops.length > 0;
  // Kolom `lv` (level subtotal) ada di META_NESTED/META_TOP.
  const wide = meta.includes("lv");
  /** "(Lainnya)" di urutan level i: selalu terakhir di dalam induknya (false < true). */
  const otherLast = (alias: string, i: number) => (tops.includes(i) ? `${alias}x${i}, ` : "");
  const k = (name: string) => ident(name);
  // Label tampil dalam kueri yang dikelompokkan per kunci: teks = variasi paling sering, lainnya kunci.
  const display = (d: Dim, key: string, text: string) =>
    d.type === "text" ? textLabel(k(text)) : k(key);

  const src: string[] = [];
  rows.forEach((d, i) => {
    src.push(`${groupKey(d)} AS ${k(`k${i}`)}`);
    if (d.type === "text") src.push(`${dimensionExpr(d)} AS ${k(`t${i}`)}`);
  });
  if (col) {
    src.push(`${groupKey(col)} AS ${k("kc")}`);
    if (col.type === "text") src.push(`${dimensionExpr(col)} AS ${k("tc")}`);
  }
  for (const c of new Set(plan.measures.flatMap(measureCols))) src.push(ident(c));

  const m0 = measureExpr(plan.measures[0]!);
  const base = `SELECT ${src.join(", ")} FROM read_parquet($path)${where}`;
  // Inline (bukan materialized): data mentah tidak ditahan di memori; parquet dibaca per cabang.
  const ctes = tops.length
    ? topCtes(plan, shape, rows, base)
    : [`${k("src")} AS NOT MATERIALIZED (${base})`];
  if (n > 1) {
    // Kelompok per level induk (g1 = baris pertama, g2 = dua baris pertama, …) lalu baris terdalam;
    // urutan tampil: urutan kelompok level demi level, lalu baris terdalam di dalam kelompoknya.
    const orders: string[] = [];
    const ranks: string[] = [];
    const joins: string[] = [];
    if (fresh) {
      // T-070: urutan tiap level dihitung di kelompoknya sendiri (kecil) sebagai `r` = urutan global
      // level itu (induk lalu nilai/label) — rws cukup mengurutkan baris terdalam per `r` induk, tanpa
      // jendela dense_rank per level atas semua baris terdalam (mahal pada 4 tingkat × ribuan baris).
      for (let l = 1; l < n; l++) {
        const keys = K(l).join(", ");
        const d = rows[l - 1]!;
        const inner = `SELECT ${keys}, ${display(d, `k${l - 1}`, `t${l - 1}`)} AS d${l - 1}, ${m0} AS v FROM src GROUP BY ${keys}`;
        const own = otherLast("g.", l - 1) + rowOrder(shape.sort, "g.v", `g.k${l - 1}`, d);
        ctes.push(
          l === 1
            ? `g1 AS MATERIALIZED (SELECT g.*, row_number() OVER (ORDER BY ${own}) AS r FROM (${inner}) g)`
            : `g${l} AS MATERIALIZED (SELECT g.*, row_number() OVER (ORDER BY p.r, ${own}) AS r ` +
                `FROM (${inner}) g JOIN g${l - 1} p ON ${on("p", "g", l - 1)})`,
        );
        ranks.push(`g${l}.r AS ${groupCol(l)}`);
        joins.push(`JOIN g${l} ON ${on(`g${l}`, "lf", l)}`);
      }
      orders.push(`g${n - 1}.r`);
    } else {
      for (let l = 1; l < n; l++) {
        const keys = keysOf(l).join(", ");
        const d = rows[l - 1]!;
        ctes.push(
          `g${l} AS MATERIALIZED (SELECT ${keys}, ${display(d, `k${l - 1}`, `t${l - 1}`)} AS d${l - 1}, ${m0} AS v FROM src GROUP BY ${keys})`,
        );
        orders.push(rowOrder(shape.sort, `g${l}.v`, `g${l}.k${l - 1}`, d));
        ranks.push(`dense_rank() OVER (ORDER BY ${orders.join(", ")}) AS ${groupCol(l)}`);
        joins.push(`JOIN g${l} ON ${keysOn(`g${l}`, "lf", l)}`);
      }
    }
    const leaf = rows[n - 1]!;
    const keys = K(n).join(", ");
    // T-070: label teks baris terdalam (histogram) hanya untuk ≤ 200 baris yang tampil, bukan semua
    // baris terdalam (4 tingkat bisa puluhan ribu) — satu pindaian kunci tambahan yang tersaring.
    const lateLabel = fresh && leaf.type === "text";
    const leafLabel = `${display(leaf, `k${n - 1}`, `t${n - 1}`)} AS d${n - 1}`;
    ctes.push(
      `lf AS MATERIALIZED (SELECT ${keys}, ${lateLabel ? "" : `${leafLabel}, `}${m0} AS v FROM src GROUP BY ${keys})`,
    );
    const cols = rows.flatMap((_, i) =>
      i < n - 1
        ? [`lf.k${i}`, `g${i + 1}.d${i}`]
        : [`lf.k${i}`, ...(lateLabel ? [] : [`lf.d${i}`])],
    );
    cols.push(...tops.map((i) => `lf.x${i}`));
    const body =
      `SELECT ${cols.join(", ")}, ` +
      `row_number() OVER (ORDER BY ${[...orders, otherLast("lf.", n - 1) + rowOrder(shape.sort, "lf.v", `lf.k${n - 1}`, leaf)].join(", ")}) AS ri, ` +
      `${ranks.join(", ")}, count(*) OVER () AS n ` +
      `FROM lf ${joins.join(" ")} QUALIFY ri <= ${PIVOT_ROWS_SHOWN}`;
    if (lateLabel) {
      ctes.push(
        `rw0 AS MATERIALIZED (${body})`,
        `rws AS MATERIALIZED (SELECT rw0.*, l.d${n - 1} FROM rw0 JOIN (SELECT ${K(n)
          .map((c) => `s.${c}`)
          .join(", ")}, ` +
          `${textLabel(`s.${k(`t${n - 1}`)}`)} AS d${n - 1} FROM src s JOIN rw0 w ON ${on("w", "s", n)} ` +
          `GROUP BY ${K(n)
            .map((c) => `s.${c}`)
            .join(", ")}) l ON ${on("l", "rw0", n)})`,
      );
    } else {
      ctes.push(`rws AS MATERIALIZED (${body})`);
    }
  } else {
    const r0 = rows[0]!;
    const keys = K(1).join(", ");
    ctes.push(
      `lf AS MATERIALIZED (SELECT ${keys}, ${display(r0, "k0", "t0")} AS d0, ${m0} AS v FROM src GROUP BY ${keys})`,
      `rws AS MATERIALIZED (SELECT ${keys}, d0, row_number() OVER (ORDER BY ${otherLast("", 0)}${rowOrder(shape.sort, "v", "k0", r0)}) AS ri, ` +
        `count(*) OVER () AS n FROM lf QUALIFY ri <= ${PIVOT_ROWS_SHOWN})`,
    );
  }
  if (col) {
    // Anggaran sel (T-070): baris tampil (terdalam + subtotal) × kolom tampil × nilai ≤ PIVOT_CELLS_MAX,
    // kolom tampil dipangkas (min. 1). Spec 1.0.0 (≤ 2 baris, ≤ 3 nilai) tidak pernah melewatinya
    // dihitung per baris terdalam (200 × 40 × 3) → batasnya tetap 40 dan SQL-nya tidak berubah.
    let limit = String(PIVOT_COLUMNS_SHOWN);
    if (fresh) {
      const body = ["count(*)", ...levels.map((l) => `count(DISTINCT ${groupCol(l)})`)].join(" + ");
      ctes.push(`bud AS MATERIALIZED (SELECT greatest(1, ${body}) AS b FROM rws)`);
      limit =
        `(SELECT greatest(1, least(${PIVOT_COLUMNS_SHOWN}, ${PIVOT_CELLS_MAX} // (b * ${nv}), ` +
        `${PIVOT_PAIRS_MAX} // b)) FROM bud)`;
    }
    ctes.push(
      `cols AS MATERIALIZED (SELECT kc, ${display(col, "kc", "tc")} AS dc, ` +
        `row_number() OVER (ORDER BY ${keyOrder("kc", col, "ASC")}) AS ci, count(*) OVER () AS n ` +
        `FROM src GROUP BY kc QUALIFY ci <= ${limit})`,
    );
  }

  const M = plan.measures.map((m) => `${measureExpr(m)} AS ${ident(m.key)}`);
  const noM = plan.measures.map((m) => `NULL AS ${ident(m.key)}`);
  const select = (o: Partial<Record<Meta, string>>, measures: string[]) =>
    `SELECT ${meta.map((c) => `${o[c] ?? "NULL"} AS ${ident(c)}`).join(", ")}, ${measures.join(", ")}`;
  const rowJoin = `JOIN rws r ON ${on("r", "s", n)}`;
  const colJoin = "JOIN cols x ON x.kc IS NOT DISTINCT FROM s.kc";

  const rowMeta: Partial<Record<Meta, string>> = { kind: "'row'", ri: "ri", n: "n" };
  rows.forEach((_, i) => {
    rowMeta[`d${i}` as Meta] = `d${i}`;
    if (i) rowMeta[groupCol(i)] = groupCol(i);
  });
  // Bit level yang berisi "(Lainnya)" (T-071).
  if (tops.length)
    rowMeta.ox = tops.map((i) => `CASE WHEN x${i} THEN ${2 ** i} ELSE 0 END`).join(" + ");
  const parts = [`${select(rowMeta, noM)} FROM rws`];
  if (col) parts.push(`${select({ kind: "'col'", ci: "ci", dc: "dc", n: "n" }, noM)} FROM cols`);

  // Satu kelompok agregat per jenis baris hasil: sel, subtotal tiap level (+ kolom Total-nya), total
  // baris/kolom, total keseluruhan. `by` = kolom pengelompokan (ri, ci, s<level>), `from` = cabang
  // 1.0.0 (satu pindaian per jenis).
  type AggSet = { meta: Partial<Record<Meta, string>>; by: string[]; from: string };
  const sets: AggSet[] = [
    col
      ? {
          meta: { kind: "'cell'", ri: "r.ri", ci: "x.ci" },
          by: ["ri", "ci"],
          from: `FROM src s ${rowJoin} ${colJoin} GROUP BY r.ri, x.ci`,
        }
      : {
          meta: { kind: "'cell'", ri: "r.ri" },
          by: ["ri"],
          from: `FROM src s ${rowJoin} GROUP BY r.ri`,
        },
  ];
  for (const l of levels) {
    // Subtotal kelompok level l (indeks kelompoknya di gi; baris ≥ 3 kolom: level di lv).
    const lv = wide ? { lv: String(l) } : {};
    const groupJoin = gj(l);
    sets.push(
      col
        ? {
            meta: { kind: "'sub'", gi: "g.gi", ci: "x.ci", ...lv },
            by: [`s${l}`, "ci"],
            from: `FROM src s ${groupJoin} ${colJoin} GROUP BY g.gi, x.ci`,
          }
        : {
            meta: { kind: "'sub'", gi: "g.gi", ...lv },
            by: [`s${l}`],
            from: `FROM src s ${groupJoin} GROUP BY g.gi`,
          },
    );
    if (col && shape.totals) {
      sets.push({
        meta: { kind: "'subtot'", gi: "g.gi", ...lv },
        by: [`s${l}`],
        from: `FROM src s ${groupJoin} GROUP BY g.gi`,
      });
    }
  }
  if (col && shape.totals) {
    sets.push(
      {
        meta: { kind: "'rowtot'", ri: "r.ri" },
        by: ["ri"],
        from: `FROM src s ${rowJoin} GROUP BY r.ri`,
      },
      {
        meta: { kind: "'coltot'", ci: "x.ci" },
        by: ["ci"],
        from: `FROM src s ${colJoin} GROUP BY x.ci`,
      },
    );
  }
  if (shape.totals) sets.push({ meta: { kind: "'grand'" }, by: [], from: "FROM src s" });

  if (!fresh) {
    // Spec 1.0.0 (≤ 2 baris, ≤ 3 nilai): satu cabang per jenis, SQL persis seperti sebelum T-070.
    for (const x of sets) parts.push(`${select(x.meta, M)} ${x.from}`);
  } else {
    // T-070: satu pindaian data untuk semua jenis (GROUPING SETS) — tiap cabang lama membaca ulang
    // semua kolom nilai dari parquet; dengan 4 tingkat × 8 nilai itu yang paling mahal. Baris/kolom/
    // kelompok yang tidak tampil bergabung NULL dan disaring per kelompok (total tetap seluruh data).
    const expr: Record<string, string> = { ri: "r.ri", ci: "x.ci" };
    const joins = [`LEFT JOIN rws r ON ${on("r", "s", n)}`];
    if (col) joins.push("LEFT JOIN cols x ON x.kc IS NOT DISTINCT FROM s.kc");
    for (const l of levels) {
      expr[`s${l}`] = `g${l}x.gi`;
      joins.push(gj(l, `g${l}x`).replace(/^JOIN/, "LEFT JOIN"));
    }
    const by = Object.keys(expr).filter((c) => sets.some((x) => x.by.includes(c)));
    // GROUPING(a, b, …): bit 1 = kolom itu tidak dikelompokkan; kolom pertama = bit tertinggi.
    const mask = (x: AggSet) =>
      by.reduce((acc, c, i) => acc + (x.by.includes(c) ? 0 : 2 ** (by.length - 1 - i)), 0);
    ctes.push(
      `agg AS MATERIALIZED (SELECT ${by.map((c) => `${expr[c]} AS ${c}`).join(", ")}, ` +
        `GROUPING(${by.map((c) => expr[c]).join(", ")}) AS gid, ${M.join(", ")} ` +
        `FROM src s ${joins.join(" ")} ` +
        `GROUP BY GROUPING SETS (${sets.map((x) => `(${x.by.map((c) => expr[c]).join(", ")})`).join(", ")}))`,
    );
    const ref = plan.measures.map((m) => ident(m.key));
    for (const x of sets) {
      const meta = Object.fromEntries(
        Object.entries(x.meta).map(([k, v]) => [
          k,
          v === "r.ri" ? "ri" : v === "x.ci" ? "ci" : v === "g.gi" ? x.by[0]! : v,
        ]),
      );
      const where = [`gid = ${mask(x)}`, ...x.by.map((c) => `${c} IS NOT NULL`)].join(" AND ");
      parts.push(`${select(meta, ref)} FROM agg WHERE ${where}`);
    }
  }

  const union = parts.join("\nUNION ALL\n");
  if (!plan.measures.some((m) => shown(m.showAs))) {
    // Tanpa "Tampilkan nilai sebagai": SQL lama persis (spec 1.0.0 identik).
    return bindCalc({ sql: `WITH ${ctes.join(",\n")}\n${union}`, params }, plan.measures);
  }
  const shownSql = showAsSql(plan, shape, { rows, col, rowJoin, colJoin, M, tops });
  return bindCalc(
    {
      sql: `WITH ${[...ctes, ...shownSql.ctes, `u AS (${union})`].join(",\n")}\n${shownSql.select}`,
      params,
    },
    plan.measures,
  );
}

/** Pembagian aman: penyebut 0/NULL → NULL ("–"), bukan galat/Infinity; hasil DOUBLE. */
const ratio = (a: string, b: string) =>
  `CASE WHEN ${b} IS NULL OR ${b} = 0 THEN NULL ELSE CAST(${a} AS DOUBLE) / CAST(${b} AS DOUBLE) END`;

/**
 * "Tampilkan nilai sebagai" (T-067) di atas hasil pivot biasa (`u`, kolom META + m0..): setiap ukuran
 * diganti menurut cara tampilnya, dengan pembanding yang dihitung dari SELURUH data yang lolos filter
 * (bukan hanya baris/kolom yang tampil), walau sakelar Total mati:
 *  - `gt` total keseluruhan; `rt` total per baris tampil dan `st` per kelompok (lintas semua kolom);
 *    `ct` total per kolom tampil (lintas semua baris);
 *  - `ax` total berjalan + nilai sebelumnya (window function) sepanjang kolom pemisah, selain itu
 *    sepanjang baris terdalam di dalam kelompok induknya, urut label naik — termasuk item yang tidak
 *    tampil (urut nilai/potongan 200 baris tidak mengubah item "sebelumnya").
 * Sel total/subtotal: persen dihitung; total berjalan/selisih NULL. Hanya identifier program.
 */
function showAsSql(
  plan: Plan,
  shape: PivotShape,
  q: {
    rows: Dim[];
    col: Dim | undefined;
    rowJoin: string;
    colJoin: string;
    M: string[];
    /** Level baris ber-Top N (penanda "(Lainnya)" di kunci), T-071. */
    tops: readonly number[];
  },
): { ctes: string[]; select: string } {
  const shows = plan.measures.map((m) => m.showAs ?? "none");
  const has = (...s: ShowAs[]) => shows.some((x) => s.includes(x));
  const m = (i: number) => ident(plan.measures[i]!.key);
  const n = shape.rowFields;
  const levels = subtotalLevelsOf(shape);
  const sub = levels.length > 0;
  const ctes: string[] = [];
  const joins: string[] = [];

  if (has("pct_grand", "pct_row", "pct_col")) {
    ctes.push(`gt AS MATERIALIZED (SELECT ${q.M.join(", ")} FROM src s)`);
    joins.push("CROSS JOIN gt");
  }
  if (q.col && has("pct_row")) {
    ctes.push(
      `rt AS MATERIALIZED (SELECT r.ri, ${q.M.join(", ")} FROM src s ${q.rowJoin} GROUP BY r.ri)`,
    );
    joins.push("LEFT JOIN rt ON u.kind = 'cell' AND rt.ri = u.ri");
    if (sub && n <= 2) {
      ctes.push(
        `st AS MATERIALIZED (SELECT g.gi, ${q.M.join(", ")} FROM src s ${groupJoinOf(1, "g", q.tops)} GROUP BY g.gi)`,
      );
      joins.push("LEFT JOIN st ON u.kind = 'sub' AND st.gi = u.gi");
    } else if (sub) {
      // Baris ≥ 3 kolom (T-070): penyebut subtotal = total baris kelompok itu di levelnya sendiri.
      const per = levels.map(
        (l) =>
          `SELECT ${l} AS lv, g.gi, ${q.M.join(", ")} FROM src s ${groupJoinOf(l, "g", q.tops)} GROUP BY g.gi`,
      );
      ctes.push(`st AS MATERIALIZED (${per.join(" UNION ALL ")})`);
      joins.push("LEFT JOIN st ON u.kind = 'sub' AND st.lv = u.lv AND st.gi = u.gi");
    }
  }
  if (q.col && has("pct_col")) {
    ctes.push(
      `ct AS MATERIALIZED (SELECT x.ci, ${q.M.join(", ")} FROM src s ${q.colJoin} GROUP BY x.ci)`,
    );
    joins.push("LEFT JOIN ct ON u.kind IN ('cell', 'sub') AND ct.ci = u.ci");
  }
  const axis = shows.flatMap((s, i) => (isAxisShowAs(s) ? [i] : []));
  if (axis.length) {
    const a = (p: string, i: number) => ident(`${p}${i}`);
    const wins = axis.flatMap((i) => [
      `${m(i)} AS ${a("a", i)}`,
      `sum(${m(i)}) OVER w AS ${a("r", i)}`,
      `lag(${m(i)}) OVER w AS ${a("p", i)}`,
    ]);
    const keep = axis.flatMap((i) => ["a", "r", "p"].map((p) => `w.${a(p, i)}`));
    const raw = axis.map((i) => q.M[i]!);
    let body: string;
    if (q.col) {
      // Sepanjang kolom pemisah, per baris tampil; kolom di luar 40 tampil tetap dihitung.
      body =
        `SELECT w.ri, x.ci, ${keep.join(", ")} FROM (SELECT ri, kc, ${wins.join(", ")} ` +
        `FROM (SELECT r.ri, s.kc, ${raw.join(", ")} FROM src s ${q.rowJoin} GROUP BY r.ri, s.kc) ` +
        `WINDOW w AS (PARTITION BY ri ORDER BY ${keyOrder("kc", q.col, "ASC")} ` +
        `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) w ` +
        `JOIN cols x ON x.kc IS NOT DISTINCT FROM w.kc`;
    } else {
      // Sepanjang baris terdalam di dalam kelompok induknya (semua level induk), termasuk baris di
      // luar 200 tampil.
      const keys = keysOf(n, q.tops).join(", ");
      const leaf = q.rows[n - 1]!;
      body =
        `SELECT r.ri, NULL AS ci, ${keep.join(", ")} FROM (SELECT ${keys}, ${wins.join(", ")} ` +
        `FROM (SELECT ${keys}, ${raw.join(", ")} FROM src s GROUP BY ${keys}) ` +
        `WINDOW w AS (${n > 1 ? `PARTITION BY ${keysOf(n - 1, q.tops).join(", ")} ` : ""}ORDER BY ${keyOrder(`k${n - 1}`, leaf, "ASC")} ` +
        `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) w ` +
        `JOIN rws r ON ${keysOn("r", "w", n, q.tops)}`;
    }
    ctes.push(`ax AS MATERIALIZED (${body})`);
    joins.push(
      "LEFT JOIN ax ON u.kind = 'cell' AND ax.ri = u.ri AND ax.ci IS NOT DISTINCT FROM u.ci",
    );
  }

  const value = (s: ShowAs, i: number): string => {
    const v = `u.${m(i)}`;
    const g = `gt.${m(i)}`;
    const a = (p: string) => `ax.${ident(`${p}${i}`)}`;
    switch (s) {
      case "pct_grand":
        return ratio(v, g);
      case "pct_row":
        // Baris "Total" (coltot/grand) dibagi total keseluruhan; total baris = 100%.
        return q.col
          ? ratio(
              v,
              `CASE u.kind WHEN 'cell' THEN rt.${m(i)} WHEN 'sub' THEN ${sub ? `st.${m(i)}` : "NULL"} ` +
                `WHEN 'coltot' THEN ${g} WHEN 'grand' THEN ${g} ELSE ${v} END`,
            )
          : ratio(v, `CASE WHEN u.kind = 'grand' THEN ${g} ELSE ${v} END`);
      case "pct_col":
        return q.col
          ? ratio(
              v,
              `CASE u.kind WHEN 'cell' THEN ct.${m(i)} WHEN 'sub' THEN ct.${m(i)} ` +
                `WHEN 'coltot' THEN ${v} ELSE ${g} END`,
            )
          : ratio(v, g);
      case "running":
        return a("r");
      case "diff_prev":
        return `${a("a")} - ${a("p")}`;
      case "pct_diff_prev":
        return ratio(`${a("a")} - ${a("p")}`, a("p"));
      default:
        return v;
    }
  };
  const meta = metaOf(shape).map((c) => `u.${ident(c)}`);
  const vals = shows.map((s, i) => `${value(s, i)} AS ${m(i)}`);
  return { ctes, select: `SELECT ${[...meta, ...vals].join(", ")} FROM u ${joins.join(" ")}` };
}

/** Tipe setiap kolom keluaran buildPivotSql (untuk toJson): indeks/jumlah = count, label sesuai dimensi. */
export function pivotOutTypes(plan: Plan, shape: PivotShape): OutColumn["type"][] {
  const dimType = (d: Dim | undefined): OutColumn["type"] =>
    !d || d.type === "text" ? "text" : d.type;
  const rows = plan.dimensions.slice(0, shape.rowFields);
  const col = shape.column ? plan.dimensions[shape.rowFields] : undefined;
  const measures = plan.columns.filter((c) => c.key.startsWith("m")).map((c) => c.type);
  const meta = metaOf(shape);
  const nested: OutColumn["type"][] =
    meta.length > META.length
      ? ["count", "count", "count", dimType(rows[2]), dimType(rows[3])] // lv, g2, g3, d2, d3
      : [];
  if (meta.length > META_NESTED.length) nested.push("count"); // ox (Top N, T-071)
  return [
    "text",
    "count",
    "count",
    "count",
    dimType(rows[0]),
    dimType(rows[1]),
    dimType(col),
    "count",
    ...nested,
    ...measures,
  ];
}

export interface PivotField {
  label: string;
  type: OutColumn["type"];
  grain?: Grain;
  /** Nilai: "Tampilkan nilai sebagai" (T-067) — format persen / judul sudah menyebutnya. */
  showAs?: ShowAs;
  /** Nilai field terhitung dengan format sendiri (T-068); tanpa field ini = format widget. */
  format?: NumberFormat;
}

/** Nilai satu sel (satu angka per ukuran, urut nilai) atau null bila tidak ada data. */
export type PivotCell = unknown[] | null;

export interface PivotData {
  rowFields: PivotField[];
  columnField: PivotField | null;
  values: PivotField[];
  /**
   * Baris terdalam yang tampil, urut: label per kolom baris + kelompok pertama (indeks `groups`).
   * `other` (Top N, T-071): bit level (bit 0 = baris pertama) yang berisi kelompok "(Lainnya)" —
   * labelnya null, bukan data (tidak bisa jadi filter silang).
   */
  rows: { labels: unknown[]; group: number | null; other?: number }[];
  /** Label kelompok baris pertama (untuk baris subtotal), bila baris 2 kolom. */
  groups: unknown[];
  /** Nilai kolom pemisah yang tampil (mis. periode), urut naik; [] bila tanpa pemisah. */
  columns: unknown[];
  /** [baris][kolom]; tanpa pemisah satu kolom saja. */
  cells: PivotCell[][];
  /** [kelompok][kolom] — subtotal kelompok pertama; null bila tidak diminta. */
  subtotals: PivotCell[][] | null;
  /** Total per baris (kolom "Total"), bila ada pemisah dan total diminta. */
  rowTotals: PivotCell[] | null;
  /** Total per kelompok di kolom "Total". */
  subtotalTotals: PivotCell[] | null;
  /** Total per kolom (baris "Total"). */
  columnTotals: PivotCell[] | null;
  grandTotal: PivotCell;
  /** Jumlah baris terdalam / nilai kolom sebelum batas tampilan. */
  rowCount: number;
  columnCount: number;
  /** Saringan yang berlaku (Saring tersimpan + saringan pembaca, T-f4a7); hasil cache lama: tidak ada. */
  filters?: PivotNote[];
  /**
   * Baris 3–4 kolom (T-070): kelompok setiap level induk (level 1 = `groups`/`subtotals`). Tidak ada
   * untuk baris ≤ 2 kolom.
   */
  nest?: PivotNest;
}

export interface PivotNest {
  /** Per baris terdalam yang tampil: indeks kelompok di setiap level induk (level 1..n-1). */
  paths: number[][];
  /** Per level induk: label kelompok, subtotal [kelompok][kolom] dan kolom Total-nya (null = mati). */
  levels: { labels: unknown[]; subtotals: PivotCell[][] | null; totals: PivotCell[] | null }[];
}

/** Baris hasil (sudah toJson, urut kolom META + ukuran) → tabel pivot. */
export function shapePivot(raw: unknown[][], plan: Plan, shape: PivotShape): PivotData {
  const meta = metaOf(shape);
  const at = (name: Meta) => meta.indexOf(name);
  const idx = (v: unknown) => (v === null || v === undefined ? -1 : Number(v) - 1);
  const field = (i: number): PivotField => {
    const c = plan.columns[i]!;
    const d = plan.dimensions[i];
    return { label: c.label, type: c.type, ...(d?.grain ? { grain: d.grain } : {}) };
  };
  const nm = plan.measures.length;
  const values = (r: unknown[]): unknown[] => r.slice(meta.length, meta.length + nm);

  const rowList = raw.filter((r) => r[at("kind")] === "row");
  const colList = raw.filter((r) => r[at("kind")] === "col");
  const nRows = rowList.length;
  const nCols = shape.column ? colList.length : 1;
  const grid = (n: number) => Array.from({ length: n }, () => Array<PivotCell>(nCols).fill(null));
  const n = shape.rowFields;
  const nested = n > 2;
  const levels = subtotalLevelsOf(shape);

  const rows: PivotData["rows"] = Array.from({ length: nRows }, () => ({
    labels: [],
    group: null,
  }));
  // Label kelompok per level induk (indeks 0 = level 1 = `groups`).
  const labels: unknown[][] = Array.from({ length: Math.max(0, n - 1) }, () => []);
  const paths: number[][] = Array.from({ length: nRows }, () => []);
  for (const r of rowList) {
    const i = idx(r[at("ri")]);
    const path = Array.from({ length: n - 1 }, (_, l) => idx(r[at(groupCol(l + 1))]));
    const g = path[0] ?? -1;
    const other = at("ox") >= 0 ? Number(r[at("ox")] ?? 0) : 0;
    rows[i] = {
      labels: Array.from({ length: n }, (_, j) => r[at(`d${j}` as Meta)]),
      group: g >= 0 ? g : null,
      ...(other ? { other } : {}),
    };
    paths[i] = path;
    path.forEach((p, l) => {
      if (p >= 0) labels[l]![p] = r[at(`d${l}` as Meta)];
    });
  }
  const groups = labels[0] ?? [];
  const columns: unknown[] = [];
  for (const r of colList) columns[idx(r[at("ci")])] = r[at("dc")];

  const cells = grid(nRows);
  const withTotals = shape.column && shape.totals;
  const nest: PivotNest["levels"] = labels.map((ls, l) => {
    const on = levels.includes(l + 1);
    return {
      labels: ls,
      subtotals: on ? grid(ls.length) : null,
      totals: on && withTotals ? Array<PivotCell>(ls.length).fill(null) : null,
    };
  });
  const rowTotals = withTotals ? Array<PivotCell>(nRows).fill(null) : null;
  const columnTotals = withTotals ? Array<PivotCell>(nCols).fill(null) : null;
  let grandTotal: PivotCell = null;
  for (const r of raw) {
    const ri = idx(r[at("ri")]);
    const gi = idx(r[at("gi")]);
    const ci = shape.column ? idx(r[at("ci")]) : 0;
    // Baris subtotal: level di lv (baris ≥ 3 kolom), selain itu kelompok pertama.
    const lvl = nest[nested ? Number(r[at("lv")]) - 1 : 0];
    switch (r[at("kind")]) {
      case "cell":
        if (ri >= 0 && ci >= 0) cells[ri]![ci] = values(r);
        break;
      case "sub":
        if (lvl?.subtotals && gi >= 0 && ci >= 0) lvl.subtotals[gi]![ci] = values(r);
        break;
      case "subtot":
        if (lvl?.totals && gi >= 0) lvl.totals[gi] = values(r);
        break;
      case "rowtot":
        if (rowTotals && ri >= 0) rowTotals[ri] = values(r);
        break;
      case "coltot":
        if (columnTotals && ci >= 0) columnTotals[ci] = values(r);
        break;
      case "grand":
        grandTotal = values(r);
        break;
    }
  }
  const count = (list: unknown[][]) => Number(list[0]?.[at("n")] ?? 0);
  return {
    rowFields: plan.dimensions.slice(0, n).map((_, i) => field(i)),
    columnField: shape.column ? field(n) : null,
    values: plan.columns.slice(plan.dimensions.length).map((c) => ({
      label: c.label,
      type: c.type,
      ...(c.showAs ? { showAs: c.showAs } : {}),
      ...(c.format ? { format: c.format } : {}),
    })),
    rows,
    groups,
    columns,
    cells,
    subtotals: nest[0]?.subtotals ?? null,
    rowTotals,
    subtotalTotals: nest[0]?.totals ?? null,
    columnTotals,
    grandTotal,
    rowCount: count(rowList),
    columnCount: shape.column ? count(colList) : 0,
    filters: shape.notes ?? [],
    ...(nested ? { nest: { paths, levels: nest } } : {}),
  };
}
