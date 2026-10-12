"use client";

import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconMinus,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WidgetView } from "@/features/dashboards/service";
import { WIDGET_TITLE_MAX, type LayoutItem } from "@/features/dashboards/validation";

/*
 * Pengaturan widget terpilih (hanya mode edit). Posisi dan ukuran juga bisa diubah lewat tombol di sini
 * — alternatif menyeret untuk keyboard dan layar sentuh (WCAG 2.5.7). Isi widget (tabel, KPI, grafik)
 * menyusul di T-011.
 */
export function WidgetPanel({
  widget,
  item,
  onRename,
  onMove,
  onResize,
  onDelete,
  onClose,
}: {
  widget: WidgetView;
  item: LayoutItem;
  onRename: (title: string) => Promise<boolean>;
  onMove: (dx: number, dy: number) => void;
  onResize: (dw: number, dh: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(widget.title);
  const [pending, setPending] = useState(false);
  const label = widget.title || "Widget tanpa judul";

  async function saveTitle(e?: React.FormEvent) {
    e?.preventDefault();
    if (title.trim() === widget.title) return;
    setPending(true);
    await onRename(title.trim());
    setPending(false);
  }

  const step = (text: string, icon: React.ReactNode, onClick: () => void) => (
    <Button
      variant="outline"
      size="icon"
      className="size-(--control-h-lg) md:size-(--control-h)"
      aria-label={text}
      title={text}
      onClick={onClick}
    >
      {icon}
    </Button>
  );

  return (
    <aside
      aria-labelledby={`${id}-h`}
      data-testid="widget-panel"
      className="flex flex-col gap-5 rounded-lg border bg-card p-4 shadow-xs"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id={`${id}-h`} className="min-w-0 break-words text-base font-semibold">
          Pengaturan widget
        </h2>
        <Button size="icon-sm" variant="ghost" aria-label="Tutup pengaturan" onClick={onClose}>
          <IconX aria-hidden />
        </Button>
      </div>

      <form onSubmit={saveTitle} className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-title`} className="text-sm font-medium">
          Judul
        </label>
        <Input
          id={`${id}-title`}
          value={title}
          maxLength={WIDGET_TITLE_MAX}
          placeholder="Mis. Omzet per cabang"
          className="h-(--control-h-lg) md:h-(--control-h)"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void saveTitle()}
          aria-busy={pending || undefined}
        />
        <p className="text-xs text-muted-foreground">
          Tersimpan saat kolom ditinggalkan atau Enter.
        </p>
      </form>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Posisi</legend>
        <div className="flex flex-wrap gap-2">
          {step(`Geser ${label} ke kiri`, <IconArrowLeft aria-hidden />, () => onMove(-1, 0))}
          {step(`Geser ${label} ke kanan`, <IconArrowRight aria-hidden />, () => onMove(1, 0))}
          {step(`Geser ${label} ke atas`, <IconArrowUp aria-hidden />, () => onMove(0, -1))}
          {step(`Geser ${label} ke bawah`, <IconArrowDown aria-hidden />, () => onMove(0, 1))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Ukuran</legend>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm">
          {step(`Persempit ${label}`, <IconMinus aria-hidden />, () => onResize(-1, 0))}
          <span className="text-center tabular-nums" aria-live="polite">
            Lebar {item.w} dari 12 kolom
          </span>
          {step(`Perlebar ${label}`, <IconPlus aria-hidden />, () => onResize(1, 0))}
          {step(`Perpendek ${label}`, <IconMinus aria-hidden />, () => onResize(0, -1))}
          <span className="text-center tabular-nums" aria-live="polite">
            Tinggi {item.h} baris
          </span>
          {step(`Pertinggi ${label}`, <IconPlus aria-hidden />, () => onResize(0, 1))}
        </div>
      </fieldset>

      <Button
        variant="outline"
        className="h-(--control-h-lg) w-full text-destructive md:h-(--control-h)"
        leadingIcon={<IconTrash aria-hidden />}
        onClick={onDelete}
      >
        Hapus widget
      </Button>
    </aside>
  );
}
