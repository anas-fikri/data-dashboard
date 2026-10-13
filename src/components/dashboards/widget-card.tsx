"use client";

import { IconAdjustmentsHorizontal, IconChartBar, IconGripVertical } from "@tabler/icons-react";
import { forwardRef, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { configVersion, type BodyState } from "@/components/widgets/body-state";
import { WidgetBody } from "@/components/widgets/widget-body";
import type { WidgetView } from "@/features/dashboards/service";
import { cn } from "@/lib/utils";
import { cardConfig, dataToggle, toggleMode } from "./widget-card-model";

/*
 * Satu widget di kanvas. Mode lihat: hanya isi. Mode edit: seluruh kepala kartu jadi pegangan seret
 * (layar lebar; tombol di dalamnya tidak memulai seret) dan satu tombol pengaturan — hapus ada di panel
 * agar kartu sempit tetap muat dan tidak ada hapus sekali ketuk. forwardRef + sisa props:
 * react-grid-layout menempelkan style, kelas, dan handler ke anak langsung.
 *
 * Kepala semua kartu setinggi satu tombol (judul ber-line-height tombol) agar judul sebaris rata.
 * Kartu adalah container. Mode lihat < 9rem (2 kolom di 1024): padding kepala dirapatkan dan judul
 * dua baris kecil (2 × 16 px = tombol 32 px; sentuh + margin = 44 px), bukan 4–5 huruf di samping
 * tombol data. Tombol data tetap ada: di kartu < 140 px grafik diganti daftar peringkat ("+N
 * lainnya"), jadi tabel itulah satu-satunya jalan ke baris yang tidak muat. Di mode edit judul tetap
 * terlihat (terpotong, lengkap di title) dan yang disembunyikan lebih dulu adalah perlengkapan yang
 * kurang penting:
 * - tombol data: < 12rem (mouse) / < 14,5rem (sentuh);
 * - ikon pegangan dengan mouse: < 10rem (seluruh kepala tetap pegangan, kursor "grab");
 * - sentuh (ikon pegangan satu-satunya pegangan, 44 px): < 10rem judul pindah ke baris sendiri di
 *   atas pegangan + pengaturan; < 6,5rem ikon pegangan hilang (geser lewat tombol di panel);
 * - < 8rem padding kepala dirapatkan; < 5rem judul hanya untuk pembaca layar.
 */
export const DRAG_HANDLE = "widget-drag-handle";
/** Pegangan seret di layar sentuh: hanya ikon ini (44 px), agar menggeser kepala kartu tetap scroll. */
export const GRIP_HANDLE = "widget-grip";
export const SETTINGS_ATTR = "data-widget-settings";
/** Tombol kepala kartu: 44 px di ponsel dan bila ada layar sentuh, 32 px dengan mouse di ≥ md. */
const HEAD_BUTTON =
  "size-(--control-h-lg) shrink-0 md:not-any-pointer-coarse:size-(--control-h-sm)";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  widget: WidgetView;
  editing: boolean;
  draggable: boolean;
  selected: boolean;
  onSettings?: () => void;
};

