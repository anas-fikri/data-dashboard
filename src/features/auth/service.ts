import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import { sendAlreadyRegisteredEmail, sendVerificationEmail } from "./email";
import { isAllowedDomain, normalizeEmail } from "./email-domain";
import { hashPassword, isPasswordAcceptable, verifyPassword } from "./password";
import { emailBucket, hit, release, reset, RULES, type RateLimitResult } from "./rate-limit";
import { generateToken, hashToken, isTokenShape, VERIFY_EMAIL_TTL_MS } from "./tokens";

/*
 * Logika auth tanpa pengetahuan HTTP (dipakai Server Action dan Route Handler).
 * Setiap fungsi mengembalikan hasil terstruktur; tidak melempar untuk kasus yang diharapkan.
 */

export type AuthCode =
  | "DOMAIN_NOT_ALLOWED"
  | "INVALID_EMAIL"
  | "PASSWORD_REQUIRED"
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
  PASSWORD_REQUIRED: "Masukkan password Anda.",
  WEAK_PASSWORD: "Password harus 12 sampai 128 karakter.",
  RATE_LIMITED: "Terlalu banyak percobaan. Coba lagi beberapa saat.",
  INVALID_CREDENTIALS: "Email atau password salah.",
  EMAIL_NOT_VERIFIED: "Akun belum diaktifkan. Periksa email verifikasi Anda.",
  ACCOUNT_DISABLED: "Akun dinonaktifkan. Hubungi admin.",
  TOKEN_INVALID: "Tautan tidak valid atau sudah kedaluwarsa.",
  SERVICE_UNAVAILABLE: "Layanan sedang tidak tersedia. Coba lagi sebentar.",
};

function fail<T = undefined>(
  code: AuthCode,
  extra?: { retryAfterSec?: number; message?: string },
): Result<T> {
  return { ok: false, code, message: extra?.message ?? MESSAGES[code], ...extra };
}

/** Pesan email yang bisa ditindak: bedakan kosong vs format salah (review desain T-002 #5). */
function invalidEmail(raw: unknown): Result<never> {
  const empty = typeof raw !== "string" || raw.trim() === "";
  return fail("INVALID_EMAIL", {
    message: empty ? "Masukkan email perusahaan Anda." : "Format email tidak valid.",
  });
}

