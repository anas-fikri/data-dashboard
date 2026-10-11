import { NextResponse } from "next/server";
import { cachedHealthReport, publicView } from "@/lib/health";
import { exposeHealthDetail, infraChecks } from "@/lib/health/checks";

export const dynamic = "force-dynamic";

/** Dipakai healthcheck Docker dan monitoring: 200 bila semua OK, 503 bila ada yang gagal. */
export async function GET() {
  const report = publicView(await cachedHealthReport(infraChecks()), exposeHealthDetail());
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
