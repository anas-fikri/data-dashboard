/*
 * Spike T-034 (P-1): segmen typed per periode vs satu file gabungan, lewat mesin query aplikasi
 * (QueryEngine: memory_limit 1GB, 2 thread, sandbox enable_external_access=false + allowed_directories +
 * lock_configuration, satu koneksi per query) dan pembangun SQL aplikasi (sql.ts, table.ts). Bukan bagian
 * check; hasil dicatat di docs/ai/perf/T-034.md.
 *
 *   npx tsx scripts/perf-segments.ts --dir /path/scratch [--segs 24] [--rows 400000] [--reps 30] [--keep]
 *
 * Data (deterministik, langsung DuckDB tanpa CSV, bentuk fixture csv T-024: 10 kolom, 30 % teks):
 *   single.parquet           segs × rows baris: _row BIGINT, _src_row, _period DATE, c1..c10 bertipe
 *   seg-NN.parquet           potongan single per periode (bulan) → isi gabungan identik
 *   legacy.parquet           AC 3: baris segmen 1..segs/6 sebagai satu segmen legacy (_row INTEGER, c1..c10)
 *   seg-NN-c11.parquet       AC 3: 4 segmen terakhir + kolom tambahan c11 BIGINT (= c4 × 2)
 * Zstd, row group 122.880, ditulis 1 thread (sama dengan copyParquet ingest).
 *
 * AC 1: group-by/totals, halaman tabel, count, filter-values — read_parquet($path) dengan $path = string
 *       (file tunggal) vs listValue(24 path); hasil dibandingkan, p50/p95 dari `reps` putaran berselang-seling.
 * AC 2: 100 posisi acak (+5 lintas batas segmen) → jendela 200 baris lewat (segmen, file_row_number).
 * AC 3: campuran legacy + baru: daftar polos (gagal, bergantung urutan), union_by_name, dan proyeksi
 *       eksplisit (CAST(_row AS BIGINT), NULL AS c11) dibandingkan dengan file tunggal; uji path di luar sandbox.
 * Keluaran: ringkasan per baris + satu baris JSON di akhir. Data dihapus di akhir kecuali --keep.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { cpus, loadavg, totalmem } from "node:os";
import { join } from "node:path";
import { DuckDBInstance, listValue, type DuckDBValue } from "@duckdb/node-api";
import type { Plan, PlanFilter } from "../src/features/query/spec";
import {
  buildFilterValuesSql,
  buildSql,
  buildTotalsSql,
  type BuiltSql,
} from "../src/features/query/sql";
import { buildTableCount, buildTablePage } from "../src/features/query/table";
import { lit } from "../src/lib/duckdb";
import { QueryEngine } from "../src/lib/duckdb/engine";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const DIR = arg("dir");
if (!DIR) {
  console.error(
    "pakai: scripts/perf-segments.ts --dir <scratch> [--segs 24] [--rows 400000] [--reps 30]",
  );
  process.exit(1);
}
const SEGS = Number(arg("segs", "24"));
const R = Number(arg("rows", "400000"));
const REPS = Number(arg("reps", "30"));
const N = SEGS * R;
const LEG = Math.max(1, Math.floor(SEGS / 6)); // segmen yang digabung jadi satu segmen legacy
const XC = Math.min(4, SEGS - LEG - 1); // segmen terakhir yang punya kolom tambahan c11
const data = join(DIR, "data");
const tmp = join(DIR, "tmp");
const pad = (k: number) => String(k).padStart(2, "0");
const single = join(data, "single.parquet");
const seg = (k: number) => join(data, `seg-${pad(k)}.parquet`);
const segX = (k: number) => join(data, `seg-${pad(k)}-c11.parquet`);
const legacy = join(data, "legacy.parquet");
const segs = Array.from({ length: SEGS }, (_, i) => seg(i + 1));
const mid = segs.slice(LEG, SEGS - XC);
const xs = Array.from({ length: XC }, (_, i) => segX(SEGS - XC + i + 1));
const mixed = [legacy, ...mid, ...xs];
/** _row pertama yang punya c11 (segmen c11 pertama); _row = indeks data + 2 (header di baris 1). */
const B11 = (SEGS - XC) * R + 2;
const C10 = Array.from({ length: 10 }, (_, i) => `c${i + 1}`).join(", ");

