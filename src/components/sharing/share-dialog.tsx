"use client";

import { IconShare, IconX } from "@tabler/icons-react";
import { Dialog } from "radix-ui";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { DIALOG_CTA } from "@/components/ui/confirm-dialog";
import { SharePanel } from "./share-panel";

/*
 * Dialog "Bagikan" (T-016, pemilik saja — halaman hanya merender tombolnya untuk pemilik; server tetap
 * menolak non-pemilik). Radix Dialog: fokus terkunci, Esc menutup, fokus kembali ke tombol pemicu.
 * < 768 px: lembar setinggi layar; ≥ 768 px: kartu di tengah. Kepala dan baris "Selesai" tetap, isi
 * bergulir sendiri. z-40 (bukan 50): konfirmasi "Cabut" (AlertDialog z-40/50) dan menu Select (z-50)
 * yang dibuka dari dalamnya tampil di atasnya, termasuk lapisan peredupnya.
 */
export function ShareDialog({
  dashboardId,
  dashboardName,
}: {
  dashboardId: string;
  dashboardName: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          variant="outline"
          leadingIcon={<IconShare aria-hidden />}
          data-testid="share-open"
          className="h-(--control-h-lg) md:h-(--control-h)"
        >
          Bagikan
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content
          ref={box}
          tabIndex={-1}
          data-testid="share-dialog"
          // Fokus awal ke dialog; isi memindahkannya ke kolom cari setelah daftar akses dimuat.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            box.current?.focus();
          }}
          onFocusCapture={(e) => {
            // Fokus keyboard (Tab berputar) tidak boleh mendarat di luar area terlihat isi yang bergulir.
            if (e.target !== e.currentTarget && e.target.matches(":focus-visible")) {
              e.target.scrollIntoView({ block: "nearest" });
            }
          }}
          className="fixed inset-0 z-40 flex h-dvh w-full flex-col bg-card outline-none md:inset-auto md:top-1/2 md:left-1/2 md:h-auto md:max-h-[calc(100dvh-2rem)] md:w-[calc(100%-2rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border md:shadow-lg"
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:px-6 md:pt-5 md:pb-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold">Bagikan dashboard</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                Atur siapa yang bisa melihat atau mengedit “{dashboardName}”.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Tutup"
                className="size-(--control-h-lg) shrink-0 md:size-(--control-h-sm)"
              >
                <IconX aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <SharePanel dashboardId={dashboardId} boxRef={box} />
          </div>
          <div className="flex shrink-0 flex-col border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:flex-row md:justify-end md:px-6 md:pb-5">
            <Dialog.Close asChild>
              <Button variant="outline" className={DIALOG_CTA}>
                Selesai
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
