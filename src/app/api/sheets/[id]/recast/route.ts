import type { NextRequest } from "next/server";
import { recastRoute } from "@/features/schema/http";

export const dynamic = "force-dynamic";

/** Koreksi skema sheet (baris header, nama, tipe, format, sembunyikan) → antrean recast (T-008). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return recastRoute(req, id);
}
