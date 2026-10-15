"use client";

import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/widgets/export-menu";
import type { WidgetRequest } from "@/components/widgets/widget-query";
import type { ChartType } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import { chartOf, dataToggle, type CardConfig } from "./widget-card-model";

/*
 * Kepala kartu widget (widget-card.tsx): judul, tombol data grafik, dan tombol ekspor (T-017). Di
 * kartu sempit (container query) tombol mengalah sebelum judul jadi tidak terbaca, ekspor PALING DULU
 * (lebih jarang dipakai daripada tombol data). Batas ekspor dihitung dari tombol yang benar-benar ada di
 * kepala (review R1 D-1): padding 16 px + judul ±4rem + tiap tombol (32 px mouse / 44 px sentuh) + gap.
 * Ekspor dari kartu sesempit itu: layar lebih lebar atau ponsel (grid satu kolom).
 * - tombol data: hanya mode edit, < 12rem (mouse) / < 14,5rem (sentuh).
 */
/** Tombol kepala kartu: 44 px di ponsel dan bila ada layar sentuh, 32 px dengan mouse di ≥ md. */
export const HEAD_BUTTON =
  "size-(--control-h-lg) shrink-0 md:not-any-pointer-coarse:size-(--control-h-sm)";

/**
 * Mode lihat di kartu sempit: padding kepala dirapatkan dan judul dua baris kecil (2 × 16 px = tombol
 * 32 px; sentuh + margin = 44 px), bukan 4–5 huruf di samping tombol. KPI/tabel: < 9rem. Grafik (tombol
 * data + ekspor) sampai judul sebaris ≥ 4rem — 16 padding + 2 × (gap 4 + tombol) + 64: < 9,5rem mouse /
 * < 11rem sentuh, seluruh rentang tempat kedua tombol tampil di kartu sesempit itu (review R2-D-2: 768 px
 * mouse, tablet sentuh 820/834 px, 844×390 tidak lagi "Omz…"); judul grafik tanpa padding sendiri (+4 px:
 * "Omzet per" muat sebaris di 820 px sentuh). Kelas utuh agar terbaca Tailwind.
 */
export const NARROW_VIEW = {
  head: {
    plain: "@max-[9rem]:px-1",
    chart: "@max-[9.5rem]:px-1 @max-[11rem]:any-pointer-coarse:px-1",
  },
  title: {
    plain: [
      "@max-[9rem]:line-clamp-2 @max-[9rem]:whitespace-normal @max-[9rem]:break-words @max-[9rem]:px-0.5",
      "@max-[9rem]:text-xs @max-[9rem]:leading-4 @max-[9rem]:min-h-(--control-h-sm) @max-[9rem]:my-1.5",
      "md:not-any-pointer-coarse:@max-[9rem]:leading-4 md:not-any-pointer-coarse:@max-[9rem]:my-0",
    ],
    chart: [
      "@max-[9.5rem]:line-clamp-2 @max-[9.5rem]:whitespace-normal @max-[9.5rem]:break-words",
      "@max-[9.5rem]:px-0 @max-[9.5rem]:text-xs @max-[9.5rem]:leading-4",
      "@max-[9.5rem]:min-h-(--control-h-sm) @max-[9.5rem]:my-1.5",
      "md:not-any-pointer-coarse:@max-[9.5rem]:leading-4 md:not-any-pointer-coarse:@max-[9.5rem]:my-0",
      "@max-[11rem]:any-pointer-coarse:line-clamp-2 @max-[11rem]:any-pointer-coarse:whitespace-normal",
      "@max-[11rem]:any-pointer-coarse:break-words @max-[11rem]:any-pointer-coarse:px-0",
      "@max-[11rem]:any-pointer-coarse:text-xs @max-[11rem]:any-pointer-coarse:leading-4",
      "@max-[11rem]:any-pointer-coarse:min-h-(--control-h-sm) @max-[11rem]:any-pointer-coarse:my-1.5",
    ],
  },
} as const;

/** Judul kartu setinggi tombol kepala (kepala KPI/tabel sama tinggi dengan kepala grafik bertombol). */
export function CardTitle(props: {
  title: string;
  /** Widget tanpa judul: teks pengganti diredupkan. */
  placeholder: boolean;
  editing: boolean;
  chart: boolean;
}) {
  const { title, placeholder, editing, chart } = props;
  return (
    <h2
      className={cn(
        // Basis = lebar judul; penanda "Memperbarui…" (basis 0) hanya mengisi sisa ruang.
        "min-w-0 flex-auto truncate px-1 text-sm font-medium",
        "leading-(--control-h-lg) md:not-any-pointer-coarse:leading-(--control-h-sm)",
        editing && [
          "@max-[8rem]:px-0.5 @max-[5rem]:sr-only",
          "@max-[10rem]:any-pointer-coarse:order-first @max-[10rem]:any-pointer-coarse:basis-full @max-[10rem]:any-pointer-coarse:leading-5",
        ],
        // Margin, bukan padding: baris ke-3 yang dipotong line-clamp tidak mengintip di padding bawah.
        // Judul sebaris rata atas, sejajar baris pertama judul dua baris.
        !editing && NARROW_VIEW.title[chart ? "chart" : "plain"],
        placeholder && "text-muted-foreground",
      )}
      title={title}
    >
      {title}
    </h2>
  );
}

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
