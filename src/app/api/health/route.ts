import { NextResponse } from "next/server";
import { getSessionUser } from "@/features/auth/session";
import { cachedHealthReport, publicView } from "@/lib/health";
import { infraChecks } from "@/lib/health/checks";

export const dynamic = "force-dynamic";

/**
 * Dipakai healthcheck Docker dan monitoring: 200 bila semua OK, 503 bila ada yang gagal.
 * Tanpa sesi admin hanya status (tanpa nama layanan internal); admin melihat detail (T-027).
 */
export async function GET() {
  const report = await cachedHealthReport(infraChecks());
  const user = await getSessionUser().catch(() => null);
  return NextResponse.json(publicView(report, !!user?.isAdmin), {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
