import { AuthError, requireAdmin } from "@/features/auth/session";
import { adminOf } from "@/features/metrics/view";
import { json } from "@/lib/api-route";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { readAdmin } from "@/lib/metrics/store";
import { redisReady } from "@/lib/redis";

export const dynamic = "force-dynamic";

/** Detail pemakaian server (v1.18): admin saja — non-admin 404 (pola requireAdmin), tanpa sesi 401. */
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
    return json({
      ok: true,
      ...adminOf(await readAdmin(await redisReady()), !!env().METRICS_NODE_URL),
    });
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "detail metrik gagal");
    return json(
      { ok: false, code: "UNAVAILABLE", message: "Data server sedang tidak tersedia." },
      503,
    );
  }
}
