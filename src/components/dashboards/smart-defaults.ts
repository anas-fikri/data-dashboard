import type { SourceSheet } from "@/features/dashboards/service";
import type { ColumnType } from "@/features/ingest/infer";

/*
 * Isian bawaan "pintar" widget baru (T-12zs): memilih kolom ukuran, kategori, dan tanggal dari
 * statistik skema yang sudah disimpan saat ingest (distinctCount, nullPct, nonEmpty) — bukan sekadar
 * kolom angka/teks pertama, yang sering menghasilkan "Total No." (menjumlah nomor urut). Deterministik:
 * skor sama → urutan kolom di sheet. Kolom tanpa statistik (skema lama, kolom sistem Periode) dinilai
 * netral, jadi sheet tanpa statistik sama sekali kembali ke perilaku lama (kolom pertama). Murni.
 */
type Column = SourceSheet["columns"][number];

const NUMERIC: ColumnType[] = ["integer", "decimal", "duration"];
const TEMPORAL: ColumnType[] = ["date", "timestamp"];

/** Kata nama kolom penanda nomor/kode (bukan besaran yang masuk akal dijumlah). */
const ID_WORDS = new Set([
  "no",
  "nomor",
  "nomer",
  "id",
  "kode",
  "kd",
  "code",
  "nik",
  "npwp",
  "nip",
]);
/** Kata nama kolom besaran: kolom bilangan bulat yang hampir semuanya unik tetap dianggap ukuran. */
const MEASURE_WORDS = [
  "omzet",
  "omset",
  "total",
  "nilai",
  "harga",
  "biaya",
  "ongkir",
  "ongkos",
  "tarif",
  "jumlah",
  "qty",
  "berat",
  "amount",
  "price",
  "revenue",
  "sales",
  "penjualan",
  "pendapatan",
  "bayar",
  "tagihan",
  "diskon",
  "komisi",
  "profit",
  "laba",
  "saldo",
  "volume",
  "kg",
  "koli",
  "pcs",
  "nominal",
  "rp",
  "rupiah",
  "pajak",
  "ppn",
  "gaji",
  "debit",
  "kredit",
  "premi",
  "denda",
  "cod",
  "setor",
];
/** Kata nama kolom bagian tanggal (Tahun, Bulan, …): angka, tetapi tidak masuk akal dijumlah. */
const DATE_PART_WORDS = new Set([
  "tahun",
  "thn",
  "bulan",
  "bln",
  "minggu",
  "pekan",
  "hari",
  "tanggal",
  "tgl",
  "periode",
  "kuartal",
  "triwulan",
  "semester",
  "jam",
  "year",
  "month",
  "week",
  "day",
  "quarter",
  "hour",
]);
/** Rentang nilai unik kategori yang enak dibaca di grafik/pivot. */
export const CATEGORY_MIN = 2;
export const CATEGORY_MAX = 50;
/** Proporsi nilai unik terhadap sel terisi yang menandai kolom ID/nomor urut. */
const UNIQUE_RATIO = 0.95;
/** Di bawah ini rasio unik tidak bermakna (sheet kecil: semua nilai wajar unik). */
const UNIQUE_MIN_ROWS = 20;

const words = (name: string) =>
  name
    // camelCase dipisah: "NoTagihan" → "No Tagihan".
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Nama seperti "No", "No.", "Nomor Resi", "ID Pelanggan", "Kode Cabang" (tidak "Nominal"). */
export const isIdName = (name: string) => words(name).some((w) => ID_WORDS.has(w));

/** Awalan kata nomor/kode yang ditulis menyatu (NOSETORAN, kdbayar). */
const ID_PREFIX = /^(no|nomor|nomer|id|kode|kd|ref)/;

/**
 * Kata besaran di awal kata; yang ≥ 4 huruf juga di tengah kata (Pembayaran, Setoran) — kecuali
 * kata itu diawali nomor/kode yang ditulis menyatu (NOSETORAN, KDBAYAR tetap nomor).
 */
