import type { ValueType } from "@/features/widgets/format";
import type { Agg } from "@/features/query/spec";
import type { ChartSort, ChartType } from "@/features/widgets/spec";

/*
 * Olahan data grafik (T-011, verifikasi putaran 3–4) — murni, diuji tanpa DOM: urutan titik garis,
 * periode kontinu untuk sumbu garis per hari/minggu/bulan/kuartal/tahun, sisa "Lainnya" pai dengan
 * toleransi pembulatan, urutan legenda, skala sumbu durasi, baris daftar peringkat yang muat, tata
 * letak tabel data, dan keterangan "N dari M" yang menyesuaikan tinggi kartu.
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

// Tanpa `numeric`: teks diurutkan per karakter seperti SQL nocase.noaccent, batang, dan tabel
// ("Unit 10" sebelum "Unit 2", sama dengan A→Z di Excel).
const collator = new Intl.Collator("id", { sensitivity: "base" });

/**
 * Urutan titik garis di layar. Tanggal: kronologis naik. Dimensi lain dengan urutan label: naik
 * (angka dibanding sebagai angka — Bulan 1..12, bukan 1,10,11,12,2; teks dengan collation id tanpa
 * beda huruf besar/aksen dan tanpa urutan angka alami, seperti urutan server). Urutan nilai: urutan
 * server dipertahankan. Kategori kosong selalu di akhir.
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
 * `empty` (0 untuk total/jumlah, null = garis putus) dan ditandai `filled` (tanpa simbol titik,
 * tooltip "tidak ada data"). Tanggal kosong tidak diplot. Lebih dari `cap` periode → tanpa pengisian
 * (hanya periode yang ada). Hasil urut waktu naik.
 */
export function timeBuckets(
  iso: readonly (string | null)[],
  values: readonly (number | null)[],
  grain: BucketGrain,
  empty: 0 | null,
  cap: number,
): { keys: number[]; values: (number | null)[]; filled: boolean[] } {
  const byKey = new Map<number, number | null>();
  iso.forEach((s, k) => {
    const ms = s ? isoToUtcMs(s) : null;
    if (ms === null) return;
    const key = bucketStart(ms, grain);
    if (!byKey.has(key)) byKey.set(key, values[k] ?? null);
  });
  const present = [...byKey.keys()].sort((a, b) => a - b);
  if (present.length === 0) return { keys: [], values: [], filled: [] };
  const keys: number[] = [];
  for (let b = present[0]!; b <= present.at(-1)!; b = nextBucket(b, grain)) {
    keys.push(b);
    if (keys.length > cap) {
      return {
        keys: present,
        values: present.map((k) => byKey.get(k)!),
        filled: present.map(() => false),
      };
    }
  }
  return {
    keys,
    values: keys.map((k) => (byKey.has(k) ? byKey.get(k)! : empty)),
    filled: keys.map((k) => !byKey.has(k)),
  };
}

/** Nama periode untuk keterangan ("4 dari 24 minggu berisi data"). */
export const GRAIN_NOUN: Record<BucketGrain, string> = {
  day: "hari",
  week: "minggu",
  month: "bulan",
  quarter: "kuartal",
  year: "tahun",
};

/**
 * Ukuran yang menjumlah (total, jumlah baris, jumlah unik): kategori yang ada tetapi semua nilainya
 * kosong = 0, seperti SUMIF Excel dan KPI — bukan "(kosong)" atau garis putus.
 */
export const zeroWhenBlank = (agg: Agg) =>
  agg === "sum" || agg === "count" || agg === "count_distinct";

/** Celah garis karena N titik dipilih menurut nilai: "top" (terbesar) / "bottom" (terkecil). */
export function valueCut(sort: ChartSort, cut: boolean): "top" | "bottom" | undefined {
  if (!cut) return undefined;
  return sort === "value_desc" ? "top" : sort === "value_asc" ? "bottom" : undefined;
}

/**
 * Nilai periode tanpa data. Total/jumlah baris/jumlah unik: 0 (memang tidak ada). Rata-rata/min/maks:
 * null (tidak terdefinisi → garis putus). N titik dipilih menurut nilai dan ada yang terpotong: null —
 * periode di luar N teratas belum tentu kosong.
 */
