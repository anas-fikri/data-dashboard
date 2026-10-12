import type { NextRequest } from "next/server";
import { saveLayoutRoute } from "@/features/dashboards/http";

export const dynamic = "force-dynamic";

/** Simpan otomatis posisi dan ukuran widget (CAS pada revisi tata letak), T-010. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return saveLayoutRoute(req, id);
}
