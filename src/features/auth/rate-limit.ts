import "server-only";
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
  /** Kegagalan login per IP. */
  loginIp: { name: "login:ip", limit: 10, windowSec: 10 * 60 },
  /** Kegagalan login per akun (dilewati untuk perangkat yang pernah sukses). */
  loginAccount: { name: "login:acct", limit: 5, windowSec: 15 * 60 },
  registerEmail: { name: "register:email", limit: 3, windowSec: 60 * 60 },
  registerIp: { name: "register:ip", limit: 20, windowSec: 60 * 60 },
  resendEmail: { name: "resend:email", limit: 3, windowSec: 60 * 60 },
  verifyIp: { name: "verify:ip", limit: 30, windowSec: 10 * 60 },
  resetEmail: { name: "reset:email", limit: 3, windowSec: 60 * 60 },
  resetIp: { name: "reset:ip", limit: 20, windowSec: 60 * 60 },
  /** Percobaan memakai token reset / ganti password yang gagal. */
  resetUseIp: { name: "reset-use:ip", limit: 30, windowSec: 10 * 60 },
  changePassword: { name: "change-pw:user", limit: 5, windowSec: 15 * 60 },
  /** Mulai/lanjutkan unggahan per user (termasuk resume setelah muat ulang). */
  uploadInit: { name: "upload-init:user", limit: 60, windowSec: 60 * 60 },
  /** Permintaan presigned URL per user (1 GB = 64 part; batch ≤ 16). */
  uploadSign: { name: "upload-sign:user", limit: 600, windowSec: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Detik sampai jendela berakhir. */
  retryAfterSec: number;
}

/** Klien minimal yang dibutuhkan (memudahkan Redis palsu di unit test). */
export type RateLimitStore = Pick<Redis, "eval" | "get" | "ttl" | "del">;

/**
 * INCR + EXPIRE NX atomik dalam satu skrip Lua: key tidak pernah tertinggal tanpa TTL
 * meski proses mati di tengah (temuan review T-002 #7).
 */
const INCR_WITH_TTL = `
local n = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1], 'NX')
return {n, redis.call('TTL', KEYS[1])}
`;

function keyOf(rule: RateLimitRule, subject: string): string {
  return `rl:${rule.name}:${subject}`;
}

/** Menambah counter (untuk percobaan yang dihitung) dan mengembalikan status setelahnya. */
export async function hit(
  store: RateLimitStore,
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const [count, ttl] = (await store.eval(
    INCR_WITH_TTL,
    1,
    keyOf(rule, subject),
    String(rule.windowSec),
  )) as [number, number];
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSec: ttl > 0 ? ttl : rule.windowSec,
  };
}

/** Membaca status tanpa menambah counter (dipakai sebelum login: hanya kegagalan yang dihitung). */
export async function peek(
  store: RateLimitStore,
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const key = keyOf(rule, subject);
  const count = Number((await store.get(key)) ?? 0);
  const ttl = count > 0 ? await store.ttl(key) : -2;
  return {
    allowed: count < rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSec: ttl > 0 ? ttl : rule.windowSec,
  };
}

const DECR_IF_POSITIVE = `
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
if n > 0 then return redis.call('DECR', KEYS[1]) end
return 0
`;

/** Mengembalikan satu slot yang sudah direservasi oleh hit() (atomik, tidak pernah negatif). */
export async function release(store: RateLimitStore, rule: RateLimitRule, subject: string) {
  await store.eval(DECR_IF_POSITIVE, 1, keyOf(rule, subject));
}

/** Dipakai setelah login sukses agar kegagalan lama tidak menghukum pengguna sah. */
export async function reset(store: RateLimitStore, rule: RateLimitRule, subject: string) {
  await store.del(keyOf(rule, subject));
}

/**
 * Kunci rate limit per email: buang "+tag" pada local part agar plus-addressing tidak
 * membuka bucket baru untuk mailbox yang sama.
 */
export function emailBucket(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.split("+")[0]}@${domain}`;
}

/**
 * IP klien: hanya percaya header dari reverse proxy bila TRUST_PROXY=true (X-Real-IP yang
 * di-set proxy, bukan X-Forwarded-For yang bisa dipalsukan klien). Proxy WAJIB menimpa
 * header ini (nginx: proxy_set_header X-Real-IP $remote_addr) — diuji di T-023.
 * Tanpa proxy: Next tidak mengekspos alamat socket → "local" (hanya dev; produksi menolak
 * start bila TRUST_PROXY bukan true, lihat env.ts).
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
