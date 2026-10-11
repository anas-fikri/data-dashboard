import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import { sendAlreadyRegisteredEmail, sendVerificationEmail } from "./email";
import { isAllowedDomain, normalizeEmail } from "./email-domain";
import { hashPassword, isPasswordAcceptable, verifyPassword } from "./password";
import { hit, reset, RULES, type RateLimitResult } from "./rate-limit";
import { generateToken, hashToken, isTokenShape, VERIFY_EMAIL_TTL_MS } from "./tokens";

/*
 * Logika auth tanpa pengetahuan HTTP (dipakai Server Action dan Route Handler).
 * Setiap fungsi mengembalikan hasil terstruktur; tidak melempar untuk kasus yang diharapkan.
 */

export type AuthCode =
  | "DOMAIN_NOT_ALLOWED"
  | "INVALID_EMAIL"
  | "WEAK_PASSWORD"
  | "RATE_LIMITED"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "ACCOUNT_DISABLED"
  | "TOKEN_INVALID"
  | "SERVICE_UNAVAILABLE";

export type Result<T = undefined> =
  { ok: true; data: T } | { ok: false; code: AuthCode; message: string; retryAfterSec?: number };

const MESSAGES: Record<AuthCode, string> = {
  DOMAIN_NOT_ALLOWED: "Email harus memakai domain perusahaan yang diizinkan.",
  INVALID_EMAIL: "Format email tidak valid.",
  WEAK_PASSWORD: "Password harus 12 sampai 128 karakter.",
  RATE_LIMITED: "Terlalu banyak percobaan. Coba lagi beberapa saat.",
  INVALID_CREDENTIALS: "Email atau password salah.",
  EMAIL_NOT_VERIFIED: "Akun belum diaktifkan. Periksa email verifikasi Anda.",
  ACCOUNT_DISABLED: "Akun dinonaktifkan. Hubungi admin.",
  TOKEN_INVALID: "Tautan tidak valid atau sudah kedaluwarsa.",
  SERVICE_UNAVAILABLE: "Layanan sedang tidak tersedia. Coba lagi sebentar.",
};

function fail<T = undefined>(code: AuthCode, extra?: Partial<Result<T>>): Result<T> {
  return { ok: false, code, message: MESSAGES[code], ...extra } as Result<T>;
}

async function limited(
  ruleKey: keyof typeof RULES,
  subject: string,
): Promise<RateLimitResult | "down"> {
  try {
    const r = await redisReady();
    return await hit(r, RULES[ruleKey], subject);
  } catch (e) {
    logger.error(
      { err: e instanceof Error ? e.message : String(e) },
      "rate limit store tidak tersedia",
    );
    return "down";
  }
}

export interface RegisterInput {
  email: unknown;
  password: unknown;
  name?: unknown;
  ip: string;
}

/**
 * Registrasi. Respons untuk email yang sudah terdaftar identik dengan pendaftaran baru
 * (anti-enumerasi); perbedaannya hanya isi email yang dikirim.
 */
export async function register(input: RegisterInput): Promise<Result<{ email: string }>> {
  const email = normalizeEmail(input.email);
  if (!email) return fail("INVALID_EMAIL");
  if (!isAllowedDomain(email, env().ALLOWED_EMAIL_DOMAINS)) return fail("DOMAIN_NOT_ALLOWED");
  if (typeof input.password !== "string" || !isPasswordAcceptable(input.password)) {
    return fail("WEAK_PASSWORD");
  }
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) || null : null;

  const byIp = await limited("registerIp", input.ip);
  const byEmail = await limited("registerEmail", email);
  if (byIp === "down" || byEmail === "down") return fail("SERVICE_UNAVAILABLE");
  if (!byIp.allowed || !byEmail.allowed) {
    return fail("RATE_LIMITED", {
      retryAfterSec: Math.max(byIp.retryAfterSec, byEmail.retryAfterSec),
    });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Sudah ada: beri tahu pemilik email, respons ke UI tetap "cek inbox".
    if (existing.emailVerifiedAt) {
      await sendAlreadyRegisteredEmail(email);
    } else {
      await issueVerification(existing.id, email);
    }
    return { ok: true, data: { email } };
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({ data: { email, name, passwordHash } });
  await issueVerification(user.id, email);
  logger.info({ userId: user.id }, "user terdaftar, menunggu verifikasi");
  return { ok: true, data: { email } };
}

