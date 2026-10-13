import type { ValueType } from "@/features/widgets/format";
import type { Agg } from "@/features/query/spec";
import type { ChartSort, ChartType } from "@/features/widgets/spec";

/*
 * Olahan data grafik (T-011, verifikasi putaran 3–5) — murni, diuji tanpa DOM: urutan titik garis,
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

/**
 * "Kantor PCP Express Gambir Unit 11" → "Kantor P…bir Unit 11": awal + akhir tetap terlihat.
 * `tailShare`: bagian akhir yang dipertahankan (0,55; 1 = hanya akhir, "…12/25 18:00").
 */
export function middleTruncate(text: string, maxChars: number, tailShare = 0.55): string {
  if (text.length <= maxChars || maxChars < 5) return text;
  const tail = Math.ceil((maxChars - 1) * tailShare);
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

/**
 * Urutan titik garis di layar. Tanggal: kronologis naik. Dimensi lain dengan urutan label: urutan
 * server (SQL sudah mengurutkan teks dengan nocase.noaccent + pemecah seri byte, angka sebagai angka —
 * sama dengan batang dan tabel), dibalik untuk Z→A agar tetap naik di layar. Urutan nilai: urutan
 * server dipertahankan. Kategori kosong di akhir.
 */
export function lineOrder<R extends readonly unknown[]>(
  rows: readonly R[],
  dimType: ValueType,
  sort: ChartSort,
): R[] {
  const temporal = dimType === "date" || dimType === "timestamp";
  if (!temporal && sort !== "label_asc" && sort !== "label_desc") return [...rows];
  const real = rows.filter((r) => r[0] !== null);
  const blank = rows.filter((r) => r[0] === null);
  if (!temporal) return [...(sort === "label_desc" ? real.reverse() : real), ...blank];
  // ISO naive: urutan teks = urutan waktu.
  const key = (r: R) => String(r[0]);
  return [...real.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)), ...blank];
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
 * dipotong server tanpa "Lainnya") diringkas di baris terakhir ("+N kategori lain"). moreValue = jumlah nilai
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

/** "Kantor P…Unit 11" sependek yang perlu agar muat `room` px. */
function middleFit(
  text: string,
  room: number,
  width: (t: string) => number,
  tailShare?: number,
): string {
  const start = Math.min(text.length - 1, Math.ceil((text.length * room) / width(text)) + 2);
  for (let n = start; n >= 5; n--) {
    const t = middleTruncate(text, n, tailShare);
    if (width(t) <= room) return t;
  }
  return middleTruncate(text, 5, tailShare);
}

/**
 * Bagian akhir yang dipertahankan saat label tanggal dipotong di tengah, dicoba berurutan sampai label
 * tidak kembar: awal + akhir ("31/1…5 18:00"), lalu makin banyak akhir (jam yang membedakan baris di
 * hari yang sama). Tanggal tidak pernah dipotong di akhir.
 */
const DATE_TAIL_SHARES = [0.55, 0.7, 0.85, 1, 0.4];

/**
 * Label daftar peringkat yang muat di `rooms[k]` px (`width` = lebar terukur teks 12 px). Teks: utuh
 * bila muat, selain itu dipendekkan di tengah seperlunya. Tanggal (`forms` dari dateLabelForms,
 * terpanjang dulu): bentuk pertama yang muat untuk SEMUA baris tanggal dan tetap membedakan semua
 * periode yang labelnya berbeda; label yang muat tidak pernah dipendekkan. Tidak ada yang muat: bentuk
 * pembeda yang paling sedikit melebihi ruangnya, baris yang tidak muat dipotong di tengah (awal dan akhir
 * tetap terlihat), dan bila masih ada yang kembar, bagian akhirnya diperbanyak — periode berbeda tidak
 * menjadi teks yang sama ("31/12/25 1…" untuk 18:00 dan 15:15).
 */