export const WidgetCard = forwardRef<HTMLDivElement, Props>(function WidgetCard(
  { widget, editing, draggable, selected, onSettings, className, children, ...rest },
  ref,
) {
  const title = widget.title || "Widget tanpa judul";
  const handle = editing && draggable;
  const config = cardConfig(widget.type, widget.spec);
  const chart =
    config?.type === "bar" || config?.type === "line" || config?.type === "pie"
      ? config.type
      : null;
  // Nilai grafik sebagai tabel: tombol di kepala kartu (tidak ikut terpotong di kartu pendek/sempit).
  const [showData, setShowData] = useState(false);
  // Status isi dari WidgetBody, ditandai versi spec: spec baru dianggap memuat sampai isinya melapor.
  const [body, setBody] = useState<{ version: string; state: BodyState } | null>(null);
  const onState = useCallback(
    (version: string, state: BodyState) =>
      setBody((b) => (b?.version === version && b.state === state ? b : { version, state })),
    [],
  );
  const status = config && body?.version === configVersion(config) ? body.state : "loading";
  const mode = chart ? toggleMode(status) : null;
  const toggle = chart && mode ? dataToggle(chart, showData) : null;
  return (
    <div
      ref={ref}
      data-testid="widget"
      data-widget-id={widget.id}
      className={cn(
        "@container flex scroll-mt-[calc(var(--topbar-h)+1rem)] flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs",
        selected && "ring-2 ring-primary",
        className,
      )}
      {...rest}
    >
      <div
        className={cn(
          "flex items-center gap-1 border-b px-2 py-1.5",
          !editing && "@max-[9rem]:px-1",
          editing && [
            "@max-[8rem]:px-1",
            "@max-[10rem]:any-pointer-coarse:flex-wrap @max-[10rem]:any-pointer-coarse:gap-y-0",
          ],
          handle && [DRAG_HANDLE, "cursor-grab active:cursor-grabbing"],
        )}
      >
        {handle ? (
          <span
            className={cn(
              GRIP_HANDLE,
              "flex size-8 shrink-0 touch-none items-center justify-center text-muted-foreground any-pointer-coarse:size-11",
              "@max-[6.5rem]:hidden @max-[10rem]:not-any-pointer-coarse:hidden",
            )}
            title="Seret kepala kartu untuk memindahkan"
            aria-hidden
          >
            <IconGripVertical size={18} stroke={1.5} />
          </span>
        ) : null}
        <h2
          className={cn(
            "min-w-0 flex-1 truncate px-1 text-sm font-medium",
            // Setinggi tombol kepala: kepala KPI/tabel sama tinggi dengan kepala grafik bertombol.
            "leading-(--control-h-lg) md:not-any-pointer-coarse:leading-(--control-h-sm)",
            editing && [
              "@max-[8rem]:px-0.5 @max-[5rem]:sr-only",
              "@max-[10rem]:any-pointer-coarse:order-first @max-[10rem]:any-pointer-coarse:basis-full @max-[10rem]:any-pointer-coarse:leading-5",
            ],
            // Mode lihat di kartu sempit: dua baris kecil (kotak 32 px; sentuh + margin = 44 px). Margin,
            // bukan padding: baris ke-3 yang dipotong line-clamp tidak mengintip di padding bawah.
            // Judul sebaris rata atas, sejajar baris pertama judul dua baris.
            !editing && [
              "@max-[9rem]:line-clamp-2 @max-[9rem]:whitespace-normal @max-[9rem]:break-words @max-[9rem]:px-0.5",
              "@max-[9rem]:text-xs @max-[9rem]:leading-4 @max-[9rem]:min-h-(--control-h-sm) @max-[9rem]:my-1.5",
              "md:not-any-pointer-coarse:@max-[9rem]:leading-4 md:not-any-pointer-coarse:@max-[9rem]:my-0",
            ],
            !widget.title && "text-muted-foreground",
          )}
          title={title}
        >
          {title}
        </h2>
        {toggle ? (
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
            aria-pressed={showData}
            // Memuat: tetap memegang fokus dan tempatnya; tekan diabaikan (pola tombol pager tabel).
            aria-disabled={mode === "wait" || undefined}
            data-testid="widget-data-toggle"
            onClick={() => {
              if (mode === "on") setShowData((s) => !s);
            }}
          >
            <toggle.Icon aria-hidden />
          </Button>
        ) : null}
        {editing ? (
          <Button
            size="icon-sm"
            variant="ghost"
            className={cn("ml-auto", HEAD_BUTTON)}
            aria-label={`Pengaturan ${title}`}
            title={`Pengaturan ${title}`}
            aria-pressed={selected}
            {...{ [SETTINGS_ATTR]: "" }}
            onClick={onSettings}
          >
            <IconAdjustmentsHorizontal aria-hidden />
          </Button>
        ) : null}
      </div>
      {config ? (
        <WidgetBody
          widgetId={widget.id}
          config={config}
          title={widget.title}
          editing={editing}
          resizable={handle}
          showData={showData}
          onState={onState}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <IconChartBar
            size={28}
            stroke={1.5}
            aria-hidden
            className="shrink-0 text-muted-foreground"
          />
          <p className="text-sm text-muted-foreground @max-[9rem]:hidden">
            {editing
              ? "Widget kosong. Pilih jenis tampilan dan datanya lewat tombol pengaturan."
              : "Widget ini belum berisi data."}
          </p>
        </div>
      )}
      {children}
    </div>
  );
});
