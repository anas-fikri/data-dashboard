/*
 * Teks filter dashboard (T-012): label nilai slicer, ringkasan di tombol dan chip, rentang tanggal
 * dari/ke isian, angka ketikan id-ID, dan filter silang dari kategori grafik (nilai MENTAH, bukan
 * label yang diformat). Murni.
 */
import type { ColumnType } from "@/features/ingest/infer";
import { formatDate, formatDuration } from "@/features/widgets/format";
import {
  addDays,
  type Bound,
  type DashFilter,
  type FilterValue,
  type Preset,
} from "./filter-model";

export const PRESET_LABEL: Record<Preset, string> = {
  this_month: "Bulan ini",
  this_quarter: "Kuartal ini",
  ytd: "Sejak awal tahun",
};
/** Sama dengan sumbu grafik dan sel tabel (features/widgets/format.ts). */
export const EMPTY_LABEL = "(kosong)";

const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
// Angka apa adanya (sampai 15 digit bermakna), bukan dibulatkan ke 6 desimal: chip harus memuat
// batas yang benar-benar dikirim.
const num = (n: number) => n.toLocaleString("id-ID", { maximumSignificantDigits: 15 });

/** Satu nilai sebagai teks; tipe tidak diketahui (filter silang dari URL) → ditebak dari bentuknya. */
export function valueText(v: FilterValue, type?: ColumnType, grain?: string): string {
  if (v === null || v === "") return EMPTY_LABEL;
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  if (typeof v === "number") return type === "duration" ? formatDuration(v) : num(v);
  if (type === "date" || type === "timestamp" || (!type && ISO.test(v))) {
    return formatDate(v, grain, type === "timestamp" || (!type && v.length > 10));
  }
  return v;
}

/** Nilai terpilih: "Jakarta", "Jakarta, Bandung", "Jakarta, Bandung +3". */
export function valuesText(values: FilterValue[], type?: ColumnType): string {
  const shown = values.slice(0, 2).map((v) => valueText(v, type));
  const more = values.length - shown.length;
  return `${shown.join(", ")}${more > 0 ? ` +${more.toLocaleString("id-ID")}` : ""}`;
}

/** Batas rentang tanggal untuk ditampilkan: `lt` (eksklusif) ditampilkan sebagai hari sebelumnya. */
export function dateBounds(f: Extract<DashFilter, { op: "range" }>): {
  from: string;
  to: string;
} {
  const d = (b: Bound | undefined) => (typeof b === "string" ? b.slice(0, 10) : "");
  const to = f.lt !== undefined ? (d(f.lt) ? addDays(d(f.lt), -1) : "") : d(f.lte);
  return { from: d(f.gte), to };
}

/** Rentang tanggal dari isian "Dari"/"Sampai"; kolom cap waktu: hari terakhir utuh (< hari+1). */
export function dateRange(
  column: string,
  type: ColumnType,
  from: string,
  to: string,
): DashFilter | null {
  if (!from && !to) return null;
  const f: DashFilter = { column, op: "range" };
  if (from) f.gte = from;
  if (to) {
    if (type === "timestamp") f.lt = addDays(to, 1);
    else f.lte = to;
  }
  return f;
}

/** Ringkasan isi filter (tanpa nama kolom). */
export function filterText(f: DashFilter, type?: ColumnType, grain?: string): string {
  if (f.op === "preset") return PRESET_LABEL[f.preset];
  if (f.op === "in") {
    return f.values.length === 1
      ? valueText(f.values[0]!, type, grain)
      : valuesText(f.values, type);
  }
  if (f.op === "not_in") return `Semua kecuali ${valuesText(f.values, type)}`;
  const numeric =
    typeof (f.gte ?? f.lte ?? f.lt) === "number" || type === "integer" || type === "decimal";
  if (numeric || type === "duration") {
    const n = (b: Bound) => (typeof b === "number" ? valueText(b, type) : String(b));
    if (f.gte !== undefined && f.lte !== undefined && f.lt === undefined) {
      return `${n(f.gte)} – ${n(f.lte)}`;
    }
    return [
      f.gte !== undefined ? `≥ ${n(f.gte)}` : "",
      f.lte !== undefined ? `≤ ${n(f.lte)}` : "",
      f.lt !== undefined ? `< ${n(f.lt)}` : "",
    ]
      .filter(Boolean)
      .join(", ");
  }
  // Periode grafik (awal periode s.d. sebelum periode berikutnya) → nama periode ("Jan 2026").
  if (grain && typeof f.gte === "string" && f.lt !== undefined) return formatDate(f.gte, grain);
  const { from, to } = dateBounds(f);
  const day = (s: string) => formatDate(s);
  if (from && to) return from === to ? day(from) : `${day(from)} – ${day(to)}`;
  return from ? `Sejak ${day(from)}` : `Sampai ${day(to)}`;
}

/**
 * Angka ketikan id-ID → number. "1.500.000", "2,5", "1.234,5", "-3"; kosong → undefined;
 * tidak terbaca → null. Grup ribuan tidak diawali 0: "0.500" = 0,5 (bukan 500).
 */
export function parseNumber(text: string): number | null | undefined {
  const t = text.replace(/\s/g, "");
  if (!t) return undefined;
  let n: string;
  if (t.includes(",")) n = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, "");
  else n = t;
  if (!/^-?\d+(\.\d+)?$/.test(n)) return null;
  const v = Number(n);
  return Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER ? v : null;
}

const MONTHS_PER: Record<string, number> = { month: 1, quarter: 3, year: 12 };

/** Awal periode berikutnya dari awal periode `iso` (bentuk sama: tanggal atau cap waktu). */
export function nextPeriod(iso: string, grain: string): string {
  const date = iso.slice(0, 10);
  const [y, m] = date.split("-").map(Number);
  const next =
    grain === "day"
      ? addDays(date, 1)
      : grain === "week"
        ? addDays(date, 7)
        : new Date(Date.UTC(y!, m! - 1 + (MONTHS_PER[grain] ?? 1), 1)).toISOString().slice(0, 10);
  return iso.length > 10 ? `${next}${iso.slice(10)}` : next;
}

/**
 * Filter silang dari satu kategori grafik: nilai mentah (`null` = kosong); kategori tanggal dengan
 * periode (grain) → rentang [awal periode, awal periode berikutnya).
 */
export function crossFilterFor(
  column: string,
  dimType: string,
  grain: string | undefined,
  raw: unknown,
): DashFilter | null {
  if (raw === null || raw === undefined) return { column, op: "in", values: [null] };
  if ((dimType === "date" || dimType === "timestamp") && grain && typeof raw === "string") {
    return { column, op: "range", gte: raw, lt: nextPeriod(raw, grain) };
  }
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return { column, op: "in", values: [raw] };
  }
  return null;
}
