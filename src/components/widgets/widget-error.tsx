"use client";

import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

/*
 * Keadaan galat isi widget (T-011/T-012): pesan + "Coba lagi" untuk gangguan sementara, atau petunjuk
 * pengaturan (mode edit). Blok ini hilang begitu memuat ulang dimulai, jadi "Coba lagi" memindah fokus
 * ke judul kartu dulu (stabil selama isi berganti) — fokus tidak jatuh ke <body> (WCAG 2.4.3).
 */

/** Gangguan sementara → tombol coba lagi; selain itu pesan menjelaskan apa yang harus diubah. */
const TRANSIENT = new Set([
  "QUERY_BUSY",
  "QUERY_TIMEOUT",
  "OFFLINE",
  "UNAVAILABLE",
  "QUERY_FAILED",
  "NOT_READY",
  "RATE_LIMITED",
]);

/** Fokus ke judul kartu; judul bukan tab stop, jadi tabindex -1. */
function focusCardHeading(from: HTMLElement) {
  const heading = from.closest("[data-testid=widget]")?.querySelector<HTMLElement>("h2");
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus();
}

export function WidgetError({
  title,
  code,
  message,
  editing,
  onRetry,
}: {
  title: string;
  code: string;
  message: string;
  editing: boolean;
  onRetry: () => void;
}) {
  return (
    // justify-center-safe + overflow-hidden: pesan panjang di kartu kecil tidak menimpa judul (H4).
    <div
      // Bisa digulir (bukan dipotong) di kartu kecil; pesan lengkap tetap terbaca dengan sentuh. Wilayah
      // gulir harus bisa difokus agar bisa digulir dengan keyboard (axe scrollable-region-focusable);
      // cincin fokus di dalam (ring-inset) karena kartu memotong outline di luar.
      className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-2 overflow-y-auto rounded-sm p-3 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      role="region"
      aria-label={`Pesan ${title || "widget"}`}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      data-testid="widget-error"
      data-code={code}
    >
      <IconAlertTriangle
        size={24}
        stroke={1.5}
        aria-hidden
        className="shrink-0 text-warning @max-[10rem]:hidden"
      />
      <p className="max-w-prose shrink-0 text-sm" title={message}>
        {message}
      </p>
      {TRANSIENT.has(code) ? (
        <Button
          size="sm"
          variant="outline"
          className="h-(--control-h-lg) shrink-0 md:h-(--control-h-sm)"
          leadingIcon={<IconRefresh aria-hidden />}
          onClick={(e) => {
            focusCardHeading(e.currentTarget);
            onRetry();
          }}
        >
          Coba lagi
        </Button>
      ) : editing ? (
        <p className="text-xs text-muted-foreground @max-[10rem]:hidden">
          Ubah lewat tombol pengaturan widget.
        </p>
      ) : null}
    </div>
  );
}
