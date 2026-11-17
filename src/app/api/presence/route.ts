import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireAdmin } from "@/features/auth/session";
import { hit, RULES } from "@/features/auth/rate-limit";
import { listOnline } from "@/features/presence/service";
import { cleanPath, touchPresence } from "@/features/presence/store";
import { json, readJson, rejectCrossOrigin, withUser } from "@/lib/api-route";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";

export const dynamic = "force-dynamic";

/*
 * Kehadiran (T-h807). POST { path } — heartbeat tab yang terlihat, semua user login; user = pemilik sesi
 * (bukan dari body), path disaring (tanpa query). Lewat batas laju → diabaikan diam-diam (204).
 * GET — daftar user online untuk admin saja (non-admin 404, tanpa sesi 401).
 */
export function POST(req: NextRequest) {
  const cross = rejectCrossOrigin(req);
  if (cross) return Promise.resolve(cross);
  return withUser("heartbeat kehadiran gagal", async (userId) => {
    const read = await readJson(req, 1024);
    if ("response" in read) return read.response;
    const r = await redisReady();
    const rl = await hit(r, RULES.presence, userId);
    if (rl.allowed) {
      const body = (read.body && typeof read.body === "object" ? read.body : {}) as {
        path?: unknown;
      };
      await touchPresence(r, userId, cleanPath(body.path));
    }
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  });
}

export async function GET() {
  try {
    await requireAdmin("action");
  } catch (e) {
    if (e instanceof AuthError) {
      return json({ ok: false, code: e.code }, e.code === "UNAUTHENTICATED" ? 401 : 404);
    }
    throw e;
  }
  try {
    const now = Date.now();
    return json({
      ok: true,
      users: await listOnline(undefined, now),
      now: new Date(now).toISOString(),
    });
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "daftar user online gagal");
    return json(
      { ok: false, code: "UNAVAILABLE", message: "Daftar user online sedang tidak tersedia." },
      503,
    );
  }
}
