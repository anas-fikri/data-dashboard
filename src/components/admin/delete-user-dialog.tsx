"use client";

import { IconTrash } from "@tabler/icons-react";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  pending: boolean;
  onConfirm: (typedEmail: string) => void;
  onCloseAutoFocus: (event: Event) => void;
  /** Pesan galat dari pemanggil (FocusNotice). */
  children?: ReactNode;
}

/**
 * Hapus akun permanen (T-c7wf): admin mengetik ulang email sasaran; server memeriksanya lagi (tombol
 * yang dinonaktifkan di klien bukan pengaman). Fokus awal di kolom ketik.
 */
export function DeleteUserDialog({
  open,
  onOpenChange,
  email,
  pending,
  onConfirm,
  onCloseAutoFocus,
  children,
}: DeleteUserDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === email;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) setTyped("");
        onOpenChange(o);
      }}
      title="Hapus akun?"
      description={
        <>
          <strong className="font-medium text-foreground [overflow-wrap:anywhere]">{email}</strong>{" "}
          dihapus permanen beserta akses dashboard yang dibagikan kepadanya dan file ekspornya.
          Catatan audit tetap tersimpan. Tindakan ini tidak bisa dibatalkan.
        </>
      }
      busy={pending}
      initialFocus={inputRef}
      onCloseAutoFocus={onCloseAutoFocus}
      data-testid="admin-confirm"
      action={
        <Button
          variant="destructive"
          pending={pending}
          disabled={!matches}
          leadingIcon={<IconTrash aria-hidden />}
          className={DIALOG_CTA}
          onClick={() => onConfirm(typed)}
        >
          Hapus permanen
        </Button>
      }
    >
      {children}
      <Field id="delete-user-confirm" label={`Ketik “${email}” untuk mengonfirmasi`}>
        <Input
          ref={inputRef}
          inputMode="email"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </Field>
    </ConfirmDialog>
  );
}
