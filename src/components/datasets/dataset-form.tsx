"use client";

import { IconDeviceFloppy, IconPlus } from "@tabler/icons-react";
import { useActionState, useEffect, useRef } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createDatasetAction,
  updateDatasetAction,
  type DatasetFormState,
} from "@/features/datasets/actions";
import { DESCRIPTION_MAX, NAME_MAX } from "@/features/datasets/validation";

interface DatasetFormProps {
  mode: "create" | "edit";
  dataset?: { id: string; name: string; description: string | null };
}

/** Form nama + deskripsi dataset (buat / ubah). Isian dipertahankan dan fokus ke field salah. */
export function DatasetForm({ mode, dataset }: DatasetFormProps) {
  const [state, action, pending] = useActionState<DatasetFormState, FormData>(
    mode === "create" ? createDatasetAction : updateDatasetAction,
    { status: "idle" },
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const error = state.status === "error" ? state : null;

  useEffect(() => {
    if (state.status === "error") {
      if (state.field === "name") nameRef.current?.focus();
      else if (state.field === "description") descRef.current?.focus();
      else alertRef.current?.focus();
    }
    if (state.status === "success") alertRef.current?.focus();
  }, [state]);

  const name = error?.values.name ?? dataset?.name ?? "";
  const description = error?.values.description ?? dataset?.description ?? "";

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4" noValidate>
      {dataset ? <input type="hidden" name="id" value={dataset.id} /> : null}
      {state.status === "success" ? (
        <FormAlert tone="success" ref={alertRef}>
          {state.message}
        </FormAlert>
      ) : null}
      {error && !error.field ? (
        <FormAlert tone="error" ref={alertRef}>
          {error.message}
        </FormAlert>
      ) : null}
      <Field
        id="name"
        label="Nama dataset"
        hint="Contoh: Penjualan Cabang 2026. Unik di antara dataset Anda."
        required
        error={error?.field === "name" ? error.message : undefined}
      >
        <Input ref={nameRef} name="name" maxLength={NAME_MAX} defaultValue={name} />
      </Field>
      <Field
        id="description"
        label="Deskripsi"
        hint="Opsional. Jelaskan isi data dan sumbernya."
        error={error?.field === "description" ? error.message : undefined}
      >
        <Textarea
          ref={descRef}
          name="description"
          rows={3}
          maxLength={DESCRIPTION_MAX}
          defaultValue={description}
        />
      </Field>
      <Button
        type="submit"
        pending={pending}
        className="w-full sm:w-auto sm:self-start"
        leadingIcon={
          mode === "create" ? <IconPlus aria-hidden /> : <IconDeviceFloppy aria-hidden />
        }
      >
        {mode === "create" ? "Buat dataset" : "Simpan perubahan"}
      </Button>
    </form>
  );
}
