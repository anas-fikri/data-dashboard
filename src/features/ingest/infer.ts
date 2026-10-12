/*
 * Inferensi tipe kolom (T-007, alur B3 tahap typed). Murni: membangun SQL DuckDB dan memutuskan tipe
 * dari profil; eksekusi ada di typed.ts.
 *
 * Profil dihitung atas raw.parquet dalam format long (UNPIVOT kolom → baris) sehingga jumlah agregat
 * tetap berapa pun lebar sheet. Urutan kandidat: bilangan bulat → desimal → tanggal/waktu → boolean
 * literal → teks; terpilih bila ≥ 98% nilai non-kosong lolos. Nilai yang gagal menjadi NULL dan
 * dihitung (castFailCount).
 *
 * Prinsip: hitungan profil (okCount) dan ekspresi konversi (typedParts) memakai predikat yang sama,
 * sehingga castFailCount selalu sama dengan jumlah NULL baru di typed.parquet. Nilai yang tidak bisa
 * disimpan persis (pembulatan, tahun 0026) dihitung gagal, tidak diubah diam-diam.
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
type TextDateFormat = Exclude<DateFormat, "serial">;

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
  /** Desimal disimpan DOUBLE (ada nilai > 6 digit pecahan atau notasi eksponen); selain itu DECIMAL(38,6). */
  float?: boolean;
  hidden: boolean;
  /** Proporsi sel kosong di baris data (0–1). */
  nullPct: number;
  /** Jumlah nilai unik teks asli (pasti bila ≤ EXACT_DISTINCT_MAX, selain itu perkiraan HyperLogLog). */
  distinctCount: number;
  /** Nilai non-kosong yang gagal dikonversi ke tipe kolom (menjadi NULL). */
  castFailCount: number;
}

export const INFER_THRESHOLD = 0.98;
/** Porsi nilai berbentuk kode (nol di depan, ≥ 16 digit) yang membuat kolom tetap teks. */
const CODE_SHARE_MAX = 0.02;
/** Nomor seri Excel terbesar (9999-12-31). */
const SERIAL_MAX = 2_958_466;

/**
 * Keluarga format tanggal teks: urutan hari/bulan/tahun dan pemisah. Urutan objek = urutan preferensi
 * saat seri: hari-di-depan sebelum bulan-di-depan (03/01/2026 → 3 Januari).
 */
export const DATE_FORMATS: Record<
  TextDateFormat,
  { order: "iso" | "dmy" | "ymd" | "mdy"; sep: string }
> = {
  "yyyy-mm-dd": { order: "iso", sep: "-" },
  "dd/mm/yyyy": { order: "dmy", sep: "/" },
  "dd-mm-yyyy": { order: "dmy", sep: "-" },
  "dd.mm.yyyy": { order: "dmy", sep: "." },
  "yyyy/mm/dd": { order: "ymd", sep: "/" },
  "mm/dd/yyyy": { order: "mdy", sep: "/" },
};
const TEXT_DATE_FORMATS = Object.keys(DATE_FORMATS) as TextDateFormat[];
const ISO_FORMATS = [
  "%Y-%m-%d",
  "%Y-%m-%dT%H:%M:%S",
  "%Y-%m-%d %H:%M:%S",
  "%Y-%m-%dT%H:%M",
  "%Y-%m-%d %H:%M",
];

