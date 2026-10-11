import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { SESSION_MAX_AGE_SEC, signSession, verifySession } from "./jwt";
import { loginUrl } from "./redirect";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

/** Nama cookie: prefix __Secure- hanya valid di HTTPS, jadi di dev memakai nama polos. */
export function sessionCookieName(): string {
  return env().APP_URL.startsWith("https://") ? "__Secure-dd.session" : "dd.session";
}

function cookieOptions() {
  const secure = env().APP_URL.startsWith("https://");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

/** Membuat JWT untuk user dan menulis cookie sesi. Dipanggil setelah kredensial terverifikasi. */
export async function createSession(user: { id: string; sessionVersion: number }) {
  const token = await signSession({ sub: user.id, sv: user.sessionVersion }, env().AUTH_SECRET);
  (await cookies()).set(sessionCookieName(), token, cookieOptions());
}

export async function destroySession() {
  (await cookies()).set(sessionCookieName(), "", { ...cookieOptions(), maxAge: 0 });
}

/**
 * Pengguna sesi saat ini, atau null. Satu SELECT berindeks PK per permintaan: memastikan
 * isActive dan sessionVersion masih cocok (pencabutan seketika) dan isAdmin dari DB (bukan JWT).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  const claims = await verifySession(token, env().AUTH_SECRET);
  if (!claims) return null;
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
    return null;
  }
  return { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
}

export class AuthError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "NOT_FOUND") {
    super(code);
  }
}

/**
 * Untuk halaman: redirect ke /login?next=<path saat ini> bila tidak ada sesi.
 * Untuk Server Action / Route Handler: lempar AuthError agar pemanggil membalas kode/HTTP.
 */
export async function requireUser(mode: "page" | "action" = "page"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user) return user;
  if (mode === "action") throw new AuthError("UNAUTHENTICATED");
  const h = await headers();
  const current = h.get("x-current-path") ?? "/";
  redirect(loginUrl(current));
}

/** Admin: non-admin mendapat 404/NOT_FOUND (bukan 403) agar keberadaan halaman tidak bocor (D2). */
export async function requireAdmin(mode: "page" | "action" = "page"): Promise<SessionUser> {
  const user = await requireUser(mode);
  if (user.isAdmin) return user;
  if (mode === "action") throw new AuthError("NOT_FOUND");
  notFound();
}
