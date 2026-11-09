"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { currentAdmin, rateLimited } from "@/features/admin/guard";
import { clientIp } from "@/features/auth/rate-limit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import * as service from "./service";
import type {
  BackupResult,
  OffsiteField,
  OffsiteInput,
  OffsiteProbe,
  OffsiteView,
  RetentionField,
  RetentionInput,
  RetentionView,
  SyncState,
} from "./types";

/*
 * Server Action Admin › Backup (T-7psf): admin aktif dari DB (selain itu NOT_FOUND, D2), rate limit per
 * admin — tes koneksi juga, karena membuat server menghubungi alamat dari isian — lalu service.
 */

const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "Halaman tidak ditemukan." } as const;

async function asAdmin<T, F extends string = OffsiteField>(
  action: string,
  run: (actor: { id: string; email: string }, ip: string) => Promise<BackupResult<T, F>>,
): Promise<BackupResult<T, F>> {
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

export async function testOffsiteAction(input: OffsiteInput): Promise<BackupResult<OffsiteProbe>> {
  return asAdmin("testBackupTarget", () => service.testOffsite(input));
}

export async function saveOffsiteAction(input: OffsiteInput): Promise<BackupResult<OffsiteView>> {
  return asAdmin("saveBackupTarget", async (actor, ip) => {
    const r = await service.saveOffsite(actor, input, ip);
    if (r.ok) revalidatePath("/admin/backup");
    return r;
  });
}

export async function saveRetentionAction(
  input: RetentionInput,
): Promise<BackupResult<RetentionView, RetentionField>> {
  return asAdmin("saveBackupRetention", async (actor, ip) => {
    const r = await service.saveRetention(actor, input, ip);
    if (r.ok) revalidatePath("/admin/backup");
    return r;
  });
}

export async function resetRetentionAction(): Promise<BackupResult<null, RetentionField>> {
  return asAdmin("resetBackupRetention", async (actor, ip) => {
    const r = await service.resetRetention(actor, ip);
    if (r.ok) revalidatePath("/admin/backup");
    return r;
  });
}

export async function requestSyncAction(): Promise<BackupResult<SyncState>> {
  return asAdmin("requestBackupSync", async (actor, ip) => {
    const r = await service.requestSync(actor, ip);
    if (r.ok) revalidatePath("/admin/backup");
    return r;
  });
}

/**
 * Dipantau tombol "Kirim ulang sekarang" selama permintaan/run berjalan. Tanpa rate limit (hanya membaca,
 * dipanggil berkala), tetap admin aktif saja.
 */
export async function syncStateAction(): Promise<
  BackupResult<{ sync: SyncState; updatedAt: string | null }>
> {
  try {
    const actor = await currentAdmin("backupSyncState");
    if (!actor) return NOT_FOUND;
    return { ok: true, data: await service.getSyncState() };
  } catch (e) {
    unstable_rethrow(e);
    logger.error(
      { err: e instanceof Error ? e.message : String(e) },
      "status kirim ulang gagal dibaca",
    );
    return { ok: false, code: "BUSY", message: "Terjadi kesalahan. Coba lagi beberapa saat lagi." };
  }
}