/* Pola (RE2, dicocokkan penuh pada nilai yang sudah di-trim). */
const RE = {
  /** Angka gaya US: ribuan koma, desimal titik, eksponen (angka asli xlsx selalu bentuk ini). */
  numUs: String.raw`[+-]?((\d{1,3}(,\d{3})+|\d+)(\.\d+)?|\.\d+)([eE][+-]?\d+)?`,
  /** Angka gaya ID: ribuan titik (grup pertama tidak diawali 0), desimal koma. */
  numId: String.raw`[+-]?([1-9]\d{0,2}(\.\d{3})+|\d+)(,\d+)?`,
  /** Bilangan bulat persis (pecahan hanya nol) per locale. */
  intUs: String.raw`[+-]?(\d{1,3}(,\d{3})+|\d+)(\.0+)?`,
  intId: String.raw`[+-]?([1-9]\d{0,2}(\.\d{3})+|\d+)(,0+)?`,
  /** Bukti kuat ID: ≥ 2 grup titik, grup titik + koma, atau koma desimal bukan 3 digit. */
  idStrong: String.raw`[+-]?([1-9]\d{0,2}(\.\d{3}){2,}(,\d+)?|[1-9]\d{0,2}(\.\d{3})+,\d+|\d+,(\d{1,2}|\d{4,}))`,
  /**
   * Grup titik berakhir 0 ("15.000"). Di xlsx ini bukti kuat ID: angka asli (String(number)) tidak
   * pernah berakhir 0 di pecahan, jadi bentuk ini pasti teks ribuan. Di CSV tidak (alat ekspor sering
   * menulis "1.250" sebagai desimal 3 digit).
   */
  idText0: String.raw`[+-]?[1-9]\d{0,2}(\.\d{3})*\.\d\d0`,
  /** Bukti kuat US: ≥ 2 grup koma, grup koma + titik, titik desimal bukan 3 digit, 0.xxx, eksponen. */
  usStrong: String.raw`[+-]?(\d{1,3}(,\d{3}){2,}(\.\d+)?|\d{1,3}(,\d{3})+\.\d+|\d*\.(\d{1,2}|\d{4,})([eE][+-]?\d+)?|0\.\d+|\d+(\.\d+)?[eE][+-]?\d+)`,
  /** Ambigu: 1.234 (ID ribuan / US desimal 3 digit). */
  idWeak: String.raw`[+-]?[1-9]\d{0,2}\.\d{3}`,
  /** Tidak muat persis di DECIMAL(38,6): > 6 digit pecahan atau eksponen. */
  wideUs: String.raw`\.\d{7}|[eE]`,
  wideId: String.raw`,\d{7}`,
  /** Kode yang tidak boleh menjadi angka: nol di depan (no. HP, kode) atau ≥ 16 digit (NIK, rekening). */
  code: String.raw`[+-]?0\d+|\d{16,}`,
  /** Bentuk angka (prafilter murah: superset semua pola angka di atas; teks biasa tidak lolos). */
  numy: String.raw`[+-]?[0-9.,]*[0-9][0-9.,]*([eE][+-]?[0-9]+)?`,
  /** Kandidat tanggal (prafilter murah sebelum strptime; dipakai juga di konversi). */
  datey: String.raw`\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}([ T]\d{1,2}:\d{1,2}(:\d{1,2})?)?`,
};
const BOOL_TRUE = ["true", "ya", "yes"];
const BOOL_FALSE = ["false", "tidak", "no"];

const listLit = (xs: string[]) => `[${xs.map(lit).join(", ")}]`;
const match = (v: string, re: string) => `regexp_full_match(${v}, ${lit(re)})`;
const norm = (v: string, loc: NumberLocale) =>
  loc === "id" ? `replace(replace(${v}, '.', ''), ',', '.')` : `replace(${v}, ',', '')`;
/** Bilangan bulat persis dari teks ter-trim, atau NULL. */
const intExpr = (v: string, loc: NumberLocale) =>
  `CASE WHEN ${match(v, loc === "id" ? RE.intId : RE.intUs)} THEN TRY_CAST(${norm(v, loc)} AS BIGINT) END`;
/** Desimal dari teks ter-trim (DECIMAL(38,6) atau DOUBLE), atau NULL bila bukan angka locale itu. */
const numExpr = (v: string, loc: NumberLocale, float = false) =>
  `CASE WHEN ${match(v, loc === "id" ? RE.numId : RE.numUs)} THEN TRY_CAST(${norm(v, loc)} AS ${float ? "DOUBLE" : "DECIMAL(38,6)"}) END`;
/**
 * Nilai yang tidak muat persis di DECIMAL(38,6) (dihitung gagal bila kolom disimpan DECIMAL).
 * Pencocokan sebagian (mengandung pola), lebih murah daripada pola penuh berawalan .*.
 */
const wideExpr = (v: string, loc: NumberLocale) =>
  `regexp_matches(${v}, ${lit(loc === "id" ? RE.wideId : RE.wideUs)})`;
/** DECIMAL hanya untuk nilai yang muat persis; DOUBLE untuk semua angka. */
const decExpr = (v: string, loc: NumberLocale, float: boolean) =>
  float ? numExpr(v, loc, true) : `CASE WHEN NOT ${wideExpr(v, loc)} THEN ${numExpr(v, loc)} END`;

/**
 * Bentuk nilai tanggal (dihitung sekali per nilai): ISO, tahun di depan, pemisah pertama, panjang
 * tahun di akhir (2/4), dan jam (0 = tanpa, 1 = jam:menit, 2 = jam:menit:detik). Dipakai untuk memilih
 * tepat satu format strptime konstan: mencoba daftar format per nilai (6 keluarga × ± 11 format)
 * membuat tahap typed ± 4× lebih lambat (review T-007 N2).
 */
