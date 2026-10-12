/*
 * Tahap typed (T-007): raw.parquet → typed-<rev>.parquet + skema kolom. Dipakai ingest (rev 1, tipe
 * hasil inferensi) dan recast (rev berikutnya, tipe pilihan user menimpa hasil inferensi).
 * typed.parquet: _row (nomor baris fisik) + c<pos> bertipe, hanya baris data (_row > headerRow).
 */
import { lit, watched, type Duck } from "@/lib/duckdb";
import type { ColumnMeta } from "./header";
import {
  decide,
  EXACT_DISTINCT_MAX,
  exactDistinctSql,
  needsFloat,
  okCount,
  pickLocale,
  profileSql,
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

export interface TypedInput {
  rawPath: string;
  outPath: string;
  source: SourceKind;
  headerRow: number;
  colCount: number;
  /** Nama kolom dari baris header ({ pos, name, original }). */
  columns: ColumnMeta[];
  overrides?: ColumnOverride[];
  /** Dipanggil berkala selama query panjang; melempar → query diinterupsi. */
  watch: () => Promise<void>;
}

export interface TypedResult {
  schema: ColumnSchema[];
  /** Baris data di typed.parquet. */
  dataRows: number;
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
      const r = await watched(duck, input.watch, () =>
        duck.conn.runAndReadAll(profileSql(input.rawPath, part, input.headerRow)),
      );
      for (const row of r.getRowObjects()) {
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
    const ok = p ? okCount(p, s) : 0;
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
    };
  });

  // Tanpa ORDER BY: raw sudah urut _row dan urutan sisip dipertahankan (1 thread) → deterministik
  // tanpa sort atas data lebar. Row group dibatasi juga oleh rata-rata karakter per baris.
  const chars = [...profiles.values()].reduce((sum, p) => sum + p.chars, 0);
  // Dua tahap: parse sekali di subquery (a<pos>), penjaga diterapkan pada hasilnya di luar.
  const parts = schema.map((s, i) => typedParts(cols[i]!, s));
  await watched(duck, input.watch, () =>
    copyParquet(
      duck,
      `SELECT _row, ${parts.map((p, i) => `${p.outer(`a${i + 1}`)} AS c${i + 1}`).join(", ")}
       FROM (SELECT _row, ${parts.map((p, i) => `${p.inner} AS a${i + 1}`).join(", ")}
             FROM read_parquet(${lit(input.rawPath)}) WHERE ${where})`,
      input.outPath,
      cols.length + 1,
      rowGroupFor(cols.length + 1, dataRows > 0 ? chars / dataRows : 0),
    ),
  );
  return { schema, dataRows };
}
