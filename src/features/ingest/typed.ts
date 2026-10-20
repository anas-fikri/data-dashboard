/*
 * Tahap typed (T-007): raw.parquet → typed-<rev>.parquet + skema kolom. Dipakai ingest (rev 1, tipe
 * hasil inferensi) dan recast (rev berikutnya, tipe pilihan user menimpa hasil inferensi).
 * typed.parquet: _row (nomor baris fisik) + c<pos> bertipe, hanya baris data (_row > headerRow).
 */
import { lit, watched, type Duck } from "@/lib/duckdb";
import type { RawValue } from "@/lib/xlsx/types";
import { columnNames, type ColumnMeta } from "./header";
import {
  decide,
  EXACT_DISTINCT_MAX,
  exactDistinctSql,
  needsFloat,
  okCount,
  pickLocale,
  profileSqls,
  sqlType,
  toProfile,
  typedParts,
  type ColumnSchema,
  type DateFormat,
  type Inferred,
  type NumberLocale,
  type ColumnType,
  type Profile,
  type SourceKind,
  DATE_FORMATS,
} from "./infer";
import { copyParquet, rowGroupFor } from "./raw-writer";
import { isIsoDate } from "./period";
import { packProfile, type RawProfile, type StoredProfile } from "./profile";

/**
 * Kolom per query profil/unik: memori agregasi (terutama count DISTINCT) tumbuh per kolom; sheet
 * 1.024 kolom × sel 64 karakter OOM di 1 GB bila diprofil sekaligus (review T-007 M6).
 */
const PROFILE_BATCH = 256;

/** Pilihan user per kolom (recast, T-008); field kosong = pakai hasil inferensi. */
export interface ColumnOverride {
  pos: number;
  name?: string;
  type?: ColumnType;
  numberLocale?: NumberLocale;
  dateFormat?: DateFormat;
  hidden?: boolean;
}

/**
 * Pilihan yang sudah berlaku di satu kolom skema (nama tampil, tipe, locale, format, sembunyi) sebagai
 * override untuk posisi `pos` (recast: posisi sama; versi refresh: posisi kolom di file baru).
 */
export const choiceOf = (c: ColumnSchema, pos = c.pos): ColumnOverride => ({
  pos,
  name: c.name,
  type: c.type,
  numberLocale: c.numberLocale,
  dateFormat: c.dateFormat,
  hidden: c.hidden,
});

/**
 * Kolom kosong (absent, T-014): kolom skema aktif yang tidak ada di file. Ditulis setelah kolom nyata
 * (pos = colCount + 1..k, urutan input = urutan posisi aktif) sebagai NULL bertipe; pilihan user (nama,
 * tipe, format, sembunyi) dan judul asli aktif dibawa agar widget dan refresh berikutnya tetap cocok.
 */
export type AbsentColumn = Pick<
  ColumnSchema,
  "name" | "original" | "type" | "numberLocale" | "dateFormat" | "float" | "hidden"
>;

export interface TypedInput {
  rawPath: string;
  outPath: string;
  source: SourceKind;
  headerRow: number;
  colCount: number;
  /** Nama kolom dari baris header ({ pos, name, original }). */
  columns: ColumnMeta[];
  overrides?: ColumnOverride[];
  /** Kolom kosong setelah kolom nyata (T-014). */
  absent?: AbsentColumn[];
  /** Dipanggil berkala selama query panjang; melempar → query diinterupsi. */
  watch: () => Promise<void>;
  /**
   * Awal `_row` segmen (ADR-0008, T-036): typed `_row BIGINT = rowBase + baris fisik` (unik per sheet
   * logis, sama di setiap recast) dan `_src_row` = baris fisik. Bawaan 0.
   */
  rowBase?: bigint;
}

export interface TypedResult {
  schema: ColumnSchema[];
  /** Baris data di typed.parquet. */
  dataRows: number;
  /**
   * Nilai non-kosong per kolom (indeks pos − 1, kolom kosong = 0): penyebut rasio cast versi refresh
   * (T-013); juga disimpan per kolom di skema (T-014).
   */
  nonEmpty: number[];
  /** Profil raw file ini (T-040), disimpan di SegmentTyped.profile. */
  profile: StoredProfile;
}

