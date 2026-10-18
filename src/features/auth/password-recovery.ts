import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendPasswordChangedEmail, sendPasswordResetEmail } from "./email";
import { isAllowedDomain, normalizeEmail } from "./email-domain";
import { hashPassword, isPasswordAcceptable, verifyPassword } from "./password";
import { emailBucket, reset, RULES } from "./rate-limit";
import {
  counted,
  domainNotAllowed,
  fail,
  invalidEmail,
  sendInBackground,
  store,
  type Result,
} from "./service";
import { generateToken, hashToken, isTokenShape, RESET_PASSWORD_TTL_MS } from "./tokens";

/*
 * Lupa / ganti password (T-026). Memakai primitif yang sama dengan registrasi: token hanya
 * hash, sekali pakai atomik, respons netral, email di latar, rate limit dihitung lebih dulu.
 */

/**
 * Minta reset password. Respons selalu netral (anti-enumerasi); token dibuat dan email dikirim
 * di latar hanya untuk akun aktif yang sudah terverifikasi.
 */
export async function requestPasswordReset(emailRaw: unknown, ip: string): Promise<Result> {
  const email = normalizeEmail(emailRaw);
  if (!email) return invalidEmail(emailRaw);
  // Kebijakan domain sudah publik (tampil di /register): menolaknya tidak membocorkan akun,
  // dan mencegah pengguna menunggu email yang tidak akan pernah datang.
  if (!isAllowedDomain(email, env().ALLOWED_EMAIL_DOMAINS)) return domainNotAllowed();
  // IP lebih dulu: permintaan yang sudah diblok per IP tidak boleh mengisi bucket email korban
  // (satu IP tidak bisa mengunci reset banyak akun — review T-026 #1).
  const byIp = await counted("resetIp", ip);
  if (byIp === "down") return fail("SERVICE_UNAVAILABLE");
  if (!byIp.allowed) return fail("RATE_LIMITED", { retryAfterSec: byIp.retryAfterSec });
  const byEmail = await counted("resetEmail", emailBucket(email));
  if (byEmail === "down") return fail("SERVICE_UNAVAILABLE");
  if (!byEmail.allowed) return fail("RATE_LIMITED", { retryAfterSec: byEmail.retryAfterSec });
  sendInBackground(async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !user.emailVerifiedAt) return;
    const token = generateToken();
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose: "RESET_PASSWORD",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_PASSWORD_TTL_MS),
      },
    });
    await sendPasswordResetEmail(email, token);
    logger.info({ userId: user.id }, "tautan reset password dikirim");
  });
  return { ok: true, data: undefined };
}

async function findResetToken(tokenRaw: unknown) {
  if (!isTokenShape(tokenRaw)) return null;
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(tokenRaw) },
    include: { user: { select: { id: true, email: true, isActive: true, passwordHash: true } } },
  });
  if (
    !record ||
    record.purpose !== "RESET_PASSWORD" ||
    record.usedAt ||
    record.expiresAt < new Date() ||
    !record.user.isActive
  ) {
    return null;
  }
  return record;
}

/**
 * Untuk halaman form (GET): validasi token tanpa memakainya (pemindai email aman). firstTime = akun
 * undangan admin yang belum punya password (halaman berjudul "Buat password").
 */
export async function previewPasswordReset(
  tokenRaw: unknown,
): Promise<Result<{ email: string; firstTime: boolean }>> {
  const record = await findResetToken(tokenRaw);
  if (!record) return fail("TOKEN_INVALID");
  return {
    ok: true,
    data: { email: record.user.email, firstTime: record.user.passwordHash === null },
  };
}

/**
 * Pakai token reset (POST): sekali pakai secara atomik, terapkan password baru, batalkan token
 * reset lain, dan naikkan sessionVersion (semua sesi lama terputus).
 */
export async function resetPassword(
  tokenRaw: unknown,
  newPasswordRaw: unknown,
  ip: string,
): Promise<Result<{ email: string }>> {
  if (typeof newPasswordRaw !== "string" || !isPasswordAcceptable(newPasswordRaw)) {
    return fail("WEAK_PASSWORD");
  }
  const rl = await counted("resetUseIp", ip);
  if (rl !== "down" && !rl.allowed) {
    return fail("RATE_LIMITED", { retryAfterSec: rl.retryAfterSec });
  }
  const record = await findResetToken(tokenRaw);
  if (!record) return fail("TOKEN_INVALID");
  const passwordHash = await hashPassword(newPasswordRaw);
  const now = new Date();
  const marked = await prisma.verificationToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });
  if (marked.count !== 1) return fail("TOKEN_INVALID");
  await prisma.$transaction([
    prisma.verificationToken.updateMany({
      where: { userId: record.user.id, purpose: "RESET_PASSWORD", usedAt: null },
      data: { usedAt: now },
    }),
    prisma.user.update({
      where: { id: record.user.id },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    }),
  ]);
  logger.info({ userId: record.user.id }, "password direset");
  const s = await store();
  // Kunci login akun dilepas: korban yang sempat dikunci penyerang bisa langsung masuk.
  if (s) await reset(s, RULES.loginAccount, emailBucket(record.user.email)).catch(() => undefined);
  const email = record.user.email;
  sendInBackground(() => sendPasswordChangedEmail(email, "reset"));
  return { ok: true, data: { email } };
}

/**
 * Ganti password saat login: wajib password lama; sukses menaikkan sessionVersion dan
 * mengembalikan versi baru agar pemanggil menerbitkan ulang sesi di perangkat ini saja.
 */
export async function changePassword(
  userId: string,
  currentRaw: unknown,
  newRaw: unknown,
): Promise<Result<{ id: string; sessionVersion: number }>> {
  if (typeof currentRaw !== "string" || currentRaw === "") return fail("PASSWORD_REQUIRED");
  if (typeof newRaw !== "string" || !isPasswordAcceptable(newRaw)) return fail("WEAK_PASSWORD");
  const rl = await counted("changePassword", userId);
  if (rl === "down") return fail("SERVICE_UNAVAILABLE");
  if (!rl.allowed) return fail("RATE_LIMITED", { retryAfterSec: rl.retryAfterSec });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(user.passwordHash, currentRaw))) {
    return fail("INVALID_CREDENTIALS", { message: "Password saat ini salah." });
  }
  const passwordHash = await hashPassword(newRaw);
  // Batalkan tautan reset yang masih berlaku (mis. diminta penyerang) — review T-026 #2.
  const [, updated] = await prisma.$transaction([
    prisma.verificationToken.updateMany({
      where: { userId, purpose: "RESET_PASSWORD", usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      select: { id: true, sessionVersion: true },
    }),
  ]);
  const s = await store();
  if (s) await reset(s, RULES.changePassword, userId).catch(() => undefined);
  logger.info({ userId }, "password diganti");
  sendInBackground(() => sendPasswordChangedEmail(user.email, "change"));
  return { ok: true, data: updated };
}
