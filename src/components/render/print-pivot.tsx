"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { PivotTableMarkup } from "@/components/widgets/pivot-markup";
import type { PivotData } from "@/features/query/pivot";
import { formatNumber } from "@/features/widgets/format";
import { columnNames, keepColumns, pivotTable } from "@/features/widgets/pivot-table";
import type { NumberFormat } from "@/features/widgets/spec";
import { fittingColumns } from "./print-table";

/*
 * Pivot di PDF (T-tcjp), pola tabel cetak (T-018 D8): kertas tidak bisa digulir, jadi hanya baris dan
 * kolom data yang muat utuh di kartu yang dicetak; baris Total selalu ikut (di bawah baris terakhir yang
 * muat). Yang tidak muat disebut di keterangan bawah. Diukur sebelum dilukis (layout effect): kolom dari
 * tepi kanan kepala kolom terdalam, baris dari tepi bawah tiap baris (label baris bisa membungkus).
 */
const count = (n: number) => formatNumber(n, { style: "number", decimals: 0 });

/** Keterangan bawah pivot cetak; null bila semua tercetak. Murni. */
export function printPivotNote(
  data: Pick<PivotData, "rowCount" | "columnCount" | "columns" | "columnField">,
  leavesShown: number,
  hidden: readonly string[],
): string | null {
  const parts: string[] = [];
  if (leavesShown < data.rowCount) {
    parts.push(`Menampilkan ${count(leavesShown)} dari ${count(data.rowCount)} baris`);
  }
  if (data.columnField && data.columnCount > data.columns.length) {
    parts.push(
      `${count(data.columns.length)} dari ${count(data.columnCount)} kolom ${data.columnField.label}`,
    );
  }
  if (hidden.length) parts.push(`${hidden.length} kolom tidak muat: ${hidden.join(", ")}`);
  return parts.length ? [...parts, "Total mencakup semua data"].join(" · ") : null;
}

/** Baris yang bawahnya (+ baris Total) masih di dalam kotak setinggi `boxPx`. Murni. */
export function fittingPivotRows(
  bottoms: readonly number[],
  boxPx: number,
  footPx: number,
): number {
  const k = bottoms.findIndex((b) => b + footPx > boxPx);
  return k < 0 ? bottoms.length : k;
}

export function PrintPivot({ data, format }: { data: PivotData; format: NumberFormat }) {
  const box = useRef<HTMLDivElement>(null);
  const full = pivotTable(data);
  const [cols, setCols] = useState(full.valueHeads.length);
  const [shown, setShown] = useState(full.rows.length);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const frame = el.getBoundingClientRect();
    const heads = [...el.querySelectorAll("thead tr:last-child th")];
    // Tanpa pemisah ber-banyak-nilai, baris kepala terakhir diawali kepala kolom baris.
    const valueHeads = heads.slice(heads.length - cols);
    setCols(
      fittingColumns(
        valueHeads.map((th) => th.getBoundingClientRect().right - frame.left),
        frame.width,
      ),
    );
    const foot = el.querySelector("tfoot")?.getBoundingClientRect().height ?? 0;
    const bottoms = [...el.querySelectorAll("tbody tr")].map(
      (tr) => tr.getBoundingClientRect().bottom - frame.top,
    );
    // Kotak dan isi diperkecil sama (widget tinggi): bandingkan dalam ukuran tampilan.
    setShown(fittingPivotRows(bottoms, frame.height, foot));
  }, [cols, shown]);

  const model = keepColumns(full, cols);
  const rows = model.rows.slice(0, shown);
  const note = printPivotNote(
    data,
    rows.filter((r) => r.kind === "leaf").length,
    columnNames(full).slice(cols),
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={box} className="min-h-0 flex-1 overflow-hidden">
        <PivotTableMarkup model={model} format={format} rows={rows} variant="print" />
        {full.rows.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            Tidak ada data untuk ditampilkan.
          </p>
        ) : null}
      </div>
      {/* Saringan pivot (T-f4a7) disebut di kertas: angka tersaring tidak terbaca seolah semua data. */}
      {full.filterNote ? (
        <p
          className="flex min-h-6 shrink-0 items-center border-t px-3 py-1 text-xs text-muted-foreground"
          data-testid="print-pivot-filter"
        >
          <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{full.filterNote}</span>
        </p>
      ) : null}
      {note ? (
        <p
          className="flex min-h-6 shrink-0 items-center border-t px-3 py-1 text-xs text-muted-foreground"
          data-testid="print-pivot-note"
        >
          <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{note}</span>
        </p>
      ) : null}
    </div>
  );
}
