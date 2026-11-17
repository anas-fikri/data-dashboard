import { countOnline } from "@/features/presence/service";
import { json, withSessionUser } from "@/lib/api-route";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { readSummaryCached } from "@/lib/metrics/store";
import { redisReady } from "@/lib/redis";
import { summaryOf } from "@/features/metrics/view";

export const dynamic = "force-dynamic";

const OFF = { available: false, latest: null, series: [], queue: null };

/** Jumlah user online untuk admin (T-h807); gagal dibaca → tidak dikirim (kartu tetap jalan). */
async function onlineFor(isAdmin: boolean): Promise<{ online?: number }> {
  if (!isAdmin) return {};
  try {
    return { online: await countOnline() };
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "hitung user online gagal");
    return {};
  }
}

/**
 * Ringkasan pemakaian server (v1.18) untuk semua user login: kartu sidebar. Admin juga menerima jumlah user
 * online (T-h807); user lain tidak pernah menerimanya.
 */
export function GET() {
  return withSessionUser("ringkasan metrik gagal", async (user) => {
    // Monitor belum dipasang → jawab tanpa menyentuh Redis; klien berhenti polling.
    if (!env().METRICS_NODE_URL) return json({ ok: true, ...summaryOf(OFF, false) });
    const [summary, online] = await Promise.all([
      readSummaryCached(await redisReady()),
      onlineFor(user.isAdmin),
    ]);
    return json({ ok: true, ...summaryOf(summary, true), ...online });
  });
}