const freeGB = () =>
  Number(execFileSync("df", ["-k", DIR]).toString().trim().split("\n").pop()!.split(/\s+/)[3]) /
  1024 /
  1024;
const load = () => loadavg().map((x) => Math.round(x * 10) / 10);
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};
const r1 = (x: number) => Math.round(x * 10) / 10;
const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

// ---------- data ----------

const KOTA = `['Jakarta','Surabaya','Bandung','Medan','Makassar','Denpasar','Semarang','Palembang','Balikpapan','Yogyakarta']`;
const LAYANAN = `['Reguler','Ekspres','Kargo','Same Day','Sameday Premium','Dokumen']`;
const KATA = `['paket','kiriman','gudang','kurir','pelanggan','alamat','rumah','kantor','toko','pabrik','cabang','utama','barat','timur','selatan','utara','lantai','blok','jalan','gang','nomor','kemasan','rapuh','dingin','berat','ringan','cepat','tertunda','diterima','dikembalikan','café','jalur','señal','über']`;
/** 2 % NULL per kolom (h % 50 = 0), seperti model fixture. */
const nul = (h: string, e: string) => `CASE WHEN ${h} % 50 = 0 THEN NULL ELSE ${e} END`;
const pick = (list: string, n: number, h: string, div: number) =>
  `${list}[CAST(${h} // ${div} % ${n} AS BIGINT) + 1]`;
const category = (h: string) =>
  nul(
    h,
    `CASE WHEN ${h} // 50 % 2 = 0 THEN ${pick(KOTA, 10, h, 100)} ELSE ${pick(LAYANAN, 6, h, 100)} END`,
  );
/** 20 % teks unik (kata acak + angka 9 digit), sisanya "Kota Layanan" (unique-ratio 0.2). */
const text = (h: string) =>
  nul(
    h,
    `CASE WHEN ${h} // 50 % 5 = 0 THEN ${pick(KATA, 34, h, 250)} || ' ' || ${pick(KATA, 34, h, 8500)} || ' ' || ${pick(KATA, 34, h, 289000)} || ' ' || CAST(${h} // 9826000 % 1000000000 AS VARCHAR) ELSE ${pick(KOTA, 10, h, 250)} || ' ' || ${pick(LAYANAN, 6, h, 2500)} END`,
  );
