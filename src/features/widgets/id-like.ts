/*
 * Kolom bilangan bulat berupa kode/nomor/tahun (dilihat dari namanya) tampil tanpa pemisah ribuan pada
 * format otomatis — "2024" dan "40115", bukan "2.024"/"40.115" (review integritas T-011). Nama dipecah
 * per kata (spasi, _, -, ., angka, camelCase) agar "kode_pos", "tahunLahir", "noResi" ikut cocok.
 *
 * Kata pertama menentukan (frasa bahasa Indonesia berkepala di depan): "No Tagihan" dan "Kode Biaya"
 * kode, "Tagihan Telepon", "Ongkir per Resi", "Tahun Lalu" besaran. Salah tebak ke arah kode lebih
 * berbahaya (10 digit tanpa pemisah mudah salah baca 10×), jadi aturannya sempit. Nama yang tetap
 * ambigu ("Resi Retur": nomor resi retur atau jumlah retur?) diputuskan dari nilainya. Murni.
 */

/** Penanda kode/nomor yang berlaku di posisi mana pun setelah kata netral ("Order ID", "Pengirim No HP"). */
const MARK = new Set([
  "id",
  "kode",
  "kd",
  "code",
  "no",
  "nomor",
  "nik",
  "npwp",
  "nip",
  "nis",
  "nisn",
  "kodepos",
  "zip",
  "postal",
]);
/** Penanda yang hanya berlaku sebagai kata pertama ("Telepon Kantor", "Resi"); "Pulsa Telp" besaran. */
const HEAD_ONLY = new Set(["telp", "tlp", "telepon", "resi", "awb"]);
/**
 * Kata status sesudah penanda kata-pertama: hitungan, bukan kode ("Resi Terkirim", "AWB Masuk Harian",
 * "Resi Gagal" — rekap harian kurir).
 */
const STATUS = new Set([
  "terkirim",
  "dikirim",
  "diterima",
  "terima",
  "gagal",
  "batal",
  "dibatalkan",
  "selesai",
  "diproses",
  "proses",
  "pending",
  "tertunda",
  "sukses",
  "berhasil",
  "hilang",
  "rusak",
  "harian",
  "mingguan",
  "bulanan",
  "tahunan",
  "delivered",
  "sent",
  "received",
  "failed",
  "returned",
  "cancelled",
  "canceled",
  "daily",
  "monthly",
]);
/**
 * Kata arus yang bisa hitungan ("Telepon Masuk" = 10.503 panggilan) atau kode ("Resi Retur", "AWB Masuk"
 * = nomor resi retur/masuk). Nama saja tidak cukup: diputuskan dari nilainya (resolveIdLike).
 */
const FLOW = new Set([
  "masuk",
  "keluar",
  "retur",
  "kirim",
  "incoming",
  "outgoing",
  "inbound",
  "outbound",
]);
/** Kode ambigu yang semua nilainya ≥ 8 digit dianggap kode (nomor resi/AWB 10–12 digit). */
const CODE_MIN = 10_000_000;
/** Tahun hanya sebagai kata pertama ("Tahun", "Tahun Lahir", "thn_masuk"); "Gaji per tahun" besaran. */
const YEAR = new Set(["tahun", "thn", "year"]);
/** "Tahun Lalu", "Tahun 2024", "Year to Date": kolom nilai per periode, bukan kolom tahun. */
const PERIOD = new Set([
  "lalu",
  "ini",
  "sebelumnya",
  "sebelum",
  "depan",
  "berikutnya",
  "kemarin",
  "berjalan",
  "sekarang",
  "last",
  "this",
  "next",
  "previous",
  "prev",
  "current",
  "to",
]);
/** Kata agregat: besaran di posisi mana pun ("Jumlah Resi", "Total ID", "ID Count"). */
const AGG = new Set([
  "jumlah",
  "jml",
  "qty",
  "kuantitas",
  "total",
  "banyak",
  "rata",
  "amount",
  "count",
  "sum",
  "avg",
  "average",
]);
/** Kata uang/ukuran: besaran bila muncul sebelum penanda ("Ongkir per Resi", "Penjualan Kode Pos"). */
const MEASURE = new Set([
  "nilai",
  "harga",
  "omzet",
  "omset",
  "biaya",
  "ongkir",
  "ongkos",
  "tagihan",
  "tarif",
  "gaji",
  "upah",
  "saldo",
  "nominal",
  "pendapatan",
  "penjualan",
  "pemakaian",
  "pulsa",
  "laba",
  "rugi",
  "diskon",
  "potongan",
  "pajak",
  "denda",
  "komisi",
  "bonus",
  "fee",
  "selisih",
  "setoran",
  "pembayaran",
  "piutang",
  "utang",
  "hutang",
  "cicilan",
  "angsuran",
  "iuran",
  "sewa",
  "berat",
  "volume",
  "stok",
  "stock",
  "price",
  "cost",
  "revenue",
  "sales",
  "profit",
]);

