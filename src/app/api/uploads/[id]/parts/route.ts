import type { NextRequest } from "next/server";
import { RULES } from "@/features/auth/rate-limit";
import { uploadRoute } from "@/features/uploads/http";
import { signParts } from "@/features/uploads/service";

export const dynamic = "force-dynamic";

/** Presigned URL untuk part tertentu: { partNumbers: number[] } (≤ 16 per permintaan). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return uploadRoute(req, RULES.uploadSign, (user, body) =>
    signParts(user.id, id, body.partNumbers),
  );
}
