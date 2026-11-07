import type { NextRequest } from "next/server";
import { setColorsRoute } from "@/features/dashboards/http";

export const dynamic = "force-dynamic";

/** Atur template warna status dashboard { colors: {template, custom?} | null } (v1.9.0). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return setColorsRoute(req, id);
}