/** Baris fisik terbesar di raw.parquet (0 bila kosong): rentang `_row` yang dipakai segmen (T-036). */
export async function maxSourceRow(duck: Duck, rawPath: string): Promise<number> {
  const r = await duck.conn.runAndReadAll(
    `SELECT coalesce(max(_row), 0) FROM read_parquet(${lit(rawPath)})`,
  );
  return Number(r.getRows()[0]?.[0] ?? 0);
}

/** `DATE '<iso>'` untuk awal periode yang sudah divalidasi (bukan input bebas). */
function periodLit(period: string): string {
  if (!isIsoDate(period)) throw new Error(`awal periode tidak valid: ${period}`);
  return `DATE '${period}'`;
}

/**
 * Gerbang integritas file typed lokal sebelum diunggah/ditautkan (T-038): jumlah barisnya = baris data
 * raw yang dihitung writeTyped, dan `_row` unik. Segmen periode (T-049, `period` = awal periode):
 * tidak ada `_period` NULL, dan baris periode itu = baris data metadata (satu segmen = satu periode).
 * [] = lolos.
 */
export async function typedFileProblems(
  duck: Duck,
  path: string,
  dataRows: number,
  label: string,
  period?: string | null,
): Promise<string[]> {
  const periodCols = period
    ? `, count(*) FILTER (WHERE _period IS NULL), count(*) FILTER (WHERE _period = ${periodLit(period)})`
    : "";
  let row: unknown[];
  try {
    const r = await duck.conn.runAndReadAll(
      `SELECT count(*), count(DISTINCT _row)${periodCols} FROM read_parquet(${lit(path)})`,
    );
    row = r.getRows()[0] ?? [];
  } catch (e) {
    // File segmen periode tanpa kolom _period: rusak, bukan galat sementara.
    if (period && /_period/.test(e instanceof Error ? e.message : "")) {
      return [`${label}: kolom periode tidak ada di file`];
    }
    throw e;
  }
  const [n, d, nulls, inPeriod] = row.map(Number) as [number, number, number?, number?];
  const out: string[] = [];
  if (n !== dataRows) out.push(`${label}: ${n} baris di file, ${dataRows} baris data di sumber`);
  if (d !== n) out.push(`${label}: ${n - d} nomor baris ganda`);
  if (period) {
    if (nulls) out.push(`${label}: ${nulls} baris data tanpa periode`);
    if (inPeriod !== dataRows) {
      out.push(`${label}: ${inPeriod ?? 0} baris periode ${period}, ${dataRows} baris di metadata`);
    }
  }
  return out;
}

/** Nama kolom dari baris fisik `row` di raw.parquet (header dipilih ulang: recast, versi refresh). */
export async function headerColumns(
  duck: Duck,
  rawPath: string,
  row: number,
  colCount: number,
): Promise<ColumnMeta[]> {
  const r = await duck.conn.runAndReadAll(
    `SELECT * EXCLUDE (_row) FROM read_parquet(${lit(rawPath)}) WHERE _row = ${Math.trunc(row)}`,
  );
  const vals = ((r.getRowsJS()[0] as RawValue[] | undefined) ?? []).map((v) => v ?? null);
  return columnNames(vals, colCount);
}

/**
 * Gabungkan pilihan user dengan inferensi. Hanya field yang relevan dengan tipe yang disimpan (locale
 * untuk angka, format untuk tanggal), sehingga hitungan gagal sama dengan hasil konversi.
 */
