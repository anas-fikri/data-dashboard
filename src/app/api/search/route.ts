import type { NextRequest } from "next/server";
import { AuthError, requireUser } from "@/features/auth/session";
import { quickSearch } from "@/features/search/service";
import { json } from "@/lib/api-route";
import { logger } from "@/lib/logger";

/** Cari cepat Ctrl+K (T-k6k0): GET ?q= → dataset, dashboard, dan panduan yang boleh dilihat user. */
export async function GET(req: NextRequest) {
  let user: { id: string; isAdmin: boolean };
  try {
    user = await requireUser("action");
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, code: e.code }, 401);
    throw e;
  }
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    return json({ ok: true, data: await quickSearch(user, q) });
  } catch (e) {
    logger.error(
      { userId: user.id, err: e instanceof Error ? e.message : String(e) },
      "cari cepat gagal",
    );
    return json(
      { ok: false, code: "UNAVAILABLE", message: "Pencarian sedang tidak tersedia. Coba lagi." },
      503,
    );
  }
}
