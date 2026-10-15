"use client";

import { IconCircleCheck, IconDownload, IconLoader2 } from "@tabler/icons-react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { ExportFileFormat } from "@/features/exports/types";
import { cn } from "@/lib/utils";
import { busyLabel, doneDetail, exportBusy, type ExportJob } from "./export-model";

/*
 * Bagian bawah menu ekspor (T-017): baris status (role=status, selalu terpasang agar perubahan
 * diumumkan; kosong = tanpa tinggi — jarak dibawa isinya), tombol "Unduh lagi" sampai kedaluwarsa, dan
 * galat di FormAlert (role=alert). Galat kedaluwarsa/hilang membawa "Ekspor lagi" (format yang sama).
 * "Unduh lagi" membaca status dulu (use-export-job): selama itu ikon jadi spinner dan tekan diabaikan
 * (aria-disabled — fokus tetap di tombol); status tidak terbaca → catatan coba lagi, tautan tetap.
 * Elemen yang hilang saat status berubah tidak membuang fokus: menu memindahkannya (export-menu.tsx).
 * NEWS_ATTR menandai isi baru yang digulir ke pandangan menu seperlunya.
 * PDF dashboard (T-018): teks per format, tanpa jumlah baris, dan `showCode` menampilkan kode galat
 * sebagai teks ("Kode: RENDERER_UNAVAILABLE") — warna teks alert biasa, bukan muted: abu-abu di latar
 * merah muda alert < 4,5:1.
 */
export const AGAIN_ATTR = "data-export-again";
export const NEWS_ATTR = "data-export-news";
/** Kontrol sekunder di menu: 44 px di ponsel/sentuh, ringkas dengan mouse di ≥ md. */
const SMALL_CONTROL = "min-h-(--control-h-lg) md:not-any-pointer-coarse:min-h-(--control-h-sm)";
const news = { [NEWS_ATTR]: "" };

interface Props {
  job: ExportJob;
  pollError: boolean;
  onRetryPoll: () => void;
  onAgain: (format: ExportFileFormat) => void;
  /** "Unduh lagi": membaca status / status tidak terbaca. */
  again?: "idle" | "checking" | "failed";
  onDownloadAgain?: () => void;
  /** Kode galat juga sebagai teks terlihat (PDF dashboard); selalu ada di data-code. */
  showCode?: boolean;
}

export function ExportStatus(props: Props) {
  const { job, pollError, onRetryPoll, onAgain, again = "idle", onDownloadAgain, showCode } = props;
  const busy = exportBusy(job);
  const checking = again === "checking";
  const pdf = job.phase !== "idle" && job.format === "pdf";
  return (
    <>
      <div role="status" data-testid="export-status" className="text-sm">
        {busy ? (
          <div className="mt-3" {...news}>
            <p className="font-medium">{busyLabel(job.format)}</p>
            <p className="text-xs text-muted-foreground">
              {pollError
                ? "Status belum terbaca. Periksa koneksi; kami terus mencoba."
                : `${pdf ? "Panel" : "Menu"} boleh ditutup; unduhan dimulai otomatis.`}
            </p>
          </div>
        ) : job.phase === "done" ? (
          <div className="mt-3" {...news}>
            <p className="flex items-center gap-1.5 font-medium">
              <IconCircleCheck size={16} stroke={1.5} aria-hidden className="text-success" />
              Siap diunduh
            </p>
            <p className="text-xs text-muted-foreground">
              {doneDetail(pdf ? null : job.rows, job.expiresAt)}
            </p>
          </div>
        ) : null}
      </div>
      {busy && pollError ? (
        <Button
          variant="link"
          size="sm"
          className={`self-start px-0 ${SMALL_CONTROL}`}
          {...news}
          onClick={onRetryPoll}
        >
          Coba sekarang
        </Button>
      ) : null}
      {job.phase === "done" ? (
        <Button
          variant="link"
          size="sm"
          data-testid="export-download"
          className={cn(
            "self-start gap-1.5 px-0 underline [&_svg]:size-4 aria-disabled:pointer-events-none",
            SMALL_CONTROL,
          )}
          aria-disabled={checking || undefined}
          aria-busy={checking || undefined}
          leadingIcon={
            checking ? (
              <IconLoader2 className="motion-safe:animate-spin" aria-hidden />
            ) : (
              <IconDownload aria-hidden />
            )
          }
          onClick={() => {
            if (!checking) onDownloadAgain?.();
          }}
        >
          Unduh lagi
        </Button>
      ) : null}
      {job.phase === "done" && again === "failed" ? (
        <p role="alert" className="text-xs text-muted-foreground" {...news}>
          Tautan belum bisa diperiksa. Periksa koneksi lalu tekan Unduh lagi.
        </p>
      ) : null}
      {job.phase === "error" ? (
        <div data-testid="export-error" data-code={job.error.code} className="mt-3" {...news}>
          <FormAlert tone="error">
            <p>{job.error.message}</p>
            {job.error.hint ? <p className="mt-1">{job.error.hint}</p> : null}
            {showCode ? (
              <p className="mt-1 text-xs" data-testid="export-error-code">
                Kode: {job.error.code}
              </p>
            ) : null}
            {job.error.again ? (
              <Button
                variant="outline"
                size="sm"
                className={`mt-2 w-full md:w-auto ${SMALL_CONTROL}`}
                {...{ [AGAIN_ATTR]: "" }}
                onClick={() => onAgain(job.format)}
              >
                Ekspor lagi
              </Button>
            ) : null}
          </FormAlert>
        </div>
      ) : null}
    </>
  );
}
