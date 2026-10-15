import type { NextRequest } from "next/server";
import { exportStatusRoute } from "@/features/exports/http";

export const dynamic = "force-dynamic";

/** Status ekspor (polling, T-017): pemilik saja, lainnya 404. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return exportStatusRoute(id);
}
