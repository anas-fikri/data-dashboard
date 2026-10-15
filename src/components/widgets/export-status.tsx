"use client";

import { IconCircleCheck, IconDownload } from "@tabler/icons-react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { ExportFormatInput } from "@/features/exports/types";
import { markDownloadNavigation } from "@/lib/download-navigation";
import { doneDetail, exportBusy, exportDownloadUrl, type ExportJob } from "./export-model";

/*
 * Bagian bawah menu ekspor (T-017): baris status (role=status, selalu terpasang agar perubahan
 * diumumkan; kosong = tanpa tinggi — jarak dibawa isinya), tautan "Unduh lagi" sampai kedaluwarsa, dan
 * galat di FormAlert (role=alert). Galat kedaluwarsa/hilang membawa "Ekspor lagi" (format yang sama).
 * Elemen yang hilang saat status berubah tidak membuang fokus: menu memindahkannya (export-menu.tsx).
 */
export const AGAIN_ATTR = "data-export-again";
/** Kontrol sekunder di menu: 44 px di ponsel/sentuh, ringkas dengan mouse di ≥ md. */
const SMALL_CONTROL = "min-h-(--control-h-lg) md:not-any-pointer-coarse:min-h-(--control-h-sm)";

interface Props {
  job: ExportJob;
  pollError: boolean;
  onRetryPoll: () => void;
  onAgain: (format: ExportFormatInput) => void;
}

export function ExportStatus({ job, pollError, onRetryPoll, onAgain }: Props) {
  const busy = exportBusy(job);
  return (
    <>
      <div role="status" data-testid="export-status" className="text-sm">
        {busy ? (
          <div className="mt-3">
            <p className="font-medium">Menyiapkan ekspor…</p>
            <p className="text-xs text-muted-foreground">
              {pollError
                ? "Status belum terbaca. Periksa koneksi; kami terus mencoba."
                : "Menu boleh ditutup; unduhan dimulai otomatis."}
            </p>
          </div>
        ) : job.phase === "done" ? (
          <div className="mt-3">
            <p className="flex items-center gap-1.5 font-medium">
              <IconCircleCheck size={16} stroke={1.5} aria-hidden className="text-success" />
              Siap diunduh
            </p>
            <p className="text-xs text-muted-foreground">{doneDetail(job.rows, job.expiresAt)}</p>
          </div>
        ) : null}
      </div>
      {busy && pollError ? (
        <Button
          variant="link"
          size="sm"
          className={`self-start px-0 ${SMALL_CONTROL}`}
          onClick={onRetryPoll}
        >
          Coba sekarang
        </Button>
      ) : null}
      {job.phase === "done" ? (
        // `download`: galat 404/410 tidak membuka halaman JSON. 302 lintas origin ke storage tetap jadi
        // navigasi di Chromium → ditandai agar peringatan beforeunload editor tidak muncul.
        <a
          href={exportDownloadUrl(job.id)}
          download
          onClick={() => markDownloadNavigation()}
          data-testid="export-download"
          className={`inline-flex items-center gap-1.5 self-start rounded-sm text-sm font-medium text-primary underline underline-offset-4 ${SMALL_CONTROL}`}
        >
          <IconDownload size={16} stroke={1.5} aria-hidden className="shrink-0" />
          Unduh lagi
        </a>
      ) : null}
      {job.phase === "error" ? (
        <div data-testid="export-error" data-code={job.error.code} className="mt-3">
          <FormAlert tone="error">
            <p>{job.error.message}</p>
            {job.error.hint ? <p className="mt-1">{job.error.hint}</p> : null}
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