const period = `CAST(DATE '2024-01-01' + to_months(CAST(i // ${R} AS INTEGER)) AS DATE)`;
const genSelect = `
  SELECT CAST(i + 2 AS BIGINT) AS _row, CAST(i % ${R} + 2 AS BIGINT) AS _src_row, ${period} AS _period,
    'PCP01' || lpad(CAST(i + 1 AS VARCHAR), 9, '0') AS c1,
    ${nul("h2", `${period} + CAST(h2 // 50 % 28 AS INTEGER)`)} AS c2,
    ${nul("h3", `CAST(CAST(h3 // 50 % 5000000 AS BIGINT) / 100.0 AS DECIMAL(38,6))`)} AS c3,
    ${nul("h4", `CAST(1 + h4 // 50 % 50 AS BIGINT)`)} AS c4,
    ${nul("h5", `h5 // 50 % 2 = 0`)} AS c5,
    ${nul("h6", `CAST(CAST(h6 // 50 % 1000000000 AS BIGINT) / 100.0 AS DECIMAL(38,6))`)} AS c6,
    ${category("h7")} AS c7, ${text("h8")} AS c8, ${text("h9")} AS c9, ${category("h10")} AS c10
  FROM (SELECT i, ${[2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => `hash(i, ${k}) AS h${k}`).join(", ")}
        FROM range(0, ${N}) t(i))`;

async function generate() {
  mkdirSync(data, { recursive: true });
  mkdirSync(tmp, { recursive: true });
  if (freeGB() < 3) throw new Error(`sisa disk ${freeGB().toFixed(1)} GB < 3 GB`);
  const db = await DuckDBInstance.create(":memory:", {
    memory_limit: "2GB",
    threads: "1",
    temp_directory: tmp,
    preserve_insertion_order: "true",
  });
  const c = await db.connect();
  const copy = async (sel: string, out: string) => {
    if (existsSync(out)) return;
    if (freeGB() < 3) throw new Error("sisa disk < 3 GB, berhenti");
    await c.run(
      `COPY (${sel}) TO ${lit(out)} (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 122880)`,
    );
  };
  const t0 = Date.now();
  await copy(genSelect, single);
  const from = (f: string) => `FROM read_parquet(${lit(f)})`;
  for (let k = 1; k <= SEGS; k++) {
    await copy(
      `SELECT * ${from(single)} WHERE _row BETWEEN ${(k - 1) * R + 2} AND ${k * R + 1}`,
      seg(k),
    );
  }
  await copy(
    `SELECT CAST(_row AS INTEGER) AS _row, ${C10} ${from(single)} WHERE _row < ${LEG * R + 2}`,
    legacy,
  );
  for (let k = SEGS - XC + 1; k <= SEGS; k++)
    await copy(`SELECT *, c4 * 2 AS c11 ${from(seg(k))}`, segX(k));
  // Mini: segmen baru dengan rowBase > 2^31 (BIGINT yang tidak muat INTEGER).
  await copy(
    `SELECT CAST(i + 2 AS INTEGER) AS _row, 'a' || i AS c1 FROM range(0, 100) t(i)`,
    join(data, "mini-legacy.parquet"),
  );
  await copy(
    `SELECT CAST(3000000000 + i AS BIGINT) AS _row, 'b' || i AS c1 FROM range(0, 100) t(i)`,
    join(data, "mini-big.parquet"),
  );
  c.closeSync();
  db.closeSync();
  const mb = (fs: string[]) => r1(fs.reduce((n, f) => n + statSync(f).size, 0) / 1024 / 1024);
  return {
    genSec: Math.round((Date.now() - t0) / 1000),
    mb: { single: mb([single]), segments: mb(segs), legacy: mb([legacy]), c11: mb(xs) },
  };
}

// ---------- sumber data untuk SQL aplikasi ----------

type Params = Record<string, DuckDBValue>;
interface Source {
  name: string;
  sql: (s: string) => string;
  params: Params;
}
const P = "read_parquet($path)";
const swap = (to: string) => (s: string) => {
  if (!s.includes(P)) throw new Error(`SQL tanpa ${P}`);
  return s.replaceAll(P, to);
};
/** Proyeksi eksplisit per kelompok skema: _row → BIGINT, kolom yang tidak ada → NULL bertipe. */
const projUnion = [
  `SELECT CAST(_row AS BIGINT) AS _row, ${C10}, CAST(NULL AS BIGINT) AS c11 FROM read_parquet($g0)`,
  `SELECT _row, ${C10}, CAST(NULL AS BIGINT) AS c11 FROM read_parquet($g1)`,
  `SELECT _row, ${C10}, c11 FROM read_parquet($g2)`,
].join(" UNION ALL ");
const SRC = {
  single: { name: "single", sql: (s: string) => s, params: { path: single } },
  segs: { name: "segs", sql: (s: string) => s, params: { path: listValue(segs) } },
  /** File tunggal dengan c11 yang diharapkan (NULL sebelum segmen c11). */
  ref11: {
    name: "ref11",
    sql: swap(
      `(SELECT _row, ${C10}, CASE WHEN _row >= ${B11} THEN c4 * 2 END AS c11 FROM ${P}) AS src`,
    ),
    params: { path: single },
  },
  union: {
    name: "union_by_name",
    sql: swap("read_parquet($path, union_by_name = true)"),
    params: { path: listValue(mixed) },
  },
  proj: {
    name: "projection",
    sql: swap(`(${projUnion}) AS src`),
    params: { g0: listValue([legacy]), g1: listValue(mid), g2: listValue(xs) },
  },
  plainLegacyFirst: {
    name: "plain, legacy dulu",
    sql: (s: string) => s,
    params: { path: listValue(mixed) },
  },
  plainNewFirst: {
    name: "plain, c11 dulu",
    sql: (s: string) => s,
    params: { path: listValue([...xs, ...mid, legacy]) },
  },
} satisfies Record<string, Source>;

let engine: QueryEngine;
/**
 * engine.exec sungguhan (sandbox + koneksi per query). Tipe params-nya hanya skalar; daftar path butuh
 * DuckDBListValue (node-api menerimanya saat runtime) → P-5 harus melebarkan tipe itu.
 */
async function run(b: BuiltSql, src: Source) {
  const sql = src.sql(b.sql);
  const params: Params = { ...b.params, ...src.params };
  if (!sql.includes("$path")) delete params.path;
  const t0 = performance.now();
  const r = await engine.exec(
    sql,
    params as unknown as Record<string, string | number | boolean>,
    30_000,
  );
  return { ms: performance.now() - t0, out: json(r.rows) };
}
async function tryRun(b: BuiltSql, src: Source) {
  try {
    return { ok: true as const, ...(await run(b, src)) };
  } catch (e) {
    return {
      ok: false as const,
      error: String((e as Error).message)
        .split("\n")[0]!
        .slice(0, 220),
    };
  }
}

// ---------- query (rencana seperti hasil resolve spec widget) ----------

const plan = (p: Partial<Plan>): Plan => ({
  dimensions: [],
  measures: [],
  filters: [],
  sort: [],
  limit: 10_000,
  columns: [],
  ...p,
});
const tableCols = plan({
  dimensions: [
    { key: "d0", col: "c1", type: "text" },
    { key: "d1", col: "c2", type: "date" },
    { key: "d2", col: "c3", type: "decimal" },
    { key: "d3", col: "c4", type: "integer" },
    { key: "d4", col: "c7", type: "text" },
    { key: "d5", col: "c8", type: "text" },
  ],
});
const byKota = plan({
  dimensions: [{ key: "d0", col: "c7", type: "text" }],
  measures: [
    { key: "m0", agg: "count" },
    { key: "m1", agg: "sum", col: "c3" },
  ],
  sort: [{ key: "m0", dir: "desc" }],
});
const filtered: PlanFilter[] = [
  { col: "c7", type: "text", op: "in", values: ["Jakarta", "Bandung"] },
  { col: "c4", type: "integer", op: "gt", values: [25] },
];
const lastPage = Math.floor((N - 1) / 100);
const QUERIES: [string, BuiltSql][] = [
  ["groupby_text", buildSql(byKota, "")],
  ["groupby_totals", buildTotalsSql(byKota, "")!],
  [
    "groupby_month",
    buildSql(
      plan({
        dimensions: [{ key: "d0", col: "c2", type: "date", grain: "month" }],
        measures: [
          { key: "m0", agg: "sum", col: "c6" },
          { key: "m1", agg: "avg", col: "c4" },
        ],
      }),
      "",
    ),
  ],
  [
    "groupby_date_filter",
    buildSql(
      plan({
        dimensions: [{ key: "d0", col: "c10", type: "text" }],
        measures: [
          { key: "m0", agg: "count" },
          { key: "m1", agg: "max", col: "c3" },
        ],
        filters: [{ col: "c2", type: "date", op: "between", values: ["2024-06-01", "2024-08-31"] }],
      }),
      "",
    ),
  ],
  ["table_first", buildTablePage(tableCols, null, 0, "")],
  ["table_deep", buildTablePage(tableCols, null, lastPage, "")],
  ["table_sort_num", buildTablePage(tableCols, { index: 2, dir: "desc" }, 1000, "")],
  ["table_sort_text", buildTablePage(tableCols, { index: 5, dir: "asc" }, 0, "")],
  ["count_all", buildTableCount(plan({}), "")],
  ["count_filtered", buildTableCount(plan({ filters: filtered }), "")],
  ["fv_text", buildFilterValuesSql({ col: "c7", type: "text" }, null, "")],
  ["fv_text_q", buildFilterValuesSql({ col: "c9", type: "text" }, "jakarta", "")],
  ["fv_int", buildFilterValuesSql({ col: "c4", type: "integer" }, null, "")],
  ["fv_date", buildFilterValuesSql({ col: "c2", type: "date" }, null, "")],
];
const c11Plan = plan({
  dimensions: [...tableCols.dimensions.slice(0, 4), { key: "d4", col: "c11", type: "integer" }],
});
const C11_QUERIES: [string, BuiltSql][] = [
  [
    "c11_totals",
    buildSql(
      plan({
        measures: [
          { key: "m0", agg: "count" },
          { key: "m1", agg: "count", col: "c11" },
          { key: "m2", agg: "sum", col: "c11" },
        ],
      }),
      "",
    ),
  ],
  [
    "c11_groupby",
    buildSql(
      plan({
        dimensions: [{ key: "d0", col: "c11", type: "integer" }],
        measures: [{ key: "m0", agg: "count" }],
      }),
      "",
    ),
  ],
  [
    "c11_is_null",
    buildTableCount(
      plan({ filters: [{ col: "c11", type: "integer", op: "is_null", values: [] }] }),
      "",
    ),
  ],
  ["c11_page_legacy_end", buildTablePage(c11Plan, null, LEG * (R / 100) - 1, "")],
  ["c11_page_new_start", buildTablePage(c11Plan, null, LEG * (R / 100), "")],
  ["c11_page_c11_start", buildTablePage(c11Plan, null, (SEGS - XC) * (R / 100), "")],
  ["c11_sort_desc", buildTablePage(c11Plan, { index: 4, dir: "desc" }, 0, "")],
  ["row_type", { sql: `SELECT typeof(_row) AS t, count(*) AS n FROM ${P} GROUP BY 1`, params: {} }],
];

/** p50/p95 per query untuk beberapa sumber, putaran berselang-seling; putaran 0 = pemanasan + cek hasil. */
async function bench(queries: [string, BuiltSql][], base: Source, others: Source[], reps: number) {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name] of queries) out[name] = {};
  const ms = new Map<string, number[]>();
  for (let rep = 0; rep <= reps; rep++) {
    for (const [name, b] of queries) {
      const order = rep % 2 ? [...others, base] : [base, ...others];
      const res = new Map<string, string>();
      for (const s of order) {
        const r = await tryRun(b, s);
        if (!r.ok) {
          out[name]![`error_${s.name}`] = r.error;
          res.set(s.name, `ERROR ${r.error}`);
          continue;
        }
        if (rep > 0) ms.set(`${name}|${s.name}`, [...(ms.get(`${name}|${s.name}`) ?? []), r.ms]);
        res.set(s.name, r.out);
      }
      if (rep === 0 || rep === reps) {
        for (const s of others) {
          const same = res.get(s.name) === res.get(base.name);
          out[name]![`identical_${s.name}`] = (out[name]![`identical_${s.name}`] ?? true) && same;
          if (!same)
            console.error(
              `BEDA ${name} ${s.name}:`,
              res.get(s.name)?.slice(0, 200),
              "vs",
              res.get(base.name)?.slice(0, 200),
            );
        }
      }
    }
  }
  for (const [name] of queries) {
    const bs = ms.get(`${name}|${base.name}`) ?? [NaN];
    const b95 = pct(bs, 95);
    out[name]![base.name] = { p50: r1(pct(bs, 50)), p95: r1(b95) };
    for (const s of others) {
      const xs = ms.get(`${name}|${s.name}`);
      if (!xs) continue;
      out[name]![s.name] = {
        p50: r1(pct(xs, 50)),
        p95: r1(pct(xs, 95)),
        ratio95: Math.round((pct(xs, 95) / b95) * 100) / 100,
      };
    }
    console.log(name, json(out[name]));
  }
  return out;
}

// ---------- AC 2: jendela posisi global → (segmen, file_row_number) ----------

const proj11 = (f: string) =>
  f === legacy
    ? `CAST(_row AS BIGINT) AS _row, ${C10}, CAST(NULL AS BIGINT) AS c11`
    : xs.includes(f)
      ? `_row, ${C10}, c11`
      : `_row, ${C10}, CAST(NULL AS BIGINT) AS c11`;

/** Hanya segmen yang beririsan dengan [p, p+n) dibaca; urutan = urutan manifest, lalu file_row_number. */
function windowSql(
  files: string[],
  counts: number[],
  p: number,
  n: number,
  cols: (f: string) => string,
): BuiltSql {
  const params: BuiltSql["params"] = {};
  const parts: string[] = [];
  let base = 0;
  files.forEach((f, k) => {
    const lo = Math.max(p, base);
    const hi = Math.min(p + n, base + counts[k]!) - 1;
    if (lo <= hi) {
      Object.assign(params, { [`s${k}`]: f, [`a${k}`]: lo - base, [`b${k}`]: hi - base });
      parts.push(
        `SELECT ${k} AS _s, file_row_number AS _f, ${cols(f)} FROM read_parquet($s${k}, file_row_number = true) WHERE file_row_number BETWEEN $a${k} AND $b${k}`,
      );
    }
    base += counts[k]!;
  });
  return {
    sql: `SELECT * EXCLUDE (_s, _f) FROM (${parts.join(" UNION ALL ")}) ORDER BY _s, _f`,
    params,
  };
}
const noSrc: Source = { name: "direct", sql: (s) => s, params: {} };

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function counts(files: string[]) {
  const out: number[] = [];
  for (const f of files) {
    const r = await engine.exec("SELECT count(*) FROM read_parquet($p)", { p: f }, 30_000);
    out.push(Number(r.rows[0]![0]));
  }
  return out;
}

async function windows(
  files: string[],
  cols: (f: string) => string,
  refCols: string,
  positions: number[],
) {
  const cnt = await counts(files);
  const segMs: number[] = [];
  const singleMs: number[] = [];
  let wrong = 0;
  for (const [i, p] of positions.entries()) {
    const ref: BuiltSql = {
      sql: `SELECT ${refCols} FROM read_parquet($path, file_row_number = true) WHERE file_row_number BETWEEN $a AND $b ORDER BY file_row_number`,
      params: { path: single, a: p, b: p + 199 },
    };
    const w = windowSql(files, cnt, p, 200, cols);
    // Berselang-seling siapa yang jalan dulu.
    const b = i % 2 ? null : await run(ref, noSrc);
    const s = await run(w, noSrc);
    const r = b ?? (await run(ref, noSrc));
    if (s.out !== r.out || JSON.parse(r.out).length !== Math.min(200, N - p)) wrong++;
    segMs.push(s.ms);
    singleMs.push(r.ms);
  }
  const st = (xs: number[]) => ({
    p50: r1(pct(xs, 50)),
    p95: r1(pct(xs, 95)),
    max: r1(Math.max(...xs)),
  });
  return { n: positions.length, wrong, segments: st(segMs), single: st(singleMs) };
}

// ---------- main ----------

async function main() {
  const t0 = Date.now();
  const load0 = load();
  const gen = await generate();
  console.log("data", json(gen));
  engine = await QueryEngine.create({
    dataDir: data,
    tmpDir: tmp,
    memoryLimit: "1GB",
    threads: 2,
    maxTempSize: "4GB",
    maxConcurrency: 4,
    perUser: 2,
    queueWaitMs: 10_000,
  });
  const version = (await engine.exec("SELECT version()", {}, 5_000)).rows[0]![0];
  const res: Record<string, unknown> = {
    machine: {
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      ramGB: Math.round(totalmem() / 2 ** 30),
      node: process.version,
      duckdb: version,
    },
    params: { SEGS, R, N, REPS, LEG, XC },
    data: gen,
    load: { start: load0 },
  };

  console.log("== AC 1: file tunggal vs daftar segmen");
  res.ac1 = await bench(QUERIES, SRC.single, [SRC.segs], REPS);
  (res.load as Record<string, unknown>).afterAc1 = load();

  console.log("== AC 2: jendela 200 baris");
  const rnd = mulberry32(34);
  const random = Array.from({ length: 105 }, () => Math.floor(rnd() * (N - 200)));
  const boundary = [1, Math.floor(SEGS / 4), Math.floor(SEGS / 2), SEGS - 1, SEGS - 2].map(
    (k) => k * R - 100,
  );
  await windows(segs, () => `_row, ${C10}`, `_row, ${C10}`, random.slice(100)); // pemanasan
  res.ac2 = {
    random: await windows(segs, () => `_row, ${C10}`, `_row, ${C10}`, random.slice(0, 100)),
    boundary: await windows(segs, () => `_row, ${C10}`, `_row, ${C10}`, boundary),
  };
  console.log(json(res.ac2));
  (res.load as Record<string, unknown>).afterAc2 = load();

  console.log("== AC 3: campuran legacy + baru");
  const all = [...QUERIES, ...C11_QUERIES];
  const plain: Record<string, unknown> = {};
  for (const s of [SRC.plainLegacyFirst, SRC.plainNewFirst]) {
    const r = await tryRun(C11_QUERIES[0]![1], s);
    const r2 = await tryRun(QUERIES[0]![1], s);
    plain[s.name] = {
      c11: r.ok ? "ok" : r.error,
      tanpaC11: r2.ok
        ? r2.out === (await run(QUERIES[0]![1], SRC.single)).out
          ? "ok, identik"
          : "ok, BEDA"
        : r2.error,
    };
  }
  const mini = { name: "mini", sql: (s: string) => s, params: {} };
  const miniSql = (opts: string): BuiltSql => ({
    sql: `SELECT typeof(_row), count(*), max(_row) FROM read_parquet($m${opts}) GROUP BY 1`,
    params: {},
  });
  const m = (fs: string[]) => ({ ...mini, params: { m: listValue(fs.map((f) => join(data, f))) } });
  for (const [k, sql, src] of [
    ["mini legacy dulu, plain", miniSql(""), m(["mini-legacy.parquet", "mini-big.parquet"])],
    ["mini baru dulu, plain", miniSql(""), m(["mini-big.parquet", "mini-legacy.parquet"])],
    [
      "mini legacy dulu, union_by_name",
      miniSql(", union_by_name = true"),
      m(["mini-legacy.parquet", "mini-big.parquet"]),
    ],
  ] as const) {
    const r = await tryRun(sql, src);
    plain[k] = r.ok ? r.out : r.error;
  }
  const outside = await tryRun(
    { sql: "SELECT count(*) FROM read_parquet($path)", params: {} },
    { ...noSrc, params: { path: listValue([seg(1), "/etc/hosts"]) } },
  );
  res.ac3 = {
    plain,
    sandboxOutside: outside.ok ? "TERBACA (sandbox bocor!)" : outside.error,
    bench: await bench(all, SRC.ref11, [SRC.union, SRC.proj], Math.max(10, Math.floor(REPS / 3))),
    windows: await windows(
      mixed,
      proj11,
      `_row, ${C10}, CASE WHEN _row >= ${B11} THEN c4 * 2 END AS c11`,
      [LEG * R - 100, (SEGS - XC) * R - 100, (SEGS - XC) * R + 5, 3 * R + 17, N - 200],
    ),
  };
  (res.load as Record<string, unknown>).end = load();
  res.totalSec = Math.round((Date.now() - t0) / 1000);
  engine.close();
  console.log(json(res));
  if (!process.argv.includes("--keep")) {
    rmSync(data, { recursive: true, force: true });
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
