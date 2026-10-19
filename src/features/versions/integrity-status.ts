import "server-only";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";

/*
 * Hasil pemeriksaan malam storage (T-038): disimpan di Redis sampai pemeriksaan berikutnya, dibaca
 * banner admin di setiap halaman. Redis kosong (baru dipasang/di-restart) = belum ada temuan.
 */
const KEY = "dd:storage-integrity";

export interface IntegrityStatus {
  checkedAt: string;
  /** Kunci terujuk versi hidup yang diperiksa (HEAD). */
  keys: number;
  missing: number;
  /** Kunci yang tidak bisa diperiksa (galat storage sementara, bukan 404) — diperiksa lagi malam berikutnya. */
  unchecked: number;
  /** Contoh kunci yang hilang (maks. 20) untuk log/penelusuran admin. */
  sample: string[];
  /** Objek yatim yang diserahkan ke pembersihan. */
  orphans: number;
}

export async function saveIntegrityStatus(s: IntegrityStatus): Promise<void> {
  await (await redisReady()).set(KEY, JSON.stringify(s));
}

export async function readIntegrityStatus(): Promise<IntegrityStatus | null> {
  const raw = await (await redisReady()).get(KEY);
  return raw ? (JSON.parse(raw) as IntegrityStatus) : null;
}

export interface IntegrityAlert {
  text: string;
}

/** Teks banner admin bila pemeriksaan terakhir menemukan file hilang; null bila tidak. Murni. */
export function integrityAlert(s: IntegrityStatus | null): IntegrityAlert | null {
  if (!s || s.missing === 0) return null;
  const at = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(s.checkedAt));
  return {
    text: `Pemeriksaan storage ${at} menemukan ${s.missing.toLocaleString("id-ID")} file data yang masih dipakai tetapi tidak ada di penyimpanan. Widget yang memakainya bisa gagal dimuat. Cari "kunci data terujuk hilang" di log worker untuk daftar kuncinya, lalu pulihkan dari backup.`,
  };
}

/** Untuk layout: galat Redis tidak menggagalkan halaman. */
export async function currentIntegrityAlert(): Promise<IntegrityAlert | null> {
  try {
    return integrityAlert(await readIntegrityStatus());
  } catch (e) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e) },
      "status integritas storage tidak terbaca",
    );
    return null;
  }
}
