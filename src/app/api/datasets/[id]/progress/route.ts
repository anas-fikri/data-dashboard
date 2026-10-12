import { progressRoute } from "@/features/schema/http";

export const dynamic = "force-dynamic";

/** Status ingest versi terbaru (polling halaman profil, T-008). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return progressRoute(id);
}
