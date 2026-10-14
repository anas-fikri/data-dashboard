"use client";

import { IconLoader2, IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FocusNotice } from "@/components/ui/focus-notice";
import type { MappingLocal, useMappingPoll } from "./use-mapping-job";

/*
 * Status simpan pemetaan: antre/diterapkan (diumumkan sopan, polling), atau galat yang menerima fokus
 * dengan langkah berikutnya (muat ulang bila skema aktif berubah). Tidak ada apa pun saat diam.
 */
export function MappingStatus({
  job,
  local,
  onDismiss,
}: {
  job: ReturnType<typeof useMappingPoll>;
  local: MappingLocal;
  onDismiss: () => void;
}) {
  const router = useRouter();
  if (job.phase) {
    return (
      <div
        role="status"
        data-testid="mapping-status"
        data-state={job.phase}
        className="flex items-start gap-3 rounded-md border border-primary/40 bg-background px-3 py-2 text-sm"
      >
        <IconLoader2
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-px shrink-0 text-primary motion-safe:animate-spin"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">
            {job.phase === "running" ? "Menerapkan pemetaan…" : "Pemetaan masuk antrean…"}
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
                className="h-(--control-h-lg) w-full sm:w-auto md:h-(--control-h-sm)"
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
        <span className="mt-2 flex flex-col gap-2 sm:flex-row">
          {local.reload ? (
            <Button
              size="sm"
              className="h-(--control-h-lg) w-full sm:w-auto md:h-(--control-h-sm)"
              leadingIcon={<IconRefresh aria-hidden />}
              onClick={() => {
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
            className="h-(--control-h-lg) w-full sm:w-auto md:h-(--control-h-sm)"
            onClick={onDismiss}
          >
            Tutup
          </Button>
        </span>
      </FocusNotice>
    </div>
  );
}
