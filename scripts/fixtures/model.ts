/*
 * Model sel fixture (T-005): isi setiap sel = fungsi murni dari (seed, sheet, baris, kolom), sehingga
 * file deterministik dan sharedStrings.xml bisa ditulis SETELAH sheet (urutan Excel asli) tanpa
 * menyimpan jutaan string di memori. Dipakai generator xlsx/csv dan verifikasi benchmark.
 */

export interface FixtureOptions {
  seed: number;
  sheets: number;
  rows: number;
  cols: number;
  /** Fraksi kolom bertipe teks (0..1). */
  textRatio: number;
  /** Fraksi sel teks yang unik (sisanya dari kosakata kecil, mis. kategori). */
  uniqueRatio: number;
  /** Baris header (1-based); baris di atasnya berisi judul/keterangan. */
  headerRow: number;
  /** Header duplikat + satu header kosong. */
  dupHeaders: boolean;
  /** Kolom tanggal berisi campuran sel tanggal asli, "dd/mm/yyyy", dan "yyyy-mm-dd". */
  mixedDates: boolean;
  /** Locale angka teks: id = 1.234.567,89; us = 1,234,567.89. */
  numberLocale: "id" | "us";
}

export type ColumnKind =
  "id" | "text" | "category" | "decimal" | "int" | "date" | "flag" | "numtext";

export type Cell =
  | { t: "s"; v: string } // teks
  | { t: "n"; v: number } // angka
  | { t: "d"; v: Date } // tanggal (xlsx: serial bergaya tanggal; csv: dd/mm/yyyy)
  | null; // kosong

/** mulberry32: PRNG 32-bit cepat dan deterministik. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(...n: number[]): number {
  let h = 2166136261;
  for (const x of n) {
    h ^= x >>> 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** FNV-1a 32-bit (checksum isi teks, dipakai verifikasi parser). */
export function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const KOTA = [
  "Jakarta",
  "Surabaya",
  "Bandung",
  "Medan",
  "Makassar",
  "Denpasar",
  "Semarang",
  "Palembang",
  "Balikpapan",
  "Yogyakarta",
];
export const LAYANAN = ["Reguler", "Ekspres", "Kargo", "Same Day", "Sameday Premium", "Dokumen"];
const KATA = [
  "paket",
  "kiriman",
  "gudang",
  "kurir",
  "pelanggan",
  "alamat",
  "rumah",
  "kantor",
  "toko",
  "pabrik",
  "cabang",
  "utama",
  "barat",
  "timur",
  "selatan",
  "utara",
  "lantai",
  "blok",
  "jalan",
  "gang",
  "nomor",
  "kemasan",
  "rapuh",
  "dingin",
  "berat",
  "ringan",
  "cepat",
  "tertunda",
  "diterima",
  "dikembalikan",
  "café",
  "jalur",
  "señal",
  "über",
];
export const FLAGS = ["ya", "tidak"];

export function columnKinds(opts: FixtureOptions): ColumnKind[] {
  const kinds: ColumnKind[] = [];
  const textCols = Math.round(opts.cols * opts.textRatio);
  const fixed: ColumnKind[] = ["id", "date", "decimal", "int", "flag", "numtext"];
  for (let c = 0; c < opts.cols; c++) {
    if (c < fixed.length && opts.cols - c > textCols) kinds.push(fixed[c]!);
    else kinds.push(c % 3 === 0 ? "category" : "text");
  }
  // Pastikan jumlah kolom teks ≈ textRatio
  let have = kinds.filter((k) => k === "text" || k === "category").length;
  for (let c = kinds.length - 1; c >= 0 && have < textCols; c--) {
    if (kinds[c] === "int" || kinds[c] === "decimal") {
      kinds[c] = "text";
      have++;
    }
  }
  return kinds;
}

export function headerNames(opts: FixtureOptions): string[] {
  const base: Record<ColumnKind, string> = {
    id: "No Resi",
    text: "Keterangan",
    category: "Kota Tujuan",
    decimal: "Ongkir",
    int: "Jumlah Koli",
    date: "Tanggal Kirim",
    flag: "COD",
    numtext: "Nilai Barang",
  };
  const seen = new Map<string, number>();
  const names = columnKinds(opts).map((k) => {
    const n = (seen.get(base[k]) ?? 0) + 1;
    seen.set(base[k], n);
    // Tanpa dupHeaders: nama dibuat unik; dengan dupHeaders: nama sama dibiarkan (Total, Total).
    return n === 1 || opts.dupHeaders ? base[k] : `${base[k]} ${n}`;
  });
  if (opts.dupHeaders && names.length > 3) names[names.length - 1] = ""; // header kosong
  return names;
}