function resolve(p: Profile | undefined, source: SourceKind, o?: ColumnOverride): Inferred {
  const inferred = decide(p, source);
  const t = o?.type ?? inferred.type;
  if (t === "integer" || t === "decimal") {
    const numberLocale =
      o?.numberLocale ?? inferred.numberLocale ?? (p ? pickLocale(p, source) : "us");
    // Bukti lemah tafsiran lawan, dihitung dari data setiap kali (termasuk pilihan locale yang dibawa
    // recast). US: ribuan id-ID "1.234" (CSV; xlsx hanya teks berakhiran 0 karena angka asli xlsx kanonik)
    // terbaca desimal (T-030), dan "1,250" tanpa bukti US kuat yang bisa desimal id-ID 3 digit terbaca
    // ribuan (T-baj2) — kecuali kolom juga memuat bilangan bulat pendek tanpa pemisah ("250"), yang cocok
    // dengan ribuan US. id-ID: ribuan US "1,500" terbaca desimal (T-t1g0). Angka asli xlsx tidak pernah
    // memakai koma, jadi bukti koma berlaku untuk kedua sumber.
    const us = numberLocale === "us";
    const dot = p && us ? (source === "csv" ? p.idWeak : p.idText0) : 0;
    const comma = !p ? 0 : us ? (p.usStrong === 0 && p.shortInt === 0 ? p.usWeak : 0) : p.usWeak;
    const kinds = [...(dot > 0 ? ["titik" as const] : []), ...(comma > 0 ? ["koma" as const] : [])];
    const flag =
      dot + comma === 0
        ? {}
        : us && comma > 0
          ? { localeAmbiguous: true as const, ambiguousKinds: kinds }
          : { localeAmbiguous: true as const };
    if (t === "integer") return { type: t, numberLocale, ...flag };
    return p && needsFloat(p, numberLocale)
      ? { type: t, numberLocale, float: true, ...flag }
      : { type: t, numberLocale, ...flag };
  }
  if (t === "date" || t === "timestamp") {
    let f = o?.dateFormat ?? inferred.dateFormat;
    if (!f && p) {
      for (const k of Object.keys(DATE_FORMATS) as (keyof typeof DATE_FORMATS)[]) {
        if (!f || p.date[k] > p.date[f as keyof typeof DATE_FORMATS]) f = k;
      }
    }
    return { type: t, dateFormat: f ?? "yyyy-mm-dd" };
  }
  return { type: t };
}

/**
 * Kolom raw (indeks `c<n>`) untuk posisi kanonik `pos` menurut peta kolom segmen (T-gcn8); peta kosong
 * = identitas. 0 = kolom tidak ada di file.
 */
