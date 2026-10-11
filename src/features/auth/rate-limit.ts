import type Redis from "ioredis";

export interface RateLimitRule {
  /** Nama bucket (mis. "login:ip"). */
  name: string;
  /** Maks percobaan dalam jendela. */
  limit: number;
  /** Panjang jendela (detik). */
  windowSec: number;
}

export const RULES = {
  loginIp: { name: "login:ip", limit: 10, windowSec: 10 * 60 },
  loginAccount: { name: "login:acct", limit: 5, windowSec: 15 * 60 },
  registerEmail: { name: "register:email", limit: 3, windowSec: 60 * 60 },
  registerIp: { name: "register:ip", limit: 20, windowSec: 60 * 60 },
  resendEmail: { name: "resend:email", limit: 3, windowSec: 60 * 60 },
  verifyIp: { name: "verify:ip", limit: 30, windowSec: 10 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Detik sampai jendela berakhir. */
  retryAfterSec: number;
}

/** Klien minimal yang dibutuhkan (memudahkan Redis palsu di unit test). */
export type RateLimitStore = Pick<Redis, "incr" | "expire" | "ttl" | "del">;

/**
 * Jendela tetap: INCR + EXPIRE pada percobaan pertama. Fail-closed: bila Redis error,
 * pemanggil memperlakukannya sebagai ditolak (keamanan > ketersediaan untuk login).
 */
export async function hit(
  store: RateLimitStore,
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const key = `rl:${rule.name}:${subject}`;
  const count = await store.incr(key);
  if (count === 1) await store.expire(key, rule.windowSec);
  const ttl = await store.ttl(key);
  const retryAfterSec = ttl > 0 ? ttl : rule.windowSec;
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSec,
  };
}

/** Dipakai setelah login sukses agar kegagalan lama tidak menghukum pengguna sah. */
export async function reset(store: RateLimitStore, rule: RateLimitRule, subject: string) {
  await store.del(`rl:${rule.name}:${subject}`);
}

/**
 * IP klien: hanya percaya header dari reverse proxy bila TRUST_PROXY=true (X-Real-IP yang
 * di-set proxy, bukan X-Forwarded-For yang bisa dipalsukan klien). Tanpa proxy: Next tidak
 * mengekspos alamat socket → "local" (semua klien dev satu bucket).
 */
export function clientIp(headers: Headers, trustProxy: boolean): string {
  if (!trustProxy) return "local";
  const real = headers.get("x-real-ip")?.trim();
  if (real && /^[0-9a-f.:]+$/i.test(real)) return real;
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    // Proxy menambahkan IP klien di ujung kanan; ambil entri terakhir.
    const parts = fwd
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^[0-9a-f.:]+$/i.test(last)) return last;
  }
  return "unknown";
}
