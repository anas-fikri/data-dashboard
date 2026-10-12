import type { NextRequest } from "next/server";
import { RULES } from "@/features/auth/rate-limit";
import { uploadRoute } from "@/features/uploads/http";
import { initUpload } from "@/features/uploads/service";

export const dynamic = "force-dynamic";

/** Mulai atau lanjutkan unggahan: { datasetId, name, size, lastModified }. */
export function POST(req: NextRequest) {
  return uploadRoute(req, RULES.uploadInit, (user, body) =>
    initUpload(user.id, {
      datasetId: body.datasetId,
      name: body.name,
      size: body.size,
      lastModified: body.lastModified,
    }),
  );
}
