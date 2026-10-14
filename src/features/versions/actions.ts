"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { RULES, clientIp, hit } from "@/features/auth/rate-limit";
import { AuthError, requireUser } from "@/features/auth/session";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import * as service from "./service";
import type { VersionResult } from "./types";

/*
 * Server Action riwayat versi (T-013), pemilik dataset saja. Urutan: sesi (tanpa sesi → NOT_FOUND,
 * D2) → rate limit per pengguna → service (cek pemilik + lock Dataset). Tidak pernah melempar:
 * error tak terduga → pesan umum, detail hanya di log.
 */

const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "Versi data tidak ditemukan." } as const;

async function rateLimited(userId: string): Promise<VersionResult<never> | null> {
  try {
    const rl = await hit(await redisReady(), RULES.versionChange, userId);
    if (rl.allowed) return null;
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: `Terlalu banyak perubahan versi. Coba lagi dalam ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} menit.`,
    };
  } catch (e) {
    // Redis mati: perubahan pemilik atas datanya sendiri tetap jalan, dicatat.
    logger.warn(
      { userId, err: e instanceof Error ? e.message : String(e) },
      "rate limit versi tidak tersedia; aksi dilanjutkan",
    );
    return null;
  }
}

async function asOwner<T>(
  action: string,
  run: (userId: string, ip: string) => Promise<VersionResult<T>>,
): Promise<VersionResult<T>> {
  try {
    const user = await requireUser("action");
    return (
      (await rateLimited(user.id)) ??
      (await run(user.id, clientIp(await headers(), env().TRUST_PROXY)))
    );
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AuthError) return NOT_FOUND;
    logger.error({ action, err: e instanceof Error ? e.message : String(e) }, "aksi versi gagal");
    return {
      ok: false,
      code: "DATASET_BUSY",
      message: "Terjadi kesalahan. Coba lagi beberapa saat lagi.",
    };
  }
}

/** Aktifkan versi siap lain (rollback): semua dashboard dataset memakai data versi itu. */
export async function activateVersionAction(
  datasetId: string,
  versionId: string,
): Promise<VersionResult<{ fileName: string }>> {
  return asOwner("activateVersion", async (userId, ip) => {
    const r = await service.activateVersion(userId, datasetId, versionId, ip);
    if (r.ok) {
      revalidatePath(`/datasets/${datasetId}`);
      revalidatePath("/datasets");
      revalidatePath("/dashboards");
      revalidatePath("/dashboards/[id]", "page");
    }
    return r;
  });
}

/** Buang versi yang menunggu pemetaan; data aktif tetap dipakai dashboard. */
export async function discardVersionAction(
  datasetId: string,
  versionId: string,
): Promise<VersionResult<{ fileName: string }>> {
  return asOwner("discardVersion", async (userId) => {
    const r = await service.discardVersion(userId, datasetId, versionId);
    if (r.ok) {
      revalidatePath(`/datasets/${datasetId}`);
      revalidatePath("/datasets");
    }
    return r;
  });
}
