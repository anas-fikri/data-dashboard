import { NextResponse } from "next/server";
import { cachedHealthReport } from "@/lib/health";
import { coreChecks } from "@/lib/health/checks";

export const dynamic = "force-dynamic";

/**
 * Healthcheck container app (Dockerfile): hanya kebutuhan inti. Renderer lambat atau SMTP mati tidak
 * membuat app "unhealthy" — proxy depends_on app sehat, jadi itu mematikan seluruh situs saat compose
 * up. Keduanya tetap diperiksa di /api/health (deploy.sh, /health admin). Hanya status, tanpa detail.
 */
export async function GET() {
  const { status, checkedAt } = await cachedHealthReport(coreChecks(), Date.now(), "core");
  return NextResponse.json(
    { status, checkedAt },
    { status: status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