/** Membuat token verifikasi baru (membatalkan yang lama) dan mengirim email. */
async function issueVerification(userId: string, email: string): Promise<boolean> {
  const token = generateToken();
  await prisma.$transaction([
    prisma.verificationToken.updateMany({
      where: { userId, purpose: "VERIFY_EMAIL", usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.verificationToken.create({
      data: {
        userId,
        purpose: "VERIFY_EMAIL",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VERIFY_EMAIL_TTL_MS),
      },
    }),
  ]);
  return sendVerificationEmail(email, token);
}

export async function resendVerification(emailRaw: unknown, ip: string): Promise<Result> {
  const email = normalizeEmail(emailRaw);
  if (!email) return fail("INVALID_EMAIL");
  const rl = await limited("resendEmail", email);
  if (rl === "down") return fail("SERVICE_UNAVAILABLE");
  if (!rl.allowed) return fail("RATE_LIMITED", { retryAfterSec: rl.retryAfterSec });
  const ipRl = await limited("registerIp", ip);
  if (ipRl !== "down" && !ipRl.allowed)
    return fail("RATE_LIMITED", { retryAfterSec: ipRl.retryAfterSec });
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerifiedAt) await issueVerification(user.id, email);
  return { ok: true, data: undefined }; // netral
}

/** Verifikasi email: token sekali pakai, kedaluwarsa 24 jam. */
export async function verifyEmail(
  tokenRaw: unknown,
  ip: string,
): Promise<Result<{ email: string }>> {
  const rl = await limited("verifyIp", ip);
  if (rl !== "down" && !rl.allowed)
    return fail("RATE_LIMITED", { retryAfterSec: rl.retryAfterSec });
  if (!isTokenShape(tokenRaw)) return fail("TOKEN_INVALID");
  const tokenHash = hashToken(tokenRaw);
  const now = new Date();
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, emailVerifiedAt: true } } },
  });
  if (!record || record.purpose !== "VERIFY_EMAIL" || record.usedAt || record.expiresAt < now) {
    return fail("TOKEN_INVALID");
  }
  // Tandai dipakai secara atomik: hanya satu pemanggil yang berhasil bila ada balapan.
  const marked = await prisma.verificationToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });
  if (marked.count !== 1) return fail("TOKEN_INVALID");
  if (!record.user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: record.user.id }, data: { emailVerifiedAt: now } });
  }
  logger.info({ userId: record.user.id }, "email terverifikasi");
  return { ok: true, data: { email: record.user.email } };
}

export interface LoginInput {
  email: unknown;
  password: unknown;
  ip: string;
}

export type LoginSuccess = { id: string; sessionVersion: number };

/** Login: rate limit per IP dan per akun; verifikasi argon2 selalu dijalankan (timing konstan). */
export async function login(input: LoginInput): Promise<Result<LoginSuccess>> {
  const email = normalizeEmail(input.email) ?? "invalid";
  const password = typeof input.password === "string" ? input.password : "";

  const byIp = await limited("loginIp", input.ip);
  if (byIp === "down") return fail("SERVICE_UNAVAILABLE");
  if (!byIp.allowed) return fail("RATE_LIMITED", { retryAfterSec: byIp.retryAfterSec });
  const byAcct = await limited("loginAccount", email);
  if (byAcct === "down") return fail("SERVICE_UNAVAILABLE");
  if (!byAcct.allowed) return fail("RATE_LIMITED", { retryAfterSec: byAcct.retryAfterSec });

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(user?.passwordHash ?? null, password);
  if (!user || !ok) return fail("INVALID_CREDENTIALS");
  if (!user.emailVerifiedAt) return fail("EMAIL_NOT_VERIFIED");
  if (!user.isActive) return fail("ACCOUNT_DISABLED");

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  try {
    const r = await redisReady();
    await reset(r, RULES.loginAccount, email);
  } catch {
    /* counter akan kedaluwarsa sendiri */
  }
  return { ok: true, data: { id: user.id, sessionVersion: user.sessionVersion } };
}

/** Pemeliharaan: hapus user yang tidak pernah verifikasi > 24 jam dan token kedaluwarsa. */
export async function purgeStale(now = new Date()): Promise<{ users: number; tokens: number }> {
  const cutoff = new Date(now.getTime() - VERIFY_EMAIL_TTL_MS);
  const users = await prisma.user.deleteMany({
    where: { emailVerifiedAt: null, createdAt: { lt: cutoff }, isAdmin: false },
  });
  const tokens = await prisma.verificationToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return { users: users.count, tokens: tokens.count };
}
