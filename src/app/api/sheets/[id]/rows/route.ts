import type { NextRequest } from "next/server";
import { gridRowsRoute } from "@/features/query/grid-http";

export const dynamic = "force-dynamic";

/** Jendela baris sheet untuk "Lihat data" (T-041): pemilik dan editor saja. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return gridRowsRoute(req, id);
}
