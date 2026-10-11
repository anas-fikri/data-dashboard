import { NextResponse } from "next/server";
import { clientIp } from "@/features/auth/rate-limit";
import * as service from "@/features/auth/service";
import { createSession, knownDeviceUserId } from "@/features/auth/session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const STATUS: Record<service.AuthCode, number> = {
  RATE_LIMITED: 429,
  INVALID_CREDENTIALS: 401,
  EMAIL_NOT_VERIFIED: 403,
  ACCOUNT_DISABLED: 403,
  INVALID_EMAIL: 400,
  WEAK_PASSWORD: 400,
  DOMAIN_NOT_ALLOWED: 400,
  TOKEN_INVALID: 400,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Anti login-CSRF: hanya application/json (form lintas situs tidak bisa mengirimnya tanpa
 * preflight CORS) dan Origin, bila ada, harus sama dengan APP_URL.
 */
function isSameOriginJson(request: Request): boolean {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(env().APP_URL).origin;
}

/** Login JSON untuk klien non-form (dan bukti AC: 429 saat rate limit). Menulis cookie sesi yang sama. */
export async function POST(request: Request) {
  if (!isSameOriginJson(request)) {
    return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_EMAIL" }, { status: 400 });
  }
  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  const result = await service.login({
    email,
    password,
    ip: clientIp(request.headers, env().TRUST_PROXY),
    knownDeviceUserId: await knownDeviceUserId(),
  });
  if (!result.ok) {
    const headers: Record<string, string> = {};
    if (result.retryAfterSec) headers["Retry-After"] = String(result.retryAfterSec);
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status: STATUS[result.code], headers },
    );
  }
  await createSession(result.data);
  return NextResponse.json({ ok: true });
}
