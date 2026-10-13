import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  DEVICE_MAX_AGE_SEC,
  SESSION_MAX_AGE_SEC,
  signDevice,
  signSession,
  verifyDevice,
  verifySession,
} from "./jwt";
import { sessionCookieSpec } from "@/lib/security-headers";
import { loginUrl } from "./redirect";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

function isHttps(): boolean {
  return env().APP_URL.startsWith("https://");
}

/** Nama cookie: prefix __Secure- hanya valid di HTTPS (produksi wajib https, lihat env.ts). */
export function sessionCookieName(): string {
  return sessionCookieSpec(env().APP_URL, SESSION_MAX_AGE_SEC).name;
}

function deviceCookieName(): string {
  return isHttps() ? "__Secure-dd.device" : "dd.device";
}

/** Atribut cookie dari satu sumber yang diuji unit (src/lib/security-headers.ts). */
function cookieOptions(maxAge: number) {
  return sessionCookieSpec(env().APP_URL, maxAge).options;
}

/** Membuat JWT untuk user, menulis cookie sesi, dan menandai perangkat ini sebagai dikenal. */
export async function createSession(user: { id: string; sessionVersion: number }) {
  const jar = await cookies();
  const secrets = env().AUTH_SECRET;
  jar.set(
    sessionCookieName(),
    await signSession({ sub: user.id, sv: user.sessionVersion }, secrets),
    cookieOptions(SESSION_MAX_AGE_SEC),
  );
  jar.set(
    deviceCookieName(),
    await signDevice(user.id, secrets),
    cookieOptions(DEVICE_MAX_AGE_SEC),
  );
}

export async function destroySession() {
  (await cookies()).set(sessionCookieName(), "", cookieOptions(0));
}

/** userId dari cookie perangkat-dikenal (untuk melewati kunci per akun), atau null. */
export async function knownDeviceUserId(): Promise<string | null> {
  const token = (await cookies()).get(deviceCookieName())?.value;
  return token ? verifyDevice(token, env().AUTH_SECRET) : null;
}

/**
 * Sesi + alasan bila tidak berlaku. "disabled" hanya bila JWT sah (ditandatangani untuk akun itu)
 * dan akunnya ada tetapi dinonaktifkan: pemegang cookie memang pemilik akun, jadi alasan ini tidak
 * membuka oracle enumerasi akun.
 */
type SessionLookup = { user: SessionUser } | { user: null; reason: "none" | "disabled" };

async function lookupSession(): Promise<SessionLookup> {
  const none = { user: null, reason: "none" } as const;
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return none;
  const claims = await verifySession(token, env().AUTH_SECRET);
  if (!claims) return none;
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      isActive: true,
      sessionVersion: true,
      emailVerifiedAt: true,
    },
  });
  if (!user || !user.isActive || user.sessionVersion !== claims.sv || !user.emailVerifiedAt) {
    logger.info({ userId: claims.sub }, "sesi tidak valid lagi (nonaktif/sessionVersion basi)");
    return user && !user.isActive ? { user: null, reason: "disabled" } : none;
  }
  return { user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin } };
}

/**
 * Pengguna sesi saat ini, atau null. Satu SELECT berindeks PK per permintaan: memastikan
 * isActive dan sessionVersion masih cocok (pencabutan seketika) dan isAdmin dari DB (bukan JWT).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  return (await lookupSession()).user;
}

export class AuthError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "NOT_FOUND") {
    super(code);
  }
}

/**
 * Untuk halaman: redirect ke /login?next=<path saat ini> bila tidak ada sesi (ditambah
 * &reason=disabled bila akunnya dinonaktifkan admin, AC1 T-019). Cookie basi ditimpa saat login
 * berikutnya (render server tidak boleh menulis cookie).
 * Untuk Server Action / Route Handler: lempar AuthError agar pemanggil membalas kode/HTTP.
 */
export async function requireUser(mode: "page" | "action" = "page"): Promise<SessionUser> {
  const session = await lookupSession();
  if (session.user) return session.user;
  if (mode === "action") throw new AuthError("UNAUTHENTICATED");
  const h = await headers();
  const current = h.get("x-current-path") ?? "/";
  redirect(loginUrl(current, session.reason === "disabled" ? "disabled" : undefined));
}

/** Admin: non-admin mendapat 404/NOT_FOUND (bukan 403) agar keberadaan halaman tidak bocor (D2). */
export async function requireAdmin(mode: "page" | "action" = "page"): Promise<SessionUser> {
  const user = await requireUser(mode);
  if (user.isAdmin) return user;
  if (mode === "action") throw new AuthError("NOT_FOUND");
  notFound();
}
