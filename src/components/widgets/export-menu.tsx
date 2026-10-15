"use client";

import { IconDownload, IconFileTypeCsv, IconFileTypeXls, IconLoader2 } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ExportFileFormat } from "@/features/exports/types";
import { cn } from "@/lib/utils";
import {
  exportAnnouncement,
  exportBody,
  exportBusy,
  FORMAT_LABEL,
  type ExportJob,
} from "./export-model";
import { AGAIN_ATTR, ExportStatus, NEWS_ATTR } from "./export-status";
import { useExportJob } from "./use-export-job";
import type { WidgetRequest } from "./widget-query";

/*
 * Tombol ekspor di kepala kartu widget (T-017), mode lihat dan edit, semua peran yang melihat widget.
 * Popover non-modal: fokus masuk ke tombol format pertama saat dibuka, Escape/klik di luar menutup
 * dan fokus kembali ke tombol ini (Radix). Selama ekspor berjalan tombol format tetap fokusabel
 * (aria-disabled, tekan diabaikan) sehingga polling tidak pernah membuang fokus; elemen yang hilang
 * saat status berubah (Ekspor lagi, Coba sekarang, Unduh lagi) mengembalikan fokus ke dalam menu.
 * Menu tertutup: ikon berputar selama ekspor, titik galat sampai menu dibuka, dan status diumumkan
 * lewat wilayah status tersembunyi. Ukuran tombol dan urutan sembunyi di kartu sempit milik kartu
 * (className dari widget-card-head.tsx). Status ekspor hidup di export-store.ts per user + widget: kartu
 * yang dipasang ulang (rotasi tumpukan ↔ grid, mode lihat ↔ edit) menampilkan ekspor yang sama.
 */
const FORMAT_ICON = { csv: IconFileTypeCsv, xlsx: IconFileTypeXls } as const;
const FORMATS = ["csv", "xlsx"] as const;

/**
 * Gulir kontrol terfokus ke area terlihat hanya untuk fokus keyboard (:focus-visible): fokus dari tekan
 * mouse/sentuh di tepi gulir akan menggeser tombol keluar dari bawah penunjuk sebelum klik selesai,
 * sehingga klik hilang (review T-017 R3-CL-1).
 */
export function revealKeyboardFocus(el: Pick<HTMLElement, "matches" | "scrollIntoView">) {
  if (el.matches(":focus-visible")) el.scrollIntoView({ block: "nearest" });
}

interface Props {
  widgetId: string;
  title: string;
  /** Jenis widget: tabel = semua baris tersaring; lainnya = nilai yang tampil. */
  table: boolean;
  /** Body query yang sedang dipakai kartu (filter + urutan tabel); dibaca saat ekspor dimulai. */
  request: { readonly current: WidgetRequest | null };
  className?: string;
}

