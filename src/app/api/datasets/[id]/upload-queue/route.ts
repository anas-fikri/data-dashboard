import { json, withUser } from "@/lib/api-route";
import { getUploadQueue } from "@/features/uploads/queue";

export const dynamic = "force-dynamic";

/** Status antrean unggah dataset (T-059; polling panel unggah, tanpa efek samping). Pemilik saja. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withUser("status antrean unggah gagal", async (userId) =>
    json({ ok: true, queue: await getUploadQueue(userId, id) }),
  );
}
