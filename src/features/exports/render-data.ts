import "server-only";
import { getDashboard } from "@/features/dashboards/service";
import { queryDeps } from "@/features/query/runtime";
import { runWidgetQuery, type QueryDeps } from "@/features/query/service";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import { renderSubjectLive } from "./repo";
import { loadRenderSession, type RenderData } from "./render-session";
import { consumeRenderSessionClaims, redisRenderStore } from "./render-token";

/*
 * Perakitan produksi data halaman /render (T-018): sesi di Redis, user/ekspor/dashboard dari Prisma,
 * query widget lewat mesin query app. Logika + urutan pemeriksaan di render-session.ts.
 */

export type { RenderData, RenderWidget, WidgetQueryJson } from "./render-session";
export { RENDER_COOKIE } from "./render-token";

/**
 * Halaman /render: ambil sesi render dari cookie dd.render (sekali pakai), cek ulang user + akses
 * dashboard, saring filter, jalankan semua query widget. null → notFound() (404 polos). Galat
 * infrastruktur (Redis/DB) juga null: halaman tidak pernah membocorkan detail; log tanpa id sesi/path.
 */
export async function consumeRenderSession(sessionId: string): Promise<RenderData | null> {
  let deps: QueryDeps | undefined;
  try {
    return await loadRenderSession(sessionId, {
      consumeClaims: async (sid) =>
        consumeRenderSessionClaims(redisRenderStore(await redisReady()), sid),
      subjectLive: renderSubjectLive,
      dashboard: (userId, dashboardId) => getDashboard(userId, dashboardId),
      query: async (userId, body, now) => {
        deps ??= await queryDeps();
        const r = await runWidgetQuery(userId, body, { ...deps, now: () => now });
        // Persis body JSON /api/query (tanpa nilai non-JSON).
        return JSON.parse(JSON.stringify(r)) as typeof r;
      },
    });
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "data render PDF gagal");
    return null;
  }
}
