"use server";

import { headers } from "next/headers";
import { clientIp } from "@/features/auth/rate-limit";
import { requireUser } from "@/features/auth/session";
import { env } from "@/lib/env";
import * as service from "./service";

/*
 * Server Action pivot tersimpan (T-072). Akses diputuskan service (pemilik dataset menulis; selain itu
 * NOT_FOUND). Hasil `{ ok: false, code, message }`, tidak melempar. UI (dan revalidasi halamannya)
 * menyusul di T-074.
 */

const ipOf = async () => clientIp(await headers(), env().TRUST_PROXY);

export async function createSavedPivotAction(
  datasetId: unknown,
  input: service.SavedPivotInput,
): Promise<service.SavedPivotResult<{ id: string; revision: number }>> {
  const user = await requireUser();
  const body = input && typeof input === "object" ? input : {};
  return service.createSavedPivot(
    user.id,
    datasetId,
    { name: body.name, spec: body.spec },
    await ipOf(),
  );
}

export async function updateSavedPivotAction(
  id: unknown,
  input: service.SavedPivotUpdate,
): Promise<service.SavedPivotResult<{ id: string; revision: number }>> {
  const user = await requireUser();
  const body = input && typeof input === "object" ? input : {};
  return service.updateSavedPivot(
    user.id,
    id,
    { name: body.name, spec: body.spec, baseRevision: body.baseRevision },
    await ipOf(),
  );
}

export async function deleteSavedPivotAction(
  id: unknown,
  baseRevision?: unknown,
): Promise<service.SavedPivotResult<{ id: string }>> {
  const user = await requireUser();
  return service.deleteSavedPivot(user.id, id, await ipOf(), baseRevision);
}
