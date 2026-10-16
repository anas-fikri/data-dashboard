import type { NextRequest } from "next/server";
import { RULES, clientIp } from "@/features/auth/rate-limit";
import { completeVideo } from "@/features/guides/videos";
import { uploadRoute } from "@/features/uploads/http";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Selesaikan unggah video panduan: { durationSec? } → signature diperiksa server, status READY. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return uploadRoute(req, RULES.uploadSign, (user, body) =>
    completeVideo(user, id, body, clientIp(req.headers, env().TRUST_PROXY)),
  );
}
