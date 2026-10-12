import type { NextRequest } from "next/server";
import { uploadRoute } from "@/features/uploads/http";
import { cancelUpload } from "@/features/uploads/service";

export const dynamic = "force-dynamic";

/** Batalkan unggahan yang belum selesai (abort multipart, hapus versi). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return uploadRoute(req, null, (user) => cancelUpload(user.id, id));
}