export function emptyBucketValue(agg: Agg, sort: ChartSort, cut: boolean): 0 | null {
  if (valueCut(sort, cut)) return null;
  return zeroWhenBlank(agg) ? 0 : null;
}

/** Titik tunggal di antara null tidak terlihat tanpa simbol. */
export const hasIsolated = (v: readonly (number | null)[]) =>
  v.some((x, k) => x !== null && (v[k - 1] ?? null) === null && (v[k + 1] ?? null) === null);

/**
 * Sisa pai di luar N teratas = total keseluruhan − jumlah yang tampil, bertanda. Sisa pembulatan
 * floating-point dianggap 0 — tanpa "Lainnya" semu atau peringatan negatif palsu. Toleransi relatif
 * 1e-9 (bukan beberapa ε): SUM DOUBLE di DuckDB atas jutaan baris dijumlah dalam urutan berbeda per
 * kategori dan untuk total, galatnya bisa ~N·ε. Sisa sekecil itu tidak bisa digambar (0 %); ringkasan
 * dan keterangan hanya menyebut "Lainnya" bila irisannya memang ada.
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
/** Label tabel data minimal sepanjang ini; kurang dari itu baris ditumpuk (label di atas nilai). */
const LABEL_MIN_CHARS = 12;

/**
 * Tata letak tabel data grafik (teks 14 px). Kolom nilai selebar teks terpanjang; nilai lengkap
 * memakan > 45 % lebar → nilai ringkas. Label mendapat sisa lebar (dipendekkan di tengah agar nama
 * berawalan sama tetap bisa dibedakan) dan minimal 12 karakter — bila tidak cukup, baris ditumpuk:
 * label selebar kartu (sampai dua baris), nilai di bawahnya (lengkap bila muat).
 */
export function tableLayout(
  width: number | null,
  full: readonly string[],
  compact: readonly string[],
): { compact: boolean; valuePx: number | null; labelChars: number; stacked: boolean } {
  if (!width) return { compact: false, valuePx: null, labelChars: 40, stacked: false };
  const px = (t: readonly string[]) =>
    t.reduce((m, s) => Math.max(m, s.length), 0) * VALUE_CHAR_PX + CELL_PAD_PX;
  const useCompact = px(full) > width * 0.45;
  const valuePx = Math.round(px(useCompact ? compact : full));
  const labelChars = Math.floor((width - valuePx - CELL_PAD_PX) / LABEL_CHAR_PX);
  if (labelChars >= LABEL_MIN_CHARS) {
    return { compact: useCompact, valuePx, labelChars, stacked: false };
  }
  const line = Math.max(LABEL_MIN_CHARS, Math.floor((width - CELL_PAD_PX) / LABEL_CHAR_PX));
  return { compact: px(full) > width, valuePx: null, labelChars: line * 2 - 2, stacked: true };
}

export type NoteMode = "full" | "compact" | "none";
/** Kartu < 140 px: daftar peringkat sebagai ganti grafik. */
export const NARROW = 140;
/** Tinggi kotak grafik minimum: batang/garis 72 px, donat 64 px. */
export const PLOT_MIN: Record<ChartType, number> = { bar: 72, line: 72, pie: 64 };
const NOTE_CHAR_PX = 6.6;
const NOTE_LINE_PX = 16;
/** Keterangan dua baris hanya bila kotak luar ≥ 200 px; jumlah biasa (tidak terpotong) ≥ 220 px. */
const NOTE_TWO_LINES_MIN = 200;
const NOTE_PLAIN_MIN = 220;

/** Baris teks 12 px yang dibutuhkan keterangan selebar kartu (px-3). */
export const noteLines = (text: string, width: number) =>
  Math.max(1, Math.ceil((text.length * NOTE_CHAR_PX) / Math.max(1, width - 24)));

/** Bar per 18 px tinggi kartu: lebih dari itu label bertabrakan → tampilkan N teratas saja. */
export const barsThatFit = (height: number) => Math.max(1, Math.floor((height - 32) / 18));

/**
 * Tinggi kotak donat: legenda di samping mulai 448 px (container @md); di bawahnya legenda di bawah
 * donat setinggi isinya (baris 20 px) dan paling banyak 45 % (+ jarak 8 px).
 */
