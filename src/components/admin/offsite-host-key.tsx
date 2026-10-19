"use client";

import { IconKeyOff } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

/**
 * Kunci host NAS yang dipin (T-y8qq): diambil saat "Tes koneksi" pertama, lalu koneksi ke kunci lain ditolak.
 * "Lupakan" hanya untuk NAS yang memang diinstal ulang/diganti — tes berikutnya menerima kunci baru.
 */
export function OffsiteHostKey({
  fingerprint,
  onForget,
  disabled,
}: {
  fingerprint: string;
  onForget: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 text-sm">
        <span className="block font-medium">Kunci host NAS</span>
        {fingerprint ? (
          <code
            className="block font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]"
            data-testid="offsite-fingerprint"
          >
            {fingerprint}
          </code>
        ) : (
          <span className="block text-muted-foreground">
            Belum ada. Tekan Tes koneksi untuk mengambilnya; setelah disimpan, server lain yang
            menyamar sebagai NAS akan ditolak.
          </span>
        )}
      </div>
      {fingerprint ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          leadingIcon={<IconKeyOff aria-hidden />}
          className="h-(--control-h-lg) w-full shrink-0 md:h-(--control-h) md:w-auto"
          onClick={onForget}
        >
          Lupakan kunci host
        </Button>
      ) : null}
    </div>
  );
}
