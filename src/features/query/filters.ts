/*
 * Filter dashboard (T-012): slicer (in / not_in "semua kecuali"), rentang angka/tanggal, preset tanggal,
 * dan cross-filter dari klik grafik. Klien mengirim { widgetId, dashboardFilters } dengan kolom lewat
 * NAMA tampil (bukan posisi): satu filter berlaku untuk widget yang sheet-nya punya kolom bernama sama
 * (tidak peka besar/kecil dan spasi, NFC) DAN kelompok tipenya sama dengan kolom sumber filter (kolom
 * filter dashboard atau dimensi grafik cross-filter; teks | angka | waktu | boolean). Widget yang
 * sheet-nya tidak punya kolom itu — atau kolomnya disembunyikan, tipenya beda kelompok, atau nilai filter
 * tidak cocok dengan tipenya — melewati filter tersebut dan melaporkannya (skippedFilters), bukan gagal.
 * Preset dihitung di Asia/Jakarta sebagai tanggal naive dan dibandingkan tanpa pergeseran zona (D8).
 * Murni (tanpa I/O).
 */
import { z } from "zod";
import type { ColumnSchema, ColumnType } from "@/features/ingest/infer";
import { normName } from "@/features/widgets/remap";
import { GRAINS } from "@/features/widgets/spec";
import { isCalendarDate } from "./spec";

export const DASH_FILTERS_MAX = 20;
export const DASH_VALUES_MAX = 500;
export const PRESETS = [
  "this_month",
  "this_quarter",
  "ytd",
  "last_month",
  "last_quarter",
  "last_year",
  "last_30_days",
  "last_90_days",
] as const;
export type Preset = (typeof PRESETS)[number];
export const JAKARTA_TZ = "Asia/Jakarta";

const column = z.string().min(1).max(200);
const num = z.number().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
/**
 * Nilai slicer/cross-filter; null = (Kosong). Teks ≤ 2000 unit UTF-16: daftar slicer memuat teks
 * ≤ 1000 karakter (karakter di luar BMP = 2 unit). Angka boleh di luar ±2^53 (label grafik/pivot dari kolom
 * DOUBLE/DECIMAL besar, T-rrn1): di-bind sebagai teks lalu di-CAST (paramValue).
 */
const inValue = z.union([z.string().max(2_000), z.number().finite(), z.boolean(), z.null()]);
/** Batas rentang: angka, atau tanggal/waktu naive ISO (YYYY-MM-DD[THH:MM[:SS]]). */
const bound = z.union([
  z.string().max(19).refine(isCalendarDate, { message: "Tanggal tidak valid" }),
  num,
]);

export const dashFilterSchema = z
  .discriminatedUnion("op", [
    z
      .object({
        column,
        op: z.literal("in"),
        values: z.array(inValue).min(1).max(DASH_VALUES_MAX),
      })
      .strict(),
    /** "Semua kecuali" nilai ini (pilih semua lalu buang beberapa); null = kecualikan (Kosong). */
    z
      .object({
        column,
        op: z.literal("not_in"),
        values: z.array(inValue).min(1).max(DASH_VALUES_MAX),
      })
      .strict(),
    z
      .object({
        column,
        op: z.literal("range"),
        gte: bound.optional(),
        lte: bound.optional(),
        lt: bound.optional(),
      })
      .strict(),
    z.object({ column, op: z.literal("preset"), preset: z.enum(PRESETS) }).strict(),
  ])
  .superRefine((f, ctx) => {
    if (f.op === "range" && f.gte === undefined && f.lte === undefined && f.lt === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rentang membutuhkan minimal satu batas",
      });
    }
  });
export type DashFilter = z.infer<typeof dashFilterSchema>;
export type DashValue = string | number | boolean | null;

export const dashFiltersSchema = z.array(dashFilterSchema).max(DASH_FILTERS_MAX);

/**
 * Saringan pivot dinamis (T-f4a7): pembaca memilih nilai field yang SUDAH dipakai pivot itu (baris 1,
 * baris 2, kolom pemisah) — dirujuk lewat perannya, bukan kolom bebas, jadi tidak membuka kolom lain
 * (D6). Berlaku hanya untuk widget itu; nilai = label mentah pivot (teks, angka, boolean, awal periode).
 * `column` + `grain` = field saat saringan dibuat: field yang sudah diganti di pengaturan (URL/ekspor
 * lama) tidak menerima nilai field lama (review T-f4a7 M2).
 */
