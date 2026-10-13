import type { ValueType } from "@/features/widgets/format";
import type { Agg } from "@/features/query/spec";
import type { ChartSort } from "@/features/widgets/spec";

/*
 * Olahan data grafik (T-011, verifikasi putaran 3) — murni, diuji tanpa DOM: urutan titik garis,
 * periode kontinu untuk sumbu garis per minggu/bulan/kuartal/tahun, sisa "Lainnya" pai dengan toleransi
 * pembulatan, urutan legenda, skala sumbu durasi, dan baris daftar peringkat yang muat.
 */

const DAY_MS = 86_400_000;

/** ISO naive → milidetik UTC (ECharts membaca string tanggal sebagai waktu lokal; di sini semua UTC). */
export function isoToUtcMs(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", se = "0"] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
}

export const msToIso = (ms: number) => new Date(ms).toISOString().slice(0, 19);

/** "Kantor PCP Express Gambir Unit 11" → "Kantor P…bir Unit 11": awal + akhir tetap terlihat. */
export function middleTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars || maxChars < 5) return text;
  const tail = Math.ceil((maxChars - 1) * 0.55);
  const head = maxChars - 1 - tail;
  return `${text.slice(0, head).trimEnd()}…${text.slice(text.length - tail).trimStart()}`;
}

/**
 * Persen bulat yang jumlahnya tepat 100 (metode sisa terbesar) — label/legenda pai tidak berjumlah
 * 99 % atau 101 % (review integritas T-011). Nilai harus ≥ 0.
 */
export function percentShares(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  let rest = 100 - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    out[i]! += 1;
    rest -= 1;
  }
  return out;
}

const collator = new Intl.Collator("id", { sensitivity: "base", numeric: true });

/**
 * Urutan titik garis di layar. Tanggal: kronologis naik. Dimensi lain dengan urutan label: naik
 * (angka dibanding sebagai angka — Bulan 1..12, bukan 1,10,11,12,2; teks dengan collation id tanpa
 * beda huruf besar/aksen, seperti urutan server). Urutan nilai: urutan server dipertahankan.
 * Kategori kosong selalu di akhir.
 */
export function lineOrder<R extends readonly unknown[]>(
  rows: readonly R[],
  dimType: ValueType,
  sort: ChartSort,
): R[] {
  const temporal = dimType === "date" || dimType === "timestamp";
  if (!temporal && sort !== "label_asc" && sort !== "label_desc") return [...rows];
  const cmp = (a: unknown, b: unknown) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    const x = String(a);
    const y = String(b);
    // ISO naive: urutan teks = urutan waktu.
    return temporal ? (x < y ? -1 : x > y ? 1 : 0) : collator.compare(x, y);
  };
  return [...rows].sort((a, b) =>
    a[0] === null ? (b[0] === null ? 0 : 1) : b[0] === null ? -1 : cmp(a[0], b[0]),
  );
}

export type BucketGrain = "day" | "week" | "month" | "quarter" | "year";
const MONTHS_PER: Partial<Record<BucketGrain, number>> = { month: 1, quarter: 3, year: 12 };

/** Awal periode yang memuat ms (minggu mulai Senin, seperti date_trunc('week')). */
function bucketStart(ms: number, grain: BucketGrain): number {
  const d = new Date(ms);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (grain === "day") return day;
  if (grain === "week") return day - ((d.getUTCDay() + 6) % 7) * DAY_MS;
  const span = MONTHS_PER[grain]!;
  return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / span) * span, 1);
}

function nextBucket(ms: number, grain: BucketGrain): number {
  if (grain === "day") return ms + DAY_MS;
  if (grain === "week") return ms + 7 * DAY_MS;
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + MONTHS_PER[grain]!, 1);
}

/**
 * Periode kontinu dari periode pertama s.d. terakhir yang dikirim server; periode tanpa data diisi
 * `empty` (0 untuk total/jumlah, null = garis putus). Tanggal kosong tidak diplot. Lebih dari `cap`
 * periode → tanpa pengisian (hanya periode yang ada). Hasil urut waktu naik.
 */
export function timeBuckets(
  iso: readonly (string | null)[],
  values: readonly (number | null)[],
  grain: BucketGrain,
  empty: 0 | null,
  cap: number,
): { keys: number[]; values: (number | null)[] } {
  const byKey = new Map<number, number | null>();
  iso.forEach((s, k) => {
    const ms = s ? isoToUtcMs(s) : null;
    if (ms === null) return;
    const key = bucketStart(ms, grain);
    if (!byKey.has(key)) byKey.set(key, values[k] ?? null);
  });
  const present = [...byKey.keys()].sort((a, b) => a - b);
  if (present.length === 0) return { keys: [], values: [] };
  const keys: number[] = [];
  for (let b = present[0]!; b <= present.at(-1)!; b = nextBucket(b, grain)) {
    keys.push(b);
    if (keys.length > cap) {
      return { keys: present, values: present.map((k) => byKey.get(k)!) };
    }
  }
  return { keys, values: keys.map((k) => (byKey.has(k) ? byKey.get(k)! : empty)) };
}

