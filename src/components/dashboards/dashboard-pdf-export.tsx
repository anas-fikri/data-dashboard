"use client";

import { IconFileTypePdf, IconLoader2 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { revealKeyboardFocus } from "@/components/widgets/export-menu";
import {
  dashboardExportTarget,
  exportAnnouncement,
  exportBusy,
  type ExportJob,
} from "@/components/widgets/export-model";
import { AGAIN_ATTR, ExportStatus, NEWS_ATTR } from "@/components/widgets/export-status";
import { useExportJob } from "@/components/widgets/use-export-job";
import type { PdfExportCreateBody } from "@/features/exports/types";
import { appliedFiltersOf } from "./filters/applied-store";
import { encodeFilterParam, parseFilterParam, type FilterState } from "./filters/filter-model";

/*
 * "Ekspor PDF" di kepala halaman dashboard (T-018 D10): mode lihat, semua peran yang bisa melihat;
 * disembunyikan halaman di mode edit dan untuk dashboard tanpa widget. Pemicu membuka panel non-modal
 * (pola menu ekspor widget T-017): isi PDF dijelaskan, "Buat PDF" memulai, status/galat tampil di
 * bawahnya. Mesin status, polling, unduhan otomatis sekali, dan "Unduh lagi" sama dengan ekspor widget
 * (use-export-job) dengan sasaran dashboardExportTarget(id) — tetap per user (ExportUserProvider
 * membungkus kepala halaman). Galat menampilkan kodenya sebagai teks (AC3: RENDERER_UNAVAILABLE).
 * Panel tertutup: ikon berputar selama berjalan, titik galat sampai panel dibuka, dan status
 * diumumkan lewat wilayah status tersembunyi. 404 = akses dicabut → halaman diambil ulang dari server.
 */

/**
 * Body POST: status filter yang berlaku di widget (diterbitkan kanvas, D9 — juga yang terlalu panjang
 * untuk URL), atau ?f= bila kanvas belum menerbitkan. Server menyaring ulang saat buat dan render.
 */
export function pdfExportBody(
  dashboardId: string,
  applied: FilterState | null,
  urlF: string | null,
): PdfExportCreateBody {
  const f = encodeFilterParam(applied ?? parseFilterParam(urlF ?? undefined));
  return f ? { dashboardId, format: "pdf", f } : { dashboardId, format: "pdf" };
}

const SPINNER = <IconLoader2 className="motion-safe:animate-spin" aria-hidden />;

export function DashboardPdfExport({ dashboardId }: { dashboardId: string }) {
  const router = useRouter();
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const target = dashboardExportTarget(dashboardId);
  const { job, start, pollError, retryPoll, downloadAgain, again } = useExportJob(target, () =>
    router.refresh(),
  );
  // Keadaan terakhir yang terlihat di panel: galat sesudahnya (panel tertutup) diberi titik.
  const [seen, setSeen] = useState<ExportJob | null>(() => (job.phase === "error" ? null : job));
  const busy = exportBusy(job);
  const content = useRef<HTMLDivElement>(null);
  const create = useRef<HTMLButtonElement>(null);

  function run() {
    if (busy) return;
    const urlF = new URL(window.location.href).searchParams.get("f");
    void start(pdfExportBody(dashboardId, appliedFiltersOf(dashboardId), urlF));
  }

  // Elemen terfokus hilang karena status berubah → fokus ke "Ekspor lagi" atau "Buat PDF".
  useEffect(() => {
    if (!open || document.activeElement !== document.body) return;
    (content.current?.querySelector<HTMLElement>(`[${AGAIN_ATTR}]`) ?? create.current)?.focus();
  }, [open, job, pollError]);
  // Status/galat baru digulir ke pandangan panel seperlunya; fokus keyboard tetap terlihat.
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
    // Satu anak slot aksi PageHeader (< 768: [&>*]:w-full): wilayah status sr-only di dalam pembungkus,
    // bukan anak langsung — lebarnya tidak ikut 100 % (kotak absolut selebar layar = gulir samping).
    <div className="relative">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setSeen(job);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            data-testid="dashboard-pdf-export"
            className="w-full h-(--control-h-lg) md:h-(--control-h)"
            leadingIcon={busy ? SPINNER : <IconFileTypePdf aria-hidden />}
          >
            Ekspor PDF
            {unseenError ? (
              <span
                aria-hidden
                className="absolute top-1 right-1 size-2 rounded-full bg-destructive ring-2 ring-background forced-colors:bg-[CanvasText]"
              />
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={content}
          aria-labelledby={headingId}
          align="end"
          className="[&_button]:scroll-my-3"
          data-testid="dashboard-pdf-panel"
          onFocus={(e) => revealKeyboardFocus(e.target as HTMLElement)}
        >
          <div>
            <p id={headingId} className="text-sm font-semibold">
              Ekspor PDF
            </p>
            <p className="text-xs text-muted-foreground">
              Semua widget dengan filter yang sedang aktif, A4 lanskap. Tabel memuat baris yang muat
              di kartunya, dalam urutan bawaan.
            </p>
          </div>
          {/* Tanpa gap: wilayah status yang kosong tidak menambah jarak (isinya membawa margin). */}
          <div className="flex flex-col">
            <Button
              ref={create}
              data-testid="export-pdf"
              className="w-full h-(--control-h-lg) md:not-any-pointer-coarse:h-(--control-h) aria-disabled:pointer-events-none"
              // Berjalan: tetap fokusabel (tekan diabaikan) — polling tidak pernah membuang fokus.
              aria-disabled={busy || undefined}
              leadingIcon={busy ? SPINNER : <IconFileTypePdf aria-hidden />}
              onClick={run}
            >
              Buat PDF
            </Button>
            <ExportStatus
              job={job}
              pollError={pollError}
              onRetryPoll={retryPoll}
              onAgain={run}
              again={again}
              onDownloadAgain={() => void downloadAgain()}
              showCode
            />
          </div>
        </PopoverContent>
      </Popover>
      {/* Hanya perubahan sesudah panel ditutup (yang terlihat di panel sudah diumumkan di sana). */}
      <span role="status" className="sr-only">
        {open || seen === job ? "" : exportAnnouncement(job, "")}
      </span>
    </div>
  );
}
