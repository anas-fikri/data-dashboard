import "server-only";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";

/*
 * Log penolakan akses admin (ASVS V7) yang tidak bisa dipakai membanjiri log (review keamanan T-019
 * putaran 2). Per pengguna (atau "anon") + aksi, per jendela 1 menit: DENIAL_LOG_BURST penolakan
 * pertama dicatat warn seperti biasa, sisanya ditekan lalu diringkas satu baris "<n> penolakan
 * ditekan" setelah jendela berakhir. Fail-open: Redis tidak tersedia → setiap penolakan dicatat.
 * Respons ke klien tidak berubah (pemanggil tetap membalas NOT_FOUND/404).
 */
export const DENIAL_LOG_BURST = 5;
export const DENIAL_LOG_WINDOW_SEC = 60;

/** INCR + EXPIRE NX atomik (pola rate-limit.ts): key tidak pernah tertinggal tanpa TTL. */
const INCR_WITH_TTL = `
local n = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1], 'NX')
return n
`;

export async function logAccessDenied(
  action: string,
  fields: { userId?: string } & Record<string, unknown>,
  msg: string,
): Promise<void> {
  const windowMs = DENIAL_LOG_WINDOW_SEC * 1000;
  const win = Math.floor(Date.now() / windowMs);
  // Satu key per jendela tetap, TTL dua jendela: ringkasan masih bisa membaca hitungan setelah
  // jendelanya berakhir.
  const key = `deny-log:${fields.userId ?? "anon"}:${action}:${win}`;
  let r: Awaited<ReturnType<typeof redisReady>>;
  let n: number;
  try {
    r = await redisReady();
    n = Number(await r.eval(INCR_WITH_TTL, 1, key, String(DENIAL_LOG_WINDOW_SEC * 2)));
  } catch {
    logger.warn(fields, msg);
    return;
  }
  if (n <= DENIAL_LOG_BURST) {
    logger.warn(fields, msg);
    return;
  }
  // Hanya penolakan pertama yang ditekan (INCR atomik → tepat satu permintaan di semua proses)
  // yang menjadwalkan ringkasan jendela ini.
  if (n !== DENIAL_LOG_BURST + 1) return;
  const who = { ...(fields.userId ? { userId: fields.userId } : {}), action };
  // Jejak segera: tetap ada walau proses berhenti sebelum ringkasan jendela ditulis.
  logger.warn({ ...who, windowSec: DENIAL_LOG_WINDOW_SEC }, `${msg}: penolakan berikutnya ditekan`);
  const timer = setTimeout(
    async () => {
      let suppressed: number | null = null;
      try {
        const v = await r.get(key);
        // Key hilang (eviksi LRU): jumlah tidak diketahui, bukan negatif.
        suppressed = v === null ? null : Math.max(0, Number(v) - DENIAL_LOG_BURST);
      } catch {
        // Redis putus setelah jendela: jumlah tidak diketahui, ringkasan tetap ditulis.
      }
      logger.warn(
        { ...who, suppressed, windowSec: DENIAL_LOG_WINDOW_SEC },
        `${msg}: ${suppressed ?? "≥ 1"} penolakan ditekan`,
      );
    },
    (win + 1) * windowMs - Date.now() + 1000,
  );
  timer.unref();
}
