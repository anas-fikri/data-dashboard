import "server-only";
import { hash, verify } from "@node-rs/argon2";

/** Parameter argon2id sesuai T-002 AC: m=64 MiB, t=3, p=1. algorithm 2 = Argon2id (const enum tidak bisa diakses di bawah isolatedModules). */
const ARGON2 = { memoryCost: 65536, timeCost: 3, parallelism: 1, algorithm: 2 as const };

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export function isPasswordAcceptable(password: string): boolean {
  return password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

/**
 * Hash pembanding untuk akun tanpa password (seed) atau email tidak dikenal, agar waktu
 * verifikasi tetap konstan dan tidak membocorkan keberadaan akun.
 */
let dummyHashPromise: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hash("dummy-password-for-constant-time", ARGON2);
  return dummyHashPromise;
}

/** Selalu menjalankan verifikasi argon2 meski hash null (timing konstan); null → selalu false. */
export async function verifyPassword(
  storedHash: string | null,
  password: string,
): Promise<boolean> {
  const target = storedHash ?? (await dummyHash());
  let ok = false;
  try {
    ok = await verify(target, password);
  } catch {
    ok = false;
  }
  return storedHash !== null && ok;
}