interface DateShape {
  iso: string;
  first4: string;
  sep: string;
  ysz: string;
  tm: string;
}
const shapeOf = (v: string): DateShape => ({
  iso: match(v, String.raw`\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{1,2}(:\d{1,2})?)?`),
  first4: match(v, String.raw`\d{4}[-/.].*`),
  sep: `regexp_extract(${v}, ${lit(String.raw`^\d{1,4}([-/.])`)}, 1)`,
  ysz: `length(regexp_extract(${v}, ${lit(String.raw`^\d{1,4}[-/.]\d{1,2}[-/.](\d{1,4})`)}, 1))`,
  tm: `CASE WHEN ${match(v, String.raw`.* \d{1,2}:\d{1,2}:\d{1,2}`)} THEN 2 WHEN ${match(v, String.raw`.* \d{1,2}:\d{1,2}`)} THEN 1 ELSE 0 END`,
});
const TIME = ["", " %H:%M", " %H:%M:%S"];
const isoParse = (v: string) => `try_strptime(${v}, ${listLit(ISO_FORMATS)})`;

/**
 * TIMESTAMP mentah satu keluarga format dari nilai `v` berbentuk `s`; `iso` = hasil parse ISO nilai
 * itu. Format teks selalu menerima ISO: sel tanggal asli xlsx tersimpan di raw sebagai yyyy-mm-dd dan
 * kolom Excel sering mencampurnya dengan teks "dd/mm/yyyy"; ISO tidak ambigu, jadi tafsiran hari/bulan
 * format teks tidak berubah. Tahun 2 digit → %y (%Y DuckDB menerima 1–4 digit: "26" → tahun 0026).
 */
function familyParse(v: string, f: TextDateFormat, s: DateShape, iso: string): string {
  const { order, sep } = DATE_FORMATS[f];
  if (order === "iso") return `CASE WHEN ${s.iso} THEN ${iso} END`;
  const whens: string[] = [];
  for (const y of order === "ymd" ? [4] : [2, 4]) {
    const Y = y === 2 ? "%y" : "%Y";
    const d =
      order === "dmy"
        ? `%d${sep}%m${sep}${Y}`
        : order === "mdy"
          ? `%m${sep}%d${sep}${Y}`
          : `%Y${sep}%m${sep}%d`;
    TIME.forEach((t, tm) => {
      const code = order === "ymd" ? tm : y * 10 + tm;
      whens.push(`WHEN ${code} THEN try_strptime(${v}, ${lit(d + t)})`);
    });
  }
  const code = order === "ymd" ? s.tm : `(${s.ysz} * 10 + ${s.tm})`;
  const shapeOk = `${order === "ymd" ? "" : "NOT "}${s.first4} AND ${s.sep} = ${lit(sep)}`;
  return `CASE WHEN ${s.iso} THEN ${iso} WHEN ${shapeOk} THEN CASE ${code} ${whens.join(" ")} END END`;
}

/** TIMESTAMP mentah dari teks ter-trim untuk konversi (prafilter bentuk tanggal; penjaga = dateOk). */
const dateParse = (v: string, f: TextDateFormat) =>
  `CASE WHEN ${match(v, RE.datey)} THEN ${familyParse(v, f, shapeOf(v), isoParse(v))} END`;
const dateOk = (ts: string) => `year(${ts}) >= 1000`;
/** Durasi Excel ([h]:mm): parser mengubahnya menjadi tanggal 1899-12-30 s.d. sebelum 1900-03-01. */
const isDuration = (ts: string) =>
  `(${ts} >= TIMESTAMP '1899-12-30' AND ${ts} < TIMESTAMP '1900-03-01')`;
/** Nomor seri Excel (angka DOUBLE US) dalam rentang tanggal Excel. */
const serialOk = (x: string) => `(${x} >= 0 AND ${x} < ${SERIAL_MAX})`;

