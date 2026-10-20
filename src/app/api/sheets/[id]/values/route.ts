import type { NextRequest } from "next/server";
import { gridValuesRoute } from "@/features/query/grid-http";

export const dynamic = "force-dynamic";

/** Daftar nilai satu kolom untuk menu saring "Lihat data" (T-044): pemilik dan editor saja. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return gridValuesRoute(req, id);
}
