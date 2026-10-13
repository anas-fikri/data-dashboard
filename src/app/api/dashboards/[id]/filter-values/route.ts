import type { NextRequest } from "next/server";
import { filterValuesRoute } from "@/features/query/http";

export const dynamic = "force-dynamic";

/**
 * Nilai unik kolom slicer { column, q?, sheet? } → { ok, type, values, truncated } (T-012). Route
 * Handler (bukan Server Action) agar permintaan per ketikan bisa dibatalkan klien (AbortController).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return filterValuesRoute(req, id);
}
