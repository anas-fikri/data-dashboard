import { recastStatusRoute } from "@/features/schema/http";

export const dynamic = "force-dynamic";

/** Status koreksi skema yang sedang diproses (polling, T-008). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; jobId: string }> }) {
  const { id, jobId } = await ctx.params;
  return recastStatusRoute(id, jobId);
}
