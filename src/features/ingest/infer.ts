/*
 * Inferensi tipe kolom (T-007, alur B3 tahap typed). Murni: membangun SQL DuckDB dan memutuskan tipe
 * dari profil; eksekusi ada di typed.ts.
 *
 * Profil dihitung atas raw.parquet dalam format long (UNPIVOT kolom → baris) sehingga jumlah agregat
 * tetap berapa pun lebar sheet. Urutan kandidat: bilangan bulat → desimal → tanggal/waktu → boolean
 * literal → teks; terpilih bila ≥ 98% nilai non-kosong lolos. Nilai yang gagal menjadi NULL dan
 * dihitung (castFailCount).
 */
import { ident, lit } from "@/lib/duckdb";

export type ColumnType =
  "integer" | "decimal" | "date" | "timestamp" | "duration" | "boolean" | "text";
export type NumberLocale = "id" | "us";
/** Format tanggal teks; "serial" = nomor seri Excel (hanya lewat koreksi user, T-008). */
export type DateFormat =
  | "yyyy-mm-dd"
  | "dd/mm/yyyy"
  | "dd-mm-yyyy"
  | "dd.mm.yyyy"
  | "yyyy/mm/dd"
  | "mm/dd/yyyy"
  | "serial";
export type SourceKind = "xlsx" | "csv";

/** Skema satu kolom (disimpan di Sheet.schema; c<pos> adalah nama kolom di typed.parquet). */
export interface ColumnSchema {
  pos: number;
  /** Nama tampil (bisa diganti user). */
  name: string;
  /** Nama asli dari baris header, apa adanya. */
  original: string;
  type: ColumnType;
  numberLocale?: NumberLocale;
  dateFormat?: DateFormat;
  hidden: boolean;
  /** Proporsi sel kosong di baris data (0–1). */
  nullPct: number;
  /** Perkiraan jumlah nilai unik (HyperLogLog). */
  distinctCount: number;
  /** Nilai non-kosong yang gagal dikonversi ke tipe kolom (menjadi NULL). */
  castFailCount: number;
}

export const INFER_THRESHOLD = 0.98;
const MAX_BIGINT = "9223372036854775807";

/**
 * Format strptime per format tanggal (dicoba berurutan per nilai). Urutan objek = urutan preferensi
 * saat seri: hari-di-depan sebelum bulan-di-depan (03/01/2026 → 3 Januari).
 */
