"use client";

import {
  IconAdjustmentsHorizontal,
  IconGripVertical,
  IconChartBar,
  IconTrash,
} from "@tabler/icons-react";
import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import type { WidgetView } from "@/features/dashboards/service";
import { cn } from "@/lib/utils";

/*
 * Satu widget di kanvas. Mode lihat: hanya isi (tanpa kontrol apa pun). Mode edit: pegangan geser
 * (layar lebar; alternatif tanpa geser ada di panel pengaturan), tombol pengaturan dan hapus. Widget
 * yang dipilih ditandai cincin primer. forwardRef + sisa props: react-grid-layout menempelkan style,
 * kelas, dan handler ke anak langsung.
 */
export const DRAG_HANDLE = "widget-drag-handle";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  widget: WidgetView;
  editing: boolean;
  draggable: boolean;
  selected: boolean;
  onSettings?: () => void;
  onDelete?: () => void;
};

export const WidgetCard = forwardRef<HTMLDivElement, Props>(function WidgetCard(
  { widget, editing, draggable, selected, onSettings, onDelete, className, children, ...rest },
  ref,
) {
  const title = widget.title || "Widget tanpa judul";
  return (
    <div
      ref={ref}
      data-testid="widget"
      data-widget-id={widget.id}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs",
        selected && "ring-2 ring-primary",
        className,
      )}
      {...rest}
    >
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        {editing && draggable ? (
          <span
            className={cn(
              DRAG_HANDLE,
              "flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-accent active:cursor-grabbing",
            )}
            title="Seret untuk memindahkan"
            aria-hidden
          >
            <IconGripVertical size={18} stroke={1.5} />
          </span>
        ) : null}
        <h3
          className={cn(
            "min-w-0 flex-1 truncate px-1 text-sm font-medium",
            !widget.title && "text-muted-foreground",
          )}
          title={title}
        >
          {title}
        </h3>
        {editing ? (
          <>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Pengaturan ${title}`}
              aria-pressed={selected}
              onClick={onSettings}
            >
              <IconAdjustmentsHorizontal aria-hidden />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Hapus ${title}`} onClick={onDelete}>
              <IconTrash aria-hidden />
            </Button>
          </>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
        <IconChartBar size={28} stroke={1.5} aria-hidden className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {editing
            ? "Widget kosong. Atur judul, posisi, dan ukurannya lewat tombol pengaturan."
            : "Widget ini belum berisi data."}
        </p>
      </div>
      {children}
    </div>
  );
});
