/*
 * Pemilih periode panel unggah (T-053, rencana G-6 §4.4 "Label"): saran periode dari nama file dan
 * pilihan yang sesuai satuan dataset (bukan teks bebas). Murni — dipakai komponen klien dan diuji unit.
 * Nama file hanya saran: tebakan yang ambigu (beberapa periode berbeda) atau tidak lengkap untuk satuan
 * dataset (mis. hanya tahun untuk dataset bulanan) menghasilkan null, dan pemilih wajib diisi pemilik.
 */
import { periodStartOf, type PeriodGrain } from "@/features/ingest/period";

const MONTHS: Record<string, number> = {
  januari: 1,
  january: 1,
  jan: 1,
  februari: 2,
  pebruari: 2,
  february: 2,
  feb: 2,
  peb: 2,
  maret: 3,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mei: 5,
  may: 5,
  juni: 6,
  june: 6,
  jun: 6,
  juli: 7,
  july: 7,
  jul: 7,
  agustus: 8,
  august: 8,
  agu: 8,
  agt: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  oktober: 10,
  october: 10,
  okt: 10,
  oct: 10,
  november: 11,
  nopember: 11,
  nov: 11,
  nop: 11,
  desember: 12,
  december: 12,
  des: 12,
  dec: 12,
};

/** Tahun yang masuk akal di nama file (bukan nomor acak seperti 0001 atau 9999). */
export const YEAR_MIN = 1990;
export const YEAR_MAX = 2100;

const okYear = (y: number) => y >= YEAR_MIN && y <= YEAR_MAX;
const okMonth = (m: number) => m >= 1 && m <= 12;

type Hit = { year: number; month: number | null; quarter: number | null };

