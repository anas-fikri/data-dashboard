"use client";

import { IconCopy, IconDeviceTv, IconDots, IconRefresh } from "@tabler/icons-react";
import { Dialog } from "radix-ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { duplicateDashboardAction, type DashboardFormState } from "@/features/dashboards/actions";
import { DASHBOARD_NAME_MAX } from "@/features/dashboards/validation";
import {
  REFRESH_OPTIONS,
  refreshLabel,
  useRefreshMinutes,
  type RefreshMinutes,
} from "./auto-refresh";
import { enterTv } from "./tv-mode";

const CTA = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";

/**
 * Menu "Lainnya" di header dashboard (mode lihat, v1.14): Mode TV (T-nn87), muat ulang otomatis (tersimpan
 * per dashboard di browser), dan Duplikat (T-fcar, pemilik saja — salinan berada di dataset pemilik).
 */
export function DashboardMoreMenu({
  dashboardId,
  copyName,
}: {
  dashboardId: string;
  /** Nama usulan salinan; null = bukan pemilik (Duplikat tidak tersedia). */
  copyName: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [minutes, setMinutes] = useRefreshMinutes(dashboardId);
  const [duplicating, setDuplicating] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            leadingIcon={<IconDots aria-hidden />}
            className="h-(--control-h-lg) md:h-(--control-h)"
            data-testid="dashboard-more"
          >
            Lainnya
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem
            onSelect={() =>
              enterTv((url) => router.push(url), pathname, new URLSearchParams(params.toString()))
            }
          >
            <IconDeviceTv aria-hidden />
            Mode TV (layar penuh)
          </DropdownMenuItem>
          {copyName !== null ? (
            <DropdownMenuItem onSelect={() => setDuplicating(true)}>
              <IconCopy aria-hidden />
              Duplikat dashboard…
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-1.5">
            <IconRefresh aria-hidden className="size-4" />
            Muat ulang otomatis
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={String(minutes ?? 0)}
            onValueChange={(v) => setMinutes(Number(v) as RefreshMinutes)}
          >
            {REFRESH_OPTIONS.map((m) => (
              <DropdownMenuRadioItem key={m} value={String(m)}>
                {refreshLabel(m)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {copyName !== null ? (
        <DuplicateDialog
          dashboardId={dashboardId}
          suggested={copyName}
          open={duplicating}
          onOpenChange={setDuplicating}
        />
      ) : null}
    </>
  );
}

function DuplicateDialog({
  dashboardId,
  suggested,
  open,
  onOpenChange,
}: {
  dashboardId: string;
  suggested: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, submit, pending] = useActionState<DashboardFormState, FormData>(
    duplicateDashboardAction,
    { status: "idle" },
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const error = state.status === "error" ? state : null;
  useEffect(() => {
    if (state.status === "error") nameRef.current?.focus();
  }, [state]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-lg"
          data-testid="duplicate-dialog"
        >
          <Dialog.Title className="text-lg font-semibold">Duplikat dashboard</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            Salinan berisi semua widget, tata letak, kolom filter, filter bawaan, dan warna. Salinan
            tidak ikut dibagikan, dan mengubahnya tidak mengubah dashboard ini.
          </Dialog.Description>
          <form action={submit} className="mt-4 flex flex-col gap-4" noValidate>
            <input type="hidden" name="id" value={dashboardId} />
            {error && error.field !== "name" ? (
              <FormAlert tone="error">{error.message}</FormAlert>
            ) : null}
            <Field
              id="duplicate-name"
              label="Nama salinan"
              required
              error={error?.field === "name" ? error.message : undefined}
            >
              <Input
                ref={nameRef}
                name="name"
                defaultValue={error?.values.name || suggested}
                maxLength={DASHBOARD_NAME_MAX}
                autoComplete="off"
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <Dialog.Close asChild>
                <Button variant="outline" className={CTA}>
                  Batal
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                pending={pending}
                leadingIcon={<IconCopy aria-hidden />}
                className={CTA}
              >
                Duplikat
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
