// Sumber data sintetis 10.000.000 baris: nilai dihitung saat diminta (tidak ada array 10 jt).
// ?rows=N hanya untuk investigasi (default 10 jt).
export const ROWS = Number(new URLSearchParams(globalThis.location?.search ?? "").get("rows")) || 10_000_000;

export const COLUMNS = [
  { title: "ID resi", type: "text", width: 130 },
  { title: "Tanggal kirim", type: "date", width: 130 },
  { title: "Kota asal", type: "text", width: 120 },
  { title: "Kota tujuan", type: "text", width: 120 },
  { title: "Berat (kg)", type: "number", width: 110 },
  { title: "Ongkir (Rp)", type: "number", width: 130 },
  { title: "COD", type: "bool", width: 80 },
  { title: "Kurir", type: "text", width: 120 },
  { title: "Layanan", type: "text", width: 110 },
  { title: "Nilai barang (Rp)", type: "number", width: 150 },
  { title: "Status", type: "text", width: 120 },
  { title: "Catatan", type: "text", width: 220 },
];

const KOTA = ["Jakarta", "Surabaya", "Bandung", "Medan", "Semarang", "Makassar", "Palembang", "Denpasar", "Yogyakarta", "Balikpapan"];
const KURIR = ["Andi", "Budi", "Citra", "Dewi", "Eko", "Fajar", "Gita", "Hadi"];
const LAYANAN = ["Reguler", "Kilat", "Ekonomi", "Kargo"];
const STATUS = ["Terkirim", "Dalam perjalanan", "Gagal kirim", "Retur"];
const CATATAN = ["", "Titip satpam", "=SUM(A1:A9)", "+62 812 0000", "-", "@kantor", "Rumah pagar hijau, dekat masjid"];

// Hash deterministik (baris, kolom) → uint32.
function h(row, col) {
  let x = (Math.imul(row ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(col + 1, 0xc2b2ae35)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

const DAY = 86_400_000;
const BASE = Date.UTC(2024, 0, 1);

/** Nilai mentah bertipe. */
export function cellValue(row, col) {
  const r = h(row, col);
  switch (col) {
    case 0:
      return "PCP" + String(row + 1).padStart(8, "0");
    case 1:
      return new Date(BASE + (r % 730) * DAY);
    case 2:
    case 3:
      return KOTA[r % KOTA.length];
    case 4:
      return (r % 50000) / 100; // 0,00–499,99 kg
    case 5:
      return 9000 + (r % 400) * 500;
    case 6:
      return r % 3 === 0;
    case 7:
      return KURIR[r % KURIR.length];
    case 8:
      return LAYANAN[r % LAYANAN.length];
    case 9:
      return (r % 100_000_000) + 0.5 * (r % 2);
    case 10:
      return STATUS[r % STATUS.length];
    default:
      return CATATAN[r % CATATAN.length];
  }
}

const NF_INT = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const NF_DEC = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DF = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const formatInt = (n) => NF_INT.format(n);

/** Teks tampilan (format id-ID). */
export function cellText(row, col) {
  const v = cellValue(row, col);
  const t = COLUMNS[col].type;
  if (t === "number") return col === 4 || col === 9 ? NF_DEC.format(v) : NF_INT.format(v);
  if (t === "date") return DF.format(v);
  if (t === "bool") return v ? "Ya" : "Tidak";
  return v;
}

/**
 * Nilai salinan yang terbaca Excel (rencana §3.5): angka tanpa pemisah ribuan, pemisah desimal
 * mengikuti pilihan pengguna, tanggal ISO, netralisasi formula hanya untuk sel teks.
 */
export function cellCopy(row, col, decimal = ",") {
  const v = cellValue(row, col);
  const t = COLUMNS[col].type;
  if (t === "number") return String(v).replace(".", decimal);
  if (t === "date") return v.toISOString().slice(0, 10);
  if (t === "bool") return v ? "Ya" : "Tidak";
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

export function toTsv(rows) {
  return rows.map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\r\n");
}

/** Huruf kolom gaya Excel: 0 → A, 25 → Z, 26 → AA. */
export function colLetter(i) {
  let s = "";
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}
