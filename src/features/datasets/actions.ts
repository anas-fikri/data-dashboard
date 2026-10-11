"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import * as service from "./service";
import type { DatasetField } from "./validation";

export type DatasetFormState =
  | { status: "idle" }
  | {
      status: "error";
      code: service.DatasetCode;
      message: string;
      field: DatasetField | null;
      values: { name: string; description: string };
    }
  | { status: "success"; message: string };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

function toError(
  r: { code: service.DatasetCode; message: string; field?: DatasetField },
  formData: FormData,
): DatasetFormState {
  return {
    status: "error",
    code: r.code,
    message: r.message,
    field: r.field ?? null,
    values: { name: str(formData.get("name")), description: str(formData.get("description")) },
  };
}

export async function createDatasetAction(
  _prev: DatasetFormState,
  formData: FormData,
): Promise<DatasetFormState> {
  const user = await requireUser();
  const r = await service.createDataset(user.id, formData.get("name"), formData.get("description"));
  if (!r.ok) return toError(r, formData);
  revalidatePath("/datasets");
  redirect(`/datasets/${r.data.id}`);
}

export async function updateDatasetAction(
  _prev: DatasetFormState,
  formData: FormData,
): Promise<DatasetFormState> {
  const user = await requireUser();
  const id = formData.get("id");
  const r = await service.updateDataset(
    user.id,
    id,
    formData.get("name"),
    formData.get("description"),
  );
  if (!r.ok) return toError(r, formData);
  revalidatePath("/datasets");
  revalidatePath(`/datasets/${r.data.id}`);
  return { status: "success", message: "Perubahan disimpan." };
}

export async function deleteDatasetAction(
  _prev: DatasetFormState,
  formData: FormData,
): Promise<DatasetFormState> {
  const user = await requireUser();
  const r = await service.deleteDataset(user.id, formData.get("id"), formData.get("confirm"));
  if (!r.ok) return toError(r, formData);
  revalidatePath("/datasets");
  redirect("/datasets?deleted=1");
}
