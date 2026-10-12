import type { NextRequest } from "next/server";
import { addWidgetRoute } from "@/features/dashboards/http";

export const dynamic = "force-dynamic";

/** Tambah widget kosong (atau pulihkan widget yang baru dihapus lewat "urungkan"), T-010. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return addWidgetRoute(req, id);
}