function domainNotAllowed(): Result<never> {
  const list = env()
    .ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`)
    .join(" atau ");
  return fail("DOMAIN_NOT_ALLOWED", { message: `Gunakan email ${list}.` });
}

type Store = Awaited<ReturnType<typeof redisReady>>;

async function store(): Promise<Store | null> {
  try {
    return await redisReady();
  } catch (e) {
    logger.error(
      { err: e instanceof Error ? e.message : String(e) },
      "rate limit store tidak tersedia",
    );
    return null;
  }
}

async function counted(
  ruleKey: keyof typeof RULES,
  subject: string,
): Promise<RateLimitResult | "down"> {
  const s = await store();
  if (!s) return "down";
  try {
    return await hit(s, RULES[ruleKey], subject);
  } catch {
    return "down";
  }
}

/** Pengiriman email di luar jalur respons: waktu respons tidak membocorkan status akun. */
function sendInBackground(task: () => Promise<unknown>) {
  void task().catch((e: unknown) =>
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "tugas email latar gagal"),
  );
}

export interface RegisterInput {
  email: unknown;
  password: unknown;
  name?: unknown;
  ip: string;
}

/**
 * Registrasi. Respons identik untuk email baru, belum terverifikasi, dan sudah terverifikasi
 * (anti-enumerasi, termasuk waktu: hash argon2 selalu dihitung, email dikirim di latar).
 * Password disimpan per token (pendingPasswordHash) dan baru berlaku saat token itu dipakai,
 * sehingga orang lain tidak bisa "menitipkan" password pada email korban (pre-account takeover).
 */
export async function register(input: RegisterInput): Promise<Result<{ email: string }>> {
  const email = normalizeEmail(input.email);
  if (!email) return invalidEmail(input.email);
  if (!isAllowedDomain(email, env().ALLOWED_EMAIL_DOMAINS)) return domainNotAllowed();
  if (typeof input.password !== "string" || !isPasswordAcceptable(input.password)) {
    return fail("WEAK_PASSWORD");
  }
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) || null : null;

  const byIp = await counted("registerIp", input.ip);
  const byEmail = await counted("registerEmail", emailBucket(email));
  if (byIp === "down" || byEmail === "down") return fail("SERVICE_UNAVAILABLE");
  if (!byIp.allowed || !byEmail.allowed) {
    return fail("RATE_LIMITED", {
      retryAfterSec: Math.max(byIp.retryAfterSec, byEmail.retryAfterSec),
    });
  }

  const passwordHash = await hashPassword(input.password); // selalu (timing konstan)
  await purgeStaleThrottled();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing?.emailVerifiedAt) {
    sendInBackground(() => sendAlreadyRegisteredEmail(email));
    return { ok: true, data: { email } };
  }

  // Nama dan password milik pendaftar disimpan di token, bukan di user (review T-002 D).
  const userId =
    existing?.id ?? (await prisma.user.create({ data: { email, passwordHash: null } })).id;
  const token = await createVerifyToken(userId, passwordHash, name);
  sendInBackground(() => sendVerificationEmail(email, token));
  logger.info({ userId }, "registrasi diterima, menunggu verifikasi");
  return { ok: true, data: { email } };
}

/** Token baru TIDAK membatalkan token lain: tiap token membawa password pendaftarnya sendiri. */
async function createVerifyToken(
  userId: string,
  pendingPasswordHash: string | null,
  pendingName: string | null,
) {
  const token = generateToken();
  await prisma.verificationToken.create({
    data: {
      userId,
      purpose: "VERIFY_EMAIL",
      tokenHash: hashToken(token),
      pendingPasswordHash,
      pendingName,
      expiresAt: new Date(Date.now() + VERIFY_EMAIL_TTL_MS),
    },
  });
  return token;
}

/** Kirim ulang: memakai password dari token terbaru yang masih berlaku. Respons selalu netral. */
export async function resendVerification(emailRaw: unknown, ip: string): Promise<Result> {
  const email = normalizeEmail(emailRaw);
  if (!email) return invalidEmail(emailRaw);
  const rl = await counted("resendEmail", emailBucket(email));
  if (rl === "down") return fail("SERVICE_UNAVAILABLE");
  if (!rl.allowed) return fail("RATE_LIMITED", { retryAfterSec: rl.retryAfterSec });
  const ipRl = await counted("registerIp", ip);
  if (ipRl !== "down" && !ipRl.allowed) {
    return fail("RATE_LIMITED", { retryAfterSec: ipRl.retryAfterSec });
  }
  sendInBackground(async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) return;
    const latest = await prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
        purpose: "VERIFY_EMAIL",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!latest?.pendingPasswordHash) return; // tidak ada pendaftaran yang masih berlaku
    const token = await createVerifyToken(user.id, latest.pendingPasswordHash, latest.pendingName);
    await sendVerificationEmail(email, token);
  });
  return { ok: true, data: undefined };
}

export interface VerifyPreview {
  email: string;
  requestedAt: Date;
}

/** Untuk halaman konfirmasi (GET): validasi token tanpa memakainya. */
export async function previewVerification(tokenRaw: unknown): Promise<Result<VerifyPreview>> {
  if (!isTokenShape(tokenRaw)) return fail("TOKEN_INVALID");
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(tokenRaw) },
    include: { user: { select: { email: true } } },
  });
  if (
    !record ||
    record.purpose !== "VERIFY_EMAIL" ||
    record.usedAt ||
    record.expiresAt < new Date()
  ) {
    return fail("TOKEN_INVALID");
  }
  return { ok: true, data: { email: record.user.email, requestedAt: record.createdAt } };
}

/**
 * Verifikasi email (POST dari halaman konfirmasi): token sekali pakai, kedaluwarsa 24 jam.
 * Wajib password yang dibuat saat mendaftar (dicocokkan ke hash milik token ini): orang yang
 * mengklik tautan dari pendaftaran orang lain tidak bisa mengaktifkannya (review T-002 A).
 * Menerapkan password + nama milik token, membatalkan token lain, dan menaikkan sessionVersion.
 */
export async function verifyEmail(
  tokenRaw: unknown,
  passwordRaw: unknown,
  ip: string,
): Promise<Result<{ email: string }>> {
  const rl = await counted("verifyIp", ip);
  if (rl !== "down" && !rl.allowed)
    return fail("RATE_LIMITED", { retryAfterSec: rl.retryAfterSec });
  if (!isTokenShape(tokenRaw)) return fail("TOKEN_INVALID");
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  const now = new Date();
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(tokenRaw) },
    include: { user: { select: { id: true, email: true, emailVerifiedAt: true } } },
  });
  if (!record || record.purpose !== "VERIFY_EMAIL" || record.usedAt || record.expiresAt < now) {
    return fail("TOKEN_INVALID");
  }
  if (!(await verifyPassword(record.pendingPasswordHash, password))) {
    return fail("INVALID_CREDENTIALS");
  }
  const marked = await prisma.verificationToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });
  if (marked.count !== 1) return fail("TOKEN_INVALID");
  await prisma.$transaction([
    prisma.verificationToken.updateMany({
      where: { userId: record.user.id, purpose: "VERIFY_EMAIL", usedAt: null },
      data: { usedAt: now },
    }),
    prisma.user.update({
      where: { id: record.user.id },
      data: {
        emailVerifiedAt: record.user.emailVerifiedAt ?? now,
        ...(record.pendingPasswordHash ? { passwordHash: record.pendingPasswordHash } : {}),
        ...(record.pendingName ? { name: record.pendingName } : {}),
        sessionVersion: { increment: 1 },
      },
    }),
  ]);
  logger.info({ userId: record.user.id }, "email terverifikasi");
  return { ok: true, data: { email: record.user.email } };
}

export interface LoginInput {
  email: unknown;
  password: unknown;
  ip: string;
  /** userId dari cookie perangkat-dikenal (login sukses sebelumnya di perangkat ini). */
  knownDeviceUserId?: string | null;
}

export type LoginSuccess = { id: string; sessionVersion: number };

/**
 * Login. Hanya KEGAGALAN yang dihitung (per IP dan per akun). Perangkat yang pernah sukses
 * untuk akun ini tidak terkena kunci akun (mencegah penyerang mengunci korban).
 * Verifikasi argon2 selalu dijalankan (timing konstan).
 */
export async function login(input: LoginInput): Promise<Result<LoginSuccess>> {
  // Isian kosong tidak menyentuh akun mana pun: beri pesan per field, tidak dihitung rate limit.
  if (typeof input.email !== "string" || input.email.trim() === "")
    return invalidEmail(input.email);
  if (typeof input.password !== "string" || input.password === "") return fail("PASSWORD_REQUIRED");
  const email = normalizeEmail(input.email) ?? "invalid";
  const password = input.password;
  const s = await store();
  if (!s) return fail("SERVICE_UNAVAILABLE");

  const user = await prisma.user.findUnique({ where: { email } });
  const trustedDevice = !!user && input.knownDeviceUserId === user.id;
  const acctKey = emailBucket(email);

  // Reservasi slot secara atomik SEBELUM argon2 (request paralel tidak bisa menyelinap di
  // antara cek dan catat — review T-002 B); slot dikembalikan bila login sukses.
  let ipReserved = false;
  try {
    const byIp = await hit(s, RULES.loginIp, input.ip);
    ipReserved = true;
    if (!byIp.allowed) {
      await release(s, RULES.loginIp, input.ip);
      return fail("RATE_LIMITED", { retryAfterSec: byIp.retryAfterSec });
    }
    if (!trustedDevice) {
      const byAcct = await hit(s, RULES.loginAccount, acctKey);
      if (!byAcct.allowed) {
        await release(s, RULES.loginIp, input.ip);
        await release(s, RULES.loginAccount, acctKey);
        return fail("RATE_LIMITED", { retryAfterSec: byAcct.retryAfterSec });
      }
    }
  } catch {
    // Redis putus di tengah: kembalikan slot IP yang sempat direservasi (best effort).
    if (ipReserved) await release(s, RULES.loginIp, input.ip).catch(() => undefined);
    return fail("SERVICE_UNAVAILABLE");
  }

  // Selalu tepat dua verifikasi argon2 (password akun + token pending terbaru, atau dummy):
  // waktu respons tidak membedakan akun tak ada / belum aktif / aktif (review T-002 C).
  const latestPending =
    user && !user.emailVerifiedAt
      ? await prisma.verificationToken.findFirst({
          where: {
            userId: user.id,
            purpose: "VERIFY_EMAIL",
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          select: { pendingPasswordHash: true },
        })
      : null;
  const [passwordOk, pendingOk] = await Promise.all([
    verifyPassword(user?.passwordHash ?? null, password),
    verifyPassword(latestPending?.pendingPasswordHash ?? null, password),
  ]);

  if (!user || (!passwordOk && !pendingOk)) return fail("INVALID_CREDENTIALS");
  // Password benar: kembalikan slot yang direservasi (hanya kegagalan yang dihitung).
  try {
    await release(s, RULES.loginIp, input.ip);
    if (!trustedDevice) await reset(s, RULES.loginAccount, acctKey);
  } catch {
    /* counter akan kedaluwarsa sendiri */
  }
  if (!user.emailVerifiedAt) return fail("EMAIL_NOT_VERIFIED");
  if (!user.isActive) return fail("ACCOUNT_DISABLED");

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, data: { id: user.id, sessionVersion: user.sessionVersion } };
}

/** Logout: menaikkan sessionVersion → semua JWT lama (termasuk yang bocor) langsung tidak berlaku. */
export async function revokeSessions(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

/** Purge paling sering sekali per jam (kunci Redis), dipicu registrasi; job terjadwal di T-023. */
async function purgeStaleThrottled() {
  const s = await store();
  if (!s) return;
  try {
    const got = await s.set("maint:purge-stale", "1", "EX", 3600, "NX");
    if (got === "OK") await purgeStale();
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "purge akun basi gagal");
  }
}

/**
 * Pemeliharaan: hapus akun non-admin yang belum verifikasi, dibuat > 24 jam lalu, dan TIDAK
 * punya token verifikasi yang masih berlaku (tautan di inbox tetap hidup — review T-002 E);
 * lalu hapus token kedaluwarsa.
 */
export async function purgeStale(now = new Date()): Promise<{ users: number; tokens: number }> {
  const cutoff = new Date(now.getTime() - VERIFY_EMAIL_TTL_MS);
  const users = await prisma.user.deleteMany({
    where: {
      emailVerifiedAt: null,
      createdAt: { lt: cutoff },
      isAdmin: false,
      tokens: { none: { purpose: "VERIFY_EMAIL", usedAt: null, expiresAt: { gt: now } } },
    },
  });
  const tokens = await prisma.verificationToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return { users: users.count, tokens: tokens.count };
}
