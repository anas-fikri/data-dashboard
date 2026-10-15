"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/features/auth/rate-limit";
import { requireUser } from "@/features/auth/session";
import { env } from "@/lib/env";
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
  const r = await service.deleteDashboard(
    user.id,
    formData.get("id"),
    // AuditLog "dashboard.delete" (review T-016 R3 CC-2) ditulis dalam transaksi penghapusan.
    clientIp(await headers(), env().TRUST_PROXY),
  );
  if (!r.ok) return toError(r, formData);
  revalidatePath("/dashboards");
  redirect("/dashboards?deleted=1");
}
