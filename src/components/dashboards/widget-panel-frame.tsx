"use client";

import { IconX } from "@tabler/icons-react";
import { Dialog } from "radix-ui";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

/*
 * Bingkai panel pengaturan widget. ≥ 1280 px: menempel di samping kanvas (sticky di bawah topbar) dan
 * fokus pindah ke judulnya saat dibuka. < 1280 px: lembar Radix Dialog — dari bawah di ponsel, dari
 * kanan di tablet — dengan fokus terkunci dan Escape untuk menutup. Pemanggil mengembalikan fokus
 * setelah onClose (tombol pengaturan widget, atau tombol urungkan bila widgetnya dihapus).
 */
const TITLE = "Pengaturan widget";
const closeClass = "size-(--control-h-lg) md:size-(--control-h-sm)";

export function WidgetPanelFrame({
  docked,
  onClose,
  children,
}: {
  docked: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const box = useRef<HTMLElement>(null);
  // Callback terbaru tanpa memasang ulang listener (fokus judul hanya saat panel dibuka).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!docked) return;
    heading.current?.focus();
    // Escape menutup panel yang menempel juga (lembar dialog sudah ditangani Radix).
    const el = box.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close.current();
    };
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [docked]);

  if (docked) {
    return (
      <aside
        ref={box}
        aria-labelledby={`${id}-h`}
        data-testid="widget-panel"
        className="sticky top-[calc(var(--topbar-h)+1rem)] flex max-h-[calc(100dvh-var(--topbar-h)-2rem)] w-80 shrink-0 flex-col gap-5 overflow-y-auto rounded-lg border bg-card p-4 shadow-xs"
      >
        <div className="flex items-start justify-between gap-2">
          <h2
            id={`${id}-h`}
            ref={heading}
            tabIndex={-1}
            className="min-w-0 break-words text-base font-semibold outline-none"
          >
            {TITLE}
          </h2>
          <Button
            size="icon-sm"
            variant="ghost"
            className={closeClass}
            aria-label="Tutup pengaturan"
            onClick={onClose}
          >
            <IconX aria-hidden />
          </Button>
        </div>
        {children}
      </aside>
    );
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content
          data-testid="widget-panel"
          aria-describedby={undefined}
          // Fokus dikembalikan pemanggil (widget bisa sudah dihapus), bukan ke pemicu bawaan Radix.
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-5 overflow-y-auto rounded-t-lg border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg md:inset-y-0 md:left-auto md:max-h-none md:w-96 md:rounded-l-lg md:rounded-tr-none"
        >
          <div className="flex items-start justify-between gap-2">
            <Dialog.Title className="min-w-0 break-words text-base font-semibold">
              {TITLE}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                className={closeClass}
                aria-label="Tutup pengaturan"
              >
                <IconX aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
