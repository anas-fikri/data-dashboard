"use client";

import { IconAlertTriangle, IconDownload, IconLoader2, IconX } from "@tabler/icons-react";
import { Dialog } from "radix-ui";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  exportBusy,
  FORMAT_LABEL,
  sheetExportTarget,
  type ExportJob,
} from "@/components/widgets/export-model";
import { ExportStatus } from "@/components/widgets/export-status";
import { useExportJob } from "@/components/widgets/use-export-job";
import {
  EXPORT_CODES,
  XLSX_MAX_DATA_ROWS,
  type ExportFormatInput,
  type SheetExportCreateBody,
} from "@/features/exports/types";
import { fmtInt } from "./grid-model";

/*
 * "Unduh tampilan" Lihat data (T-046, rencana G-6 §3.5). Chunk lazy sendiri (bukan chunk grid):
 * dimuat saat tombol pertama kali ditekan lalu tetap terpasang, jadi polling + unduhan otomatis
 * berjalan walau dialog ditutup (mesin status use-export-job, sasaran sheet:<id>).
 * Tampilan dibaca saat "Buat file" ditekan: kolom terlihat dalam urutan tampil, urut, saringan, cari —
 * kolom yang disembunyikan tidak ikut. Batas baris (EXPORT_MAX_ROWS; XLSX ≤ 1.048.575) dijelaskan di
 * dialog; tampilan yang lebih besar tidak bisa dimulai dan disarankan disaring (server juga menolak
 * dengan EXPORT_TOO_LARGE — file tidak pernah dipotong).
 */

export type SheetView = Pick<SheetExportCreateBody, "cols" | "sort" | "filters" | "search">;

const BTN = "h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto";
const SPINNER = <IconLoader2 className="motion-safe:animate-spin" aria-hidden />;
const HINT =
  "Saring kolom (menu kolom → Saring…) atau cari teks untuk mempersempit baris, lalu unduh lagi.";

/** Batas baris file per format: XLSX tidak pernah lebih dari 1.048.575 baris data. */
export const limitFor = (format: ExportFormatInput, maxRows: number) =>
  format === "xlsx" ? Math.min(maxRows, XLSX_MAX_DATA_ROWS) : maxRows;

/** Teks batas di dialog (AC2). */
export function limitText(format: ExportFormatInput, maxRows: number): string {
  const base = `Paling banyak ${fmtInt(limitFor(format, maxRows))} baris per file.`;
  return format === "xlsx"
    ? `${base} File Excel (XLSX) memuat paling banyak ${fmtInt(XLSX_MAX_DATA_ROWS)} baris data.`
    : base;
}

/** Saran galat "terlalu besar" milik grid (bukan saran filter dashboard dari menu ekspor widget). */
function withGridHint(job: ExportJob): ExportJob {
  if (job.phase !== "error" || job.error.code !== EXPORT_CODES.EXPORT_TOO_LARGE) return job;
  return { ...job, error: { ...job.error, hint: HINT } };
}

export default function GridExport({
  open,
  onOpenChange,
  sheetId,
  versionId,
  rows,
  maxRows,
  getView,
  onAccessLost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetId: string;
  versionId: string;
  /** Baris tampilan sekarang (setelah saring/cari); null = belum diketahui. */
  rows: number | null;
  maxRows: number;
  getView: () => SheetView;
  onAccessLost: () => void;
}) {
  const uid = useId();
  const [format, setFormat] = useState<ExportFormatInput>("xlsx");
  const { job, start, pollError, retryPoll, downloadAgain, again } = useExportJob(
    sheetExportTarget(sheetId),
    onAccessLost,
  );
  const busy = exportBusy(job);
  const limit = limitFor(format, maxRows);
  const over = rows !== null && rows > limit;
  const cols = open ? getView().cols.length : 0;

  function run(f: ExportFormatInput = format) {
    if (busy || (rows !== null && rows > limitFor(f, maxRows))) return;
    const v = getView();
    void start({
      sheetId,
      versionId,
      format: f,
      cols: v.cols,
      ...(v.sort?.length ? { sort: v.sort } : {}),
      ...(v.filters?.length ? { filters: v.filters } : {}),
      ...(v.search ? { search: v.search } : {}),
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay/40" />
        <Dialog.Content
          aria-describedby={`${uid}-desc`}
          data-testid="grid-export-dialog"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-lg border bg-card shadow-lg md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
            <Dialog.Title className="text-base font-semibold">Unduh tampilan</Dialog.Title>
            <Dialog.Close asChild>
              <Button size="icon-lg" variant="ghost" aria-label="Tutup">
                <IconX aria-hidden />
              </Button>
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-3 px-4 py-3 text-sm">
            <p id={`${uid}-desc`} data-testid="grid-export-summary">
              {rows !== null ? `${fmtInt(rows)} baris` : "Semua baris tampilan"} × {fmtInt(cols)}{" "}
              kolom, sama dengan tampilan sekarang: kolom terlihat dan urutannya, urutan baris,
              saringan, dan pencarian. Kolom yang disembunyikan tidak ikut. File dibuat di server;
              tautannya berlaku 1 jam.
            </p>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 font-medium">Format</legend>
              {(["xlsx", "csv"] as const).map((f) => (
                <label
                  key={f}
                  className="flex min-h-(--control-h-lg) cursor-pointer items-center gap-2 rounded-sm px-1 hover:bg-accent md:min-h-9"
                >
                  <input
                    type="radio"
                    name={`${uid}-format`}
                    value={f}
                    checked={format === f}
                    onChange={() => setFormat(f)}
                    className="size-4 accent-[hsl(var(--primary))]"
                    data-testid={`grid-export-format-${f}`}
                  />
                  {FORMAT_LABEL[f]}
                </label>
              ))}
            </fieldset>
            <p className="text-muted-foreground" data-testid="grid-export-limit">
              {limitText(format, maxRows)}
            </p>
            {over ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/15 px-3 py-2"
                data-testid="grid-export-too-large"
              >
                <IconAlertTriangle size={20} stroke={1.5} aria-hidden className="mt-px shrink-0" />
                <span>
                  Tampilan ini {fmtInt(rows)} baris, melebihi batas {fmtInt(limit)} baris untuk{" "}
                  {FORMAT_LABEL[format]}. {HINT} File tidak pernah dipotong.
                </span>
              </div>
            ) : null}
            <div className="flex flex-col">
              <Button
                className={`${BTN} aria-disabled:pointer-events-none aria-disabled:opacity-50`}
                data-testid="grid-export-start"
                // Tetap fokusabel saat berjalan/terlalu besar: tekan diabaikan, fokus tidak hilang.
                aria-disabled={busy || over || undefined}
                leadingIcon={busy ? SPINNER : <IconDownload aria-hidden />}
                onClick={() => run()}
              >
                Buat file {FORMAT_LABEL[format]}
              </Button>
              <ExportStatus
                job={withGridHint(job)}
                pollError={pollError}
                onRetryPoll={retryPoll}
                onAgain={(f) => {
                  if (f === "csv" || f === "xlsx") run(f);
                }}
                again={again}
                onDownloadAgain={() => void downloadAgain()}
              />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
