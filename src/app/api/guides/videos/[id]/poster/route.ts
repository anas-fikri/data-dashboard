import { NextResponse, type NextRequest } from "next/server";
import { RULES, clientIp, hit } from "@/features/auth/rate-limit";
import { AuthError, requireUser } from "@/features/auth/session";
import { POSTER_MAX_BYTES } from "@/features/guides/media";
import { setVideoPoster } from "@/features/guides/videos";
import { isSameOrigin } from "@/features/uploads/http";
import { env } from "@/lib/env";
import { readBytesLimited } from "@/lib/http-body";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";

export const dynamic = "force-dynamic";

const STATUS = { NOT_FOUND: 404, FILE_TOO_LARGE: 413, INVALID_FORMAT: 422 } as const;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Poster PNG video panduan dari browser (T-021): body mentah image/png ≤ 2 MB. Origin sama, sesi admin
 * (selain itu 404), signature PNG diperiksa di service, Content-Type objek ditetapkan server.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req, env().APP_URL))
    return json({ ok: false, code: "FORBIDDEN", message: "Permintaan ditolak." }, 403);
  let user;
  try {
    user = await requireUser("action");
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, code: e.code }, 401);
    throw e;
  }
  if (!user.isAdmin) return json({ ok: false, code: "NOT_FOUND" }, 404);
  const rl = await hit(await redisReady(), RULES.uploadSign, user.id);
  if (!rl.allowed)
    return json({ ok: false, code: "RATE_LIMITED", message: "Coba lagi nanti." }, 429);
  const bytes = await readBytesLimited(req, POSTER_MAX_BYTES);
  if (!bytes)
    return json({ ok: false, code: "FILE_TOO_LARGE", message: "Poster melebihi 2 MB." }, 413);
  const { id } = await ctx.params;
  try {
    const r = await setVideoPoster(user, id, bytes, clientIp(req.headers, env().TRUST_PROXY));
    return r.ok ? json(r) : json(r, STATUS[r.code as keyof typeof STATUS] ?? 400);
  } catch (e) {
    logger.error({ userId: user.id, err: String(e) }, "poster video panduan gagal");
    return json({ ok: false, code: "STORAGE_ERROR", message: "Terjadi gangguan." }, 503);
  }
}
