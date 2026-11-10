import type { NextRequest } from "next/server";
import { deleteViewRoute, updateViewRoute } from "@/features/dashboards/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; viewId: string }> };

/** Ganti nama / perbarui filter / bersama-pribadi { name?, state?, shared? } (T-tf88). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, viewId } = await ctx.params;
  return updateViewRoute(req, id, viewId);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id, viewId } = await ctx.params;
  return deleteViewRoute(req, id, viewId);
}
