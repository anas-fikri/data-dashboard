import type { NextRequest } from "next/server";
import { deleteWidgetRoute, renameWidgetRoute } from "@/features/dashboards/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; widgetId: string }> };

/** Ganti judul widget (T-010). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, widgetId } = await ctx.params;
  return renameWidgetRoute(req, id, widgetId);
}

/** Hapus widget dari dashboard (T-010). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id, widgetId } = await ctx.params;
  return deleteWidgetRoute(req, id, widgetId);
}
