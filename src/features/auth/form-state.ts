import type { AuthCode } from "./service";

export type AuthField = "email" | "password" | "name" | "current";

/** Bentuk state untuk useActionState di form auth (keputusan D2: code, bukan HTTP status). */
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      code: AuthCode;
      message: string;
      retryAfterSec?: number;
      /** Field yang salah (null = kesalahan level form). */
      field: AuthField | null;
      /** Isian yang dikembalikan agar tidak hilang setelah error (password sengaja tidak). */
      values: { email: string; name: string };
    }
  | {
      status: "success";
      email: string;
      /** Konfirmasi tambahan, mis. "Tautan baru dikirim pukul 14.05." setelah kirim ulang. */
      note?: string;
    };

/** Pemetaan kode → field agar error tampil di bawah kontrol yang bersangkutan. */
export function fieldOf(code: AuthCode): AuthField | null {
  switch (code) {
    case "INVALID_EMAIL":
    case "DOMAIN_NOT_ALLOWED":
      return "email";
    case "WEAK_PASSWORD":
    case "PASSWORD_REQUIRED":
      return "password";
    default:
      return null;
  }
}

/** Pesan rate limit dengan waktu tunggu nyata (review desain T-002 #4). */
export function withRetryHint(code: AuthCode, message: string, retryAfterSec?: number): string {
  if (code !== "RATE_LIMITED" || !retryAfterSec) return message;
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`;
}
