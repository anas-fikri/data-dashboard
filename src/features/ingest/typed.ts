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
    if (t === "integer") return { type: t, numberLocale };
    return p && needsFloat(p, numberLocale)
      ? { type: t, numberLocale, float: true }
      : { type: t, numberLocale };
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

export async function writeTyped(duck: Duck, input: TypedInput): Promise<TypedResult> {
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

  const overrides = new Map((input.overrides ?? []).map((o) => [o.pos, o]));
  const names = new Map(input.columns.map((c) => [c.pos, c]));
  const schema: ColumnSchema[] = cols.map((col, i) => {
    const pos = i + 1;
    const p = profiles.get(col);
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

  // Tanpa ORDER BY: raw sudah urut _row dan urutan sisip dipertahankan (1 thread) → deterministik
  // tanpa sort atas data lebar. Row group dibatasi juga oleh rata-rata karakter per baris.
  const chars = [...profiles.values()].reduce((sum, p) => sum + p.chars, 0);
  // Dua tahap: parse sekali di subquery (a<pos>), penjaga diterapkan pada hasilnya di luar.
  const parts = schema.map((s, i) => typedParts(cols[i]!, s, input.source));
  const outer = [
    ...parts.map((p, i) => `${p.outer(`a${i + 1}`)} AS c${i + 1}`),
    ...absent.map((a) => `CAST(NULL AS ${sqlType(a)}) AS c${a.pos}`),
  ];
  const width = outer.length + 1;
  await watched(duck, input.watch, () =>
    copyParquet(
      duck,
      `SELECT _row, ${outer.join(", ")}
       FROM (SELECT _row, ${parts.map((p, i) => `${p.inner} AS a${i + 1}`).join(", ")}
             FROM read_parquet(${lit(input.rawPath)}) WHERE ${where})`,
      input.outPath,
      width,
      rowGroupFor(width, dataRows > 0 ? chars / dataRows : 0),
    ),
  );
  const all = [...schema, ...absent];
  return { schema: all, dataRows, nonEmpty: all.map((c) => c.nonEmpty ?? 0) };
}
