import type { NextRequest } from "next/server";
import { createExportRoute } from "@/features/exports/http";

export const dynamic = "force-dynamic";

/** Minta ekspor widget { widgetId, format: "csv"|"xlsx", dashboardFilters?, sort? } → 202 (T-017). */
export async function POST(req: NextRequest) {
  return createExportRoute(req);
}
