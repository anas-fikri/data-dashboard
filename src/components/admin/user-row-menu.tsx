"use client";

import {
  IconArrowsExchange,
  IconDots,
  IconShieldOff,
  IconShieldPlus,
  IconUserCheck,
  IconUserOff,
} from "@tabler/icons-react";
import { useRef, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConfirmKind } from "./admin-messages";

export interface RowUser {
  id: string;
  email: string;
  isAdmin: boolean;
  isActive: boolean;
  emailVerified: boolean;
  datasetCount: number;
}

export type RowChoice = ConfirmKind | "activate" | "transfer";

interface UserRowMenuProps {
  user: RowUser;
  isSelf: boolean;
  pending: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onChoose: (choice: RowChoice) => void;
}

/** Item menu 44px di ponsel (target sentuh), 36px mulai 768. */
const ITEM = "h-11 md:h-9";

/*
 * Hanya aksi yang bisa berhasil yang ditampilkan (server tetap memeriksa ulang): jadikan admin butuh
 * akun aktif + email terverifikasi; nonaktifkan diri sendiri tidak ada; alihkan dataset hanya untuk
 * pengguna nonaktif yang punya dataset.
 */
export function UserRowMenu({ user, isSelf, pending, triggerRef, onChoose }: UserRowMenuProps) {
  /** Pilihan membuka dialog: fokus jangan dikembalikan ke pemicu (dialog yang memegang fokus). */
  const toDialog = useRef(false);
  const canGrant = !user.isAdmin && user.isActive && user.emailVerified;
  const canTransfer = !user.isActive && user.datasetCount > 0;
  const hint = isSelf
    ? "Akun Anda sendiri tidak bisa dinonaktifkan."
    : user.isActive && !user.emailVerified && !user.isAdmin
      ? "Bisa dijadikan admin setelah emailnya terverifikasi."
      : null;

  function choose(choice: RowChoice) {
    toDialog.current = choice !== "activate";
    onChoose(choice);
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          pending={pending}
          aria-label={`Aksi untuk ${user.email}`}
          data-testid="admin-row-actions"
          className="size-(--control-h-lg) md:size-(--control-h)"
        >
          <IconDots aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-w-[calc(100vw-2rem)]"
        onCloseAutoFocus={(e) => {
          if (toDialog.current) e.preventDefault();
          toDialog.current = false;
        }}
      >
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.isAdmin ? (
          <DropdownMenuItem destructive className={ITEM} onSelect={() => choose("revoke")}>
            <IconShieldOff aria-hidden />
            {isSelf ? "Cabut akses admin saya…" : "Cabut admin…"}
          </DropdownMenuItem>
        ) : null}
        {canGrant ? (
          <DropdownMenuItem className={ITEM} onSelect={() => choose("grant")}>
            <IconShieldPlus aria-hidden />
            Jadikan admin…
          </DropdownMenuItem>
        ) : null}
        {user.isActive && !isSelf ? (
          <DropdownMenuItem destructive className={ITEM} onSelect={() => choose("deactivate")}>
            <IconUserOff aria-hidden />
            Nonaktifkan…
          </DropdownMenuItem>
        ) : null}
        {!user.isActive ? (
          <DropdownMenuItem className={ITEM} onSelect={() => choose("activate")}>
            <IconUserCheck aria-hidden />
            Aktifkan
          </DropdownMenuItem>
        ) : null}
        {canTransfer ? (
          <DropdownMenuItem className={ITEM} onSelect={() => choose("transfer")}>
            <IconArrowsExchange aria-hidden />
            Alihkan dataset…
          </DropdownMenuItem>
        ) : null}
        {hint ? <DropdownMenuLabel className="font-normal">{hint}</DropdownMenuLabel> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
