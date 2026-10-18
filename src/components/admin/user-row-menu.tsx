"use client";

import {
  IconArrowsExchange,
  IconDots,
  IconLoader2,
  IconShieldOff,
  IconShieldPlus,
  IconTrash,
  IconUserCheck,
  IconUserOff,
} from "@tabler/icons-react";
import { useRef, useState, type RefObject } from "react";
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
import { EmailText } from "./email-text";

export interface RowUser {
  id: string;
  email: string;
  isAdmin: boolean;
  isActive: boolean;
  emailVerified: boolean;
  datasetCount: number;
}

export type RowChoice = ConfirmKind | "activate" | "transfer" | "delete";

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
 * pengguna nonaktif yang punya dataset; hapus akun hanya untuk akun lain tanpa dataset.
 */
export function UserRowMenu({ user, isSelf, pending, triggerRef, onChoose }: UserRowMenuProps) {
  /** Pilihan membuka dialog: fokus jangan dikembalikan ke pemicu (dialog yang memegang fokus). */
  const toDialog = useRef(false);
  const [open, setOpen] = useState(false);
  const canGrant = !user.isAdmin && user.isActive && user.emailVerified;
  const canTransfer = !user.isActive && user.datasetCount > 0;
  const canDelete = !isSelf && user.datasetCount === 0;
  const hint = isSelf
    ? "Akun Anda sendiri tidak bisa dinonaktifkan atau dihapus."
    : user.isActive && !user.emailVerified && !user.isAdmin
      ? "Bisa dijadikan admin setelah emailnya terverifikasi."
      : user.datasetCount > 0
        ? "Untuk menghapus akun, nonaktifkan lalu alihkan datasetnya dulu."
        : null;

  function choose(choice: RowChoice) {
    toDialog.current = choice !== "activate";
    // Tutup eksplisit: onSelect berjalan di flushSync Radix, jadi `pending` bisa sudah true saat
    // Radix menutup menu, dan onOpenChange(false) tidak lagi dipanggil untuk menu terkendali.
    setOpen(false);
    onChoose(choice);
  }

  return (
    // Selama aksi tanpa dialog (Aktifkan) berjalan, pemicu tetap fokus (bukan disabled, yang membuang
    // fokus ke <body>) tetapi menu tidak bisa dibuka; spinner menggantikan ikon di slot yang sama.
    <DropdownMenu modal={false} open={open} onOpenChange={(o) => setOpen(o && !pending)}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          aria-label={`Aksi untuk ${user.email}`}
          aria-busy={pending || undefined}
          aria-disabled={pending || undefined}
          data-testid="admin-row-actions"
          className="size-(--control-h-lg) md:size-(--control-h)"
        >
          {pending ? (
            <IconLoader2 className="motion-safe:animate-spin" aria-hidden />
          ) : (
            <IconDots aria-hidden />
          )}
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
        <DropdownMenuLabel className="[overflow-wrap:anywhere]">
          <EmailText email={user.email} />
        </DropdownMenuLabel>
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
        {canDelete ? (
          <DropdownMenuItem destructive className={ITEM} onSelect={() => choose("delete")}>
            <IconTrash aria-hidden />
            Hapus akun…
          </DropdownMenuItem>
        ) : null}
        {hint ? <DropdownMenuLabel className="font-normal">{hint}</DropdownMenuLabel> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
