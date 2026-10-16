import type { NextRequest } from "next/server";
import { RULES } from "@/features/auth/rate-limit";
import { initVideo } from "@/features/guides/videos";
import { uploadRoute } from "@/features/uploads/http";

export const dynamic = "force-dynamic";

/** Mulai unggah video panduan (admin): { articleId, title, name, size } → { videoId, partSize, partCount }. */
export async function POST(req: NextRequest) {
  return uploadRoute(req, RULES.uploadInit, (user, body) => initVideo(user, body));
}
