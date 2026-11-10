import type { NextRequest } from "next/server";
import { createViewRoute, listViewsRoute } from "@/features/dashboards/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Tampilan tersimpan dashboard (T-tf88): pribadi user + bersama. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return listViewsRoute(id);
}

/** Simpan tampilan { name, state, shared? } (bersama: pemilik/editor). */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return createViewRoute(req, id);
}
