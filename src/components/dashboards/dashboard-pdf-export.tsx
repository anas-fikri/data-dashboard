"use client";

import {
  IconDownload,
  IconFileTypeHtml,
  IconFileTypePdf,
  IconLoader2,
  IconPhoto,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import type { ExportFileFormat, PdfExportCreateBody, RenderFormat } from "@/features/exports/types";
import { appliedFiltersOf } from "./filters/applied-store";
import {
  defaultState,
  encodeFilterParam,
  parseFilterParam,
  type FilterColumnView,
  type FilterState,
} from "./filters/filter-model";

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
 * untuk URL), atau ?f= bila kanvas belum menerbitkan; tanpa ?f= sama sekali = filter bawaan dashboard
 * (T-4q8n, aturan yang sama dengan kanvas: ?f= kosong → bawaan, ?f={} → tanpa filter). Server menyaring
 * ulang saat buat dan render.
 */
export function pdfExportBody(
  dashboardId: string,
  applied: FilterState | null,
  urlF: string | null,
  format: RenderFormat = "pdf",
  defaults: FilterState = { filters: [] },
): PdfExportCreateBody {
  const f = encodeFilterParam(applied ?? (urlF ? parseFilterParam(urlF) : defaults));
  return f ? { dashboardId, format, f } : { dashboardId, format };
}

/** Pilihan unduhan dashboard (T-yye9/T-c2bh): semuanya snapshot tampilan sesuai filter aktif. */
const PAGE_FORMATS = [
  { format: "pdf", label: "PDF (A4 lanskap)", icon: IconFileTypePdf },
  { format: "png", label: "Gambar (PNG)", icon: IconPhoto },
  { format: "html", label: "Halaman (HTML)", icon: IconFileTypeHtml },
] as const;

const SPINNER = <IconLoader2 className="motion-safe:animate-spin" aria-hidden />;

/**
 * Pengganti tombol saat tombol tidak tampil (mode edit, dashboard tanpa widget — review R1-CL-1): PDF
 * yang dimulai di mode lihat tetap dipantau — polling dan unduhan otomatis (sekali per ekspor lewat
 * klaim store) berjalan, perubahan statusnya diumumkan lewat wilayah status tersembunyi. Halaman
 * memasang tepat satu dari keduanya, jadi status tidak pernah di-polling ganda.
 */
export function DashboardPdfWatch({ dashboardId }: { dashboardId: string }) {
  const router = useRouter();
  const { job } = useExportJob(dashboardExportTarget(dashboardId), () => router.refresh());
  // Keadaan saat dipasang sudah diumumkan di mode lihat: hanya perubahan sesudahnya.
  const [mounted] = useState(job);
  const news =
    job === mounted
      ? ""
      : job.phase === "error"
        ? "Unduhan dashboard gagal. Detailnya ada di Unduh dashboard pada mode lihat."
        : exportAnnouncement(job, "");
  return (
    <span role="status" className="sr-only" data-testid="dashboard-pdf-watch">
      {news}
    </span>
  );
}

export function DashboardPdfExport({
  dashboardId,
  filterColumns = [],
}: {
  dashboardId: string;
  /** Kolom filter dashboard: sumber filter bawaan untuk cadangan bila kanvas belum menerbitkan. */
  filterColumns?: FilterColumnView[];
}) {
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

  function run(format: ExportFileFormat = "pdf") {
    if (busy || (format !== "pdf" && format !== "png" && format !== "html")) return;
    const urlF = new URL(window.location.href).searchParams.get("f");
    void start(
      pdfExportBody(
        dashboardId,
        appliedFiltersOf(dashboardId),
        urlF,
        format,
        defaultState(filterColumns),
      ),
    );
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
            leadingIcon={busy ? SPINNER : <IconDownload aria-hidden />}
          >
            Unduh dashboard
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
              Unduh dashboard
            </p>
            <p className="text-xs text-muted-foreground">
              Snapshot semua widget dengan filter yang sedang aktif. Tabel memuat baris yang muat di
              kartunya. HTML bisa dibuka tanpa login, tanpa interaksi. Datanya: unduh per widget.
            </p>
          </div>
          {/* Tanpa gap: wilayah status yang kosong tidak menambah jarak (isinya membawa margin). */}
          <div className="flex flex-col">
            <div className="flex flex-col gap-2">
              {PAGE_FORMATS.map(({ format, label, icon: Icon }) => {
                const active = busy && job.format === format;
                return (
                  <Button
                    key={format}
                    ref={format === "pdf" ? create : undefined}
                    variant={format === "pdf" ? "primary" : "outline"}
                    data-testid={`export-${format}`}
                    className={cn(
                      "w-full justify-start h-(--control-h-lg) md:not-any-pointer-coarse:h-(--control-h) aria-disabled:pointer-events-none",
                      busy && !active && "opacity-50",
                    )}
                    // Berjalan: tetap fokusabel (tekan diabaikan) — polling tidak pernah membuang fokus.
                    aria-disabled={busy || undefined}
                    leadingIcon={active ? SPINNER : <Icon aria-hidden />}
                    onClick={() => run(format)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
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