const isMeasureName = (name: string) =>
  words(name).some((w) =>
    MEASURE_WORDS.some(
      (m) => w.startsWith(m) || (m.length >= 4 && w.includes(m) && !ID_PREFIX.test(w)),
    ),
  );

/** Nama yang seluruhnya bagian tanggal ("Tahun", "Bulan"; bukan "Bulan Kirim" atau "Jam Lembur"). */
const isDatePartName = (name: string) => {
  const ws = words(name);
  return ws.length > 0 && ws.every((w) => DATE_PART_WORDS.has(w));
};

/** Nama memuat bagian tanggal tanpa kata besaran ("Bulan Kirim", "Tahun Anggaran"). */
const hasDatePart = (name: string) =>
  words(name).some((w) => DATE_PART_WORDS.has(w)) && !isMeasureName(name);

/**
 * Kolom angka yang sebenarnya ID/nomor urut: namanya No./ID/Kode/Nomor, atau bilangan bulat yang
 * hampir semua nilainya berbeda (≥ 95% sel terisi) — kecuali namanya jelas besaran (Omzet, Harga, …).
 * Desimal tidak dinilai dari keunikannya: nominal per transaksi wajar hampir semuanya berbeda.
 */
export function isIdLike(c: Column): boolean {
  if (isIdName(c.name)) return true;
  if (c.type !== "integer" || isMeasureName(c.name)) return false;
  const { distinct, filled } = c;
  if (distinct === undefined || filled === undefined || filled < UNIQUE_MIN_ROWS) return false;
  return distinct >= UNIQUE_RATIO * filled;
}

/** Banyak sel kosong (> 50%): kurang cocok sebagai isian bawaan. */
const sparse = (c: Column) => (c.nullPct ?? 0) > 0.5;

const byScore = <T extends Column>(cols: T[], score: (c: T) => number): T[] =>
  [...cols].sort((a, b) => score(a) - score(b) || a.pos - b.pos);

/**
 * Kolom ukuran (Total) urut kecocokan: angka bukan ID dan bukan bagian tanggal (Tahun, Bulan, …);
 * nama yang memuat bagian tanggal (Bulan Kirim) paling akhir, lalu yang banyak kosong; di antara
 * sisanya nama besaran (Omzet, Harga, …) didahulukan.
 * Kolom yang dilewati tetap bisa dipilih pengguna di panel.
 */
export function measureCandidates(cols: Column[]): Column[] {
  return byScore(
    cols.filter((c) => NUMERIC.includes(c.type) && !isIdLike(c) && !isDatePartName(c.name)),
    (c) => (hasDatePart(c.name) ? 4 : 0) + (sparse(c) ? 2 : 0) + (isMeasureName(c.name) ? 0 : 1),
  );
}

/**
 * Skor kategori (kecil = lebih cocok): 2–50 nilai unik dan jarang kosong paling baik; tanpa statistik
 * netral; terlalu banyak nilai unik (mis. nomor resi) lalu satu nilai saja paling akhir.
 */
function categoryScore(c: Column): number {
  const sparsePenalty = sparse(c) ? 1 : 0;
  const { distinct } = c;
  if (distinct === undefined || distinct === 0) return 2 + sparsePenalty;
  if (distinct >= CATEGORY_MIN && distinct <= CATEGORY_MAX) return sparsePenalty;
  return distinct > CATEGORY_MAX ? 4 + sparsePenalty : 6 + sparsePenalty;
}

/** Kolom teks urut kecocokan sebagai kategori (Kelompokkan / baris pivot). */
export function categoryCandidates(cols: Column[]): Column[] {
  return byScore(
    cols.filter((c) => c.type === "text"),
    categoryScore,
  );
}

/** Kolom tanggal untuk garis/kolom pivot: yang tidak banyak kosong dulu, lalu urutan sheet. */
export function dateCandidates(cols: Column[]): Column[] {
  return byScore(
    cols.filter((c) => TEMPORAL.includes(c.type)),
    (c) => (sparse(c) ? 1 : 0),
  );
}
