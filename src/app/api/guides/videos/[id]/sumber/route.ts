import { AuthError, requireUser } from "@/features/auth/session";
import { videoSource } from "@/features/guides/reader";
import { json } from "@/lib/api-route";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * URL pemutaran baru untuk pemutar panduan yang terbuka > 1 jam (presigned kedaluwarsa, T-z5nq). GET
 * tanpa efek samping; hanya video yang boleh dilihat user (selain itu 404, bukan 403).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let user;
  try {
    user = await requireUser("action");
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, code: e.code }, 401);
    throw e;
  }
  try {
    const s = await videoSource(user, id);
    return s
      ? json({ ok: true, ...s })
      : json({ ok: false, code: "NOT_FOUND", message: "Video tidak ditemukan." }, 404);
  } catch (e) {
    logger.error(
      { userId: user.id, err: e instanceof Error ? e.message : String(e) },
      "sumber video panduan gagal",
    );
    return json({ ok: false, code: "UNAVAILABLE", message: "Layanan sedang tidak tersedia." }, 503);
  }
}
