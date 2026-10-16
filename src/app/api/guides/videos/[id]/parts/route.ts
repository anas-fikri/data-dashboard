import type { NextRequest } from "next/server";
import { RULES } from "@/features/auth/rate-limit";
import { signVideoParts } from "@/features/guides/videos";
import { uploadRoute } from "@/features/uploads/http";

export const dynamic = "force-dynamic";

/** Presigned URL part video panduan: { partNumbers: number[] } (≤ 16 per permintaan). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return uploadRoute(req, RULES.uploadSign, (user, body) =>
    signVideoParts(user, id, body.partNumbers),
  );
}
