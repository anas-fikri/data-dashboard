import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireUser } from "@/features/auth/session";
import { runtimeQuery } from "@/features/query/http";

export const dynamic = "force-dynamic";

/**
 * Query widget { widgetId, … }, pratinjau editor { dashboardId, spec }, atau query bebas pemilik
 * { datasetId, spec } (T-009, T-011, T-016).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser("action");
    return await runtimeQuery(req, user.id);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json(
        { ok: false, code: e.code },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw e;
  }
}