export const PIVOT_FIELDS = ["row0", "row1", "column"] as const;
export type PivotFieldRole = (typeof PIVOT_FIELDS)[number];
export const pivotFilterSchema = z
  .object({
    field: z.enum(PIVOT_FIELDS),
    column: z.string().min(1).max(200),
    grain: z.enum(GRAINS).optional(),
    op: z.enum(["in", "not_in"]),
    values: z.array(inValue).min(1).max(DASH_VALUES_MAX),
  })
  .strict();
export const pivotFiltersSchema = z.array(pivotFilterSchema).max(PIVOT_FIELDS.length);
export type PivotFilter = z.infer<typeof pivotFilterSchema>;

/**
 * Status filter di URL (?f=, JSON): filter bar + satu cross-filter aktif beserta widget sumbernya.
 * Tidak valid → diabaikan (lihat parseFilterState).
 */
export const filterStateSchema = z
  .object({
    filters: dashFiltersSchema,
    cross: z
      .object({ widgetId: z.string().regex(/^[a-z0-9]{20,32}$/), filter: dashFilterSchema })
      .strict()
      .optional(),
    /** Saringan pivot per widget (T-f4a7): ikut URL, muat ulang, ekspor, dan PDF. */
    pivot: z.record(z.string().regex(/^[a-z0-9]{20,32}$/), pivotFiltersSchema).optional(),
  })
  .strict();
export type FilterState = z.infer<typeof filterStateSchema>;

