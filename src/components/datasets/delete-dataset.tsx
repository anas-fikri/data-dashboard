"use client";

import { IconTrash } from "@tabler/icons-react";
import { Dialog } from "radix-ui";
import { useActionState, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteDatasetAction, type DatasetFormState } from "@/features/datasets/actions";
import type { ShareImpact } from "@/features/datasets/service";
import { nameKeyOf } from "@/features/datasets/validation";

interface DeleteDatasetProps {
  id: string;
  name: string;
  dashboardCount: number;
  /** Akses yang ikut hilang (T-016); null = tidak ada dashboard. */
  shareImpact?: ShareImpact | null;
}

/** "3 orang dan seluruh organisasi kehilangan akses ke 2 dashboard yang dibagikan." */
function lostAccess(i: ShareImpact | null | undefined): string | null {
  if (!i || i.sharedDashboards === 0) return null;
  const who =
    i.people > 0 && i.orgShared
      ? `${i.people} orang dan seluruh organisasi`
      : i.people > 0
        ? `${i.people} orang`
        : "Seluruh organisasi";
  return `${who} kehilangan akses ke ${i.sharedDashboards} dashboard yang dibagikan.`;
}

/**
 * Hapus dua langkah: tombol membuka dialog, lalu pengguna mengetik nama dataset. Server memeriksa
 * nama itu lagi (tidak mengandalkan tombol yang dinonaktifkan di klien).
 */
export function DeleteDataset({ id, name, dashboardCount, shareImpact }: DeleteDatasetProps) {
  const lost = lostAccess(shareImpact);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<DatasetFormState, FormData>(deleteDatasetAction, {
    status: "idle",
  });
  const error = state.status === "error" ? state : null;
  // Aturan yang sama dengan server (NFC, spasi, huruf besar/kecil).
  const matches = nameKeyOf(typed) === nameKeyOf(name);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          variant="outline"
          leadingIcon={<IconTrash aria-hidden />}
          className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
        >
          Hapus dataset
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">Hapus “{name}”?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Semua versi data, file yang diunggah
            {dashboardCount > 0 ? `, dan ${dashboardCount} dashboard` : ""} akan dihapus permanen.{" "}
            {lost ? (
              <>
                <span data-testid="delete-share-impact" className="font-medium text-foreground">
                  {lost}
                </span>{" "}
              </>
            ) : null}
            Tindakan ini tidak bisa dibatalkan.
          </Dialog.Description>
          <form action={action} className="mt-4 flex flex-col gap-4" noValidate>
            <input type="hidden" name="id" value={id} />
            {error && error.field !== "confirm" ? (
              <FormAlert tone="error">{error.message}</FormAlert>
            ) : null}
            <Field
              id="confirm"
              label={`Ketik “${name}” untuk mengonfirmasi`}
              error={error?.field === "confirm" ? error.message : undefined}
            >
              <Input
                name="confirm"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <Button variant="outline" className="w-full sm:w-auto">
                  Batal
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                variant="destructive"
                pending={pending}
                disabled={!matches}
                leadingIcon={<IconTrash aria-hidden />}
                className="w-full sm:w-auto"
              >
                Hapus permanen
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