/** Profil satu kolom (hasil query profileSql). */
export interface Profile {
  col: string;
  /** Nilai non-kosong. */
  n: number;
  distinct: number;
  /** Total karakter nilai non-kosong (untuk ukuran row group). */
  chars: number;
  code: number;
  idStrong: number;
  usStrong: number;
  idWeak: number;
  idText0: number;
  intUs: number;
  intId: number;
  /** Angka (DOUBLE) per locale. */
  numUs: number;
  numId: number;
  /** Angka yang tidak muat persis di DECIMAL(38,6) per locale. */
  wideUs: number;
  wideId: number;
  /** Angka yang muat di DECIMAL(38,6) per locale. */
  decUs: number;
  decId: number;
  serial: number;
  /** Lolos per format tanggal teks. */
  date: Record<TextDateFormat, number>;
  /** Bernilai jam ≠ 00:00:00 per format tanggal teks. */
  time: Record<TextDateFormat, number>;
  /** Nilai durasi Excel (lihat isDuration). */
  duration: number;
  bool: number;
}

/** Alias kolom per format (indeks: "dd/mm", "dd-mm", "dd.mm" berbeda hanya di pemisah). */
const dateAlias = (f: TextDateFormat, p: string) => `${p}_f${TEXT_DATE_FORMATS.indexOf(f)}`;

/**
 * SQL profil kolom atas raw.parquet (baris data = _row > headerRow). Satu baris hasil per kolom yang
 * punya nilai non-kosong; kolom tanpa nilai tidak muncul. Pemanggil membatasi jumlah kolom per query.
 */
export function profileSql(rawPath: string, cols: string[], headerRow: number): string {
  // Tiga agregasi bersaring WHERE (selection vector): ekspresi angka hanya untuk nilai berbentuk angka,
  // parse tanggal hanya untuk bentuk tanggal. CASE/AND dalam proyeksi tidak cukup: pengoptimal
  // menulis ulang CASE … ELSE false menjadi AND yang mengevaluasi kedua sisi untuk semua baris.
  const shape: DateShape = { iso: "s_iso", first4: "s_f4", sep: "s_sep", ysz: "s_ysz", tm: "s_tm" };
  const shapeCols = (Object.entries(shapeOf("v")) as [keyof DateShape, string][])
    .map(([k, e]) => `${e} AS ${shape[k]}`)
    .join(",\n      ");
  const dateCols = TEXT_DATE_FORMATS.map(
    (f) => `${familyParse("v", f, shape, "p_iso")} AS ${dateAlias(f, "p")}`,
  ).join(",\n      ");
  const dateAggs = TEXT_DATE_FORMATS.map((f) => {
    const a = dateAlias(f, "p");
    return `count(*) FILTER (WHERE ${dateOk(a)}) AS ${dateAlias(f, "d")},
    count(*) FILTER (WHERE ${dateOk(a)} AND CAST(${a} AS TIME) <> TIME '00:00:00') AS ${dateAlias(f, "t")}`;
  }).join(",\n    ");
  const iso = dateAlias("yyyy-mm-dd", "p");
  const numOut = [
    "code",
    "id_strong",
    "us_strong",
    "id_weak",
    "id_text0",
    "int_us",
    "int_id",
    "num_us",
    "num_id",
    "wide_us",
    "wide_id",
    "dec_us",
    "dec_id",
    "ser",
  ];
  const dateOut = [
    ...TEXT_DATE_FORMATS.flatMap((f) => [dateAlias(f, "d"), dateAlias(f, "t")]),
    "dur",
  ];
  return `
WITH src AS (
  SELECT ${cols.map(ident).join(", ")} FROM read_parquet(${lit(rawPath)}) WHERE _row > ${Math.trunc(headerRow)}
),
long AS (UNPIVOT src ON ${cols.map(ident).join(", ")} INTO NAME col VALUE raw),
f AS (SELECT col, v FROM (SELECT col, trim(raw) AS v FROM long) WHERE v <> ''),
base AS (
  SELECT col,
      count(*) AS n,
      approx_count_distinct(v) AS distinct_n,
      sum(length(v)) AS chars,
      count(*) FILTER (WHERE lower(v) IN (${[...BOOL_TRUE, ...BOOL_FALSE].map(lit).join(", ")})) AS bool
  FROM f GROUP BY col
),
nf AS (
  SELECT col, v,
      ${match("v", RE.code)} AS code,
      ${match("v", RE.idStrong)} AS ids,
      ${match("v", RE.usStrong)} AS uss,
      ${match("v", RE.idWeak)} AS idw,
      ${match("v", RE.idText0)} AS idt,
      ${numExpr("v", "us", true)} AS nus,
      ${numExpr("v", "id", true)} AS nid,
      ${wideExpr("v", "us")} AS wus,
      ${wideExpr("v", "id")} AS wid,
      ${intExpr("v", "us")} AS ius,
      ${intExpr("v", "id")} AS iid
  FROM f WHERE ${match("v", RE.numy)}
),
num AS (
  SELECT col,
      count(*) FILTER (WHERE code) AS code,
      count(*) FILTER (WHERE ids) AS id_strong,
      count(*) FILTER (WHERE uss) AS us_strong,
      count(*) FILTER (WHERE idw) AS id_weak,
      count(*) FILTER (WHERE idt) AS id_text0,
      count(ius) AS int_us,
      count(iid) AS int_id,
      count(nus) AS num_us,
      count(nid) AS num_id,
      count(*) FILTER (WHERE nus IS NOT NULL AND wus) AS wide_us,
      count(*) FILTER (WHERE nid IS NOT NULL AND wid) AS wide_id,
      count(*) FILTER (WHERE nus IS NOT NULL AND NOT wus AND TRY_CAST(${norm("v", "us")} AS DECIMAL(38,6)) IS NOT NULL) AS dec_us,
      count(*) FILTER (WHERE nid IS NOT NULL AND NOT wid AND TRY_CAST(${norm("v", "id")} AS DECIMAL(38,6)) IS NOT NULL) AS dec_id,
      count(*) FILTER (WHERE ${serialOk("nus")}) AS ser
  FROM nf GROUP BY col
),
df AS (
  SELECT col, v,
      ${shapeCols}
  FROM f WHERE ${match("v", RE.datey)}
),
dh AS (SELECT *, CASE WHEN s_iso THEN ${isoParse("v")} END AS p_iso FROM df),
di AS (
  SELECT col,
      ${dateCols}
  FROM dh
),
dt AS (
  SELECT col,
    ${dateAggs},
    count(*) FILTER (WHERE ${dateOk(iso)} AND ${isDuration(iso)}) AS dur
  FROM di GROUP BY col
)
SELECT base.*,
    ${numOut.map((c) => `coalesce(num.${c}, 0) AS ${c}`).join(", ")},
    ${dateOut.map((c) => `coalesce(dt.${c}, 0) AS ${c}`).join(", ")}
FROM base LEFT JOIN num USING (col) LEFT JOIN dt USING (col)`;
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
    chars: num("chars"),
    code: num("code"),
    idStrong: num("id_strong"),
    usStrong: num("us_strong"),
    idWeak: num("id_weak"),
    idText0: num("id_text0"),
    intUs: num("int_us"),
    intId: num("int_id"),
    numUs: num("num_us"),
    numId: num("num_id"),
    wideUs: num("wide_us"),
    wideId: num("wide_id"),
    decUs: num("dec_us"),
    decId: num("dec_id"),
    serial: num("ser"),
    date: per("d"),
    time: per("t"),
    duration: num("dur"),
    bool: num("bool"),
  };
}

