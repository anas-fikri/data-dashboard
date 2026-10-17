"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { currentAdmin, rateLimited } from "@/features/admin/guard";
import { clientIp } from "@/features/auth/rate-limit";
import type { SessionUser } from "@/features/auth/session";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import * as service from "./service";

/*
 * Server Action panduan (T-020). Setiap aksi: admin aktif (currentAdmin) lebih dulu — non-admin atau
 * tanpa sesi → NOT_FOUND tanpa menyentuh data (AC3) — lalu rate limit per admin, lalu service
 * (validasi zod + AuditLog buat/ubah/terbit/tarik/hapus). Galat tak terduga → BUSY tanpa detail.
 */

export type GuideActionCode = service.GuideCode | "RATE_LIMITED" | "BUSY";
export type GuideActionResult<T = null> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: GuideActionCode;
      message: string;
      fields?: Partial<Record<string, string>>;
    };

const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "Halaman tidak ditemukan." } as const;

async function asGuideAdmin<T>(
  action: string,
  run: (actor: SessionUser, ip: string) => Promise<GuideActionResult<T>>,
): Promise<GuideActionResult<T>> {
  try {
    const actor = await currentAdmin(action);
    if (!actor) return NOT_FOUND;
    const limited = await rateLimited(actor.id);
    if (limited) return limited;
    const r = await run(actor, clientIp(await headers(), env().TRUST_PROXY));
    if (r.ok) {
      revalidatePath("/admin/panduan");
      revalidatePath("/panduan");
    }
    return r;
  } catch (e) {
    unstable_rethrow(e);
    logger.error({ action, err: e instanceof Error ? e.message : String(e) }, "aksi panduan gagal");
    return { ok: false, code: "BUSY", message: "Terjadi kesalahan. Coba lagi beberapa saat lagi." };
  }
}

export async function createGuideAction(
  input: unknown,
): Promise<GuideActionResult<{ id: string }>> {
  return asGuideAdmin("createGuide", (actor, ip) => service.createGuide(actor.id, input, ip));
}

export async function updateGuideAction(id: string, input: unknown): Promise<GuideActionResult> {
  return asGuideAdmin("updateGuide", (actor, ip) => service.updateGuide(actor.id, id, input, ip));
}

export async function setGuideStatusAction(
  id: string,
  published: boolean,
): Promise<GuideActionResult> {
  return asGuideAdmin("setGuideStatus", (actor, ip) =>
    service.setGuideStatus(actor.id, id, published ? "PUBLISHED" : "DRAFT", ip),
  );
}

export async function moveGuideAction(id: string, dir: "up" | "down"): Promise<GuideActionResult> {
  if (dir !== "up" && dir !== "down") return NOT_FOUND;
  return asGuideAdmin("moveGuide", () => service.moveGuide(id, dir));
}

export async function deleteGuideAction(id: string): Promise<GuideActionResult> {
  return asGuideAdmin("deleteGuide", (actor, ip) => service.deleteGuide(actor.id, id, ip));
}