const words = (name: string, re: RegExp): string[] =>
  name
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .toLowerCase()
    .match(re) ?? [];

/** "tahunLahir" → ["tahun", "lahir"], "IDPelanggan" → ["id", "pelanggan"], "No. HP" → ["no", "hp"]. */
export function nameTokens(name: string): string[] {
  return words(name, /\p{L}+/gu);
}

/** "id" = kode/nomor/tahun, "quantity" = besaran, "ambiguous" = ditentukan nilainya (resolveIdLike). */
export type IdLikeKind = "id" | "quantity" | "ambiguous";

/** Jenis kolom bilangan bulat dari namanya saja. */
export function idLikeKind(name: string): IdLikeKind {
  // Angka ikut sebagai kata: "Tahun 2024" ≠ "Tahun"; nomor urut di depan ("1. Kode") dilewati.
  const t = words(name, /\p{L}+|\p{N}+/gu);
  const start = t.findIndex((w) => /\p{L}/u.test(w));
  if (start < 0 || t.some((w) => AGG.has(w))) return "quantity";
  const head = t[start]!;
  const next = t[start + 1];
  const kind = (id: boolean): IdLikeKind => (id ? "id" : "quantity");
  if (YEAR.has(head)) return kind(next === undefined || !(PERIOD.has(next) || /\p{N}/u.test(next)));
  // "No. of Orders" = jumlah pesanan.
  if (MARK.has(head)) return kind(next !== "of");
  if (HEAD_ONLY.has(head)) {
    const rest = t.slice(start + 1);
    // "Resi Terkirim", "AWB Masuk Harian": hitungan; "Resi Retur", "Telepon Masuk": lihat nilainya;
    // "Resi", "Telepon Kantor": kode.
    if (next === "of" || rest.some((w) => STATUS.has(w))) return "quantity";
    return rest.some((w) => FLOW.has(w)) ? "ambiguous" : "id";
  }
  for (let i = start; i < t.length; i++) {
    if (MEASURE.has(t[i]!)) return "quantity";
    // "Pendapatan per ID", "Tarif per AWB": tarif per satuan, bukan kode.
    if (MARK.has(t[i]!) && t[i - 1] !== "per") return "id";
  }
  return "quantity";
}

/**
 * Tanpa pemisah ribuan? Kolom ambigu = kode bila semua bilangan bulatnya (halaman tabel ini, atau nilai
 * KPI) ≥ 10.000.000: nomor resi 12 digit "880012345678", bukan "880.012.345.678"; hitungan "10.503".
 */
export function resolveIdLike(kind: IdLikeKind, values: Iterable<unknown>): boolean {
  if (kind !== "ambiguous") return kind === "id";
  let any = false;
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < CODE_MIN) return false;
    any = true;
  }
  return any;
}

/** Nama kolom kode/nomor/tahun (bukan besaran) → angkanya ditulis tanpa pemisah ribuan. Ambigu = besaran. */
export function isIdLikeName(name: string): boolean {
  return idLikeKind(name) === "id";
}