/**
 * Locale angka per kolom. Bukti kuat menang mayoritas (xlsx: "15.000" ikut bukti ID, lihat idText0).
 * Bila seri (biasanya keduanya 0): CSV → ID bila ada pola 1.234 (ribuan ID, sesuai ekspor Excel
 * berlocale Indonesia), xlsx → US karena angka asli xlsx selalu berbentuk kanonik (String(1.234) =
 * "1.234" adalah desimal, bukan ribuan).
 */
export function pickLocale(p: Profile, source: SourceKind): NumberLocale {
  const id = p.idStrong + (source === "xlsx" ? p.idText0 : 0);
  if (id !== p.usStrong) return id > p.usStrong ? "id" : "us";
  if (source === "csv" && p.idWeak > 0) return "id";
  return "us";
}

/** Disimpan DOUBLE bila ada angka yang tidak muat persis di DECIMAL(38,6). */
export const needsFloat = (p: Profile, locale: NumberLocale) =>
  (locale === "id" ? p.wideId : p.wideUs) > 0;

const passes = (ok: number, n: number) => n > 0 && ok / n >= INFER_THRESHOLD;

/** Jumlah nilai yang lolos konversi untuk pilihan tipe/locale/format tertentu (= non-NULL di typed). */
export function okCount(p: Profile, s: Inferred): number {
  const id = s.numberLocale === "id";
  switch (s.type) {
    case "text":
      return p.n;
    case "integer":
      return id ? p.intId : p.intUs;
    case "decimal":
      if (s.float) return id ? p.numId : p.numUs;
      return id ? p.decId : p.decUs;
    case "boolean":
      return p.bool;
    case "duration":
      return p.duration;
    case "date":
    case "timestamp":
      if (s.dateFormat === "serial") return p.serial;
      return p.date[s.dateFormat ?? "yyyy-mm-dd"];
  }
}

