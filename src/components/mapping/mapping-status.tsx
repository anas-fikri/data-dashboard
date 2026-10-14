"use client";

import { IconLoader2, IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FocusNotice } from "@/components/ui/focus-notice";
import { SAVE_ID } from "./mapping-save-bar";
import type { MappingLocal, useMappingPoll } from "./use-mapping-job";

/** Banner status (bisa difokus): tujuan fokus setelah dialog konfirmasi disetujui. */
export const STATUS_ID = "mapping-status-banner";

const SMALL_CTA = "h-(--control-h-lg) w-full sm:w-auto md:h-(--control-h-sm)";

/**
 * Judul halaman menerima fokus sebelum render ulang: form dipasang ulang (acuan skema berubah) atau
 * diganti keadaan kosong, jadi tombol yang sedang difokus hilang. h1 tetap ada di kedua keadaan.
 */
export function focusPageHeading() {
  const h1 = document.querySelector<HTMLElement>('[data-testid="mapping-page"] h1');
  if (!h1) return;
  h1.tabIndex = -1;
  h1.focus();
}

/*
 * Status simpan pemetaan: dikirim/antre/diterapkan (diumumkan sopan, polling), atau galat yang
 * menerima fokus dengan langkah berikutnya (muat ulang bila skema aktif berubah). Tidak ada apa pun
 * saat diam atau saat tahap tinjau (panel tinjau sendiri).
 */
export function MappingStatus({
  job,
  local,
  onDismiss,
}: {
  job: ReturnType<typeof useMappingPoll>;
  local: MappingLocal;
  /** Menyembunyikan galat (fokus diatur di sini: Tutup → tombol simpan, Muat ulang → judul). */
  onDismiss: () => void;
}) {
  const router = useRouter();
  if (job.phase || local.phase === "submitting") {
    const phase = job.phase ?? "submitting";
    return (
      <div
        id={STATUS_ID}
        tabIndex={-1}
        role="status"
        data-testid="mapping-status"
        data-state={phase}
        className="flex items-start gap-3 rounded-md border border-primary/40 bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconLoader2
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-px shrink-0 text-primary motion-safe:animate-spin"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">
            {phase === "running"
              ? "Menerapkan pemetaan…"
              : phase === "queued"
                ? "Pemetaan masuk antrean…"
                : "Menyimpan pemetaan…"}
          </span>
          <span className="block text-muted-foreground">
            Dashboard tetap memakai data aktif sampai selesai. Untuk file besar bisa beberapa menit;
            halaman berpindah ke dataset setelah versi baru aktif.
          </span>
          {job.pollError ? (
            <span className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
              Status terbaru belum bisa dimuat; mencoba lagi otomatis.
              <Button
                size="sm"
                variant="outline"
                className={SMALL_CTA}
                leadingIcon={<IconRefresh aria-hidden />}
                onClick={job.retry}
              >
                Coba sekarang
              </Button>
            </span>
          ) : null}
        </span>
      </div>
    );
  }
  if (local.phase !== "error") return null;
  return (
    <div data-testid="mapping-status" data-state={local.reload ? "stale" : "error"}>
      <FocusNotice tone="error">
        <span className="block">{local.message}</span>
        {local.reload ? (
          <span className="mt-1 block">
            Pilihan yang sudah dibuat di halaman ini hilang saat dimuat ulang dan perlu dibuat lagi.
          </span>
        ) : null}
        <span className="mt-2 flex flex-col gap-2 sm:flex-row">
          {local.reload ? (
            <Button
              size="sm"
              className={SMALL_CTA}
              leadingIcon={<IconRefresh aria-hidden />}
              onClick={() => {
                // Fokus dulu ke judul (tetap ada), baru galat ditutup dan halaman dirender ulang.
                focusPageHeading();
                onDismiss();
                router.refresh();
              }}
            >
              Muat ulang
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className={SMALL_CTA}
            onClick={() => {
              onDismiss();
              requestAnimationFrame(() => document.getElementById(SAVE_ID)?.focus());
            }}
          >
            Tutup
          </Button>
        </span>
      </FocusNotice>
    </div>
  );
}
