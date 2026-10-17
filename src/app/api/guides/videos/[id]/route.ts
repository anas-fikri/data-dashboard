import type { NextRequest } from "next/server";
import { RULES, clientIp } from "@/features/auth/rate-limit";
import { deleteVideo } from "@/features/guides/videos";
import { uploadRoute } from "@/features/uploads/http";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Batalkan unggahan / hapus video panduan beserta objek, poster, dan takarirnya. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return uploadRoute(req, RULES.uploadSign, (user) =>
    deleteVideo(user, id, clientIp(req.headers, env().TRUST_PROXY)),
  );
}
