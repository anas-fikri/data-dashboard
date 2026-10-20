"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { RULES, clientIp, hit, type RateLimitRule } from "@/features/auth/rate-limit";
import { AuthError, requireUser } from "@/features/auth/session";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import type { SetupPreview } from "@/features/ingest/period-setup-plan";
import { pairPlanFor, submitMapping } from "./mapping";
import { applyPeriodSetup, previewPeriodSetup, savePeriodSettings } from "./period-setup";
import { removePeriod, restorePeriod } from "./period-manage";
import { confirmPeriodUpload, reviewPeriodUpload, type PeriodReview } from "./period-upload";
import * as service from "./service";
import type { MappingPairPlan, VersionResult } from "./types";

/*
 * Server Action riwayat versi (T-013), pemilik dataset saja. Urutan: sesi (tanpa sesi → NOT_FOUND,
 * D2) → rate limit per pengguna → service (cek pemilik + lock Dataset). Tidak pernah melempar:
 * error tak terduga → pesan umum, detail hanya di log.
 */

const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "Versi data tidak ditemukan." } as const;

async function rateLimited(
  userId: string,
  rule: RateLimitRule = RULES.versionChange,
  what = "perubahan versi",
): Promise<VersionResult<never> | null> {
  try {
    const rl = await hit(await redisReady(), rule, userId);
    if (rl.allowed) return null;
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: `Terlalu banyak ${what}. Coba lagi dalam ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} menit.`,
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
  /**
   * false: rate limit dipanggil sendiri (pemetaan T-014: setelah cek bentuk payload; rencana pasangan:
   * aturan lain).
   */
  limitFirst = true,
): Promise<VersionResult<T>> {
  try {
    const user = await requireUser("action");
    return (
      (limitFirst ? await rateLimited(user.id) : null) ??
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

/**
 * Simpan pemetaan kolom versi yang menunggu pemetaan (T-014): keputusan divalidasi lalu diterapkan job
 * di worker (versi aktif setelah job selesai, atau hasil "review" untuk dikonfirmasi). Rate limit
 * dihitung service setelah cek bentuk payload, sebelum lock Dataset.
 */
export async function submitMappingAction(
  datasetId: string,
  versionId: string,
  payload: unknown,
): Promise<VersionResult<{ jobId: string }>> {
  return asOwner(
    "submitMapping",
    async (userId, ip) => {
      const r = await submitMapping(userId, datasetId, versionId, payload, ip, () =>
        rateLimited(userId),
      );
      if (r.ok) {
        revalidatePath(`/datasets/${datasetId}`);
        revalidatePath(`/datasets/${datasetId}/pemetaan`);
      }
      return r;
    },
    false,
  );
}

/**
 * Rencana kolom satu pasangan sheet pilihan user di halaman pemetaan (T-014): diminta saat kandidat
 * dipilih, bukan dikirim untuk semua kandidat. Baca saja; rate limit longgar (aturan query).
 */
export async function pairPlanAction(
  datasetId: string,
  versionId: string,
  activeSheetId: string,
  newSheetId: string,
): Promise<VersionResult<MappingPairPlan>> {
  return asOwner(
    "pairPlan",
    async (userId) =>
      (await rateLimited(userId, RULES.query, "permintaan")) ??
      (await pairPlanFor(userId, datasetId, versionId, activeSheetId, newSheetId)),
    false,
  );
}

/**
 * "Tinjau" Atur periode (T-051): sebaran baris per periode, baris tanpa tanggal valid, dan proyeksi
 * kapasitas. Baca saja (query lewat mesin query); rate limit aturan query.
 */
export async function previewPeriodSetupAction(
  datasetId: string,
  payload: unknown,
): Promise<VersionResult<SetupPreview>> {
  return asOwner(
    "previewPeriodSetup",
    async (userId) =>
      (await rateLimited(userId, RULES.query, "permintaan")) ??
      (await previewPeriodSetup(userId, datasetId, payload)),
    false,
  );
}

/** "Terapkan" Atur periode (T-051): versi PERIOD_SETUP diproses worker lalu aktif. */
export async function applyPeriodSetupAction(
  datasetId: string,
  payload: unknown,
): Promise<VersionResult<{ versionId: string }>> {
  return asOwner("applyPeriodSetup", async (userId, ip) => {
    const r = await applyPeriodSetup(userId, datasetId, payload, ip);
    if (r.ok) {
      revalidatePath(`/datasets/${datasetId}`);
      revalidatePath(`/datasets/${datasetId}/periode`);
      revalidatePath("/datasets");
    }
    return r;
  });
}

/** Pengaturan periode dataset (T-051): "Simpan N periode" + "Saat batas tercapai". */
export async function savePeriodSettingsAction(
  datasetId: string,
  payload: unknown,
): Promise<VersionResult<{ keepPeriods: number | null; onLimit: "REJECT" | "EVICT_OLDEST" }>> {
  return asOwner("savePeriodSettings", async (userId, ip) => {
    const r = await savePeriodSettings(userId, datasetId, payload, ip);
    if (r.ok) {
      revalidatePath(`/datasets/${datasetId}`);
      revalidatePath(`/datasets/${datasetId}/periode`);
    }
    return r;
  });
}

/**
 * Tinjauan unggahan periode yang menunggu konfirmasi (T-052): rencana dihitung ulang dari data aktif
 * sekarang (+ pilihan "Masukkan" periode nyasar) beserta sidiknya. Baca saja; rate limit aturan query.
 */
export async function reviewPeriodUploadAction(
  datasetId: string,
  versionId: string,
  payload: unknown,
): Promise<VersionResult<PeriodReview>> {
  return asOwner(
    "reviewPeriodUpload",
    async (userId) =>
      (await rateLimited(userId, RULES.query, "permintaan")) ??
      (await reviewPeriodUpload(userId, datasetId, versionId, payload)),
    false,
  );
}

/** "Terapkan" unggahan periode (T-052): PLAN_STALE bila rencana berubah sejak ditinjau. */
export async function confirmPeriodUploadAction(
  datasetId: string,
  versionId: string,
  payload: unknown,
): Promise<VersionResult<{ fileName: string; summary: string }>> {
  return asOwner("confirmPeriodUpload", async (userId, ip) => {
    const r = await confirmPeriodUpload(userId, datasetId, versionId, payload, ip);
    if (r.ok) {
      revalidatePath(`/datasets/${datasetId}`);
      revalidatePath("/datasets");
      revalidatePath("/dashboards");
      revalidatePath("/dashboards/[id]", "page");
    }
    return r;
  });
}

/** Revalidasi setelah data aktif berganti (hapus/pulihkan periode, T-056). */
function revalidateActive(datasetId: string) {
  revalidatePath(`/datasets/${datasetId}`);
  revalidatePath("/datasets");
  revalidatePath("/dashboards");
  revalidatePath("/dashboards/[id]", "page");
}

/**
 * "Hapus <periode>" di kartu Periode (T-056): versi PERIOD_REMOVE aktif tanpa job worker; bisa
 * di-rollback atau dipulihkan. PLAN_STALE bila versi aktif berganti sejak halaman dimuat.
 */
export async function removePeriodAction(
  datasetId: string,
  payload: unknown,
): Promise<VersionResult<{ label: string; versionId: string }>> {
  return asOwner("removePeriod", async (userId, ip) => {
    const r = await removePeriod(userId, datasetId, payload, ip);
    if (r.ok) revalidateActive(datasetId);
    return r;
  });
}

/** "Pulihkan <periode>" dari versi siap yang masih tersimpan (T-056): versi PERIOD_RESTORE aktif. */
export async function restorePeriodAction(
  datasetId: string,
  payload: unknown,
): Promise<VersionResult<{ label: string; versionId: string }>> {
  return asOwner("restorePeriod", async (userId, ip) => {
    const r = await restorePeriod(userId, datasetId, payload, ip);
    if (r.ok) revalidateActive(datasetId);
    return r;
  });
}
