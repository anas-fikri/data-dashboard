"use client";

import { AlertDialog } from "radix-ui";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Tombol di baris aksi dialog: 44px dan full-width di ponsel, ukuran biasa mulai 768. */
export const DIALOG_CTA = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Akibat tindakan dalam bahasa sehari-hari (isi inline; dirender di dalam <p>). */
  description: ReactNode;
  /** Isi tambahan di antara deskripsi dan tombol: pilihan, pesan galat. */
  children?: ReactNode;
  /**
   * Tombol konfirmasi (Button biasa, bukan AlertDialog.Action) agar dialog tetap terbuka sampai
   * server menjawab. Tombol Batal disediakan dialog.
   */
  action: ReactNode;
  /** Permintaan sedang berjalan: Batal dinonaktifkan (Esc diabaikan oleh pemanggil lewat onOpenChange). */
  busy?: boolean;
  /** Mengatur ke mana fokus kembali saat dialog tertutup (dialog dibuka dari menu, bukan dari Trigger). */
  onCloseAutoFocus?: (event: Event) => void;
  "data-testid"?: string;
}

/**
 * Dialog konfirmasi (role=alertdialog): fokus awal ke Batal, fokus terkunci, Esc menutup, klik di
 * luar tidak menutup. Gaya sama dengan dialog hapus dataset/dashboard. Urutan tombol di DOM sama
 * dengan urutan tampilan: Batal lalu tombol utama (di ponsel bertumpuk, tombol utama di bawah).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  action,
  busy = false,
  onCloseAutoFocus,
  "data-testid": testId,
}: ConfirmDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  /*
   * Saat permintaan berjalan, tombol yang baru diklik menjadi disabled dan peramban membuang fokus
   * ke <body>. Fokus ditahan di dialog (kontainernya) agar Tab/pembaca layar tetap di dalam dialog;
   * bila gagal, pesan galat (FocusNotice) yang mengambil fokus.
   */
  useEffect(() => {
    const content = contentRef.current;
    if (!busy || !content) return;
    const active = document.activeElement;
    const lost =
      !active ||
      !content.contains(active) ||
      ((active instanceof HTMLButtonElement || active instanceof HTMLInputElement) &&
        active.disabled);
    if (lost) content.focus();
  }, [busy]);

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <AlertDialog.Content
          ref={contentRef}
          data-testid={testId}
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border bg-card p-6 shadow-lg outline-none"
        >
          <div>
            <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              {description}
            </AlertDialog.Description>
          </div>
          {children}
          <div className="flex flex-col gap-2 md:flex-row md:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={busy} className={DIALOG_CTA}>
                Batal
              </Button>
            </AlertDialog.Cancel>
            {action}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
