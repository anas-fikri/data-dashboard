"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { RULES, hit } from "@/features/auth/rate-limit";
import { AuthError, requireUser } from "@/features/auth/session";
import { logger } from "@/lib/logger";
import { redisReady } from "@/lib/redis";
import type { FilterColumnView } from "./filter-columns";
import * as service from "./service";

export type DashboardFormState =
  | { status: "idle" }
  | {
      status: "error";
      code: service.DashboardCode;
      message: string;
      field: "name" | "datasetId" | null;
      values: { name: string; datasetId: string };
    }
  | { status: "success"; message: string };

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

function toError(
  r: { code: service.DashboardCode; message: string; field?: "name" | "datasetId" },
  formData: FormData,
): DashboardFormState {
  return {
    status: "error",
    code: r.code,
    message: r.message,
    field: r.field ?? null,
    values: { name: str(formData.get("name")), datasetId: str(formData.get("datasetId")) },
  };
}

export async function createDashboardAction(
  _prev: DashboardFormState,
  formData: FormData,
): Promise<DashboardFormState> {
  const user = await requireUser();
  const r = await service.createDashboard(user.id, formData.get("datasetId"), formData.get("name"));
  if (!r.ok) return toError(r, formData);
  revalidatePath("/dashboards");
  // Dashboard baru langsung dibuka di mode edit agar widget pertama bisa ditambahkan.
  redirect(`/dashboards/${r.data.id}?mode=edit`);
}

export async function renameDashboardAction(
  _prev: DashboardFormState,
  formData: FormData,
): Promise<DashboardFormState> {
  const user = await requireUser();
  const r = await service.renameDashboard(user.id, formData.get("id"), formData.get("name"));
  if (!r.ok) return toError(r, formData);
  revalidatePath("/dashboards");
  revalidatePath(`/dashboards/${r.data.id}`);
  return { status: "success", message: "Nama dashboard disimpan." };
}

export async function deleteDashboardAction(
  _prev: DashboardFormState,
  formData: FormData,
): Promise<DashboardFormState> {
  const user = await requireUser();
  const r = await service.deleteDashboard(user.id, formData.get("id"));
  if (!r.ok) return toError(r, formData);
  revalidatePath("/dashboards");
  redirect("/dashboards?deleted=1");
}

export type FilterColumnsActionResult =
  | service.DashboardResult<{ filterColumns: FilterColumnView[] }>
  | { ok: false; code: "RATE_LIMITED" | "UNAUTHENTICATED"; message: string };

/**
 * Atur kolom filter global dashboard (T-012), pemilik saja (lainnya NOT_FOUND). Sama dengan
 * PATCH /api/dashboards/[id]/filter-columns; rate limit perubahan dashboard yang sama dengan kanvas.
 * Tidak melempar: error tak terduga → BUSY (detail hanya di log, tanpa isi permintaan).
 */
export async function setDashboardFilterColumnsAction(
  dashboardId: string,
  filterColumns: unknown,
): Promise<FilterColumnsActionResult> {
  try {
    const user = await requireUser("action");
    const rl = await hit(await redisReady(), RULES.dashboardEdit, user.id);
    if (!rl.allowed) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        message: `Terlalu banyak perubahan. Coba lagi dalam ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} menit.`,
      };
    }
    const r = await service.setDashboardFilterColumns(user.id, dashboardId, filterColumns);
    if (r.ok) revalidatePath(`/dashboards/${dashboardId}`);
    return r;
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AuthError) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Sesi Anda berakhir. Masuk lagi untuk melanjutkan.",
      };
    }
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "simpan kolom filter gagal");
    return { ok: false, code: "BUSY", message: "Terjadi kesalahan. Coba lagi beberapa saat lagi." };
  }
}
