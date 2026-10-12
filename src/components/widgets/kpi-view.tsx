"use client";

import { useRef } from "react";
import { formatCell, formatCompact } from "@/features/widgets/format";
import type { NumberFormat } from "@/features/widgets/spec";
import { useBoxSize } from "./use-box-size";
import type { WidgetData } from "./widget-query";

/*
 * Satu angka besar (T-011). Angka tidak pernah dipatah per baris; ukuran huruf mengikuti lebar kartu
 * (cqi) dan kartu sempit memakai bentuk ringkas ("Rp 3,97 jt") dengan nilai lengkap di title dan untuk
 * pembaca layar (review desain T-011 H4). Label ukuran disembunyikan bila sama dengan judul widget.
 */
const COMPACT_BELOW = 200;

export function KpiView({
  data,
  format,
  title,
}: {
  data: WidgetData;
  format: NumberFormat;
  title: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const column = data.columns[0];
  const value = data.rows[0]?.[0] ?? null;
  // Jumlah baris/unik juga mengikuti format pilihan user.
  const type = column?.type === "count" ? "decimal" : (column?.type ?? "decimal");
  const full = formatCell(value, type, format);
  const compact =
    typeof value === "number" && size && size.width < COMPACT_BELOW
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
        className="whitespace-nowrap text-[clamp(1.125rem,13cqi,2.25rem)] leading-tight font-semibold tabular-nums tracking-tight"
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
