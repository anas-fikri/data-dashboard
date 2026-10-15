import type { NextRequest } from "next/server";
import { renderTokenRoute } from "@/features/exports/render-route";

export const dynamic = "force-dynamic";

/**
 * Tukar token render PDF (T-018) dengan cookie dd.render → 303 /render; selain itu 404 polos. Hanya
 * dipanggil renderer (worker → renderer → APP_INTERNAL_URL/render/<token>).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return renderTokenRoute(token);
}

/**
 * HEAD tidak boleh jatuh ke GET (Next memakai GET untuk HEAD bila tidak ada): token sekali pakai akan
 * habis oleh pemeriksa tautan/probe. Selalu 404 polos tanpa menyentuh token.
 */
export function HEAD() {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
