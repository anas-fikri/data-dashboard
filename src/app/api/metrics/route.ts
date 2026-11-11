import { json, withUser } from "@/lib/api-route";
import { env } from "@/lib/env";
import { readSummary } from "@/lib/metrics/store";
import { redisReady } from "@/lib/redis";
import { summaryOf } from "@/features/metrics/view";

export const dynamic = "force-dynamic";

const OFF = { available: false, latest: null, series: [], queue: null };

/** Ringkasan pemakaian server (v1.18) untuk semua user login: kartu sidebar. */
export function GET() {
  return withUser("ringkasan metrik gagal", async () => {
    // Monitor belum dipasang → jawab tanpa menyentuh Redis; klien berhenti polling.
    if (!env().METRICS_NODE_URL) return json({ ok: true, ...summaryOf(OFF, false) });
    return json({ ok: true, ...summaryOf(await readSummary(await redisReady()), true) });
  });
}