function formatNumberText(v: number, locale: "id" | "us"): string {
  const [int, frac] = v.toFixed(2).split(".");
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, locale === "id" ? "." : ",");
  return `${grouped}${locale === "id" ? "," : "."}${frac}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ddmmyyyy = (d: Date) =>
  `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
export const isoDate = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function uniqueText(r: () => number): string {
  const words = 3 + Math.floor(r() * 6);
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(KATA[Math.floor(r() * KATA.length)]!);
  out.push(String(Math.floor(r() * 1e9)));
  let s = out.join(" ");
  // Sesekali karakter yang menguji quoting CSV
  const x = r();
  if (x < 0.01) s = `${s}, "catatan"`;
  else if (x < 0.015) s = `${s}\nbaris kedua`;
  return s;
}

/**
 * Isi sel data (baris data ke-`dataRow`, 0-based, kolom `col`). null = sel kosong (± 2%).
 * Dipanggil ulang dengan argumen sama selalu menghasilkan nilai sama.
 */
export function dataCell(
  opts: FixtureOptions,
  sheet: number,
  dataRow: number,
  col: number,
  kind: ColumnKind,
): Cell {
  const r = rng(mix(opts.seed, sheet, dataRow, col));
  if (kind !== "id" && r() < 0.02) return null;
  switch (kind) {
    case "id":
      return {
        t: "s",
        v: `PCP${String(sheet + 1).padStart(2, "0")}${String(dataRow + 1).padStart(9, "0")}`,
      };
    case "category":
      return r() < 0.5
        ? { t: "s", v: KOTA[Math.floor(r() * KOTA.length)]! }
        : { t: "s", v: LAYANAN[Math.floor(r() * LAYANAN.length)]! };
    case "text":
      return r() < opts.uniqueRatio
        ? { t: "s", v: uniqueText(r) }
        : {
            t: "s",
            v:
              KOTA[Math.floor(r() * KOTA.length)]! +
              " " +
              LAYANAN[Math.floor(r() * LAYANAN.length)]!,
          };
    case "decimal":
      return { t: "n", v: Math.round(r() * 5_000_000) / 100 };
    case "int":
      return { t: "n", v: 1 + Math.floor(r() * 50) };
    case "flag":
      return { t: "s", v: FLAGS[Math.floor(r() * 2)]! };
    case "numtext":
      return { t: "s", v: formatNumberText(r() * 10_000_000, opts.numberLocale) };
    case "date": {
      const d = new Date(Date.UTC(2024, 0, 1) + Math.floor(r() * 900) * 86_400_000);
      if (!opts.mixedDates) return { t: "d", v: d };
      const y = r();
      return y < 0.6
        ? { t: "d", v: d }
        : y < 0.8
          ? { t: "s", v: ddmmyyyy(d) }
          : { t: "s", v: isoDate(d) };
    }
  }
}

/** Baris pembuka di atas header (judul, keterangan, baris kosong). */
export function preambleRows(opts: FixtureOptions, sheet: number): (string | null)[] {
  const rows: (string | null)[] = [];
  for (let i = 1; i < opts.headerRow; i++) {
    if (i === 1) rows.push(`Laporan Pengiriman PCP Express — Sheet ${sheet + 1}`);
    else if (i === 2)
      rows.push(null); // baris kosong (tidak ditulis di xlsx)
    else rows.push(`Dicetak otomatis, seed ${opts.seed}`);
  }
  return rows;
}

export function sheetName(sheet: number): string {
  return `Pengiriman ${sheet + 1}`;
}

export interface SheetManifest {
  name: string;
  headerRow: number;
  /** Nomor baris fisik terakhir (1-based). */
  lastRow: number;
  /** Jumlah baris yang punya ≥ 1 sel berisi. */
  nonEmptyRows: number;
  cols: number;
  /** Jumlah sel teks dan XOR fnv1a("<baris>:<kolom>:<teks>") — tidak bergantung urutan baca. */
  textCells: number;
  textChecksum: number;
  numberCells: number;
  dateCells: number;
}

export function emptySheetManifest(name: string, headerRow: number, cols: number): SheetManifest {
  return {
    name,
    headerRow,
    lastRow: 0,
    nonEmptyRows: 0,
    cols,
    textCells: 0,
    textChecksum: 0,
    numberCells: 0,
    dateCells: 0,
  };
}

/** Catat satu sel teks ke manifest (baris/kolom 1-based). */
export function addText(m: SheetManifest, row: number, col: number, text: string) {
  m.textCells++;
  m.textChecksum = (m.textChecksum ^ fnv1a(`${row}:${col}:${text}`)) >>> 0;
}