export function rankedLabels(
  forms: readonly (readonly string[])[],
  rooms: readonly number[],
  width: (t: string) => number,
  dates: boolean,
): string[] {
  const fits = (t: string, k: number) => width(t) <= rooms[k]!;
  const fit = (t: string, k: number, tail?: number) =>
    fits(t, k) ? t : middleFit(t, rooms[k]!, width, tail);
  const first = forms[0]!;
  if (!dates) return first.map((t, k) => fit(t, k));
  const distinct = (f: readonly string[]) => new Set(f).size;
  const unique = forms.filter((f) => distinct(f) === distinct(first));
  // Baris bukan tanggal ("Lainnya", "(kosong)") sama di semua bentuk: tidak ikut menentukan bentuk.
  const dated = first.map((_, k) => forms.some((f) => f[k] !== first[k]));
  const shown = unique.find((f) => f.every((t, k) => !dated[k] || fits(t, k)));
  if (shown) return shown.map((t, k) => fit(t, k));
  const excess = (f: readonly string[]) =>
    f.reduce((s, t, k) => s + Math.max(0, width(t) - rooms[k]!), 0);
  const base = unique.reduce((best, f) => (excess(f) <= excess(best) ? f : best));
  let cut: string[] = [];
  for (const tail of DATE_TAIL_SHARES) {
    cut = base.map((t, k) => fit(t, k, tail));
    if (distinct(cut) === distinct(first)) break;
  }
  return cut;
}

/** Lebar teks 14 px (px) — `header`: kepala kolom (font-medium); null = tidak bisa diukur. */
export type TextMeasure = (text: string, header: boolean) => number | null;
/** Perkiraan tanpa canvas (SSR, uji): ±9,5 px per angka/huruf, 4,5 px per spasi/tanda baca. */
const CHAR_PX_EST = 9.5;
const NARROW_CHAR_PX_EST = 4.5;
/** Canvas tidak memakai angka tabular (tnum): titik/koma tabular ±9 % lebih lebar. */
export const MEASURE_SLACK = 1.1;
const LABEL_CHAR_PX = 7.7;
const CELL_PAD_PX = 24;
/** Label tabel data minimal sepanjang ini; kurang dari itu baris ditumpuk (label di atas nilai). */
const LABEL_MIN_CHARS = 12;

