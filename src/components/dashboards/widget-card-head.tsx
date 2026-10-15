"use client";

import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/widgets/export-menu";
import type { WidgetRequest } from "@/components/widgets/widget-query";
import type { ChartType } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import { chartOf, dataToggle, type CardConfig } from "./widget-card-model";

/*
 * Tombol di kepala kartu widget (widget-card.tsx): tombol data grafik dan tombol ekspor (T-017). Di
 * kartu sempit (container query) tombol mengalah sebelum judul jadi tidak terbaca, ekspor PALING DULU
 * (lebih jarang dipakai daripada tombol data). Batas ekspor dihitung dari tombol yang benar-benar ada di
 * kepala (review R1 D-1): padding 16 px + judul ±4rem + tiap tombol (32 px mouse / 44 px sentuh) + gap.
 * Ekspor dari kartu sesempit itu: layar lebih lebar atau ponsel (grid satu kolom).
 * - tombol data: hanya mode edit, < 12rem (mouse) / < 14,5rem (sentuh).
 */
/** Tombol kepala kartu: 44 px di ponsel dan bila ada layar sentuh, 32 px dengan mouse di ≥ md. */
export const HEAD_BUTTON =
  "size-(--control-h-lg) shrink-0 md:not-any-pointer-coarse:size-(--control-h-sm)";

/** Nilai grafik sebagai tabel. `mode` "wait": memuat — tetap memegang fokus dan tempatnya. */
export function DataToggleButton(props: {
  chart: ChartType;
  mode: "on" | "wait";
  pressed: boolean;
  title: string;
  editing: boolean;
  onToggle: () => void;
}) {
  const { chart, mode, pressed, title, editing, onToggle } = props;
  const toggle = dataToggle(chart, pressed);
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      className={cn(
        HEAD_BUTTON,
        // Tertekan terlihat (bukan hanya aria-pressed); mode warna paksa: garis Highlight.
        "aria-pressed:bg-accent aria-pressed:text-primary aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-primary",
        "forced-colors:aria-pressed:border-2 forced-colors:aria-pressed:border-[Highlight]",
        "aria-disabled:opacity-50",
        // Mode edit di kartu sempit: ruang kepala untuk judul + pengaturan.
        editing && "@max-[12rem]:hidden @max-[14.5rem]:any-pointer-coarse:hidden",
      )}
      aria-label={`Tampilkan data ${title} sebagai tabel`}
      title={toggle.tooltip}
      aria-pressed={pressed}
      // Memuat: tekan diabaikan (pola tombol pager tabel).
      aria-disabled={mode === "wait" || undefined}
      data-testid="widget-data-toggle"
      onClick={() => {
        if (mode === "on") onToggle();
      }}
    >
      <toggle.Icon aria-hidden />
    </Button>
  );
}

/**
 * Lebar container kartu di bawahnya tombol ekspor disembunyikan, menurut isi kepala:
 * - KPI/tabel (tanpa tombol data): lihat < 7,25rem / < 8rem sentuh; edit (+ pegangan + pengaturan)
 *   < 11,75rem / < 14,5rem;
 * - grafik (+ tombol data): lihat < 9rem / < 10,25rem sentuh — kartu bawaan w=4 dengan bilah samping
 *   terbuka tetap bertombol ekspor: 768 px mouse (container 147 px, judul ±59 px) dan tablet tegak
 *   820 px sentuh (164 px, judul ±52 px); edit < 14rem / < 17,5rem.
 * Kelas utuh (bukan rangkaian) agar terbaca Tailwind.
 */
export const EXPORT_HIDE = {
  view: {
    plain: "@max-[7.25rem]:hidden @max-[8rem]:any-pointer-coarse:hidden",
    chart: "@max-[9rem]:hidden @max-[10.25rem]:any-pointer-coarse:hidden",
  },
  edit: {
    plain: "@max-[11.75rem]:hidden @max-[14.5rem]:any-pointer-coarse:hidden",
    chart: "@max-[14rem]:hidden @max-[17.5rem]:any-pointer-coarse:hidden",
  },
} as const;

/** Ekspor CSV/XLSX dengan filter + urutan tabel yang sedang dipakai isi kartu. */
export function HeadExport(props: {
  widgetId: string;
  type: CardConfig["type"];
  title: string;
  editing: boolean;
  request: { readonly current: WidgetRequest | null };
}) {
  const { widgetId, type, title, editing, request } = props;
  const hide = EXPORT_HIDE[editing ? "edit" : "view"][chartOf(type) ? "chart" : "plain"];
  return (
    <ExportMenu
      widgetId={widgetId}
      title={title}
      table={type === "table"}
      request={request}
      className={cn(HEAD_BUTTON, hide)}
    />
  );
}
