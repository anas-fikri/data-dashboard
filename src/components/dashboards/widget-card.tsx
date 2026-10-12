"use client";

import {
  IconAdjustmentsHorizontal,
  IconChartBar,
  IconGripVertical,
  IconTable,
} from "@tabler/icons-react";
import { forwardRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { WidgetBody } from "@/components/widgets/widget-body";
import type { WidgetView } from "@/features/dashboards/service";
import { parseWidgetConfig } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";

/*
 * Satu widget di kanvas. Mode lihat: hanya isi. Mode edit: seluruh kepala kartu jadi pegangan seret
 * (layar lebar; tombol di dalamnya tidak memulai seret) dan satu tombol pengaturan — hapus ada di panel
 * agar kartu sempit tetap muat dan tidak ada hapus sekali ketuk. Kartu adalah container: di bawah ±9rem
 * judul hanya untuk pembaca layar sehingga pegangan + tombol tetap utuh. forwardRef + sisa props:
 * react-grid-layout menempelkan style, kelas, dan handler ke anak langsung.
 */
export const DRAG_HANDLE = "widget-drag-handle";
/** Pegangan seret di layar sentuh: hanya ikon ini (44 px), agar menggeser kepala kartu tetap scroll. */
export const GRIP_HANDLE = "widget-grip";
export const SETTINGS_ATTR = "data-widget-settings";

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
  const parsed = parseWidgetConfig(widget.type, widget.spec);
  const config = parsed.ok && parsed.config.type !== "empty" ? parsed.config : null;
  const chart = config?.type === "bar" || config?.type === "line" || config?.type === "pie";
  // Nilai grafik sebagai tabel: tombol di kepala kartu (tidak ikut terpotong di kartu pendek/sempit).
  const [showData, setShowData] = useState(false);
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
          handle && [DRAG_HANDLE, "cursor-grab active:cursor-grabbing"],
        )}
      >
        {handle ? (
          <span
            className={cn(
              GRIP_HANDLE,
              "flex size-8 shrink-0 touch-none items-center justify-center text-muted-foreground @max-[6rem]:hidden any-pointer-coarse:size-11",
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
            editing && "@max-[9rem]:sr-only",
            !widget.title && "text-muted-foreground",
          )}
          title={title}
        >
          {title}
        </h2>
        {chart ? (
          <Button
            size="icon-sm"
            variant="ghost"
            className={cn(
              "size-(--control-h-lg) shrink-0 md:size-(--control-h-sm)",
              // Mode edit di kartu sempit: ruang kepala untuk pegangan + pengaturan.
              editing && "@max-[9rem]:hidden",
            )}
            aria-label={`Tampilkan data ${title} sebagai tabel`}
            title="Tampilkan sebagai tabel"
            aria-pressed={showData}
            data-testid="widget-data-toggle"
            onClick={() => setShowData((s) => !s)}
          >
            <IconTable aria-hidden />
          </Button>
        ) : null}
        {editing ? (
          <Button
            size="icon-sm"
            variant="ghost"
            className="ml-auto size-(--control-h-lg) shrink-0 md:size-(--control-h-sm)"
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
          showData={showData}
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
