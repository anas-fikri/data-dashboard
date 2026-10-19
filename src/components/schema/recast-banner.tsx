"use client";

import { IconLoader2, IconRefresh, IconX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { FocusNotice } from "@/components/ui/focus-notice";
import type { ColumnSchema } from "@/features/ingest/infer";
import type { RecastProgress } from "@/features/ingest/recast-input";
import { fmtInt } from "./labels";
import { useRecast } from "./use-recast";

/** "Segmen 7 dari 24" (menulis) / "Membaca segmen 3 dari 24" (profil data lama, T-040). */
export function segmentProgressText(p: RecastProgress): string {
  const n = `${fmtInt(p.current)} dari ${fmtInt(p.total)}`;
  return p.phase === "read" ? `Membaca segmen ${n}` : `Segmen ${n}`;
}

/*
 * Status koreksi skema untuk sheet ini: antre/diproses (diumumkan sopan), gagal (dengan langkah
 * berikutnya), atau selesai — termasuk nilai yang gagal dikonversi di kolom yang baru diubah (AC 4).
 */
export function RecastBanner({ schema }: { schema: ColumnSchema[] }) {
  const router = useRouter();
  const { local, jobState, progress, pollError, retryPoll, done, dismissDone, dismissError } =
    useRecast();

  if (jobState) {
    return (
      <div
        role="status"
        data-testid="recast-status"
        data-state={jobState}
        className="flex flex-wrap items-start gap-3 rounded-md border border-primary/40 bg-background px-3 py-2 text-sm"
      >
        <IconLoader2
          size={20}
          stroke={1.5}
          aria-hidden
          className="mt-px shrink-0 text-primary motion-safe:animate-spin"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">
            {jobState === "running" ? "Menerapkan perubahan ke data…" : "Perubahan masuk antrean…"}
          </span>
          {progress && progress.total > 1 ? (
            <span className="block tabular-nums" data-testid="recast-progress">
              {segmentProgressText(progress)}
            </span>
          ) : null}
          <span className="block text-muted-foreground">
            Untuk file besar bisa beberapa menit. Halaman ini diperbarui otomatis setelah selesai.
          </span>
          {pollError ? (
            <span className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
              Status terbaru belum bisa dimuat; mencoba lagi otomatis.
              <Button
                size="sm"
                variant="outline"
                leadingIcon={<IconRefresh aria-hidden />}
                onClick={retryPoll}
              >
                Coba sekarang
              </Button>
            </span>
          ) : null}
        </span>
      </div>
    );
  }

  if (local.phase === "error") {
    return (
      <FormAlert tone="error">
        <span className="block">{local.message}</span>
        <span className="mt-2 flex flex-wrap gap-2">
          {local.stale ? (
            <Button
              size="sm"
              leadingIcon={<IconRefresh aria-hidden />}
              onClick={() => {
                dismissError();
                router.refresh();
              }}
            >
              Muat ulang
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={dismissError}>
            Tutup
          </Button>
        </span>
      </FormAlert>
    );
  }

  if (done) {
    const changed = done.change.kind === "columns" ? new Set(done.change.positions) : null;
    const failed = schema.filter((c) => c.castFailCount > 0 && (!changed || changed.has(c.pos)));
    return (
      <div className="relative" data-testid="recast-done">
        <div className="[&_[data-testid=form-alert]]:pr-14">
          <FocusNotice tone="success">
            <span className="block font-medium">
              {done.change.kind === "header"
                ? `Baris judul sekarang baris ${fmtInt(done.change.row)}; nama dan tipe kolom dideteksi ulang.`
                : done.change.kind === "metadata"
                  ? "Nama dan tampilan kolom diperbarui. Data tidak diproses ulang."
                  : "Perubahan skema diterapkan."}
            </span>
            {done.change.kind === "metadata" ? null : failed.length > 0 ? (
              <span className="mt-1 block">
                Nilai yang tidak sesuai tipe dikosongkan:{" "}
                {failed
                  .slice(0, 5)
                  .map((c) => `"${c.name}" ${fmtInt(c.castFailCount)} baris`)
                  .join(", ")}
                {failed.length > 5 ? `, dan ${fmtInt(failed.length - 5)} kolom lain` : ""}. Periksa
                format atau ubah tipenya ke Teks bila perlu.
              </span>
            ) : (
              <span className="mt-1 block">
                Semua nilai di kolom yang diubah berhasil dikonversi.
              </span>
            )}
          </FocusNotice>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-1 top-1 size-(--control-h-lg) md:size-(--control-h-sm)"
          aria-label="Tutup pemberitahuan"
          onClick={dismissDone}
        >
          <IconX aria-hidden />
        </Button>
      </div>
    );
  }
  return null;
}
