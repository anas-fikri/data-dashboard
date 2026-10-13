"use client";

import { IconDeviceFloppy, IconTrash } from "@tabler/icons-react";
import { Dialog } from "radix-ui";
import { useActionState, useEffect, useRef } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  deleteDashboardAction,
  renameDashboardAction,
  type DashboardFormState,
} from "@/features/dashboards/actions";
import type { FilterColumnView, SourceSheet } from "@/features/dashboards/service";
import { DASHBOARD_NAME_MAX } from "@/features/dashboards/validation";
import { FilterColumnsSettings } from "./filter-columns-settings";

/*
 * Pengaturan dashboard (mode edit): ganti nama, kolom filter (T-012), dan hapus. Hapus memakai dialog konfirmasi; data
 * tetap aman di dataset, hanya susunan widget dashboard ini yang hilang.
 */
export function DashboardSettings({
  id,
  name,
  filterColumns,
  sources,
}: {
  id: string;
  name: string;
  filterColumns: FilterColumnView[];
  sources: SourceSheet[];
}) {
  const [renameState, rename, renaming] = useActionState<DashboardFormState, FormData>(
    renameDashboardAction,
    { status: "idle" },
  );
  const [deleteState, remove, removing] = useActionState<DashboardFormState, FormData>(
    deleteDashboardAction,
    { status: "idle" },
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const renameError = renameState.status === "error" ? renameState : null;

  useEffect(() => {
    if (renameState.status === "error") nameRef.current?.focus();
    if (renameState.status === "success") alertRef.current?.focus();
  }, [renameState]);

  const cta = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pengaturan dashboard</CardTitle>
        <CardDescription>Nama, kolom filter, dan penghapusan dashboard ini.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form action={rename} className="flex max-w-xl flex-col gap-3" noValidate>
          <input type="hidden" name="id" value={id} />
          {renameState.status === "success" ? (
            <FormAlert tone="success" ref={alertRef}>
              {renameState.message}
            </FormAlert>
          ) : null}
          <Field
            id="dashboard-name"
            label="Nama dashboard"
            required
            error={renameError ? renameError.message : undefined}
          >
            <Input
              ref={nameRef}
              name="name"
              maxLength={DASHBOARD_NAME_MAX}
              defaultValue={renameError?.values.name ?? name}
              className="h-(--control-h-lg) md:h-(--control-h)"
            />
          </Field>
          <Button
            type="submit"
            variant="outline"
            pending={renaming}
            className={`${cta} md:self-start`}
            leadingIcon={<IconDeviceFloppy aria-hidden />}
          >
            Simpan nama
          </Button>
        </form>

        <FilterColumnsSettings dashboardId={id} columns={filterColumns} sources={sources} />

        <div className="flex flex-col gap-3 border-t pt-5">
          <p className="text-sm text-muted-foreground">
            Menghapus dashboard menghapus semua widget di dalamnya. Data di dataset tidak terhapus.
          </p>
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <Button
                variant="outline"
                leadingIcon={<IconTrash aria-hidden />}
                className={`${cta} border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive md:self-start`}
              >
                Hapus dashboard
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-lg">
                <Dialog.Title className="break-words text-lg font-semibold [overflow-wrap:anywhere]">
                  Hapus “{name}”?
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                  Dashboard dan semua widgetnya dihapus permanen. Data di dataset tetap ada.
                </Dialog.Description>
                <form action={remove} className="mt-4 flex flex-col gap-4">
                  <input type="hidden" name="id" value={id} />
                  {deleteState.status === "error" ? (
                    <FormAlert tone="error">{deleteState.message}</FormAlert>
                  ) : null}
                  <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
                    <Dialog.Close asChild>
                      <Button variant="outline" className={cta}>
                        Batal
                      </Button>
                    </Dialog.Close>
                    <Button
                      type="submit"
                      variant="destructive"
                      pending={removing}
                      leadingIcon={<IconTrash aria-hidden />}
                      className={cta}
                    >
                      Hapus permanen
                    </Button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </CardContent>
    </Card>
  );
}
