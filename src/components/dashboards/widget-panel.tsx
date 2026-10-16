"use client";

import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconMinus,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WidgetView } from "@/features/dashboards/service";
import {
  GRID_COLS,
  WIDGET_TITLE_MAX,
  normalizeName,
  type LayoutItem,
} from "@/features/dashboards/validation";
import type { StepKey } from "./layout-ops";
import { useIsPhone, useIsTablet } from "./use-media-query";

/*
 * Isi panel pengaturan widget (hanya mode edit; bingkainya di widget-panel-frame). Posisi dan ukuran
 * juga bisa diubah lewat tombol di sini — alternatif menyeret untuk keyboard dan layar sentuh
 * (WCAG 2.5.7). Posisi/ukuran dibacakan; tombol di tepi grid tetap fokus (aria-disabled) dan
 * mengumumkan alasannya. Isi widget (tabel, KPI, grafik — T-011) diatur lewat bagian Data (children).
 */
const EDGE: Record<StepKey, string> = {
  left: "Sudah paling kiri.",
  right: "Sudah paling kanan.",
  up: "Sudah paling atas.",
  down: "Sudah paling bawah.",
  narrower: "Sudah lebar minimum.",
  wider: "Sudah selebar grid.",
  shorter: "Sudah tinggi minimum.",
  taller: "Sudah tinggi maksimum.",
};

export function WidgetPanel({
  widget,
  item,
  can,
  onRename,
  onStep,
  onDelete,
  children,
}: {
  widget: WidgetView;
  item: LayoutItem;
  /** Langkah mana yang masih mengubah sesuatu (dihitung pemanggil dari algoritma tata letak). */
  can: Record<StepKey, boolean>;
  onRename: (title: string) => Promise<boolean>;
  onStep: (key: StepKey) => void;
  onDelete: () => void;
  /** Bagian isi/data widget (form konfigurasi T-011). */
  children?: React.ReactNode;
}) {
  const id = useId();
  const [title, setTitle] = useState(widget.title);
  const [pending, setPending] = useState(false);
  const [edge, setEdge] = useState<string | null>(null);
  const phone = useIsPhone();
  // < 1024 px kanvas tidak menggambar satuan 12 kolom (tumpukan / tampilan 6 kolom, T-031).
  const tablet = useIsTablet();
  const label = widget.title || "Widget tanpa judul";

  async function saveTitle(e?: React.FormEvent) {
    e?.preventDefault();
    const next = normalizeName(title);
    if (next === widget.title) return;
    setPending(true);
    await onRename(next);
    setPending(false);
  }

  const step = (key: StepKey, text: string, icon: React.ReactNode) => (
    <Button
      variant="outline"
      size="icon"
      className="size-(--control-h-lg) aria-disabled:cursor-not-allowed aria-disabled:opacity-50 md:size-(--control-h)"
      aria-label={text}
      aria-disabled={!can[key] || undefined}
      title={text}
      onClick={() => {
        if (!can[key]) return setEdge(EDGE[key]);
        setEdge(null);
        onStep(key);
      }}
    >
      {icon}
    </Button>
  );

  return (
    <>
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

      {children ? <div className="border-t pt-4">{children}</div> : null}

      {/* Garis pemisah di pembungkus (seperti bagian Data): jarak atas/bawah garis seimbang. */}
      <div className="border-t pt-4">
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Posisi</legend>
          <div className="flex flex-wrap gap-2">
            {step("left", `Geser ${label} ke kiri`, <IconArrowLeft aria-hidden />)}
            {step("right", `Geser ${label} ke kanan`, <IconArrowRight aria-hidden />)}
            {step("up", `Geser ${label} ke atas`, <IconArrowUp aria-hidden />)}
            {step("down", `Geser ${label} ke bawah`, <IconArrowDown aria-hidden />)}
          </div>
          <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
            {edge ??
              `${phone || tablet ? "Di layar lebar: kolom" : "Kolom"} ${item.x + 1}–${Math.min(item.x + item.w, GRID_COLS)}, baris ${item.y + 1}`}
          </p>
        </fieldset>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Ukuran</legend>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm">
          {step("narrower", `Persempit ${label}`, <IconMinus aria-hidden />)}
          <span className="text-center tabular-nums" aria-live="polite">
            Lebar {item.w} dari {GRID_COLS} kolom
          </span>
          {step("wider", `Perlebar ${label}`, <IconPlus aria-hidden />)}
          {step("shorter", `Perpendek ${label}`, <IconMinus aria-hidden />)}
          <span className="text-center tabular-nums" aria-live="polite">
            Tinggi {item.h} baris
          </span>
          {step("taller", `Pertinggi ${label}`, <IconPlus aria-hidden />)}
        </div>
      </fieldset>

      <Button
        variant="outline"
        className="h-(--control-h-lg) w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive md:h-(--control-h)"
        leadingIcon={<IconTrash aria-hidden />}
        onClick={onDelete}
      >
        Hapus widget
      </Button>
    </>
  );
}
