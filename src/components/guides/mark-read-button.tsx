"use client";

import { IconCheck, IconCircleCheck, IconLoader2 } from "@tabler/icons-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { markGuideReadAction } from "@/features/guides/reader-actions";

/**
 * "Tandai sudah dibaca" (T-022). Setelah berhasil, tombol diganti status "Sudah dibaca" yang menerima
 * fokus (tombol yang ditekan hilang dari halaman); galat tampil dan difokus. Dipasang dua kali di
 * halaman artikel (kepala + akhir artikel, T-exfc); tiap salinan memegang fokusnya sendiri.
 */
export function MarkReadButton({ articleId, read }: { articleId: string; read: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Salinan ini yang diklik: hanya ia yang memindah fokus dan berperan status.
  const [marked, setMarked] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (read && marked) statusRef.current?.focus();
  }, [read, marked]);
  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  if (read) {
    return (
      <p
        ref={statusRef}
        // Hanya salinan yang diklik: ia menerima fokus dan diumumkan; salinan lain cukup teks (tanpa
        // pengumuman ganda dari dua live region yang muncul bersamaan).
        role={marked ? "status" : undefined}
        tabIndex={-1}
        className="inline-flex min-h-(--control-h) items-center gap-1.5 text-sm font-medium text-success outline-none"
      >
        <IconCircleCheck size={20} stroke={1.5} aria-hidden />
        Sudah dibaca
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {/*
       * Menunggu: aria-disabled, bukan `pending` Button (disabled) — tombol disabled melepas fokus ke
       * body; fokus tetap di tombol sampai status/galat mengambilnya (T-exfc). Klik ulang diabaikan.
       */}
      <Button
        variant="outline"
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        leadingIcon={
          pending ? (
            <IconLoader2 className="motion-safe:animate-spin" aria-hidden />
          ) : (
            <IconCheck aria-hidden />
          )
        }
        className="h-(--control-h-lg) w-full aria-disabled:cursor-progress md:h-(--control-h) md:w-auto md:self-start"
        onClick={() => {
          if (pending) return;
          start(async () => {
            setError(null);
            const r = await markGuideReadAction(articleId).catch(() => null);
            if (r?.ok) setMarked(true);
            else setError(r?.message ?? "Koneksi terputus. Coba lagi.");
          });
        }}
      >
        Tandai sudah dibaca
      </Button>
      {error ? (
        <FormAlert tone="error" ref={alertRef}>
          {error}
        </FormAlert>
      ) : null}
    </div>
  );
}
