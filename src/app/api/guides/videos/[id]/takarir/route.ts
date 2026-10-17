import { NextResponse, type NextRequest } from "next/server";
import { RULES, hit } from "@/features/auth/rate-limit";
import { AuthError, requireUser } from "@/features/auth/session";
import { CAPTION_MAX_BYTES } from "@/features/guides/media";
import { videoCaptionKey } from "@/features/guides/reader";
import { setVideoCaption } from "@/features/guides/videos";
import { isSameOrigin } from "@/features/uploads/http";
import { env } from "@/lib/env";
import { readBytesLimited } from "@/lib/http-body";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import { CAPTION_CONTENT_TYPE, getGuideCaption } from "@/lib/storage/guides";

export const dynamic = "force-dynamic";

const STATUS = { NOT_FOUND: 404, FILE_TOO_LARGE: 413, INVALID_FORMAT: 422 } as const;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "Takarir tidak ditemukan." };

/**
 * Takarir WebVTT video panduan (T-j9j6). GET disajikan app (same-origin): <track> lintas origin ke
 * storage diblokir browser tanpa CORS. Akses sama dengan halaman (videoCaptionKey), selain itu 404.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let user;
  try {
    user = await requireUser("action");
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, code: e.code }, 401);
    throw e;
  }
  try {
    const key = await videoCaptionKey(user, id);
    const body = key ? await getGuideCaption(key) : null;
    if (!body) return json(NOT_FOUND, 404);
    return new NextResponse(Buffer.from(body), {
      headers: {
        "Content-Type": CAPTION_CONTENT_TYPE,
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    logger.error({ userId: user.id, err: String(e) }, "takarir video panduan gagal dibaca");
    return json({ ok: false, code: "UNAVAILABLE", message: "Layanan sedang tidak tersedia." }, 503);
  }
}

/**
 * Unggah takarir dari editor: body mentah ≤ 200 KB. Origin sama, sesi admin (selain itu 404),
 * signature WEBVTT + UTF-8 diperiksa di service, Content-Type objek ditetapkan server.
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
  const bytes = await readBytesLimited(req, CAPTION_MAX_BYTES);
  if (!bytes)
    return json(
      { ok: false, code: "FILE_TOO_LARGE", message: "Takarir melebihi batas 200 KB." },
      413,
    );
  const { id } = await ctx.params;
  try {
    const r = await setVideoCaption(user, id, bytes);
    return r.ok ? json(r) : json(r, STATUS[r.code as keyof typeof STATUS] ?? 400);
  } catch (e) {
    logger.error({ userId: user.id, err: String(e) }, "takarir video panduan gagal disimpan");
    return json({ ok: false, code: "STORAGE_ERROR", message: "Terjadi gangguan." }, 503);
  }
}
