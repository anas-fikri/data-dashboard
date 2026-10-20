import type { NextRequest } from "next/server";
import { RULES } from "@/features/auth/rate-limit";
import { uploadRoute } from "@/features/uploads/http";
import { initQueueItem } from "@/features/uploads/queue";

export const dynamic = "force-dynamic";

/** Mulai atau lanjutkan unggahan satu file antrean (T-059): multipart baru atau part yang sudah ada. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return uploadRoute(req, RULES.uploadInit, (user) => initQueueItem(user.id, id));
}
