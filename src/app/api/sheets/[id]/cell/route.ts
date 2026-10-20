import type { NextRequest } from "next/server";
import { gridCellRoute } from "@/features/query/grid-http";

export const dynamic = "force-dynamic";

/** Isi penuh satu sel + nilai asli bila gagal cast + sumbernya (T-041): pemilik dan editor saja. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return gridCellRoute(req, id);
}
