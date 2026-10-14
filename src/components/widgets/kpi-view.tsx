"use client";

import { useRef } from "react";
import type { Agg } from "@/features/query/spec";
import type { NumberFormat } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import { chooseKpi, kpiTexts } from "./kpi-fit";
import { useBoxSize } from "./use-box-size";
import type { WidgetData } from "./widget-query";

/*
 * Satu angka besar (T-011). Ukuran huruf mengikuti lebar kotak ini (container sendiri, jadi cqi = lebar
 * isi yang diukur — tanpa potong padding dua kali). Bentuk yang tampil dipilih di kpi-fit: lengkap,
 * ringkas, "Rp" pindah ke label, huruf kecil, lalu dua baris — tidak pernah potongan berelipsis. Nilai
 * lengkap selalu di title dan untuk pembaca layar (review desain T-011). Total/jumlah atas nol baris = 0
 * seperti SUM Excel. Label ukuran disembunyikan bila sama dengan judul widget.
 */
let ctx: CanvasRenderingContext2D | null | undefined;

/** Lebar teks (px) pada font tebal ukuran `px`; null di luar browser. */
function textWidth(text: string, px: number): number | null {
  if (typeof document === "undefined") return null;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.font = `600 ${px}px ${getComputedStyle(document.body).fontFamily}`;
  return ctx.measureText(text).width;
}

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
  const label = column?.label ?? "";
  const { full, options } = kpiTexts(value, column?.type ?? "decimal", format, agg, label);
  const shown = chooseKpi(options, size?.width ?? null, textWidth);
  const sameAsTitle = label.trim().toLowerCase() === title.trim().toLowerCase();

  return (
    <div
      ref={box}
      className="@container flex min-h-0 flex-1 flex-col justify-center-safe gap-1 overflow-hidden px-4 pb-3 @max-[9rem]:px-2"
    >
      {sameAsTitle && !shown.unit ? null : (
        <p
          className="flex min-w-0 gap-1 text-sm text-muted-foreground"
          title={sameAsTitle ? undefined : label}
        >
          {sameAsTitle ? null : <span className="truncate">{label}</span>}
          {/* Satuan yang dipindah dari angka; pembaca layar mendengarnya di nilai lengkap. */}
          {shown.unit ? (
            <span className="shrink-0" aria-hidden>
              {sameAsTitle ? shown.unit : `(${shown.unit})`}
            </span>
          ) : null}
        </p>
      )}
      <p
        className={cn(
          // shrink-0: kotak pendek (kartu sempit di tablet sentuh) tidak memotong angka di dalam barisnya
          // sendiri — angka boleh memakai padding bawah.
          "shrink-0 leading-tight font-semibold tabular-nums tracking-tight",
          shown.small ? "text-sm" : "text-[clamp(1.125rem,15cqi,2.25rem)]",
          // Belum diukur: satu baris (title tetap lengkap). Tidak ada yang muat: boleh pindah baris.
          shown.wrap ? "[overflow-wrap:anywhere]" : "truncate whitespace-nowrap",
        )}
        data-testid="kpi-value"
        title={full}
      >
        {shown.text === full ? (
          full
        ) : (
          <>
            <span aria-hidden>{shown.text}</span>
            <span className="sr-only">{full}</span>
          </>
        )}
      </p>
    </div>
  );
}
