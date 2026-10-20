"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { RULES, hit } from "@/features/auth/rate-limit";
import { AuthError, requireUser } from "@/features/auth/session";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import { createUploadQueue, dismissUploadQueue, stopUploadQueue } from "./queue";
import type { QueueView } from "./queue-plan";
import type { UploadCode } from "./service";

/*
 * Server Action antrean unggah (T-059), pemilik dataset saja: sesi (tanpa sesi → NOT_FOUND, D2) →
 * rate limit (buat antrean = aturan init unggah) → service (cek pemilik + lock). Tidak pernah melempar.
 */

type ActionResult<T> =
  ({ ok: true } & T) | { ok: false; code: UploadCode | "RATE_LIMITED"; message: string };

const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "Antrean tidak ditemukan." } as const;

async function asOwner<T>(
  action: string,
  run: (userId: string) => Promise<ActionResult<T>>,
  limit = false,
): Promise<ActionResult<T>> {
  try {
    const user = await requireUser("action");
    if (limit) {
      const rl = await hit(await redisReady(), RULES.uploadInit, user.id).catch(() => null);
      if (rl && !rl.allowed) {
        return {
          ok: false,
          code: "RATE_LIMITED",
          message: `Terlalu banyak permintaan unggah. Coba lagi dalam ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} menit.`,
        };
      }
    }
    return await run(user.id);
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AuthError) return NOT_FOUND;
    logger.error({ action, err: e instanceof Error ? e.message : String(e) }, "aksi antrean gagal");
    return {
      ok: false,
      code: "STORAGE_ERROR",
      message: "Terjadi gangguan. Coba lagi beberapa saat lagi.",
    };
  }
}

/** Buat antrean dari daftar file: { baseVersionId, files: [{ name, size, lastModified, label }] }. */
export async function createUploadQueueAction(
  datasetId: string,
  input: { baseVersionId: unknown; files: unknown },
): Promise<ActionResult<{ queue: QueueView }>> {
  return asOwner(
    "createUploadQueue",
    async (userId) => {
      const r = await createUploadQueue(userId, {
        datasetId,
        baseVersionId: input?.baseVersionId,
        files: input?.files,
      });
      if (r.ok) revalidatePath(`/datasets/${datasetId}`);
      return r;
    },
    true,
  );
}

/** "Hentikan antrean": file yang belum diproses dibatalkan, file yang sedang diproses diselesaikan. */
export async function stopUploadQueueAction(
  datasetId: string,
  queueId: string,
): Promise<ActionResult<{ queue: QueueView | null }>> {
  return asOwner("stopUploadQueue", async (userId) => {
    const r = await stopUploadQueue(userId, queueId);
    if (r.ok) revalidatePath(`/datasets/${datasetId}`);
    return r;
  });
}

/** Tutup ringkasan antrean yang sudah selesai. */
export async function dismissUploadQueueAction(
  datasetId: string,
  queueId: string,
): Promise<ActionResult<{ dismissed: true }>> {
  return asOwner("dismissUploadQueue", async (userId) => {
    const r = await dismissUploadQueue(userId, queueId);
    if (r.ok) revalidatePath(`/datasets/${datasetId}`);
    return r;
  });
}