/** Nilai ?f= (sudah di-decode dari URL) → status filter, atau null bila rusak/tidak valid. */
export function parseFilterState(raw: string | null | undefined): FilterState | null {
  if (!raw || raw.length > 16_384) return null;
  try {
    const p = filterStateSchema.safeParse(JSON.parse(raw));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Tanggal hari ini di Asia/Jakarta sebagai tanggal naive YYYY-MM-DD (bukan toISOString yang UTC). */
export function todayJakarta(now: Date = new Date()): string {
  const p = Object.fromEntries(DAY_FORMAT.formatToParts(now).map((x) => [x.type, x.value]));
  return `${pad(Number(p.year), 4)}-${p.month}-${p.day}`;
}

/** Geser tanggal naive YYYY-MM-DD sebanyak n hari (aritmetika kalender, tanpa zona). */
export function addDays(day: string, n: number): string {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * Rentang preset (inklusif) dari hari ini: berjalan (awal bulan / awal kuartal / 1 Januari s.d. hari
 * ini), periode sebelumnya utuh (bulan / kuartal / tahun lalu, T-9gs1), dan N hari terakhir termasuk
 * hari ini.
 */
export function presetRange(preset: Preset, today: string): { start: string; end: string } {
  const [y = 0, m = 1] = today.split("-").map(Number);
  const first = (yy: number, mm: number) => {
    const t = new Date(Date.UTC(yy, mm - 1, 1));
    return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-01`;
  };
  const quarter = Math.floor((m - 1) / 3) * 3 + 1;
  switch (preset) {
    case "ytd":
      return { start: `${pad(y, 4)}-01-01`, end: today };
    case "this_month":
      return { start: first(y, m), end: today };
    case "this_quarter":
      return { start: first(y, quarter), end: today };
    case "last_month":
      return { start: first(y, m - 1), end: addDays(first(y, m), -1) };
    case "last_quarter":
      return { start: first(y, quarter - 3), end: addDays(first(y, quarter), -1) };
    case "last_year":
      return { start: `${pad(y - 1, 4)}-01-01`, end: `${pad(y - 1, 4)}-12-31` };
    case "last_30_days":
      return { start: addDays(today, -29), end: today };
    case "last_90_days":
      return { start: addDays(today, -89), end: today };
  }
}

type Bound = string | number;
interface ClauseBase {
  /** Kolom fisik c<pos> di sheet widget. */
  col: string;
  type: ColumnType;
  /** Desimal yang disimpan DOUBLE (ColumnSchema.float); selain itu DECIMAL(38,6). */
  float: boolean;
}
/** Filter dashboard yang sudah dicocokkan dengan sheet satu widget (preset sudah jadi rentang). */
export type DashClause = ClauseBase &
  (
    | { op: "in" | "not_in"; values: DashValue[] }
    | { op: "range"; gte?: Bound; lte?: Bound; lt?: Bound }
  );

const NUMERIC: ColumnType[] = ["integer", "decimal", "duration"];

/** Kelompok tipe untuk mencocokkan filter dashboard antar-sheet (kontrak T-012 putaran 1). */
export type TypeFamily = "text" | "number" | "time" | "boolean";
export const typeFamily = (t: ColumnType): TypeFamily =>
  NUMERIC.includes(t) ? "number" : t === "date" || t === "timestamp" ? "time" : (t as TypeFamily);

/**
 * Waktu naive ke bentuk penuh YYYY-MM-DDTHH:MM:SS (urutan teks = urutan waktu, kunci cache stabil).
 * Tanggal saja (YYYY-MM-DD) → tengah malam; dipakai untuk batas rentang, bukan nilai in/not_in.
 */
function fullTimestamp(v: string): string {
  const s = v.replace(" ", "T");
  return DATE_ONLY.test(s) ? `${s}T00:00:00` : s.length === 16 ? `${s}:00` : s;
}

function fits(type: ColumnType, v: Exclude<DashValue, null>): boolean {
  switch (type) {
    case "integer":
    case "decimal":
    case "duration":
      return typeof v === "number";
    case "boolean":
      return typeof v === "boolean";
    case "date":
      return typeof v === "string" && DATE_ONLY.test(v) && isCalendarDate(v);
    case "timestamp":
      return typeof v === "string" && isCalendarDate(v);
    case "text":
      return typeof v === "string";
  }
}

const rank = (v: DashValue) =>
  v === null ? 0 : typeof v === "boolean" ? 1 : typeof v === "number" ? 2 : 3;

/** Nilai unik terurut (null dulu): pilihan yang sama dalam urutan berbeda = kunci cache yang sama. */
export function canonicalValues(values: DashValue[]): DashValue[] {
  const unique = new Map(values.map((v) => [JSON.stringify(v), v]));
  return [...unique.values()].sort(
    (a, b) =>
      rank(a) - rank(b) || (a === b ? 0 : (a as string | number) < (b as string | number) ? -1 : 1),
  );
}

function toClause(f: DashFilter, c: ColumnSchema, today: string): DashClause | null {
  const base: ClauseBase = { col: `c${c.pos}`, type: c.type, float: c.float === true };
  const temporal = c.type === "date" || c.type === "timestamp";
  switch (f.op) {
    case "in":
    case "not_in": {
      if (!f.values.every((v) => v === null || fits(c.type, v))) return null;
      // TIMESTAMP: tanggal saja tetap tanggal (dicocokkan sehari penuh di SQL, sama dengan kolom DATE);
      // nilai berjam dilengkapi detiknya.
      const values =
        c.type === "timestamp"
          ? f.values.map((v) =>
              typeof v === "string" && !DATE_ONLY.test(v) ? fullTimestamp(v) : v,
            )
          : f.values;
      return { ...base, op: f.op, values: canonicalValues(values) };
    }
    case "range": {
      const bounds = [f.gte, f.lte, f.lt].filter((b) => b !== undefined);
      const ok = NUMERIC.includes(c.type)
        ? bounds.every((b) => typeof b === "number")
        : temporal && bounds.every((b) => typeof b === "string");
      if (!ok) return null;
      if (c.type !== "timestamp") {
        return {
          ...base,
          op: "range",
          ...(f.gte !== undefined ? { gte: f.gte } : {}),
          ...(f.lte !== undefined ? { lte: f.lte } : {}),
          ...(f.lt !== undefined ? { lt: f.lt } : {}),
        };
      }
      const ts = (b: Bound | undefined) => (b === undefined ? undefined : fullTimestamp(String(b)));
      let lte = ts(f.lte);
      let lt = ts(f.lt);
      // Batas atas berupa tanggal saja pada kolom waktu = sampai akhir hari itu (< hari berikutnya
      // 00:00), bukan tepat tengah malam yang membuang data hari terakhir.
      if (typeof f.lte === "string" && DATE_ONLY.test(f.lte)) {
        const next = `${addDays(f.lte, 1)}T00:00:00`;
        lt = lt === undefined || next < lt ? next : lt;
        lte = undefined;
      }
      const gte = ts(f.gte);
      return {
        ...base,
        op: "range",
        ...(gte !== undefined ? { gte } : {}),
        ...(lte !== undefined ? { lte } : {}),
        ...(lt !== undefined ? { lt } : {}),
      };
    }
    case "preset": {
      if (!temporal) return null;
      const { start, end } = presetRange(f.preset, today);
      // DATE: awal ≤ c ≤ hari ini. TIMESTAMP: awal 00:00 ≤ c < besok 00:00 (tanpa geser zona, D8).
      return c.type === "date"
        ? { ...base, op: "range", gte: start, lte: end }
        : { ...base, op: "range", gte: `${start}T00:00:00`, lt: `${addDays(end, 1)}T00:00:00` };
    }
  }
}

/** Kelompok tipe kolom sumber per nama ternormalisasi (lihat sourceFamilies). */
export type SourceFamilies = Map<string, Set<TypeFamily>>;

/**
 * Kelompok tipe sumber filter dashboard: kolom filter tersimpan + dimensi grafik cross-filter yang
 * tersedia di versi aktif (type null = tidak tersedia → tidak menyumbang kelompok).
 */
export function sourceFamilies(
  sources: { name: string; type: ColumnType | null }[],
): SourceFamilies {
  const out: SourceFamilies = new Map();
  for (const s of sources) {
    if (!s.type) continue;
    const k = normName(s.name);
    out.set(k, (out.get(k) ?? new Set()).add(typeFamily(s.type)));
  }
  return out;
}

/**
 * Terapkan filter dashboard ke sheet satu widget: kolom dicocokkan lewat nama di antara kolom yang
 * tidak disembunyikan, dan (bila `families` diberikan) hanya bila kelompok tipenya sama dengan kolom
 * sumber filter — "Tanggal" bertipe tanggal tidak dipakai untuk kolom teks "Tanggal" di sheet lain.
 * Hasil: klausa kanonik (unik, terurut — untuk kunci cache) + nama kolom filter yang dilewati.
 */
/**
 * Klausa nilai satu kolom skema untuk bagian Saring pivot (T-f4a7): aturan cocok sama dengan filter
 * dashboard (teks tanpa peka huruf besar/kecil, tanggal saja = sehari penuh, null = (kosong)). null bila
 * nilainya tidak cocok tipe kolom (mis. tipe kolom berubah di versi data baru).
 */
export const valuesClause = (
  op: "in" | "not_in",
  values: DashValue[],
  c: ColumnSchema,
): DashClause | null => toClause({ column: c.name, op, values }, c, "");

/**
 * Klausa satu filter berbentuk filter dashboard untuk kolom skema tertentu (saringan Lihat data T-041:
 * kolom dirujuk lewat posisi, bukan nama). null bila nilai/rentang tidak cocok tipe kolom.
 */
export const columnClause = (f: DashFilter, c: ColumnSchema, now: Date): DashClause | null =>
  toClause(f, c, todayJakarta(now));

export function applyDashFilters(
  filters: DashFilter[],
  schema: ColumnSchema[],
  now: Date,
  families?: SourceFamilies,
): { clauses: DashClause[]; skipped: string[] } {
  const byName = new Map<string, ColumnSchema>();
  for (const c of schema) {
    if (!c.hidden && !byName.has(normName(c.name))) byName.set(normName(c.name), c);
  }
  const today = todayJakarta(now);
  const clauses = new Map<string, DashClause>();
  const skipped: string[] = [];
  for (const f of filters) {
    const c = byName.get(normName(f.column));
    const sameFamily =
      !families || (!!c && !!families.get(normName(f.column))?.has(typeFamily(c.type)));
    const clause = c && sameFamily ? toClause(f, c, today) : null;
    if (clause) clauses.set(JSON.stringify(clause), clause);
    else if (!skipped.includes(f.column)) skipped.push(f.column);
  }
  const sorted = [...clauses.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { clauses: sorted.map(([, c]) => c), skipped };
}

/** Filter pertama yang kolomnya tidak termasuk nama yang diizinkan dashboard (D6), bila ada. */
export function disallowedFilter(
  filters: DashFilter[],
  allowed: Iterable<string>,
): DashFilter | undefined {
  const names = new Set([...allowed].map(normName));
  return filters.find((f) => !names.has(normName(f.column)));
}
