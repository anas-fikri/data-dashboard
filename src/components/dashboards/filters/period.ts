/*
 * Filter per periode (T-9gs1): bulan, kuartal, atau tahun tertentu dari bulan yang ada di data. Filter
 * yang dikirim = rentang [awal periode, awal periode berikutnya) — bentuk yang sama dengan filter silang
 * dari grafik, berlaku untuk kolom tanggal maupun cap waktu tanpa jenis filter baru. Rentang kalender
 * utuh dikenali lagi untuk label ("Maret 2026", "Kuartal 1 2026", "Tahun 2026"). Murni.
 */
import type { DashFilter } from "./filter-model";

export type PeriodGrain = "month" | "quarter" | "year";

export const GRAIN_TEXT: Record<PeriodGrain, string> = {
  month: "Bulan",
  quarter: "Kuartal",
  year: "Tahun",
};

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export interface PeriodOption {
  /** Awal periode YYYY-MM-DD (juga nilai pilihan). */
  value: string;
  label: string;
}

const YM = /^(\d{4})-(\d{2})$/;
const STEP: Record<PeriodGrain, number> = { month: 1, quarter: 3, year: 12 };

/** Awal periode berikutnya dari awal periode YYYY-MM-01 (aritmetika kalender, tanpa zona). */
function nextPeriod(start: string, grain: PeriodGrain): string {
  const t = new Date(
    Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1 + STEP[grain], 1),
  );
  return `${String(t.getUTCFullYear()).padStart(4, "0")}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function labelOf(start: string, grain: PeriodGrain): string {
  const y = start.slice(0, 4);
  const m = Number(start.slice(5, 7));
  if (grain === "year") return `Tahun ${y}`;
  if (grain === "quarter") return `Kuartal ${Math.floor((m - 1) / 3) + 1} ${y}`;
  return `${MONTHS[m - 1]} ${y}`;
}

/** Awal periode `grain` yang memuat bulan YYYY-MM. */
function startOf(ym: string, grain: PeriodGrain): string {
  const [, y, m] = YM.exec(ym)!;
  if (grain === "year") return `${y}-01-01`;
  if (grain === "quarter")
    return `${y}-${String(Math.floor((Number(m) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  return `${y}-${m}-01`;
}

/** Pilihan periode dari bulan yang ada di data (YYYY-MM, urutan apa pun): terbaru dulu, tanpa kembar. */
export function periodOptions(months: readonly string[], grain: PeriodGrain): PeriodOption[] {
  const starts = new Set(months.filter((m) => YM.test(m)).map((m) => startOf(m, grain)));
  return [...starts]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((value) => ({ value, label: labelOf(value, grain) }));
}

/** Filter rentang satu periode (awal inklusif, awal periode berikutnya eksklusif). */
export function periodFilter(column: string, start: string, grain: PeriodGrain): DashFilter {
  return { column, op: "range", gte: start, lt: nextPeriod(start, grain) };
}

/** Rentang yang tepat satu periode kalender (tahun, lalu kuartal, lalu bulan) → periodenya; selain itu null. */
export function calendarPeriod(
  f: DashFilter,
): { grain: PeriodGrain; start: string; label: string } | null {
  if (f.op !== "range" || f.lte !== undefined) return null;
  const { gte, lt } = f;
  if (typeof gte !== "string" || typeof lt !== "string") return null;
  if (!/^\d{4}-\d{2}-01$/.test(gte)) return null;
  const m = Number(gte.slice(5, 7));
  for (const grain of ["year", "quarter", "month"] as const) {
    if (grain === "year" && m !== 1) continue;
    if (grain === "quarter" && (m - 1) % 3 !== 0) continue;
    if (nextPeriod(gte, grain) === lt) return { grain, start: gte, label: labelOf(gte, grain) };
  }
  return null;
}