export function ExportMenu({ widgetId, title, table, request, className }: Props) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const { job, start, pollError, retryPoll, downloadAgain, again } = useExportJob(widgetId);
  // Keadaan yang terakhir terlihat di menu: galat sesudahnya (menu tertutup) diberi titik di tombol.
  // Dipasang ulang: ekspor yang sedang berjalan/selesai tidak diumumkan ulang; galat tetap bertitik.
  const [seen, setSeen] = useState<ExportJob | null>(() => (job.phase === "error" ? null : job));
  const busy = exportBusy(job);
  const content = useRef<HTMLDivElement>(null);
  const buttons = useRef<Partial<Record<ExportFileFormat, HTMLButtonElement | null>>>({});

  function run(format: ExportFileFormat) {
    const body = request.current; // null hanya sebelum isi kartu pertama kali dirender
    // PDF hanya untuk dashboard utuh (kepala halaman); store kartu tidak pernah memegangnya.
    if (body && !busy && format !== "pdf") void start(exportBody(body, format));
  }

  // Elemen terfokus hilang karena status berubah → fokus ke "Ekspor lagi" atau tombol format.
  useEffect(() => {
    if (!open || document.activeElement !== document.body) return;
    const again = content.current?.querySelector<HTMLElement>(`[${AGAIN_ATTR}]`);
    (again ?? (job.phase === "idle" ? null : buttons.current[job.format]))?.focus();
  }, [open, job, pollError]);
  // Menu setinggi sisa layar bergulir: status/galat baru (di bawah) digulir ke pandangan seperlunya,
  // lalu kontrol yang terfokus keyboard dijaga tetap terlihat (skrip tidak pernah menggulir fokus keluar
  // menu). Fokus dari ketuk/klik tidak menarik gulir kembali — hasil tetap terbaca (review R3-D-1).
  useEffect(() => {
    const el = content.current;
    if (!el || job.phase === "idle") return;
    const fresh = el.querySelectorAll<HTMLElement>(`[${NEWS_ATTR}]`);
    fresh[fresh.length - 1]?.scrollIntoView({ block: "nearest" });
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && el.contains(focused)) revealKeyboardFocus(focused);
  }, [job, pollError, again]);

  const unseenError = job.phase === "error" && seen !== job && !open;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setSeen(job);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className={className}
          aria-label={`Ekspor ${title}`}
          title={unseenError ? "Ekspor gagal. Buka untuk detail." : "Ekspor CSV atau Excel"}
          data-testid="widget-export"
        >
          {busy ? (
            <IconLoader2 className="motion-safe:animate-spin" aria-hidden />
          ) : (
            <IconDownload aria-hidden />
          )}
          {unseenError ? (
            <span
              aria-hidden
              className="absolute top-1 right-1 size-2 rounded-full bg-destructive ring-2 ring-card forced-colors:bg-[CanvasText]"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      {/* Hanya perubahan sesudah menu ditutup (yang terlihat di menu sudah diumumkan di sana). */}
      <span role="status" className="sr-only">
        {open || seen === job ? "" : exportAnnouncement(job, title)}
      </span>
      <PopoverContent
        ref={content}
        aria-labelledby={headingId}
        align="end"
        // Margin gulir = padding menu: cincin fokus (2 px + offset 2 px) tidak terpotong tepi gulir.
        className="w-72 [&_button]:scroll-my-3"
        data-testid="export-menu"
        // Tab/Shift+Tab berputar di dalam menu (Radix FocusScope: focus tanpa gulir) — di menu setinggi
        // sisa layar kontrol tujuan bisa di luar area terlihat; gulir seperlunya (review R2-D-1).
        onFocus={(e) => revealKeyboardFocus(e.target as HTMLElement)}
      >
        <div>
          <p id={headingId} className="truncate text-sm font-semibold" title={title}>
            Ekspor {title}
          </p>
          <p className="text-xs text-muted-foreground">
            {table
              ? "Semua baris yang tersaring, urut seperti di tabel."
              : "Nilai yang tampil di widget ini, sesuai filter aktif."}{" "}
            Angka apa adanya, tanpa Rp atau %.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {FORMATS.map((f) => {
            const Icon = FORMAT_ICON[f];
            const active = busy && job.format === f;
            return (
              <Button
                key={f}
                ref={(el) => {
                  buttons.current[f] = el;
                }}
                variant="outline"
                data-testid={`export-${f}`}
                className={cn(
                  "w-full justify-start h-(--control-h-lg) md:not-any-pointer-coarse:h-(--control-h)",
                  // Berjalan: tetap fokusabel (tekan diabaikan); format lain diredupkan.
                  "aria-disabled:pointer-events-none",
                  busy && !active && "opacity-50",
                )}
                aria-disabled={busy || undefined}
                leadingIcon={
                  active ? (
                    <IconLoader2 className="motion-safe:animate-spin" aria-hidden />
                  ) : (
                    <Icon aria-hidden />
                  )
                }
                onClick={() => run(f)}
              >
                {FORMAT_LABEL[f]}
              </Button>
            );
          })}
        </div>
        {/* Tanpa gap: wilayah status yang kosong tidak menambah jarak (isinya membawa margin). */}
        <div className="flex flex-col">
          <p className="text-xs text-muted-foreground">
            File CSV memakai koma; untuk Excel berbahasa Indonesia pilih Excel (XLSX).
          </p>
          <ExportStatus
            job={job}
            pollError={pollError}
            onRetryPoll={retryPoll}
            onAgain={run}
            again={again}
            onDownloadAgain={() => void downloadAgain()}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
