import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Token 32 byte acak (base64url, 43 karakter); hanya hash-nya yang disimpan di DB. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokensEqual(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA, "hex");
  const b = Buffer.from(hashB, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_PASSWORD_TTL_MS = 30 * 60 * 1000;
/** Undangan akun dari admin (T-c7wf): token RESET_PASSWORD yang lebih panjang umurnya. */
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

/** Format token yang diterima dari URL: base64url 43 karakter persis. */
export function isTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
