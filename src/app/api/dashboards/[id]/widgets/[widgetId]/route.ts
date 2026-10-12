import type { NextRequest } from "next/server";
import { deleteWidgetRoute, updateWidgetRoute } from "@/features/dashboards/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; widgetId: string }> };

/** Ganti judul (T-010) atau atur tipe + isi widget (T-011). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, widgetId } = await ctx.params;
  return updateWidgetRoute(req, id, widgetId);
}

/** Hapus widget dari dashboard (T-010). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id, widgetId } = await ctx.params;
  return deleteWidgetRoute(req, id, widgetId);
}
