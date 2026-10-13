/*
 * Kolom bilangan bulat berupa kode/nomor/tahun (dilihat dari namanya) tampil tanpa pemisah ribuan pada
 * format otomatis — "2024" dan "40115", bukan "2.024"/"40.115" (review integritas T-011). Nama dipecah
 * per kata (spasi, _, -, ., angka, camelCase) agar "kode_pos", "tahunLahir", "noResi" ikut cocok.
 * Kolom besaran ("Jumlah WA terkirim", "Gaji per tahun", "Penjualan HP") tetap berpemisah. Murni.
 */

/** Penanda kode/nomor di posisi mana pun ("Kode Pos", "Order ID", "Invoice No"). */
const ID_ANY = new Set([
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
  "telp",
  "tlp",
  "telepon",
  "resi",
  "awb",
  "kodepos",
  "zip",
  "postal",
]);
/** Tahun hanya sebagai kata pertama ("Tahun", "Tahun Ajaran", "thn_masuk"); "Gaji per tahun" besaran. */
const ID_FIRST = new Set(["tahun", "thn", "year"]);
/** Kata besaran: kolom tetap berpemisah ribuan walau ada penanda kode ("Jumlah Resi", "Total ID"). */
const QUANTITY = new Set([
  "jumlah",
  "jml",
  "qty",
  "kuantitas",
  "total",
  "nilai",
  "harga",
  "omzet",
  "omset",
  "biaya",
  "gaji",
  "upah",
  "saldo",
  "nominal",
  "berat",
  "volume",
  "stok",
  "stock",
  "banyak",
  "rata",
  "amount",
  "count",
  "sum",
  "price",
  "cost",
]);

/** "tahunLahir" → ["tahun", "lahir"], "IDPelanggan" → ["id", "pelanggan"], "No. HP" → ["no", "hp"]. */
export function nameTokens(name: string): string[] {
  return name
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

/** Nama kolom kode/nomor/tahun (bukan besaran) → angkanya ditulis tanpa pemisah ribuan. */
export function isIdLikeName(name: string): boolean {
  const words = nameTokens(name);
  if (words.length === 0 || words.some((w) => QUANTITY.has(w))) return false;
  return ID_FIRST.has(words[0]!) || words.some((w) => ID_ANY.has(w));
}
