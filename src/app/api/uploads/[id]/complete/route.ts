import type { NextRequest } from "next/server";
import { uploadRoute } from "@/features/uploads/http";
import { completeUpload } from "@/features/uploads/service";

export const dynamic = "force-dynamic";

/** Selesaikan unggahan: ListParts → complete → HeadObject → cek signature → UPLOADED + antre ingest. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return uploadRoute(req, null, (user) => completeUpload(user.id, id));
}
