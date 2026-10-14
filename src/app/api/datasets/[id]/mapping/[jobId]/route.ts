import { mappingStatus } from "@/features/versions/mapping";
import { json, withUser } from "@/lib/api-route";

export const dynamic = "force-dynamic";

/**
 * Status job pemetaan kolom (polling halaman pemetaan, T-014): { ok, state, message? }. Bukan pemilik,
 * job dataset lain, atau job yang sudah dibersihkan antrean → 404 yang sama (UI memuat ulang dari DB).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; jobId: string }> }) {
  const { id, jobId } = await ctx.params;
  return withUser("status pemetaan gagal", async (userId) => {
    const status = await mappingStatus(userId, id, jobId);
    return status
      ? json({ ok: true, ...status })
      : json({ ok: false, code: "NOT_FOUND", message: "Pemetaan tidak ditemukan." }, 404);
  });
}
