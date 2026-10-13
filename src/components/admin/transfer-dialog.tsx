"use client";

import { IconArrowsExchange } from "@tabler/icons-react";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import type { TransferTarget } from "@/features/admin/types";
import { cn } from "@/lib/utils";
import { EmailText } from "./email-text";
import { TransferPicker } from "./transfer-picker";

/**
 * Label tombol memuat email tujuan yang bisa panjang: boleh turun baris, tinggi minimal tetap token.
 * Di baris tombol mendatar (≥ md) tombol ini yang menyusut — Batal tidak pernah terdorong keluar.
 */
const CTA = cn(
  DIALOG_CTA,
  "h-auto min-h-(--control-h-lg) whitespace-normal py-2 [overflow-wrap:anywhere] md:h-auto md:min-h-(--control-h) md:min-w-0 md:shrink",
);

interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: { id: string; email: string; datasetCount: number };
  pending: boolean;
  onConfirm: (target: TransferTarget) => void;
  onCloseAutoFocus: (event: Event) => void;
  /** Pesan galat aksi (dirender di atas pemilih). */
  children?: ReactNode;
}

/** Alihkan semua dataset pengguna nonaktif ke satu pengguna aktif; dashboard ikut datasetnya. */
export function TransferDialog({
  open,
  onOpenChange,
  source,
  pending,
  onConfirm,
  onCloseAutoFocus,
  children,
}: TransferDialogProps) {
  const [target, setTarget] = useState<TransferTarget | null>(null);
  /** Langkah pertama memang mencari: kolom cari menerima fokus awal (bukan Batal). */
  const searchRef = useRef<HTMLInputElement>(null);
  const who = (email: string) => (
    <strong className="font-medium text-foreground [overflow-wrap:anywhere]">
      <EmailText email={email} />
    </strong>
  );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && !pending) setTarget(null);
      }}
      title="Alihkan dataset?"
      description={
        <>
          {source.datasetCount === 1 ? "Dataset" : `Semua ${source.datasetCount} dataset`} milik{" "}
          {who(source.email)} beserta dashboard-nya pindah ke{" "}
          {target ? who(target.email) : "pengguna yang Anda pilih"}. Dataset yang namanya sudah
          dipakai pemilik baru diberi nama baru.
        </>
      }
      busy={pending}
      onCloseAutoFocus={onCloseAutoFocus}
      initialFocus={searchRef}
      data-testid="admin-confirm"
      action={
        <Button
          pending={pending}
          disabled={!target}
          leadingIcon={<IconArrowsExchange aria-hidden />}
          className={CTA}
          onClick={() => target && onConfirm(target)}
        >
          {target ? (
            <span>
              Alihkan ke <EmailText email={target.email} />
            </span>
          ) : (
            "Alihkan dataset"
          )}
        </Button>
      }
    >
      {children}
      <TransferPicker
        sourceId={source.id}
        selectedId={target?.id ?? null}
        disabled={pending}
        onSelect={setTarget}
        inputRef={searchRef}
        onResults={(items) => setTarget((t) => (t && items.some((i) => i.id === t.id) ? t : null))}
      />
    </ConfirmDialog>
  );
}
