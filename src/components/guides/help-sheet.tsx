"use client";

import { IconHelpCircle, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Panel bantuan samping (T-022): tombol "Bantuan" di kepala halaman membuka sheet kanan berisi artikel
 * panduan untuk halaman ini (dirender server, dikirim sebagai children) tanpa meninggalkan halaman.
 * Fokus terkunci di panel, Esc/klik latar menutup, fokus kembali ke tombol Bantuan (Trigger).
 */
export function HelpSheet({ page, children }: { page: string; children: ReactNode }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          variant="outline"
          leadingIcon={<IconHelpCircle aria-hidden />}
          data-testid="help-open"
          className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto"
        >
          Bantuan
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/50" />
        <Dialog.Content
          data-testid="help-panel"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-lg outline-none"
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold">Bantuan: {page}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Panduan untuk halaman ini sesuai peran Anda.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Tutup bantuan"
                className="size-(--control-h-lg) shrink-0 md:size-(--control-h-sm)"
              >
                <IconX aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          {/* Area gulir bisa difokus agar bisa digulir dengan keyboard (axe scrollable-region-focusable). */}
          <div
            role="region"
            aria-label="Isi bantuan"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <div className="flex flex-col gap-6">{children}</div>
          </div>
          <div className="shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Link
              href="/panduan"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4 md:min-h-6"
            >
              Buka semua panduan
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