export function rawColumnOf(colMap: number[] | undefined, pos: number): number {
  const p = Math.trunc(pos);
  if (!colMap?.length) return p;
  const n = colMap[p - 1];
  return n !== undefined && Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Profil per kolom raw → per posisi kanonik (`c<pos>`) lewat peta kolom segmen: gabungan profil
 * antarsegmen dan skema selalu berkunci posisi kanonik. Peta kosong = identitas (profil apa adanya).
 */
export function canonicalProfile(
  raw: RawProfile,
  colMap: number[] | undefined,
  colCount: number,
): RawProfile {
  if (!colMap?.length) return raw;
  const profiles = new Map<string, Profile>();
  for (let pos = 1; pos <= colCount; pos++) {
    const n = rawColumnOf(colMap, pos);
    const p = n ? raw.profiles.get(`c${n}`) : undefined;
    if (p) profiles.set(`c${pos}`, { ...p, col: `c${pos}` });
  }
  return { dataRows: raw.dataRows, profiles };
}

/** Profil raw (baris data = _row > headerRow) kolom c1..c<colCount>: tahap mahal penentuan tipe. */
export async function profileRaw(
  duck: Duck,
  input: Pick<TypedInput, "rawPath" | "headerRow" | "colCount" | "watch">,
): Promise<RawProfile> {
  const cols = Array.from({ length: input.colCount }, (_, i) => `c${i + 1}`);
  const where = `_row > ${Math.trunc(input.headerRow)}`;
  const dataRows = Number(
    (
      await duck.conn.runAndReadAll(
        `SELECT count(*) AS n FROM read_parquet(${lit(input.rawPath)}) WHERE ${where}`,
      )
    ).getRowObjects()[0]!.n,
  );
  const profiles = new Map<string, Profile>();
  const batches = <T>(xs: T[]) =>
    Array.from({ length: Math.ceil(xs.length / PROFILE_BATCH) }, (_, i) =>
      xs.slice(i * PROFILE_BATCH, (i + 1) * PROFILE_BATCH),
    );
  if (dataRows > 0) {
    for (const part of batches(cols)) {
      // Tiga query streaming (dasar, angka, tanggal) digabung per kolom; kolom tanpa nilai angka/
      // tanggal tidak muncul di query itu (hitungannya 0).
      const rows = new Map<string, Record<string, unknown>>();
      for (const sql of profileSqls(input.rawPath, part, input.headerRow)) {
        const r = await watched(duck, input.watch, () => duck.conn.runAndReadAll(sql));
        for (const row of r.getRowObjects()) {
          const col = String(row.col);
          rows.set(col, { ...rows.get(col), ...row });
        }
      }
      for (const row of rows.values()) {
        // Kolom hanya dari query angka/tanggal tidak mungkin (base menghitung semua nilai).
        if (row.n === undefined) continue;
        const p = toProfile(row);
        profiles.set(p.col, p);
      }
    }
    const small = [...profiles.values()]
      .filter((p) => p.distinct <= EXACT_DISTINCT_MAX)
      .map((p) => p.col);
    for (const part of batches(small)) {
      const exact = await watched(duck, input.watch, () =>
        duck.conn.runAndReadAll(exactDistinctSql(input.rawPath, part, input.headerRow)),
      );
      for (const row of exact.getRowObjects()) {
        profiles.get(String(row.col))!.distinct = Number(row.distinct_n);
      }
    }
  }
  return { dataRows, profiles };
}

/**
 * Skema kolom dari profil (satu file, atau gabungan semua segmen sheet saat recast T-040) + pilihan
 * user: tipe/locale/format hasil inferensi atau pilihan, statistik kosong/unik/gagal cast, lalu kolom
 * kosong (absent) setelah kolom nyata.
 */
export function typedSchema(
  raw: RawProfile,
  input: Pick<TypedInput, "source" | "colCount" | "columns" | "overrides" | "absent">,
): ColumnSchema[] {
  const { dataRows, profiles } = raw;
  const overrides = new Map((input.overrides ?? []).map((o) => [o.pos, o]));
  const names = new Map(input.columns.map((c) => [c.pos, c]));
  const schema: ColumnSchema[] = Array.from({ length: input.colCount }, (_, i) => {
    const pos = i + 1;
    const p = profiles.get(`c${pos}`);
    const o = overrides.get(pos);
    const s = resolve(p, input.source, o);
    const n = p?.n ?? 0;
    const ok = p ? okCount(p, s, input.source) : 0;
    const info = names.get(pos);
    return {
      pos,
      name: o?.name?.trim() || info?.name || `kolom_${pos}`,
      original: info?.original ?? "",
      ...s,
      hidden: o?.hidden ?? false,
      nullPct: dataRows > 0 ? Math.round(((dataRows - n) / dataRows) * 10_000) / 10_000 : 0,
      distinctCount: p?.distinct ?? 0,
      castFailCount: s.type === "text" ? 0 : Math.max(0, n - ok),
      nonEmpty: n,
    };
  });
  // Kolom kosong: tanpa profil; locale/format dilengkapi seperti pilihan user tanpa data.
  const absent: ColumnSchema[] = (input.absent ?? []).map((a, i) => {
    const s = resolve(undefined, input.source, { pos: 0, ...a });
    return {
      pos: input.colCount + i + 1,
      name: a.name,
      original: a.original,
      ...s,
      ...(s.type === "decimal" && a.float ? { float: true } : {}),
      hidden: a.hidden,
      nullPct: dataRows > 0 ? 1 : 0,
      distinctCount: 0,
      castFailCount: 0,
      nonEmpty: 0,
      absent: true,
    };
  });
  return [...schema, ...absent];
}

/** SQL cast satu kolom di file typed: sama → isi kolom di file sama (recast boleh memakai file lama). */
export function castSignature(c: ColumnSchema, source: SourceKind): string {
  if (c.absent) return `null:${sqlType(c)}`;
  const p = typedParts("v", c, source);
  return `${p.inner}|${p.outer("a")}`;
}

/**
 * Tulis typed.parquet berisi kolom `schema` (urut pos): kolom nyata pos ≤ rawCols dari raw `c<pos>`,
 * kolom kosong (absent) sebagai NULL bertipe.
 */
export async function copyTyped(
  duck: Duck,
  input: Pick<TypedInput, "rawPath" | "outPath" | "source" | "headerRow" | "watch" | "rowBase"> & {
    /** Kolom raw file ini (c1..c<rawCols>). */
    rawCols: number;
    /** Peta kolom segmen (T-gcn8): colMap[pos-1] = kolom raw posisi kanonik `pos`; kosong = identitas. */
    colMap?: number[];
    schema: ColumnSchema[];
    /** Rata-rata karakter per baris data (ukuran row group). */
    charsPerRow: number;
    /**
     * Awal periode segmen (T-049, ISO naive): `_period DATE` konstan setelah `_src_row`, ditulis dari
     * metadata segmen (dibekukan saat unggah). Tanpa ini layout typed tidak berubah (tanpa `_period`).
     */
    period?: string | null;
  },
): Promise<void> {
  const where = `_row > ${Math.trunc(input.headerRow)}`;
  const src = (s: ColumnSchema) => rawColumnOf(input.colMap, s.pos);
  const fromRaw = (s: ColumnSchema) => !s.absent && src(s) >= 1 && src(s) <= input.rawCols;
  // Dua tahap: parse sekali di subquery (a<pos>), penjaga diterapkan pada hasilnya di luar.
  const parts = new Map(
    input.schema
      .filter(fromRaw)
      .map((s) => [s.pos, typedParts(`c${src(s)}`, s, input.source)] as const),
  );
  const outer = input.schema.map((s) => {
    const id = Math.trunc(s.pos);
    const p = parts.get(s.pos);
    return p ? `${p.outer(`a${id}`)} AS c${id}` : `CAST(NULL AS ${sqlType(s)}) AS c${id}`;
  });
  const inner = [...parts].map(([pos, p]) => `${p.inner} AS a${Math.trunc(pos)}`);
  const period = input.period ? `${periodLit(input.period)} AS _period, ` : "";
  const width = outer.length + (period ? 3 : 2);
  const rowBase = input.rowBase ?? 0n;
  if (rowBase < 0n) throw new Error("rowBase negatif");
  // Tanpa ORDER BY: raw sudah urut _row dan urutan sisip dipertahankan (1 thread) → deterministik
  // tanpa sort atas data lebar. Row group dibatasi juga oleh rata-rata karakter per baris.
  await watched(duck, input.watch, () =>
    copyParquet(
      duck,
      `SELECT CAST(_row AS BIGINT) + ${rowBase.toString()}::BIGINT AS _row, _row AS _src_row, ${period}${outer.join(", ")}
       FROM (SELECT ${["_row", ...inner].join(", ")}
             FROM read_parquet(${lit(input.rawPath)}) WHERE ${where})`,
      input.outPath,
      width,
      rowGroupFor(width, input.charsPerRow),
    ),
  );
}

export async function writeTyped(duck: Duck, input: TypedInput): Promise<TypedResult> {
  const raw = await profileRaw(duck, input);
  const schema = typedSchema(raw, input);
  const chars = [...raw.profiles.values()].reduce((sum, p) => sum + p.chars, 0);
  await copyTyped(duck, {
    ...input,
    rawCols: input.colCount,
    schema,
    charsPerRow: raw.dataRows > 0 ? chars / raw.dataRows : 0,
  });
  return {
    schema,
    dataRows: raw.dataRows,
    nonEmpty: schema.map((c) => c.nonEmpty ?? 0),
    profile: packProfile(input.headerRow, raw),
  };
}