export const DATE_FORMATS: Record<Exclude<DateFormat, "serial">, string[]> = {
  "yyyy-mm-dd": [
    "%Y-%m-%d",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M",
  ],
  "dd/mm/yyyy": ["%d/%m/%Y", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%y"],
  "dd-mm-yyyy": ["%d-%m-%Y", "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%d-%m-%y"],
  "dd.mm.yyyy": ["%d.%m.%Y", "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M"],
  "yyyy/mm/dd": ["%Y/%m/%d", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M"],
  "mm/dd/yyyy": ["%m/%d/%Y", "%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M", "%m/%d/%y"],
};
const TEXT_DATE_FORMATS = Object.keys(DATE_FORMATS) as Exclude<DateFormat, "serial">[];

/* Pola (RE2, dicocokkan penuh pada nilai yang sudah di-trim). */
const RE = {
  /** Angka gaya US: ribuan koma, desimal titik, eksponen (angka asli xlsx selalu bentuk ini). */
  numUs: String.raw`[+-]?((\d{1,3}(,\d{3})+|\d+)(\.\d+)?|\.\d+)([eE][+-]?\d+)?`,
  /** Angka gaya ID: ribuan titik, desimal koma. */
  numId: String.raw`[+-]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?`,
  /** Bukti kuat ID: ≥ 2 grup titik, grup titik + koma, atau koma desimal bukan 3 digit. */
  idStrong: String.raw`[+-]?(\d{1,3}(\.\d{3}){2,}(,\d+)?|\d{1,3}(\.\d{3})+,\d+|\d+,(\d{1,2}|\d{4,}))`,
  /** Bukti kuat US: ≥ 2 grup koma, grup koma + titik, atau titik desimal bukan 3 digit. */
  usStrong: String.raw`[+-]?(\d{1,3}(,\d{3}){2,}(\.\d+)?|\d{1,3}(,\d{3})+\.\d+|\d*\.(\d{1,2}|\d{4,})([eE][+-]?\d+)?)`,
  /** Ambigu: 1.234 (ID ribuan / US desimal 3 digit). */
  idWeak: String.raw`[+-]?\d{1,3}\.\d{3}`,
  /** Kode yang tidak boleh menjadi angka: nol di depan (no. HP, kode) atau ≥ 16 digit (NIK, rekening). */
  code: String.raw`[+-]?0\d+|\d{16,}`,
  /** Kandidat tanggal (prafilter murah sebelum strptime). */
  datey: String.raw`\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?`,
};
const BOOL_TRUE = ["true", "ya", "yes"];
const BOOL_FALSE = ["false", "tidak", "no"];

const listLit = (xs: string[]) => `[${xs.map(lit).join(", ")}]`;
const norm = (v: string, loc: NumberLocale) =>
  loc === "id" ? `replace(replace(${v}, '.', ''), ',', '.')` : `replace(${v}, ',', '')`;
/** Nilai DECIMAL(38,6) dari teks ter-trim `v`, atau NULL bila bukan angka pada locale itu. */
const numExpr = (v: string, loc: NumberLocale) =>
  `CASE WHEN regexp_full_match(${v}, ${lit(loc === "id" ? RE.numId : RE.numUs)}) THEN TRY_CAST(${norm(v, loc)} AS DECIMAL(38,6)) END`;
const isInt = (x: string) => `(${x} = trunc(${x}) AND abs(${x}) <= ${MAX_BIGINT})`;
/**
 * Format teks selalu ditambah ISO: sel tanggal asli xlsx tersimpan di raw sebagai yyyy-mm-dd, dan
 * kolom Excel sering mencampur sel tanggal asli dengan teks "dd/mm/yyyy". ISO tidak ambigu (tahun 4
 * digit di depan), jadi penggabungan ini tidak mengubah tafsiran hari/bulan format teksnya.
 */
const formatsFor = (f: Exclude<DateFormat, "serial">) =>
  f === "yyyy-mm-dd" ? DATE_FORMATS[f] : [...DATE_FORMATS[f], ...DATE_FORMATS["yyyy-mm-dd"]];
const strptime = (v: string, f: Exclude<DateFormat, "serial">) =>
  `try_strptime(${v}, ${listLit(formatsFor(f))})`;

/** Profil satu kolom (hasil query profileSql). */
export interface Profile {
  col: string;
  /** Nilai non-kosong. */
  n: number;
  distinct: number;
  code: number;
  idStrong: number;
  usStrong: number;
  idWeak: number;
  intUs: number;
  decUs: number;
  intId: number;
  decId: number;
  /** Lolos per format tanggal teks. */
  date: Record<Exclude<DateFormat, "serial">, number>;
  /** Bernilai jam ≠ 00:00:00 per format tanggal teks. */
  time: Record<Exclude<DateFormat, "serial">, number>;
  /** Nilai yyyy-mm-dd sebelum 1900-03-01: hasil parser untuk format durasi Excel ([h]:mm). */
  duration: number;
  bool: number;
}

const dateAlias = (f: string, p: string) => `${p}_${f.replace(/[^a-z]/g, "")}`;

/**
 * SQL profil kolom atas raw.parquet (baris data = _row > headerRow). Satu baris hasil per kolom yang
 * punya nilai non-kosong; kolom tanpa nilai tidak muncul.
 */
export function profileSql(rawPath: string, cols: string[], headerRow: number): string {
  const dateCols = TEXT_DATE_FORMATS.map(
    (f) => `CASE WHEN datey THEN ${strptime("v", f)} END AS ${dateAlias(f, "p")}`,
  ).join(",\n      ");
  const dateAggs = TEXT_DATE_FORMATS.map(
    (f) =>
      `count(${dateAlias(f, "p")}) AS ${dateAlias(f, "d")},
    count(*) FILTER (WHERE CAST(${dateAlias(f, "p")} AS TIME) <> TIME '00:00:00') AS ${dateAlias(f, "t")}`,
  ).join(",\n    ");
  return `
WITH src AS (
  SELECT ${cols.map(ident).join(", ")} FROM read_parquet(${lit(rawPath)}) WHERE _row > ${Math.trunc(headerRow)}
),
long AS (UNPIVOT src ON ${cols.map(ident).join(", ")} INTO NAME col VALUE raw),
f AS (
  SELECT col, v,
      regexp_full_match(v, ${lit(RE.code)}) AS code,
      ${numExpr("v", "us")} AS nus,
      ${numExpr("v", "id")} AS nid,
      regexp_full_match(v, ${lit(RE.datey)}) AS datey,
      ${dateCols},
      lower(v) AS lv
  FROM (SELECT col, trim(raw) AS v FROM long) WHERE v <> ''
)
SELECT col,
    count(*) AS n,
    approx_count_distinct(v) AS distinct_n,
    count(*) FILTER (WHERE code) AS code,
    count(*) FILTER (WHERE regexp_full_match(v, ${lit(RE.idStrong)})) AS id_strong,
    count(*) FILTER (WHERE regexp_full_match(v, ${lit(RE.usStrong)})) AS us_strong,
    count(*) FILTER (WHERE regexp_full_match(v, ${lit(RE.idWeak)})) AS id_weak,
    count(nus) AS dec_us,
    count(*) FILTER (WHERE ${isInt("nus")}) AS int_us,
    count(nid) AS dec_id,
    count(*) FILTER (WHERE ${isInt("nid")}) AS int_id,
    ${dateAggs},
    count(*) FILTER (WHERE ${dateAlias("yyyy-mm-dd", "p")} < TIMESTAMP '1900-03-01') AS dur,
    count(*) FILTER (WHERE lv IN (${[...BOOL_TRUE, ...BOOL_FALSE].map(lit).join(", ")})) AS bool
FROM f
GROUP BY col`;
}

/**
 * Kolom dengan perkiraan unik ≤ batas ini dihitung pasti (pass kedua, memori kecil): HyperLogLog
 * meleset justru pada kolom kecil (8 nilai terbaca 9), yang paling sering dilihat user.
 */
export const EXACT_DISTINCT_MAX = 10_000;

/** SQL jumlah unik pasti untuk kolom tertentu (definisi nilai sama dengan profileSql). */
export function exactDistinctSql(rawPath: string, cols: string[], headerRow: number): string {
  return `
SELECT col, count(DISTINCT v) AS distinct_n FROM (
  SELECT col, trim(raw) AS v FROM (
    UNPIVOT (SELECT ${cols.map(ident).join(", ")} FROM read_parquet(${lit(rawPath)}) WHERE _row > ${Math.trunc(headerRow)})
    ON ${cols.map(ident).join(", ")} INTO NAME col VALUE raw
  )
) WHERE v <> '' GROUP BY col`;
}

/** Baris hasil profileSql (objek DuckDB, angka BIGINT) → Profile. */
export function toProfile(r: Record<string, unknown>): Profile {
  const num = (k: string) => Number(r[k] ?? 0);
  const per = (p: string) =>
    Object.fromEntries(TEXT_DATE_FORMATS.map((f) => [f, num(dateAlias(f, p))])) as Profile["date"];
  return {
    col: String(r.col),
    n: num("n"),
    distinct: num("distinct_n"),
    code: num("code"),
    idStrong: num("id_strong"),
    usStrong: num("us_strong"),
    idWeak: num("id_weak"),
    intUs: num("int_us"),
    decUs: num("dec_us"),
    intId: num("int_id"),
    decId: num("dec_id"),
    date: per("d"),
    time: per("t"),
    duration: num("dur"),
    bool: num("bool"),
  };
}

/**
 * Locale angka per kolom. Bukti kuat menang mayoritas. Bila seri (biasanya keduanya 0): CSV → ID bila
 * ada pola 1.234 (ribuan ID, sesuai ekspor Excel berlocale Indonesia), xlsx → US karena angka asli
 * xlsx selalu berbentuk kanonik (String(1.234) = "1.234" adalah desimal, bukan ribuan).
 */
export function pickLocale(p: Profile, source: SourceKind): NumberLocale {
  if (p.idStrong !== p.usStrong) return p.idStrong > p.usStrong ? "id" : "us";
  if (source === "csv" && p.idWeak > 0) return "id";
  return "us";
}

const passes = (ok: number, n: number) => n > 0 && ok / n >= INFER_THRESHOLD;

/** Jumlah nilai yang lolos konversi untuk pilihan tipe/locale/format tertentu. */
export function okCount(
  p: Profile,
  type: ColumnType,
  locale: NumberLocale = "us",
  format?: DateFormat,
): number {
  switch (type) {
    case "text":
      return p.n;
    case "integer":
      return locale === "id" ? p.intId : p.intUs;
    case "decimal":
      return locale === "id" ? p.decId : p.decUs;
    case "boolean":
      return p.bool;
    case "duration":
      return format === undefined || format === "yyyy-mm-dd" ? p.duration : 0;
    case "date":
    case "timestamp":
      if (format === "serial") return p.decUs;
      return format ? p.date[format] : 0;
  }
}

export interface Inferred {
  type: ColumnType;
  numberLocale?: NumberLocale;
  dateFormat?: DateFormat;
}

/** Keputusan tipe dari profil (urutan kandidat dan ambang 98%, lihat atas). */
export function decide(p: Profile | undefined, source: SourceKind): Inferred {
  if (!p || p.n === 0) return { type: "text" };
  const locale = pickLocale(p, source);
  // Kode bernol-depan / ≥ 16 digit tetap teks: menjadikannya angka menghilangkan informasi.
  if (p.code === 0) {
    if (passes(okCount(p, "integer", locale), p.n))
      return { type: "integer", numberLocale: locale };
    if (passes(okCount(p, "decimal", locale), p.n))
      return { type: "decimal", numberLocale: locale };
  }
  let best: Exclude<DateFormat, "serial"> | null = null;
  for (const f of TEXT_DATE_FORMATS) if (best === null || p.date[f] > p.date[best]) best = f;
  if (best && passes(p.date[best], p.n)) {
    // Format durasi Excel ([h]:mm) diubah parser menjadi tanggal sekitar 1899-12-30.
    if (best === "yyyy-mm-dd" && passes(p.duration, p.n)) {
      return { type: "duration", dateFormat: best };
    }
    return { type: p.time[best] > 0 ? "timestamp" : "date", dateFormat: best };
  }
  if (passes(p.bool, p.n)) return { type: "boolean" };
  return { type: "text" };
}

/**
 * Ekspresi SQL kolom bertipe dari kolom raw `col` (VARCHAR). Teks dipertahankan apa adanya; tipe
 * lain dari nilai ter-trim. Gagal konversi → NULL.
 */
export function typedExpr(col: string, s: Inferred): string {
  const raw = ident(col);
  const v = `trim(${raw})`;
  const loc = s.numberLocale ?? "us";
  switch (s.type) {
    case "text":
      return raw;
    case "integer": {
      const x = numExpr(v, loc);
      return `CASE WHEN ${isInt(x)} THEN CAST(${x} AS BIGINT) END`;
    }
    case "decimal":
      return numExpr(v, loc);
    case "boolean":
      return `CASE WHEN lower(${v}) IN (${BOOL_TRUE.map(lit).join(", ")}) THEN true WHEN lower(${v}) IN (${BOOL_FALSE.map(lit).join(", ")}) THEN false END`;
    case "duration": {
      // Detik sejak epoch Excel (1899-12-30) = panjang durasi; sama dengan hitungan profil (< 1900-03-01).
      const ts = strptime(v, "yyyy-mm-dd");
      return `CASE WHEN ${ts} < TIMESTAMP '1900-03-01' THEN date_diff('second', TIMESTAMP '1899-12-30', ${ts}) END`;
    }
    case "date":
    case "timestamp": {
      const f = s.dateFormat ?? "yyyy-mm-dd";
      if (f === "serial") {
        const x = numExpr(v, "us");
        return s.type === "date"
          ? `CAST(DATE '1899-12-30' + CAST(floor(${x}) AS INTEGER) AS DATE)`
          : `TIMESTAMP '1899-12-30' + to_microseconds(CAST(round(${x} * 86400000000) AS BIGINT))`;
      }
      const ts = strptime(v, f);
      return s.type === "date" ? `CAST(${ts} AS DATE)` : ts;
    }
  }
}
