/*
 * Pemangkasan segmen (T-058, rencana G-6 §4.3 "Filter pada kolom periode memangkas segmen"): sebelum
 * file disewa, segmen sheet periode yang TERBUKTI tidak bisa memuat satu baris pun yang lolos filter
 * dibuang dari sumber. Hanya optimasi — SQL tetap memuat filter yang sama, jadi hasil identik dengan
 * tanpa pemangkasan; ragu = segmen dipertahankan.
 *
 * Rentang yang diketahui per segmen:
 *  - kolom sistem Periode (c<PERIOD_COLUMN>): setiap baris = awal periode segmen (Segment.periodStart);
 *  - kolom periode sumber KOLOM: Segment.minDate/maxDate (tanggal aktual kolom itu);
 *  - sheet berlabel: min/max segmen = kolom tanggal acuan, BUKAN rentang periode (T-054) → hanya
 *    kolom sistem Periode yang dipangkas (SegmentPeriod.min/max kosong untuk segmen berlabel).
 * Waktu dibandingkan sebagai teks ISO penuh "YYYY-MM-DDTHH:MM:SS" (urutan teks = urutan waktu). Batas
 * bawah dibulatkan ke bawah per detik; batas atas memakai "detik sesudahnya" (eksklusif), sehingga
 * pecahan detik yang terpotong (presisi ms Prisma vs µs PostgreSQL) tidak pernah membuang segmen.
 * Klausa yang didukung: filter dashboard (in, range — preset sudah jadi range/in) dan filter rencana
 * (eq, in, gt, gte, lt, lte, between); not_in, neq, is_null, dll. tidak memangkas. Murni.
 */
import type { DashClause } from "./filters";
import { PERIOD_IDENT, type ParquetSource, type SegmentFile } from "./source";
import type { PlanFilter } from "./spec";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/;

/** Waktu naive → "YYYY-MM-DDTHH:MM:SS" (tanggal saja = tengah malam); null bila bentuknya lain. */
export function fullIso(v: string): string | null {
  if (!ISO.test(v)) return null;
  const s = v.replace(" ", "T");
  return DATE_ONLY.test(s) ? `${s}T00:00:00` : s.length === 16 ? `${s}:00` : s;
}

/** Satu detik sesudah waktu ISO penuh (aritmetika kalender UTC = naive). */
function nextSecond(iso: string): string {
  const t = new Date(`${iso}Z`);
  t.setUTCSeconds(t.getUTCSeconds() + 1);
  return t.toISOString().slice(0, 19);
}

/** Rentang nilai satu kolom di satu segmen: lo ≤ nilai < hiUp, hari terakhir = maxDay. */
interface Span {
  lo: string;
  hiUp: string;
  minDay: string;
  maxDay: string;
}

function span(min: string, max: string): Span | null {
  const lo = fullIso(min.slice(0, 19));
  const hi = fullIso(max.slice(0, 19));
  if (!lo || !hi || lo > hi) return null;
  return { lo, hiUp: nextSecond(hi), minDay: lo.slice(0, 10), maxDay: hi.slice(0, 10) };
}

/** Rentang kolom `col` di segmen ini, bila diketahui. */
function spanOf(col: string, f: SegmentFile, periodColumn: number | null): Span | null {
  const p = f.period;
  if (!p) return null;
  if (col === PERIOD_IDENT) return span(p.start, p.start);
  if (periodColumn !== null && col === `c${periodColumn}` && p.min && p.max) {
    return span(p.min, p.max);
  }
  return null;
}

/** Nilai v (=) mungkin ada di rentang: tanggal saja pada kolom waktu dicocokkan per hari. */
function mayEqual(s: Span, v: unknown, dayMatch: boolean): boolean {
  if (typeof v !== "string") return true;
  if (dayMatch && DATE_ONLY.test(v)) return v >= s.minDay && v <= s.maxDay;
  const t = fullIso(v);
  return t === null || (t >= s.lo && t < s.hiUp);
}

/** Klausa filter dashboard pasti tidak cocok dengan baris mana pun di rentang ini. */
function dashExcludes(cl: DashClause, s: Span): boolean {
  if (cl.type !== "date" && cl.type !== "timestamp") return false;
  if (cl.op === "range") {
    const b = (x: string | number | undefined) => (typeof x === "string" ? fullIso(x) : null);
    const gte = b(cl.gte);
    const lte = b(cl.lte);
    const lt = b(cl.lt);
    return (
      (gte !== null && s.hiUp <= gte) || (lte !== null && s.lo > lte) || (lt !== null && s.lo >= lt)
    );
  }
  if (cl.op !== "in" || cl.values.includes(null)) return false;
  // Kolom waktu: tanggal saja = sehari penuh (CAST(c AS DATE) IN …), selain itu per detik.
  return !cl.values.some((v) => mayEqual(s, v, cl.type === "timestamp"));
}

/** Filter rencana (query bebas) pasti tidak cocok dengan baris mana pun di rentang ini. */
function planExcludes(f: PlanFilter, s: Span): boolean {
  if (f.type !== "date" && f.type !== "timestamp") return false;
  // Kolom DATE dengan nilai berjam di-CAST AS DATE oleh SQL: tidak dipangkas (ragu = pertahankan).
  const vals = f.values.map((v) =>
    typeof v === "string" && (f.type === "timestamp" || DATE_ONLY.test(v)) ? fullIso(v) : null,
  );
  if (vals.some((v) => v === null)) return false;
  const [a, b] = vals as string[];
  switch (f.op) {
    case "eq":
    case "in":
      return !(vals as string[]).some((t) => t >= s.lo && t < s.hiUp);
    case "gt":
    case "gte":
      return s.hiUp <= a!;
    case "lt":
      return s.lo >= a!;
    case "lte":
      return s.lo > a!;
    case "between":
      return s.hiUp <= a! || s.lo > b!;
    default:
      return false;
  }
}

/** Filter yang dipakai untuk memangkas (AND): klausa dashboard + filter rencana. */
export interface PruneFilters {
  clauses?: DashClause[];
  filters?: PlanFilter[];
}

/** Segmen ini pasti tidak memuat baris yang lolos semua filter (AND). */
export function segmentExcluded(
  f: SegmentFile,
  periodColumn: number | null,
  where: PruneFilters,
): boolean {
  return (
    (where.clauses ?? []).some((cl) => {
      const s = spanOf(cl.col, f, periodColumn);
      return !!s && dashExcludes(cl, s);
    }) ||
    (where.filters ?? []).some((pf) => {
      const s = spanOf(pf.col, f, periodColumn);
      return !!s && planExcludes(pf, s);
    })
  );
}

/**
 * Sumber tanpa segmen yang pasti di luar filter. Bukan sheet periode / tidak ada yang terbuang → sumber
 * yang sama. Semua terbuang → segmen pertama dipertahankan (hasilnya tetap kosong lewat WHERE; sumber
 * daftar kosong tidak bisa dibaca).
 */
export function pruneSource(source: ParquetSource, where: PruneFilters): ParquetSource {
  if (typeof source === "string" || !source.period) return source;
  if (!where.clauses?.length && !where.filters?.length) return source;
  const column = source.period.column;
  const kept = source.files.filter((f) => !segmentExcluded(f, column, where));
  if (kept.length === source.files.length) return source;
  return { ...source, files: kept.length ? kept : source.files.slice(0, 1) };
}
