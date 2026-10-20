import type { NextRequest } from "next/server";
import { RULES } from "@/features/auth/rate-limit";
import { uploadRoute } from "@/features/uploads/http";
import { completeQueueItem } from "@/features/uploads/queue";

export const dynamic = "force-dynamic";

/** Selesaikan unggahan file antrean (validasi objek) lalu jalankan giliran antrean. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return uploadRoute(req, RULES.uploadSign, (user) => completeQueueItem(user.id, id));
}
