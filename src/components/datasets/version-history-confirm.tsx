"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import { FocusNotice } from "@/components/ui/focus-notice";
import type { VersionResult } from "@/features/versions/types";
import { NETWORK_ERROR, versionErrorText } from "./version-history-status";

/** Tombol aksi di baris/kartu: 44px dan full-width di ponsel, ringkas mulai 768. */
export const ROW_CTA = "h-(--control-h-lg) w-full md:h-(--control-h-sm) md:w-auto";

interface VersionConfirmProps {
  /** Isi tombol pemicu (boleh berisi teks sr-only untuk konteks baris). */
  label: ReactNode;
  icon: ReactNode;
  testId: string;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  run: () => Promise<VersionResult<{ fileName: string }>>;
  /** Berhasil: dialog sudah tertutup; pemanggil menampilkan hasil (yang mengambil fokus). */
  onDone: (fileName: string) => void;
}

/**
 * Tombol → dialog konfirmasi → Server Action versi (pola user-row-actions T-019). Galat tampil di
 * dialog dan menerima fokus; dialog tidak bisa ditutup selama permintaan berjalan; gagal/batal
 * mengembalikan fokus ke tombol pemicu, berhasil menyerahkan fokus ke pemberitahuan hasil.
 */
export function VersionConfirm({
  label,
  icon,
  testId,
  title,
  description,
  confirmLabel,
  destructive = false,
  run,
  onDone,
}: VersionConfirmProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const succeeded = useRef(false);
  const [open, setOpen] = useState(false);
  /** Direset tiap percobaan: FocusNotice galat dipasang ulang (dan menerima fokus) tiap kali gagal. */
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    setError(null);
    start(async () => {
      const res = await run().catch(() => null);
      if (!res || !res.ok) {
        setError(res ? versionErrorText(res.code, res.message) : NETWORK_ERROR);
        return;
      }
      succeeded.current = true;
      setOpen(false);
      onDone(res.data.fileName);
    });
  }

  function openDialog() {
    succeeded.current = false;
    setError(null);
    setOpen(true);
  }

  function restoreFocus(event: Event) {
    event.preventDefault();
    if (!succeeded.current) triggerRef.current?.focus();
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        leadingIcon={icon}
        className={ROW_CTA}
        onClick={openDialog}
        data-testid={testId}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !pending) setOpen(false);
        }}
        title={title}
        description={description}
        busy={pending}
        onCloseAutoFocus={restoreFocus}
        data-testid="version-confirm"
        action={
          <Button
            variant={destructive ? "destructive" : "primary"}
            pending={pending}
            leadingIcon={icon}
            className={DIALOG_CTA}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        }
      >
        {error ? <FocusNotice tone="error">{error}</FocusNotice> : null}
      </ConfirmDialog>
    </>
  );
}
