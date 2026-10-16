import "server-only";
import { unstable_rethrow } from "next/navigation";
import { logAccessDenied } from "@/features/auth/denial-log";
import { RULES, hit } from "@/features/auth/rate-limit";
import { AuthError, requireAdmin, type SessionUser } from "@/features/auth/session";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";

/*
 * Penjaga Server Action admin (T-019, dipakai juga panduan T-020): admin aktif dari DB lebih dulu —
 * non-admin/tanpa sesi/sesi dicabut → null (pemanggil menjawab NOT_FOUND, dicatat dibatasi per
 * menit) — lalu rate limit per admin untuk aksi yang mengubah data.
 */

/** Admin aktif dari DB, atau null (dicatat). redirect()/notFound() milik Next tetap dilempar ulang. */
export async function currentAdmin(action: string): Promise<SessionUser | null> {
  try {
    return await requireAdmin("action");
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AuthError) {
      await logAccessDenied(
        action,
        { ...(e.userId ? { userId: e.userId } : {}), code: e.code, action },
        "aksi admin ditolak",
      );
      return null;
    }
    throw e;
  }
}

export async function rateLimited(
  actorId: string,
): Promise<{ ok: false; code: "RATE_LIMITED"; message: string } | null> {
  try {
    const rl = await hit(await redisReady(), RULES.admin, actorId);
    if (rl.allowed) return null;
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: `Terlalu banyak perubahan. Coba lagi dalam ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} menit.`,
    };
  } catch (e) {
    // Redis mati: aksi admin tetap jalan (mis. menonaktifkan akun yang disalahgunakan), dicatat.
    logger.warn(
      { actorId, err: e instanceof Error ? e.message : String(e) },
      "rate limit admin tidak tersedia; aksi dilanjutkan",
    );
    return null;
  }
}