export interface Inferred {
  type: ColumnType;
  numberLocale?: NumberLocale;
  dateFormat?: DateFormat;
  float?: boolean;
}

/** Keputusan tipe dari profil (urutan kandidat dan ambang 98%, lihat atas). */
export function decide(p: Profile | undefined, source: SourceKind): Inferred {
  if (!p || p.n === 0) return { type: "text" };
  const locale = pickLocale(p, source);
  // Kolom berisi kode (nol di depan / ≥ 16 digit) lebih dari 2% tetap teks: menjadikannya angka
  // menghilangkan informasi. Di bawah itu, kode yang tetap berupa angka sah dikonversi.
  if (p.code / p.n <= CODE_SHARE_MAX) {
    const nums = locale === "id" ? p.numId : p.numUs;
    if (passes(nums, p.n)) {
      // Bulat hanya bila semua angka bulat: 1 nilai 2,5 di antara bilangan bulat → desimal.
      if ((locale === "id" ? p.intId : p.intUs) === nums) {
        return { type: "integer", numberLocale: locale };
      }
      const float = needsFloat(p, locale);
      return float
        ? { type: "decimal", numberLocale: locale, float }
        : { type: "decimal", numberLocale: locale };
    }
  }
  let best: TextDateFormat | null = null;
  for (const f of TEXT_DATE_FORMATS) if (best === null || p.date[f] > p.date[best]) best = f;
  if (best && passes(p.date[best], p.n)) {
    // Format durasi Excel ([h]:mm) hanya mungkin dari sel xlsx; CSV "1900-01-01" tetap tanggal.
    if (source === "xlsx" && best === "yyyy-mm-dd" && passes(p.duration, p.n)) {
      return { type: "duration" };
    }
    return { type: p.time[best] > 0 ? "timestamp" : "date", dateFormat: best };
  }
  if (passes(p.bool, p.n)) return { type: "boolean" };
  return { type: "text" };
}

/**
 * Ekspresi SQL kolom bertipe dari kolom raw `col` (VARCHAR), dua tahap agar parse dilakukan sekali:
 * `inner` dihitung di subquery (alias), `outer(alias)` menerapkan penjaga pada hasilnya. Teks
 * dipertahankan apa adanya (sel berisi spasi saja → NULL, sama dengan profil); tipe lain dari nilai
 * ter-trim. Gagal konversi → NULL (predikat sama dengan okCount).
 */
export function typedParts(
  col: string,
  s: Inferred,
): { inner: string; outer: (a: string) => string } {
  const raw = ident(col);
  const v = `trim(${raw})`;
  const loc = s.numberLocale ?? "us";
  const same = (a: string) => a;
  switch (s.type) {
    case "text":
      return { inner: raw, outer: (a) => `CASE WHEN trim(${a}) <> '' THEN ${a} END` };
    case "integer":
      return { inner: intExpr(v, loc), outer: same };
    case "decimal":
      return { inner: decExpr(v, loc, s.float ?? false), outer: same };
    case "boolean":
      return {
        inner: `CASE WHEN lower(${v}) IN (${BOOL_TRUE.map(lit).join(", ")}) THEN true WHEN lower(${v}) IN (${BOOL_FALSE.map(lit).join(", ")}) THEN false END`,
        outer: same,
      };
    case "duration":
      // Detik sejak epoch Excel (1899-12-30) = panjang durasi.
      return {
        inner: dateParse(v, "yyyy-mm-dd"),
        outer: (a) =>
          `CASE WHEN ${dateOk(a)} AND ${isDuration(a)} THEN date_diff('second', TIMESTAMP '1899-12-30', ${a}) END`,
      };
    case "date":
    case "timestamp": {
      const f = s.dateFormat ?? "yyyy-mm-dd";
      if (f === "serial") {
        return {
          inner: numExpr(v, "us", true),
          outer: (a) =>
            s.type === "date"
              ? `CASE WHEN ${serialOk(a)} THEN CAST(DATE '1899-12-30' + CAST(floor(${a}) AS INTEGER) AS DATE) END`
              : `CASE WHEN ${serialOk(a)} THEN TIMESTAMP '1899-12-30' + to_microseconds(CAST(round(${a} * 86400000000) AS BIGINT)) END`,
        };
      }
      return {
        inner: dateParse(v, f),
        outer: (a) =>
          `CASE WHEN ${dateOk(a)} THEN ${s.type === "date" ? `CAST(${a} AS DATE)` : a} END`,
      };
    }
  }
}