/** Bagian nama file sebelum ekstensi, huruf kecil, pemisah apa pun → spasi. */
function tokensOf(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return ` ${base.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
}

/** Penanda periode setengah tahun (semester, S1/S2, H1/H2): bukan satuan dataset → tanpa tebakan. */
const HALF_YEAR = /(?<= )(?:semester|smt|sem)(?= |[12] )|(?<= )[sh] ?[12](?= )/;
const QUARTER_WORD = "triwulan|kuartal|tw|q";

/**
 * Petunjuk periode di nama file; null = ambigu (penanda semester, rentang bulan, atau angka/bulan/
 * tahun lain yang tersisa setelah petunjuk dibaca — mis. "sales 12 2026 rev 3").
 */
function hitsOf(name: string): Hit[] | null {
  let t = tokensOf(name);
  if (HALF_YEAR.test(t)) return null;
  const hits: Hit[] = [];
  const add = (year: number, month: number | null, quarter: number | null) => {
    if (!okYear(year)) return;
    if (month !== null && !okMonth(month)) return;
    hits.push({ year, month, quarter });
  };
  /** Baca semua kecocokan lalu kosongkan teksnya, agar pola berikutnya tidak membacanya ulang. */
  const scan = (re: RegExp, on: (m: RegExpExecArray) => void) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) on(m);
    t = t.replace(re, " ");
  };
  const monthName = Object.keys(MONTHS)
    .sort((a, b) => b.length - a.length)
    .join("|");
  // Q1 2026, q 1 2026, 2026 Q1, kuartal 1 2026, tw 1 2026 (triwulan) — dibaca dulu, agar
  // "kuartal 4 2025" tidak juga terbaca sebagai bulan 4.
  scan(new RegExp(`(?<= )(?:${QUARTER_WORD}) ?([1-4]) (\\d{4})(?= )`, "g"), (m) =>
    add(Number(m[2]), null, Number(m[1])),
  );
  scan(new RegExp(`(?<= )(\\d{4}) ?(?:${QUARTER_WORD}) ?([1-4])(?= )`, "g"), (m) =>
    add(Number(m[1]), null, Number(m[2])),
  );
  // Tanggal lengkap: 2026 03 15 dan 15 03 2026 → bulannya.
  scan(/(?<= )(\d{4}) (\d{1,2}) (\d{1,2})(?= )/g, (m) => add(Number(m[1]), Number(m[2]), null));
  scan(/(?<= )(\d{1,2}) (\d{1,2}) (\d{4})(?= )/g, (m) => add(Number(m[3]), Number(m[2]), null));
  // 2026 03 / 03 2026 (setelah pemisah dinormalkan), 202603 (YYYYMM rapat).
  scan(/(?<= )(\d{4}) (\d{1,2})(?= )/g, (m) => add(Number(m[1]), Number(m[2]), null));
  scan(/(?<= )(\d{1,2}) (\d{4})(?= )/g, (m) => add(Number(m[2]), Number(m[1]), null));
  scan(/(?<= )(\d{4})(\d{2})(?= )/g, (m) => add(Number(m[1]), Number(m[2]), null));
  // maret 2026 / 2026 maret (tahun dua digit seperti mar26 tidak didukung: ambigu).
  scan(new RegExp(`(?<= )(${monthName}) ?(\\d{4})(?= )`, "g"), (m) =>
    add(Number(m[2]), MONTHS[m[1]!]!, null),
  );
  scan(new RegExp(`(?<= )(\\d{4}) ?(${monthName})(?= )`, "g"), (m) =>
    add(Number(m[1]), MONTHS[m[2]!]!, null),
  );
  // Tahun saja: hanya bila tidak ada petunjuk yang lebih rinci.
  if (!hits.length) scan(/(?<= )(\d{4})(?= )/g, (m) => add(Number(m[1]), null, null));
  // Sisa yang masih tampak seperti periode → ambigu (rentang "jan mar 2026", "rev 3", tahun lain).
  const leftover = new RegExp(
    `(?<= )(?:\\d{1,2}|\\d{4}|${monthName}|(?:${QUARTER_WORD}) ?[1-4]?)(?= )`,
  );
  return leftover.test(t) ? null : hits;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Awal periode satu petunjuk untuk satuan dataset, atau null bila petunjuknya kurang rinci. */
function startOf(grain: PeriodGrain, h: Hit): string | null {
  if (grain === "YEAR") return `${h.year}-01-01`;
  if (grain === "QUARTER") {
    if (h.quarter !== null) return `${h.year}-${pad((h.quarter - 1) * 3 + 1)}-01`;
    if (h.month !== null) return periodStartOf("QUARTER", `${h.year}-${pad(h.month)}-01`);
    return null;
  }
  return h.month !== null ? `${h.year}-${pad(h.month)}-01` : null;
}

/**
 * Saran awal periode (YYYY-MM-DD) dari nama file untuk satuan dataset: "laporan_2026-03.xlsx" →
 * "2026-03-01" (bulan). null bila tidak ada petunjuk, petunjuknya kurang rinci, atau ambigu.
 */
export function guessPeriodFromName(name: string, grain: PeriodGrain): string | null {
  const hits = hitsOf(name);
  if (!hits) return null;
  const starts = new Set<string>();
  for (const h of hits) {
    const s = startOf(grain, h);
    if (s === null) return null; // petunjuk kurang rinci: jangan tebak dari sebagian nama
    starts.add(s);
  }
  return starts.size === 1 ? [...starts][0]! : null;
}

/** Bagian pemilih: tahun + (bulan 1–12 | kuartal 1–4 | tidak ada untuk tahun). */
export interface PeriodParts {
  year: number | null;
  sub: number | null;
}

export function partsOf(grain: PeriodGrain, start: string | null): PeriodParts {
  if (!start) return { year: null, sub: null };
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7));
  if (grain === "YEAR") return { year: y, sub: null };
  return { year: y, sub: grain === "QUARTER" ? Math.floor((m - 1) / 3) + 1 : m };
}

/** Awal periode dari bagian pemilih; null bila belum lengkap. */
export function startFromParts(grain: PeriodGrain, p: PeriodParts): string | null {
  if (p.year === null || !okYear(p.year)) return null;
  if (grain === "YEAR") return `${p.year}-01-01`;
  if (p.sub === null) return null;
  if (grain === "QUARTER") {
    if (p.sub < 1 || p.sub > 4) return null;
    return `${p.year}-${pad((p.sub - 1) * 3 + 1)}-01`;
  }
  return okMonth(p.sub) ? `${p.year}-${pad(p.sub)}-01` : null;
}

/**
 * Pilihan tahun, terbaru dulu: tahun berjalan + 1 sampai 20 tahun ke belakang, diperluas agar tahun
 * terpilih (mis. dari nama file) selalu ada.
 */
export function yearOptions(now: Date, selected: number | null): number[] {
  const cur = now.getFullYear();
  let hi = cur + 1;
  let lo = cur - 20;
  if (selected !== null && okYear(selected)) {
    hi = Math.max(hi, selected);
    lo = Math.min(lo, selected);
  }
  const out: number[] = [];
  for (let y = hi; y >= lo; y--) out.push(y);
  return out;
}
