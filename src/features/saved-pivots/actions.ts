"use server";

import { headers } from "next/headers";
import { RULES, clientIp, hit } from "@/features/auth/rate-limit";
import { requireUser } from "@/features/auth/session";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import * as service from "./service";

/*
 * Server Action pivot tersimpan (T-072). Urutan: sesi → rate limit per user (RULES.savedPivot) →
 * service (akses: pemilik dataset menulis; selain itu NOT_FOUND). Hasil `{ ok: false, code, message }`,
 * tidak melempar. Redis mati: tulis pemilik atas datasetnya tetap jalan (dicatat), seperti berbagi.
 * UI (dan revalidasi halamannya) menyusul di T-074.
 */

const ipOf = async () => clientIp(await headers(), env().TRUST_PROXY);

async function limited(userId: string): Promise<service.SavedPivotResult<never> | null> {
  try {
    const rl = await hit(await redisReady(), RULES.savedPivot, userId);
    if (rl.allowed) return null;
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: `Terlalu banyak perubahan pivot tersimpan. Coba lagi dalam ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} menit.`,
    };
  } catch (e) {
    logger.warn(
      { userId, rule: RULES.savedPivot.name, err: e instanceof Error ? e.message : String(e) },
      "rate limit pivot tersimpan tidak tersedia; aksi dilanjutkan",
    );
    return null;
  }
}

export async function createSavedPivotAction(
  datasetId: unknown,
  input: service.SavedPivotInput,
): Promise<service.SavedPivotResult<{ id: string; revision: number }>> {
  const user = await requireUser();
  const body = input && typeof input === "object" ? input : {};
  return (
    (await limited(user.id)) ??
    service.createSavedPivot(user.id, datasetId, { name: body.name, spec: body.spec }, await ipOf())
  );
}

export async function updateSavedPivotAction(
  id: unknown,
  input: service.SavedPivotUpdate,
): Promise<service.SavedPivotResult<{ id: string; revision: number }>> {
  const user = await requireUser();
  const body = input && typeof input === "object" ? input : {};
  return (
    (await limited(user.id)) ??
    service.updateSavedPivot(
      user.id,
      id,
      { name: body.name, spec: body.spec, baseRevision: body.baseRevision },
      await ipOf(),
    )
  );
}

export async function deleteSavedPivotAction(
  id: unknown,
  baseRevision?: unknown,
): Promise<service.SavedPivotResult<{ id: string }>> {
  const user = await requireUser();
  return (
    (await limited(user.id)) ?? service.deleteSavedPivot(user.id, id, await ipOf(), baseRevision)
  );
}
