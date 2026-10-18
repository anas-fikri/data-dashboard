"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { currentAdmin, rateLimited } from "@/features/admin/guard";
import { clientIp } from "@/features/auth/rate-limit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import * as service from "./service";
import type { BackupResult, OffsiteInput, OffsiteView } from "./types";

/*
 * Server Action Admin › Backup (T-7psf): admin aktif dari DB (selain itu NOT_FOUND, D2), rate limit per
 * admin — tes koneksi juga, karena membuat server menghubungi alamat dari isian — lalu service.
 */

const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "Halaman tidak ditemukan." } as const;

async function asAdmin<T>(
  action: string,
  run: (actor: { id: string; email: string }, ip: string) => Promise<BackupResult<T>>,
): Promise<BackupResult<T>> {
  try {
    const actor = await currentAdmin(action);
    if (!actor) return NOT_FOUND;
    return (
      (await rateLimited(actor.id)) ??
      (await run(actor, clientIp(await headers(), env().TRUST_PROXY)))
    );
  } catch (e) {
    unstable_rethrow(e);
    logger.error({ action, err: e instanceof Error ? e.message : String(e) }, "aksi backup gagal");
    return { ok: false, code: "BUSY", message: "Terjadi kesalahan. Coba lagi beberapa saat lagi." };
  }
}

export async function testOffsiteAction(input: OffsiteInput): Promise<BackupResult> {
  return asAdmin("testBackupTarget", () => service.testOffsite(input));
}

export async function saveOffsiteAction(input: OffsiteInput): Promise<BackupResult<OffsiteView>> {
  return asAdmin("saveBackupTarget", async (actor, ip) => {
    const r = await service.saveOffsite(actor, input, ip);
    if (r.ok) revalidatePath("/admin/backup");
    return r;
  });
}