export function pieChartHeight(width: number, height: number, legendRows: number): number {
  if (width >= 448) return height;
  return height - Math.min(legendRows * 20 + 4, height * 0.45) - 8;
}

export interface FitInput {
  type: ChartType;
  /** Kotak luar (grafik + keterangan). */
  room: { width: number; height: number };
  /** Kategori/titik yang dikirim server, dan seluruhnya (sebelum batas N). */
  rows: number;
  categories: number;
  /** Pai: baris legenda (termasuk "Lainnya") dan ada-tidaknya irisan "Lainnya". */
  legendRows: number;
  others: boolean;
  /** Pai tanpa total keseluruhan (query total gagal) yang mungkin terpotong: persen dari yang tampil. */
  partial: boolean;
  /** Garis per periode dengan periode tanpa data yang diisi: periode di sumbu dan yang berisi data. */
  fill?: { buckets: number; present: number; noun: string };
}
export interface Fit {
  note: NoteMode;
  /** Batang yang digambar (batang: sesuai tinggi; lainnya: semua baris). */
  visible: number;
  ranked: boolean;
  /** Keterangan lengkap (title + pembaca layar) dan yang tampil ("" = tidak ada). */
  full: string;
  shown: string;
}

/**
 * Keterangan di bawah grafik yang menyesuaikan tinggi kartu: lengkap (≤ 2 baris; 2 baris hanya di
 * kartu ≥ 200 px), ringkas satu baris ("5 dari 40 kategori"), atau tidak tampil (ringkasan tetap untuk
 * pembaca layar) — keterangan tidak pernah membuat grafik lebih pendek dari PLOT_MIN. Grafik yang
 * tetap tidak muat (pai di kartu pendek) diganti daftar peringkat.
 */
export function chartFit(i: FitInput): Fit {
  const { width, height } = i.room;
  const noun = i.type === "line" ? "titik" : "kategori";
  const all = i.categories.toLocaleString("id-ID");
  const texts = (visible: number) => {
    if (i.categories > visible) {
      return {
        important: true,
        full: `Menampilkan ${visible} dari ${all} ${noun}${i.others ? " · sisanya di Lainnya" : ""}`,
        compact: `${visible} dari ${all} ${noun}`,
      };
    }
    if (i.partial) {
      return {
        important: true,
        full: `Persentase dari ${visible} kategori yang tampil (total keseluruhan tidak tersedia)`,
        compact: `Persen dari ${visible} yang tampil saja`,
      };
    }
    // Periode berisi data = titik yang digambar bersimbol (tanggal kosong tidak diplot).
    const full = i.fill
      ? `${i.fill.present.toLocaleString("id-ID")} dari ${i.fill.buckets.toLocaleString("id-ID")} ${i.fill.noun} berisi data`
      : `${all} ${noun}`;
    return { important: false, full, compact: "" };
  };
  const plot = (h: number) => (i.type === "pie" ? pieChartHeight(width, h, i.legendRows) : h);
  const visibleAt = (h: number) => (i.type === "bar" ? Math.min(barsThatFit(h), i.rows) : i.rows);

  if (width < NARROW) {
    return { note: "none", visible: i.rows, ranked: true, full: texts(i.rows).full, shown: "" };
  }
  for (const note of ["full", "compact"] as const) {
    // Tinggi keterangan menentukan jumlah batang, dan jumlah batang menentukan teksnya.
    for (const lines of note === "full" ? [1, 2] : [1]) {
      const h = height - lines * NOTE_LINE_PX - 4;
      const visible = visibleAt(h);
      const t = texts(visible);
      const text = note === "full" ? t.full : t.compact;
      if (!text || plot(h) < PLOT_MIN[i.type]) continue;
      if (note === "full") {
        if (noteLines(text, width) !== lines) continue;
        if (!t.important && height < NOTE_PLAIN_MIN) continue;
        if (lines === 2 && height < NOTE_TWO_LINES_MIN) continue;
      }
      return { note, visible, ranked: false, full: t.full, shown: text };
    }
  }
  const visible = visibleAt(height);
  return {
    note: "none",
    visible,
    ranked: plot(height) < PLOT_MIN[i.type],
    full: texts(visible).full,
    shown: "",
  };
}
