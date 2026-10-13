"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, DIALOG_CTA } from "@/components/ui/confirm-dialog";
import {
  setUserActiveAction,
  setUserAdminAction,
  transferDatasetsAction,
} from "@/features/admin/actions";
import type { AdminResult } from "@/features/admin/types";
import { useAdminNotify } from "./admin-feedback";
import {
  adminErrorText,
  confirmCopy,
  NETWORK_ERROR,
  SUCCESS,
  transferResult,
  type ConfirmKind,
} from "./admin-messages";
import { TransferDialog, type TransferTarget } from "./transfer-dialog";
import { UserRowMenu, type RowChoice, type RowUser } from "./user-row-menu";

interface UserRowActionsProps {
  user: RowUser;
  isSelf: boolean;
  /** Calon pemilik baru; hanya terisi untuk pengguna nonaktif yang punya dataset. */
  targets: TransferTarget[];
}

/**
 * Aksi per baris: menu → dialog konfirmasi → Server Action. Galat tampil di dialog yang terbuka
 * (atau di pemberitahuan atas tabel bila tanpa dialog); sukses → pemberitahuan + router.refresh().
 */
export function UserRowActions({ user, isSelf, targets }: UserRowActionsProps) {
  const router = useRouter();
  const notify = useAdminNotify();
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Aksi berhasil: fokus pindah ke pemberitahuan hasil, bukan kembali ke pemicu menu. */
  const succeeded = useRef(false);
  const [dialog, setDialog] = useState<ConfirmKind | "transfer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run<T>(call: () => Promise<AdminResult<T>>, onOk: (data: T) => void) {
    const inDialog = dialog !== null;
    setError(null);
    start(async () => {
      const res = await call().catch(() => null);
      if (!res || !res.ok) {
        const text = res ? adminErrorText(res.code, res.message) : NETWORK_ERROR;
        if (inDialog) setError(text);
        else notify({ tone: "error", content: text });
        return;
      }
      succeeded.current = true;
      setDialog(null);
      onOk(res.data);
    });
  }

  function done(content: ReactNode) {
    notify({ tone: "success", content });
    router.refresh();
  }

  function choose(choice: RowChoice) {
    if (choice === "activate") {
      run(
        () => setUserActiveAction(user.id, true),
        () => done(SUCCESS.activate(user.email)),
      );
      return;
    }
    succeeded.current = false;
    setError(null);
    setDialog(choice);
  }

  function confirm(kind: ConfirmKind) {
    if (kind === "deactivate") {
      run(
        () => setUserActiveAction(user.id, false),
        () => done(SUCCESS.deactivate(user.email)),
      );
      return;
    }
    run(
      () => setUserAdminAction(user.id, kind === "grant"),
      (data) => {
        // Akses admin sendiri hilang: muat penuh agar shell (menu Admin) ikut diperbarui.
        if (data.selfDemoted) window.location.assign("/");
        else done(SUCCESS[kind](user.email));
      },
    );
  }

  function closeDialog(open: boolean) {
    if (!open && !pending) setDialog(null);
  }

  /** Dialog dibuka dari menu (bukan dari Trigger dialog), jadi fokus kembali diatur manual. */
  function restoreFocus(event: Event) {
    event.preventDefault();
    if (!succeeded.current) triggerRef.current?.focus();
  }

  const kind: ConfirmKind = dialog && dialog !== "transfer" ? dialog : "deactivate";
  const copy = confirmCopy(kind, user.email, isSelf);

  return (
    <>
      <UserRowMenu
        user={user}
        isSelf={isSelf}
        pending={pending && dialog === null}
        triggerRef={triggerRef}
        onChoose={choose}
      />
      <ConfirmDialog
        open={dialog !== null && dialog !== "transfer"}
        onOpenChange={closeDialog}
        title={copy.title}
        description={copy.body}
        busy={pending}
        onCloseAutoFocus={restoreFocus}
        data-testid="admin-confirm"
        action={
          <Button
            variant={copy.destructive ? "destructive" : "primary"}
            pending={pending}
            leadingIcon={copy.icon}
            className={DIALOG_CTA}
            onClick={() => confirm(kind)}
          >
            {copy.label}
          </Button>
        }
      >
        {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      </ConfirmDialog>
      {!user.isActive && user.datasetCount > 0 ? (
        <TransferDialog
          open={dialog === "transfer"}
          onOpenChange={closeDialog}
          source={user}
          targets={targets}
          pending={pending}
          error={error}
          onCloseAutoFocus={restoreFocus}
          onConfirm={(target) =>
            run(
              () => transferDatasetsAction(user.id, target.id),
              (data) => done(transferResult(data, target.email)),
            )
          }
        />
      ) : null}
    </>
  );
}
