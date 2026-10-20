import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { hit, type RateLimitRule } from "@/features/auth/rate-limit";
import { AuthError, requireUser, type SessionUser } from "@/features/auth/session";
import { appOrigins } from "@/lib/env";
import { readTextLimited } from "@/lib/http-body";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import type { UploadCode, UploadResult } from "./service";

/*
 * Pembungkus Route Handler unggah (JSON). Route Handler tidak mendapat cek Origin bawaan seperti
 * Server Action, jadi di sini: Origin wajib sama dengan APP_URL (CSRF; cookie sesi juga SameSite=Lax),
 * body JSON ≤ 8 KB, sesi Node-side (sessionVersion dicek), rate limit per user.
 */

const BODY_MAX = 8 * 1024;

const STATUS: Record<UploadCode, number> = {
  NOT_FOUND: 404,
  INVALID: 400,
  FILE_TOO_LARGE: 413,
  INVALID_FORMAT: 422,
  UPLOAD_CORRUPT: 422,
  UPLOAD_FAILED: 410,
  DATASET_BUSY: 409,
  BUSY: 409,
  INCOMPLETE: 409,
  LIMIT_REACHED: 409,
  QUOTA_EXCEEDED: 409,
  STORAGE_ERROR: 503,
  STALE: 409,
};

const noStore = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...noStore, ...headers } });
}

/** Origin permintaan termasuk origin sah aplikasi (`appOrigins()`: domain publik + akses LAN, T-9t9b). */
export function isSameOrigin(req: NextRequest, allowed: string | readonly string[]): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const own = new URL(origin).origin;
    return (typeof allowed === "string" ? [allowed] : allowed).some(
      (u) => new URL(u).origin === own,
    );
  } catch {
    return false;
  }
}

async function readJson(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false }> {
  if (req.method === "DELETE") return { ok: true, body: {} };
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return { ok: false };
  const text = await readTextLimited(req, BODY_MAX);
  if (text === null) return { ok: false };
  try {
    return { ok: true, body: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false };
  }
}

export async function uploadRoute<T>(
  req: NextRequest,
  rule: RateLimitRule | null,
  handler: (user: SessionUser, body: Record<string, unknown>) => Promise<UploadResult<T>>,
): Promise<NextResponse> {
  if (!isSameOrigin(req, appOrigins())) {
    return json({ ok: false, code: "FORBIDDEN", message: "Permintaan ditolak." }, 403);
  }
  let user: SessionUser;
  try {
    user = await requireUser("action");
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, code: e.code }, 401);
    throw e;
  }
  const parsed = await readJson(req);
  if (
    !parsed.ok ||
    typeof parsed.body !== "object" ||
    parsed.body === null ||
    Array.isArray(parsed.body)
  ) {
    return json({ ok: false, code: "INVALID", message: "Permintaan tidak valid." }, 400);
  }
  if (rule) {
    const rl = await hit(await redisReady(), rule, user.id);
    if (!rl.allowed) {
      return json(
        {
          ok: false,
          code: "RATE_LIMITED",
          message: `Terlalu banyak permintaan unggah. Coba lagi dalam ${Math.ceil(rl.retryAfterSec / 60)} menit.`,
        },
        429,
        { "Retry-After": String(rl.retryAfterSec) },
      );
    }
  }
  try {
    const result = await handler(user, parsed.body as Record<string, unknown>);
    return result.ok ? json(result) : json(result, STATUS[result.code]);
  } catch (e) {
    logger.error(
      { userId: user.id, err: e instanceof Error ? e.message : String(e) },
      "route unggah gagal",
    );
    return json(
      {
        ok: false,
        code: "STORAGE_ERROR",
        message: "Terjadi gangguan. Coba lagi beberapa saat lagi.",
      },
      503,
    );
  }
}
