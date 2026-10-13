import type { NextRequest } from "next/server";
import { setFilterColumnsRoute } from "@/features/dashboards/http";

export const dynamic = "force-dynamic";

/** Atur kolom filter global dashboard { filterColumns: [{ sheet, column }] } (T-012). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return setFilterColumnsRoute(req, id);
}
