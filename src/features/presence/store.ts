import type Redis from "ioredis";

/*
 * Kehadiran user (T-h807, khusus admin): tab aplikasi yang terlihat mengirim heartbeat ±60 dtk; server
 * mencatat waktu terakhir aktif per user (ZSET, skor = epoch ms) dan halaman terakhir (string ber-TTL).
 * "Online" = aktif dalam ONLINE_WINDOW_MS. Data lebih tua dari RETENTION_MS dibuang saat menulis, dan semua
 * kunci ber-TTL — tanpa riwayat jangka panjang (privasi). Redis diinjeksi (uji tanpa Redis).
 */

export const ONLINE_WINDOW_MS = 5 * 60_000;
export const RETENTION_MS = 24 * 60 * 60_000;
const RETENTION_SEC = RETENTION_MS / 1000;

const ZKEY = "presence:z";
const pathKey = (userId: string) => `presence:p:${userId}`;

export type PresenceRedis = Pick<Redis, "multi" | "zrangebyscore" | "mget">;

/**
 * Path halaman yang boleh disimpan: hanya pathname aplikasi (tanpa query/hash — ?f= bisa berisi nilai
 * filter), karakter aman, paling panjang 200; /api dan /render tidak pernah dicatat. Selain itu null.
 */
export function cleanPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.split(/[?#]/, 1)[0]!;
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 200) return null;
  if (!/^[A-Za-z0-9/_.~-]*$/.test(path)) return null;
  if (/^\/(api|render)(\/|$)/.test(path)) return null;
  return path;
}

/** Catat heartbeat user (id dari sesi, bukan dari body). */
export async function touchPresence(
  r: PresenceRedis,
  userId: string,
  path: string | null,
  now = Date.now(),
): Promise<void> {
  const m = r
    .multi()
    .zadd(ZKEY, now, userId)
    .zremrangebyscore(ZKEY, "-inf", now - RETENTION_MS)
    .expire(ZKEY, RETENTION_SEC);
  if (path) m.set(pathKey(userId), path, "EX", RETENTION_SEC);
  await m.exec();
}

export interface PresenceEntry {
  userId: string;
  /** Epoch ms terakhir aktif. */
  lastSeen: number;
  /** Halaman terakhir (pathname bersih) bila ada. */
  path: string | null;
}

/** User yang aktif dalam jendela online, terbaru dulu. */
export async function readOnline(
  r: PresenceRedis,
  now = Date.now(),
  windowMs = ONLINE_WINDOW_MS,
): Promise<PresenceEntry[]> {
  const raw = await r.zrangebyscore(ZKEY, now - windowMs, "+inf", "WITHSCORES");
  const pairs: { userId: string; lastSeen: number }[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    pairs.push({ userId: raw[i]!, lastSeen: Number(raw[i + 1]) });
  }
  pairs.sort((a, b) => b.lastSeen - a.lastSeen);
  if (!pairs.length) return [];
  const paths = await r.mget(...pairs.map((p) => pathKey(p.userId)));
  return pairs.map((p, i) => ({ ...p, path: cleanPath(paths[i]) }));
}
