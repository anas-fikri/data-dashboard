"use client";

import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/widgets/export-menu";
import type { WidgetRequest } from "@/components/widgets/widget-query";
import type { ChartType } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import { dataToggle } from "./widget-card-model";

/*
 * Tombol di kepala kartu widget (widget-card.tsx): tombol data grafik dan tombol ekspor (T-017). Di
 * kartu sempit (container query) tombol mengalah sebelum judul jadi tidak terbaca, ekspor PALING DULU
 * (lebih jarang dipakai daripada tombol data; judul tetap ≥ ±4rem):
 * - ekspor: mode lihat < 9,5rem (mouse) / < 11rem (sentuh); mode edit < 14rem / < 17,5rem;
 * - tombol data: hanya mode edit, < 12rem (mouse) / < 14,5rem (sentuh).
 * Ekspor dari kartu sesempit itu: layar lebih lebar atau ponsel (grid satu kolom).
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

/** Ekspor CSV/XLSX dengan filter + urutan tabel yang sedang dipakai isi kartu. */
export function HeadExport(props: {
  title: string;
  table: boolean;
  editing: boolean;
  request: { readonly current: WidgetRequest | null };
}) {
  const { editing, ...rest } = props;
  return (
    <ExportMenu
      {...rest}
      className={cn(
        HEAD_BUTTON,
        editing
          ? "@max-[14rem]:hidden @max-[17.5rem]:any-pointer-coarse:hidden"
          : "@max-[9.5rem]:hidden @max-[11rem]:any-pointer-coarse:hidden",
      )}
    />
  );
}
