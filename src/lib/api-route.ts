import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireUser, type SessionUser } from "@/features/auth/session";
import { isSameOrigin } from "@/features/uploads/http";
import { appOrigins } from "@/lib/env";
import { readTextLimited } from "@/lib/http-body";
import { logger } from "@/lib/logger";

/*
 * Kerangka Route Handler JSON (T-008, T-010): sesi server (401 tanpa sesi), respons no-store, error tak
 * terduga → 503 tanpa detail internal (dicatat di log), dan pembacaan body berbatas untuk mutasi
 * (Origin wajib = APP_URL, content-type JSON).
 */

const noStore = { "Cache-Control": "no-store" };

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...noStore, ...headers } });

export async function withUser(
  label: string,
  fn: (userId: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  return withSessionUser(label, (user) => fn(user.id));
}

/** Sama dengan withUser, tetapi fn menerima user sesi lengkap (mis. isAdmin, T-h807). */
export async function withSessionUser(
  label: string,
  fn: (user: SessionUser) => Promise<NextResponse>,
): Promise<NextResponse> {
  let user: SessionUser;
  try {
    user = await requireUser("action");
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, code: e.code }, 401);
    throw e;
  }
  const userId = user.id;
  try {
    return await fn(user);
  } catch (e) {
    logger.error({ userId, err: e instanceof Error ? e.message : String(e) }, label);
    return json(
      {
        ok: false,
        code: "UNAVAILABLE",
        message: "Layanan sedang tidak tersedia. Coba lagi beberapa saat lagi.",
      },
      503,
    );
  }
}

/** Origin lain → respons 403 siap kirim; null = boleh lanjut. */
export function rejectCrossOrigin(req: NextRequest): NextResponse | null {
  return isSameOrigin(req, appOrigins())
    ? null
    : json({ ok: false, code: "FORBIDDEN", message: "Permintaan ditolak." }, 403);
}

/**
 * Body JSON berbatas: { body } atau respons siap kirim (400 bentuk salah, 413 terlalu besar dengan
 * pesan `tooLarge`).
 */
export async function readJson(
  req: NextRequest,
  maxBytes: number,
  tooLarge = "Permintaan terlalu besar.",
): Promise<{ body: unknown } | { response: NextResponse }> {
  const invalid = {
    response: json({ ok: false, code: "INVALID", message: "Permintaan tidak valid." }, 400),
  };
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return invalid;
  const text = await readTextLimited(req, maxBytes);
  if (text === null) {
    return { response: json({ ok: false, code: "TOO_LARGE", message: tooLarge }, 413) };
  }
  try {
    return { body: JSON.parse(text) };
  } catch {
    return invalid;
  }
}
