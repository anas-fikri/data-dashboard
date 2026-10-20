import type { NextRequest } from "next/server";
import { uploadRoute } from "@/features/uploads/http";
import { skipQueueItem } from "@/features/uploads/queue";

export const dynamic = "force-dynamic";

/**
 * Lewati file antrean yang belum diproses: { reason?: "INVALID_FORMAT" | "FILE_TOO_LARGE" } (pra-cek
 * lokal gagal → file gagal dengan pesan tetap server); tanpa alasan = dilewati pemilik.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return uploadRoute(req, null, (user, body) => skipQueueItem(user.id, id, body.reason));
}
