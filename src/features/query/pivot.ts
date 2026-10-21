/*
 * Widget pivot (T-686n), seperti PivotTable Excel: baris 1–2 kolom, kolom pemisah opsional (mis. periode
 * per bulan), nilai 1–3. Satu query DuckDB (UNION ALL, dibedakan kolom `kind`) mengembalikan baris dan
 * kolom yang tampil (dibatasi), sel, subtotal kelompok pertama, total baris/kolom, dan total keseluruhan;
 * shapePivot menyusunnya jadi tabel. Total dan subtotal dihitung dari SELURUH data yang lolos filter,
 * termasuk baris/kolom di luar batas tampilan. Aturan kunci (teks tidak peka huruf besar/kecil, label =
 * variasi paling sering), agregasi, dan filter sama persis dengan grafik (sql.ts). Murni (tanpa I/O).
 */
import {
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
type Meta = (typeof META)[number];

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

export function buildPivotSql(plan: Plan, shape: PivotShape, parquetPath: string): BuiltSql {
  const params: BuiltSql["params"] = { path: parquetPath };
  const where = pivotWhere(plan, shape, params);
  const rows = plan.dimensions.slice(0, shape.rowFields);
  const col = shape.column ? plan.dimensions[shape.rowFields] : undefined;
  const two = shape.rowFields === 2;
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
  const ctes = [
    // Inline (bukan materialized): data mentah tidak ditahan di memori; parquet dibaca per cabang.
    `${k("src")} AS NOT MATERIALIZED (SELECT ${src.join(", ")} FROM read_parquet($path)${where})`,
  ];
  const r0 = rows[0]!;
  if (two) {
    const r1 = rows[1]!;
    const g1Order = rowOrder(shape.sort, "g1.v", "g1.k0", r0);
    ctes.push(
      `g1 AS MATERIALIZED (SELECT k0, ${display(r0, "k0", "t0")} AS d0, ${m0} AS v FROM src GROUP BY k0)`,
      `lf AS MATERIALIZED (SELECT k0, k1, ${display(r1, "k1", "t1")} AS d1, ${m0} AS v FROM src GROUP BY k0, k1)`,
      `rws AS MATERIALIZED (SELECT lf.k0, g1.d0, lf.k1, lf.d1, ` +
        `row_number() OVER (ORDER BY ${g1Order}, ${rowOrder(shape.sort, "lf.v", "lf.k1", r1)}) AS ri, ` +
        `dense_rank() OVER (ORDER BY ${g1Order}) AS gi, count(*) OVER () AS n ` +
        `FROM lf JOIN g1 ON g1.k0 IS NOT DISTINCT FROM lf.k0 QUALIFY ri <= ${PIVOT_ROWS_SHOWN})`,
    );
  } else {
    ctes.push(
      `lf AS MATERIALIZED (SELECT k0, ${display(r0, "k0", "t0")} AS d0, ${m0} AS v FROM src GROUP BY k0)`,
      `rws AS MATERIALIZED (SELECT k0, d0, row_number() OVER (ORDER BY ${rowOrder(shape.sort, "v", "k0", r0)}) AS ri, ` +
        `count(*) OVER () AS n FROM lf QUALIFY ri <= ${PIVOT_ROWS_SHOWN})`,
    );
  }
  if (col) {
    ctes.push(
      `cols AS MATERIALIZED (SELECT kc, ${display(col, "kc", "tc")} AS dc, ` +
        `row_number() OVER (ORDER BY ${keyOrder("kc", col, "ASC")}) AS ci, count(*) OVER () AS n ` +
        `FROM src GROUP BY kc QUALIFY ci <= ${PIVOT_COLUMNS_SHOWN})`,
    );
  }

  const M = plan.measures.map((m) => `${measureExpr(m)} AS ${ident(m.key)}`);
  const noM = plan.measures.map((m) => `NULL AS ${ident(m.key)}`);
  const select = (o: Partial<Record<Meta, string>>, measures: string[]) =>
    `SELECT ${META.map((c) => `${o[c] ?? "NULL"} AS ${ident(c)}`).join(", ")}, ${measures.join(", ")}`;
  const rowJoin = `JOIN rws r ON r.k0 IS NOT DISTINCT FROM s.k0${two ? " AND r.k1 IS NOT DISTINCT FROM s.k1" : ""}`;
  const colJoin = "JOIN cols x ON x.kc IS NOT DISTINCT FROM s.kc";
  const groupJoin = "JOIN (SELECT DISTINCT k0, gi FROM rws) g ON g.k0 IS NOT DISTINCT FROM s.k0";

  const parts = [
    `${select({ kind: "'row'", ri: "ri", gi: two ? "gi" : undefined, d0: "d0", d1: two ? "d1" : undefined, n: "n" }, noM)} FROM rws`,
  ];
  if (col) {
    parts.push(`${select({ kind: "'col'", ci: "ci", dc: "dc", n: "n" }, noM)} FROM cols`);
    parts.push(
      `${select({ kind: "'cell'", ri: "r.ri", ci: "x.ci" }, M)} FROM src s ${rowJoin} ${colJoin} GROUP BY r.ri, x.ci`,
    );
  } else {
    parts.push(`${select({ kind: "'cell'", ri: "r.ri" }, M)} FROM src s ${rowJoin} GROUP BY r.ri`);
  }
  if (shape.subtotals && two) {
    parts.push(
      col
        ? `${select({ kind: "'sub'", gi: "g.gi", ci: "x.ci" }, M)} FROM src s ${groupJoin} ${colJoin} GROUP BY g.gi, x.ci`
        : `${select({ kind: "'sub'", gi: "g.gi" }, M)} FROM src s ${groupJoin} GROUP BY g.gi`,
    );
    if (col && shape.totals) {
      parts.push(
        `${select({ kind: "'subtot'", gi: "g.gi" }, M)} FROM src s ${groupJoin} GROUP BY g.gi`,
      );
    }
  }
  if (col && shape.totals) {
    parts.push(
      `${select({ kind: "'rowtot'", ri: "r.ri" }, M)} FROM src s ${rowJoin} GROUP BY r.ri`,
    );
    parts.push(
      `${select({ kind: "'coltot'", ci: "x.ci" }, M)} FROM src s ${colJoin} GROUP BY x.ci`,
    );
  }
  if (shape.totals) parts.push(`${select({ kind: "'grand'" }, M)} FROM src s`);

  const union = parts.join("\nUNION ALL\n");
  if (!plan.measures.some((m) => shown(m.showAs))) {
    // Tanpa "Tampilkan nilai sebagai": SQL lama persis (spec 1.0.0 identik).
    return bindCalc({ sql: `WITH ${ctes.join(",\n")}\n${union}`, params }, plan.measures);
  }
  const shownSql = showAsSql(plan, shape, { rows, col, rowJoin, colJoin, groupJoin, M });
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
    groupJoin: string;
    M: string[];
  },
): { ctes: string[]; select: string } {
  const shows = plan.measures.map((m) => m.showAs ?? "none");
  const has = (...s: ShowAs[]) => shows.some((x) => s.includes(x));
  const m = (i: number) => ident(plan.measures[i]!.key);
  const two = shape.rowFields === 2;
  const sub = shape.subtotals && two;
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
    if (sub) {
      ctes.push(
        `st AS MATERIALIZED (SELECT g.gi, ${q.M.join(", ")} FROM src s ${q.groupJoin} GROUP BY g.gi)`,
      );
      joins.push("LEFT JOIN st ON u.kind = 'sub' AND st.gi = u.gi");
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
      // Sepanjang baris terdalam di dalam kelompok induknya, termasuk baris di luar 200 tampil.
      const keys = two ? "k0, k1" : "k0";
      const inner = two ? "k1" : "k0";
      const leaf = q.rows[two ? 1 : 0]!;
      body =
        `SELECT r.ri, NULL AS ci, ${keep.join(", ")} FROM (SELECT ${keys}, ${wins.join(", ")} ` +
        `FROM (SELECT ${keys}, ${raw.join(", ")} FROM src s GROUP BY ${keys}) ` +
        `WINDOW w AS (${two ? "PARTITION BY k0 " : ""}ORDER BY ${keyOrder(inner, leaf, "ASC")} ` +
        `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) w ` +
        `JOIN rws r ON r.k0 IS NOT DISTINCT FROM w.k0${two ? " AND r.k1 IS NOT DISTINCT FROM w.k1" : ""}`;
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
  const meta = META.map((c) => `u.${ident(c)}`);
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
  return [
    "text",
    "count",
    "count",
    "count",
    dimType(rows[0]),
    dimType(rows[1]),
    dimType(col),
    "count",
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
  /** Baris terdalam yang tampil, urut: label per kolom baris + kelompok pertama (indeks `groups`). */
  rows: { labels: unknown[]; group: number | null }[];
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
}

/** Baris hasil (sudah toJson, urut kolom META + ukuran) → tabel pivot. */
export function shapePivot(raw: unknown[][], plan: Plan, shape: PivotShape): PivotData {
  const at = (name: Meta) => META.indexOf(name);
  const idx = (v: unknown) => (v === null || v === undefined ? -1 : Number(v) - 1);
  const field = (i: number): PivotField => {
    const c = plan.columns[i]!;
    const d = plan.dimensions[i];
    return { label: c.label, type: c.type, ...(d?.grain ? { grain: d.grain } : {}) };
  };
  const nm = plan.measures.length;
  const values = (r: unknown[]): unknown[] => r.slice(META.length, META.length + nm);

  const rowList = raw.filter((r) => r[at("kind")] === "row");
  const colList = raw.filter((r) => r[at("kind")] === "col");
  const nRows = rowList.length;
  const nCols = shape.column ? colList.length : 1;
  const grid = (n: number) => Array.from({ length: n }, () => Array<PivotCell>(nCols).fill(null));
  const two = shape.rowFields === 2;

  const rows: PivotData["rows"] = Array.from({ length: nRows }, () => ({
    labels: [],
    group: null,
  }));
  const groups: unknown[] = [];
  for (const r of rowList) {
    const i = idx(r[at("ri")]);
    const g = two ? idx(r[at("gi")]) : -1;
    rows[i] = {
      labels: two ? [r[at("d0")], r[at("d1")]] : [r[at("d0")]],
      group: g >= 0 ? g : null,
    };
    if (g >= 0) groups[g] = r[at("d0")];
  }
  const columns: unknown[] = [];
  for (const r of colList) columns[idx(r[at("ci")])] = r[at("dc")];

  const cells = grid(nRows);
  const subtotals = shape.subtotals && two ? grid(groups.length) : null;
  const rowTotals = shape.column && shape.totals ? Array<PivotCell>(nRows).fill(null) : null;
  const subtotalTotals =
    subtotals && shape.column && shape.totals ? Array<PivotCell>(groups.length).fill(null) : null;
  const columnTotals = shape.column && shape.totals ? Array<PivotCell>(nCols).fill(null) : null;
  let grandTotal: PivotCell = null;
  for (const r of raw) {
    const ri = idx(r[at("ri")]);
    const gi = idx(r[at("gi")]);
    const ci = shape.column ? idx(r[at("ci")]) : 0;
    switch (r[at("kind")]) {
      case "cell":
        if (ri >= 0 && ci >= 0) cells[ri]![ci] = values(r);
        break;
      case "sub":
        if (subtotals && gi >= 0 && ci >= 0) subtotals[gi]![ci] = values(r);
        break;
      case "subtot":
        if (subtotalTotals && gi >= 0) subtotalTotals[gi] = values(r);
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
    rowFields: plan.dimensions.slice(0, shape.rowFields).map((_, i) => field(i)),
    columnField: shape.column ? field(shape.rowFields) : null,
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
    subtotals,
    rowTotals,
    subtotalTotals,
    columnTotals,
    grandTotal,
    rowCount: count(rowList),
    columnCount: shape.column ? count(colList) : 0,
    filters: shape.notes ?? [],
  };
}