const estimate = (text: string) =>
  [...text].reduce((w, ch) => w + (/[\s.,:;']/.test(ch) ? NARROW_CHAR_PX_EST : CHAR_PX_EST), 0);

/**
 * Baris yang dibutuhkan teks selebar `room` bila dibungkus seperti peramban (kata demi kata; kata yang
 * lebih lebar dari baris dipecah per huruf, seperti break-words).
 */
function lineCount(text: string, room: number, width: (t: string) => number): number {
  let lines = 1;
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (width(next) <= room) {
      cur = next;
      continue;
    }
    if (cur) lines++;
    let rest = word;
    while (rest.length > 1 && width(rest) > room) {
      let k = rest.length - 1;
      while (k > 1 && width(rest.slice(0, k)) > room) k--;
      lines++;
      rest = rest.slice(k);
    }
    cur = rest;
  }
  return lines;
}

/**
 * Teks yang muat dalam dua baris selebar `room`; yang tidak muat dipendekkan di akhir dengan "…"
 * ("Total Pendapatan…", bukan "Total Pendapatan" yang terbaca sebagai ukuran lain).
 */
export function fitTwoLines(text: string, room: number, width: (t: string) => number): string {
  if (lineCount(text, room, width) <= 2) return text;
  const cut = (k: number) => `${text.slice(0, k).trimEnd()}…`;
  let lo = 1;
  let hi = text.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (lineCount(cut(mid), room, width) <= 2) lo = mid;
    else hi = mid - 1;
  }
  return cut(lo);
}

/** Lebar terkecil yang memuat teks dalam dua baris (dipecah di spasi). */
function twoLineWidth(text: string, width: (t: string) => number): number {
  const words = text.split(/\s+/);
  let best = width(text);
  for (let k = 1; k < words.length; k++) {
    const a = width(words.slice(0, k).join(" "));
    best = Math.min(best, Math.max(a, width(words.slice(k).join(" "))));
  }
  return best;
}

/**
 * Tata letak tabel data grafik (teks 14 px). Kolom nilai selebar teks terpanjang yang diukur (canvas;
 * tanpa canvas perkiraan per karakter) — nilai yang muat tidak pernah dipotong — dan minimal selebar
 * kepala kolomnya: satu baris bila muat dalam 45 % lebar, selain itu dua baris (yang tetap tidak muat
 * dipendekkan dengan "…"; teks lengkap di title). Nilai lengkap memakan > 45 % lebar → nilai ringkas. Label
 * mendapat sisa lebar (dipendekkan di tengah agar nama berawalan sama tetap bisa dibedakan) dan
 * minimal 12 karakter (atau sepanjang label terpanjang) — bila tidak cukup, baris ditumpuk: label
 * selebar kartu (sampai dua baris), nilai di bawahnya (lengkap bila muat).
 */
export function tableLayout(
  width: number | null,
  full: readonly string[],
  compact: readonly string[],
  opts: { header?: string; labelLength?: number; measure?: TextMeasure } = {},
): {
  compact: boolean;
  valuePx: number | null;
  labelChars: number;
  stacked: boolean;
  /** Kepala kolom nilai yang tampil (dua kolom: muat dua baris, selebihnya "…"). */
  header: string;
} {
  const headFull = opts.header ?? "";
  if (!width) {
    return { compact: false, valuePx: null, labelChars: 40, stacked: false, header: headFull };
  }
  const textPx = (t: string, header = false) => {
    const m = opts.measure?.(t, header);
    return typeof m === "number" ? m * MEASURE_SLACK : estimate(t);
  };
  const widest = (t: readonly string[]) => t.reduce((m, s) => Math.max(m, textPx(s)), 0);
  const fullPx = widest(full) + CELL_PAD_PX;
  const useCompact = fullPx > width * 0.45;
  const values = useCompact ? widest(compact) : fullPx - CELL_PAD_PX;
  const header = opts.header?.trim() ?? "";
  const headRoom = Math.max(0, width * 0.45 - CELL_PAD_PX);
  const oneLine = header ? textPx(header, true) : 0;
  const head =
    oneLine <= headRoom
      ? oneLine
      : Math.min(
          twoLineWidth(header, (t) => textPx(t, true)),
          headRoom,
        );
  const valuePx = Math.ceil(Math.max(values, head) + CELL_PAD_PX);
  const labelChars = Math.floor((width - valuePx - CELL_PAD_PX) / LABEL_CHAR_PX);
  // Semua label lebih pendek dari batas minimum: cukup sepanjang label terpanjang.
  const need = Math.min(LABEL_MIN_CHARS, Math.max(opts.labelLength ?? LABEL_MIN_CHARS, 4));
  if (labelChars >= need) {
    const shown = header
      ? fitTwoLines(headFull, valuePx - CELL_PAD_PX, (t) => textPx(t, true))
      : headFull;
    return { compact: useCompact, valuePx, labelChars, stacked: false, header: shown };
  }
  // Bertumpuk: kepala kolom satu baris ringkas (CSS memotong dengan "…"), teks lengkap tetap di sel.
  const line = Math.max(LABEL_MIN_CHARS, Math.floor((width - CELL_PAD_PX) / LABEL_CHAR_PX));
  return {
    compact: fullPx > width,
    valuePx: null,
    labelChars: line * 2 - 2,
    stacked: true,
    header: headFull,
  };
}

/** N baris yang diambil server menurut urutan ("5 kategori terbesar"). */
export const RANK_WORD: Record<ChartSort, string> = {
  value_desc: "terbesar",
  value_asc: "terkecil",
  label_asc: "pertama",
  label_desc: "terakhir",
};

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
  /**
   * Tanpa total keseluruhan (query total gagal) dan baris sebanyak batas N: mungkin terpotong. Pai:
   * persen dari yang tampil; batang/garis: "N teratas" menurut `sort`, bukan "N kategori".
   */
  partial: boolean;
  sort?: ChartSort;
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
    if (i.partial && i.type !== "pie") {
      const top = `${visible} ${noun} ${RANK_WORD[i.sort ?? "value_desc"]}`;
      return {
        important: true,
        full: `Menampilkan ${top} (jumlah keseluruhan tidak tersedia)`,
        compact: top,
      };
    }
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