/**
 * Nilai periode tanpa data. Total/jumlah baris/jumlah unik: 0 (memang tidak ada). Rata-rata/min/maks:
 * null (tidak terdefinisi → garis putus). N titik dipilih menurut nilai dan ada yang terpotong: null —
 * periode di luar N teratas belum tentu kosong.
 */
export function emptyBucketValue(agg: Agg, sort: ChartSort, cut: boolean): 0 | null {
  if (cut && (sort === "value_desc" || sort === "value_asc")) return null;
  return agg === "sum" || agg === "count" || agg === "count_distinct" ? 0 : null;
}

/** Titik tunggal di antara null tidak terlihat tanpa simbol. */
export const hasIsolated = (v: readonly (number | null)[]) =>
  v.some((x, k) => x !== null && (v[k - 1] ?? null) === null && (v[k + 1] ?? null) === null);

/**
 * Sisa pai di luar N teratas = total keseluruhan − jumlah yang tampil, bertanda. Sisa pembulatan
 * floating-point (desimal Rupiah miliaran) dianggap 0 — tanpa "Lainnya" semu atau peringatan negatif
 * palsu.
 */
export function pieRest(
  values: readonly (number | null)[],
  grandTotal: number | null | undefined,
  cut: boolean,
): number {
  if (!cut || typeof grandTotal !== "number") return 0;
  let sum = 0;
  let abs = Math.abs(grandTotal);
  for (const v of values) {
    sum += v ?? 0;
    abs += Math.abs(v ?? 0);
  }
  const rest = grandTotal - sum;
  return Math.abs(rest) <= Math.max(1e-9 * abs, 1e-6) ? 0 : rest;
}

/** Indeks baris legenda urut nilai terbesar dulu (stabil); "Lainnya" ikut menurut nilainya. */
export function legendOrder(values: readonly (number | null)[]): number[] {
  return values.map((_, i) => i).sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0));
}

/**
 * Skala sumbu durasi (detik): jam, atau menit bila nilai terbesar < 1 jam — garis sumbu jatuh di angka
 * bulat (10, 20 jam), bukan kelipatan detik (100 rb). Satuan di nama sumbu.
 */
export function durationScale(values: readonly (number | null)[]): { div: number; unit: string } {
  const max = values.reduce<number>((m, v) => Math.max(m, Math.abs(v ?? 0)), 0);
  return max < 3600 ? { div: 60, unit: "menit" } : { div: 3600, unit: "jam" };
}

/**
 * Daftar peringkat kartu sempit: kategori yang tidak terdaftar (baris yang tidak muat, atau sudah
 * dipotong server tanpa "Lainnya") diringkas di baris terakhir "+N lainnya". moreValue = jumlah nilai
 * baris tersembunyi; null bila sebagian tidak diketahui (kategori di luar N tanpa "Lainnya").
 */
export function rankedItems<T extends { value: number | null; others?: boolean }>(
  rows: readonly T[],
  fit: number,
  categories: number,
): { items: T[]; more: number; moreValue: number | null } {
  const real = rows.filter((r) => !r.others).length;
  const unlisted = rows.some((r) => r.others) ? 0 : Math.max(0, categories - real);
  if (rows.length <= fit && unlisted === 0) return { items: [...rows], more: 0, moreValue: 0 };
  // Satu baris untuk "+N lainnya".
  const items = rows.slice(0, Math.max(1, Math.min(rows.length, fit - 1)));
  const hidden = rows.slice(items.length);
  const listed = items.filter((r) => !r.others).length;
  const more = real - listed + (items.some((r) => r.others) ? 0 : Math.max(0, categories - real));
  const moreValue = unlisted > 0 ? null : hidden.reduce((s, r) => s + (r.value ?? 0), 0);
  return { items, more, moreValue };
}

const VALUE_CHAR_PX = 8;
const LABEL_CHAR_PX = 7.7;
const CELL_PAD_PX = 24;

/**
 * Tata letak tabel data grafik (teks 14 px): kolom nilai selebar teks terpanjang; bila nilai lengkap
 * memakan > 55 % lebar, pakai nilai ringkas. Sisa lebar untuk label (dipendekkan di tengah agar nama
 * berawalan sama tetap bisa dibedakan).
 */
export function tableLayout(
  width: number | null,
  full: readonly string[],
  compact: readonly string[],
): { compact: boolean; valuePx: number | null; labelChars: number } {
  if (!width) return { compact: false, valuePx: null, labelChars: 40 };
  const px = (t: readonly string[]) =>
    t.reduce((m, s) => Math.max(m, s.length), 0) * VALUE_CHAR_PX + CELL_PAD_PX;
  const useCompact = px(full) > width * 0.55;
  const valuePx = Math.round(Math.min(px(useCompact ? compact : full), width * 0.6));
  const labelChars = Math.max(6, Math.floor((width - valuePx - CELL_PAD_PX) / LABEL_CHAR_PX));
  return { compact: useCompact, valuePx, labelChars };
}
