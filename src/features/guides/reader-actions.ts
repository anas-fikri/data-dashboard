"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/session";
import { guideRolesFor, markRead } from "./reader";

export type MarkReadResult = { ok: true } | { ok: false; code: "NOT_FOUND"; message: string };

/** Tandai artikel dibaca (T-022); hanya artikel terbit yang boleh dilihat user (selain itu NOT_FOUND). */
export async function markGuideReadAction(articleId: string): Promise<MarkReadResult> {
  const user = await requireUser();
  const roles = await guideRolesFor(user.id, user.isAdmin);
  if (!(await markRead(user.id, roles, articleId)))
    return { ok: false, code: "NOT_FOUND", message: "Artikel tidak ditemukan." };
  revalidatePath("/");
  revalidatePath("/panduan", "layout");
  return { ok: true };
}
