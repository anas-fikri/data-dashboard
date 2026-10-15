import type { NextRequest } from "next/server";
import { createExportRoute } from "@/features/exports/http";

export const dynamic = "force-dynamic";

/**
 * Minta ekspor → 202 { ok, exportId }: widget { widgetId, format: "csv"|"xlsx", dashboardFilters?, sort? }
 * (T-017) atau dashboard PDF { dashboardId, format: "pdf", f? } (T-018; renderer mati → 503).
 */
export async function POST(req: NextRequest) {
  return createExportRoute(req);
}
