import type { NextRequest } from "next/server";
import { gridStatsRoute } from "@/features/query/grid-http";

export const dynamic = "force-dynamic";

/** Ringkasan kolom angka "Lihat data" atas seluruh baris tersaring (T-045): pemilik dan editor saja. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return gridStatsRoute(req, id);
}
