"use client";

import { IconArrowsExchange } from "@tabler/icons-react";
import { useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface TransferTarget {
  id: string;
  email: string;
  name: string | null;
}

interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: { id: string; email: string; datasetCount: number };
  targets: TransferTarget[];
  pending: boolean;
  error: string | null;
  onConfirm: (target: TransferTarget) => void;
  onCloseAutoFocus: (event: Event) => void;
}

/** Alihkan semua dataset pengguna nonaktif ke satu pengguna aktif; dashboard ikut datasetnya. */
export function TransferDialog({
  open,
  onOpenChange,
  source,
  targets,
  pending,
  error,
  onConfirm,
  onCloseAutoFocus,
}: TransferDialogProps) {
  const [targetId, setTargetId] = useState("");
  const options = targets.filter((t) => t.id !== source.id);
  const target = options.find((t) => t.id === targetId);
  const selectId = `transfer-target-${source.id}`;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && !pending) setTargetId("");
      }}
      title="Alihkan dataset?"
      description={
        <>
          Semua {source.datasetCount} dataset milik{" "}
          <strong className="font-medium text-foreground [overflow-wrap:anywhere]">
            {source.email}
          </strong>{" "}
          beserta dashboard-nya pindah ke pengguna yang Anda pilih. Dataset yang namanya sudah
          dipakai pemilik baru diberi nama baru.
        </>
      }
      busy={pending}
      onCloseAutoFocus={onCloseAutoFocus}
      data-testid="admin-confirm"
      action={
        <Button
          pending={pending}
          disabled={!target}
          leadingIcon={<IconArrowsExchange aria-hidden />}
          className={DIALOG_CTA}
          onClick={() => target && onConfirm(target)}
        >
          Alihkan dataset
        </Button>
      }
    >
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      {options.length === 0 ? (
        <p className="text-sm">
          Belum ada pengguna aktif lain yang sudah memverifikasi email. Minta calon pemilik baru
          mendaftar dan memverifikasi emailnya dulu.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={selectId} className="text-sm font-medium">
            Pemilik baru
          </label>
          <Select value={targetId} onValueChange={setTargetId} disabled={pending}>
            <SelectTrigger
              id={selectId}
              data-testid="admin-transfer-target"
              aria-describedby={`${selectId}-hint`}
              className="h-(--control-h-lg) md:h-(--control-h)"
            >
              <SelectValue placeholder="Pilih pengguna" />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name ? `${t.name} · ${t.email}` : t.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id={`${selectId}-hint`} className="text-sm text-muted-foreground">
            Hanya pengguna aktif dengan email terverifikasi yang bisa menerima dataset.
          </p>
        </div>
      )}
    </ConfirmDialog>
  );
}
