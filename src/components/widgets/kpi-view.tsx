"use client";

import { useRef } from "react";
import type { Agg } from "@/features/query/spec";
import { formatCell, formatCompact } from "@/features/widgets/format";
import type { NumberFormat } from "@/features/widgets/spec";
import { useBoxSize } from "./use-box-size";
import type { WidgetData } from "./widget-query";

/*
 * Satu angka besar (T-011). Angka tidak pernah dipatah per baris; ukuran huruf mengikuti lebar kartu.
 * Bentuk lengkap dipakai bila benar-benar muat (diukur dengan canvas pada ukuran huruf yang sama),
 * selain itu bentuk ringkas ("Rp 2,57 M") dengan nilai lengkap di title dan untuk pembaca layar —
 * tidak ada angka yang terpotong diam-diam (review desain T-011 H4). Total/jumlah atas nol baris = 0
 * seperti SUM Excel. Label ukuran disembunyikan bila sama dengan judul widget.
 */
const PAD_X = 32;
let ctx: CanvasRenderingContext2D | null | undefined;

/** Lebar teks (px) pada font tebal ukuran `px`; null di luar browser. */
function textWidth(text: string, px: number): number | null {
  if (typeof document === "undefined") return null;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.font = `600 ${px}px ${getComputedStyle(document.body).fontFamily}`;
  return ctx.measureText(text).width;
}

/** Sama dengan clamp(1.125rem, 13cqi, 2.25rem) di kelas angka. */
const fontPx = (width: number) => Math.min(36, Math.max(18, width * 0.13));

export function KpiView({
  data,
  format,
  title,
  agg,
}: {
  data: WidgetData;
  format: NumberFormat;
  title: string;
  agg: Agg;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const column = data.columns[0];
  const raw = data.rows[0]?.[0] ?? null;
  const value =
    raw === null && (agg === "sum" || agg === "count" || agg === "count_distinct") ? 0 : raw;
  // Jumlah baris/unik juga mengikuti format pilihan user.
  const type = column?.type === "count" ? "decimal" : (column?.type ?? "decimal");
  const full = formatCell(value, type, format);
  const room = size ? size.width - PAD_X : null;
  const fits = (text: string) => {
    if (room === null) return true;
    const w = textWidth(text, fontPx(size!.width));
    return w === null || w <= room;
  };
  const compact =
    typeof value === "number" && type !== "duration" && !fits(full)
      ? formatCompact(value, format)
      : full;
  const label = column?.label ?? "";
  const sameAsTitle = label.trim().toLowerCase() === title.trim().toLowerCase();

  return (
    <div
      ref={box}
      className="flex min-h-0 flex-1 flex-col justify-center-safe gap-1 overflow-hidden px-4 pb-3"
    >
      {sameAsTitle ? null : (
        <p className="truncate text-sm text-muted-foreground" title={label}>
          {label}
        </p>
      )}
      <p
        className="truncate whitespace-nowrap text-[clamp(1.125rem,13cqi,2.25rem)] leading-tight font-semibold tabular-nums tracking-tight"
        data-testid="kpi-value"
        title={compact === full ? undefined : full}
      >
        {compact === full ? (
          full
        ) : (
          <>
            <span aria-hidden>{compact}</span>
            <span className="sr-only">{full}</span>
          </>
        )}
      </p>
    </div>
  );
}
