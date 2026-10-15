import type { NextRequest } from "next/server";
import { exportDownloadRoute } from "@/features/exports/http";

export const dynamic = "force-dynamic";

/** Unduh file ekspor (T-017): pemilik → 302 ke presigned 5 menit + AuditLog; lainnya 404; lewat → 410. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return exportDownloadRoute(req, id);
}
