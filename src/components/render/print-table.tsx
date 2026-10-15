"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { count, NUMERIC, tableCellText } from "@/components/widgets/table-view";
import type { WidgetData } from "@/components/widgets/widget-query";
import type { NumberFormat } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";

/*
 * Tabel di PDF (T-018 D8): halaman pertama dalam urutan bawaan (urutan/halaman per kartu di layar tidak
 * ikut — perbedaan yang diterima), hanya baris yang muat utuh di kartu (`fit`, dari tableRowsFit) +
 * "Menampilkan X dari N baris". Teks sel sama dengan layar (tableCellText). Tanpa tombol urut, pager,
 * atau wilayah gulir: kertas tidak bisa digulir — kolom yang tidak muat utuh di lebar kartu tidak
 * dicetak setengah ("Jumla"), tetapi disebut namanya di keterangan bawah. Kolom diukur sekali sebelum
 * dilukis (layout effect; sinyal siap cetak menunggu DOM tenang).
 */

/** Kolom depan yang muat utuh (tepi kanan ≤ lebar kotak); paling sedikit satu. Murni. */
export function fittingColumns(rights: readonly number[], width: number): number {
  const k = rights.findIndex((r) => r > width + 0.5);
  return k < 0 ? rights.length : Math.max(1, k);
}

/** Keterangan bawah tabel cetak. Murni. */
export function printTableNote(shown: number, total: number, hidden: readonly string[]): string {
  if (!total) return "Tidak ada baris";
  const rows = `Menampilkan ${count(shown)} dari ${count(total)} baris`;
  return hidden.length ? `${rows} · ${hidden.length} kolom tidak muat: ${hidden.join(", ")}` : rows;
}

export function PrintTable({
  data,
  positions,
  format,
  formatColumns,
  fit,
}: {
  data: WidgetData;
  positions: number[];
  format: NumberFormat;
  formatColumns?: number[];
  fit: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(data.columns.length);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const rights = [...el.querySelectorAll("th")].map((th) => th.offsetLeft + th.offsetWidth);
    // Ukuran DOM baru diketahui setelah tata letak: satu render ulang sebelum dilukis.
    setCols(fittingColumns(rights, el.clientWidth));
  }, [data.columns.length]);

  const total = data.total ?? data.rows.length;
  const rows = data.rows.slice(0, fit);
  const columns = data.columns.slice(0, cols);
  const cellText = tableCellText(data, positions, format, formatColumns);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={box} className="min-h-0 flex-1 overflow-hidden">
        <table className="w-full border-collapse text-xs" data-testid="print-table">
          <thead>
            <tr className="h-6 border-b">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "max-w-[16rem] truncate px-2 font-medium",
                    NUMERIC.has(c.type) ? "text-right" : "text-left",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="h-6 border-b last:border-b-0">
                {row.slice(0, cols).map((v, i) => (
                  <td
                    key={i}
                    className={cn(
                      "max-w-[16rem] truncate px-2",
                      NUMERIC.has(data.columns[i]!.type) && "text-right tabular-nums",
                      (v === null || v === "") && "text-muted-foreground",
                    )}
                  >
                    {cellText(v, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {total === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            Tidak ada baris untuk ditampilkan.
          </p>
        ) : null}
      </div>
      <p
        className="flex h-6 shrink-0 items-center border-t px-3 text-xs text-muted-foreground"
        data-testid="print-table-range"
      >
        <span className="min-w-0 truncate">
          {printTableNote(
            rows.length,
            total,
            data.columns.slice(cols).map((c) => c.label),
          )}
        </span>
      </p>
    </div>
  );
}
