"use client";

import type { PivotData } from "@/features/query/pivot";
import { formatCell } from "@/features/widgets/format";
import {
  pivotTable,
  type PivotBodyRow,
  type PivotTableModel,
} from "@/features/widgets/pivot-table";
import type { NumberFormat } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";

/*
 * Widget pivot (T-tcjp), seperti PivotTable Excel: kolom baris (kiri) dan kepala kolom menempel saat
 * digulir, baris Total menempel di bawah; kelompok/subtotal berlatar abu dan tebal, kolom/baris Total
 * tebal dengan garis pemisah. Angka rata kanan tabular; sel tanpa data "–" (dibacakan "tidak ada data").
 * Wilayah gulir bisa difokus (keyboard). Baris/kolom di luar batas tampilan disebut di catatan bawah.
 * `variant="print"`: tanpa gulir/menempel, untuk PDF (baris dibatasi pemanggil).
 */
const NUM = "whitespace-nowrap px-3 py-1.5 text-right tabular-nums";
// Garis kepala/kaki/kolom baris yang menempel: border (border-collapse) ikut tergulir, bayangan inset
// menempel. Sel pojok dan label Total menimpa bayangan kepala/kaki (!) agar garis kanannya tetap ada.
const SIDE_LINE = "shadow-[inset_-1px_0_0_var(--color-border)]";
const CORNER_LINE =
  "shadow-[inset_0_-1px_0_var(--color-border),inset_-1px_0_0_var(--color-border)]!";
const TOTAL_LINE = "shadow-[inset_0_2px_0_var(--color-border),inset_-1px_0_0_var(--color-border)]!";
const HEAD_LINE = "[&_th]:shadow-[inset_0_-1px_0_var(--color-border)]";
const FOOT_LINE =
  "[&_td]:shadow-[inset_0_2px_0_var(--color-border)] [&_th]:shadow-[inset_0_2px_0_var(--color-border)]";

export function PivotCells({
  row,
  model,
  format,
}: {
  row: PivotBodyRow;
  model: PivotTableModel;
  format: NumberFormat;
}) {
  if (row.kind === "group" && row.values.length === 0) {
    return <td colSpan={model.valueHeads.length} />;
  }
  return row.values.map((v, i) => {
    const head = model.valueHeads[i]!;
    const empty = v === null || v === undefined;
    return (
      <td key={i} className={cn(NUM, head.total && "border-l font-semibold")}>
        {empty ? (
          <>
            <span aria-hidden className="text-muted-foreground">
              –
            </span>
            <span className="sr-only">tidak ada data</span>
          </>
        ) : (
          formatCell(v, head.type, format)
        )}
      </td>
    );
  });
}

export function PivotTableMarkup({
  model,
  format,
  rows = model.rows,
  variant,
}: {
  model: PivotTableModel;
  format: NumberFormat;
  /** Baris yang dicetak (PDF memotong yang tidak muat); bawaan semua. */
  rows?: PivotBodyRow[];
  variant: "screen" | "print";
}) {
  const screen = variant === "screen";
  // Sel menempel harus berlatar padat agar isi yang tergulir tidak tembus.
  const stickLeft = screen ? "sticky left-0 z-[5]" : "";
  const twoHead = !!model.columnHeads;
  const head = (
    <thead className={cn(screen ? `sticky top-0 z-10 ${HEAD_LINE}` : "[&_th]:border-b", "bg-card")}>
      <tr>
        <th
          scope="col"
          rowSpan={twoHead ? 2 : 1}
          className={cn(
            stickLeft,
            screen && `z-20 ${CORNER_LINE}`,
            "bg-card px-3 py-1.5 text-left align-bottom font-medium",
          )}
        >
          {model.rowHeader}
        </th>
        {(model.columnHeads ?? model.valueHeads).map((h, i) => (
          <th
            key={i}
            scope={twoHead ? "colgroup" : "col"}
            colSpan={"span" in h ? h.span : 1}
            className={cn(
              "whitespace-nowrap px-3 py-1.5 font-medium",
              twoHead ? "text-center" : "text-right",
              h.total && "border-l font-semibold",
            )}
          >
            {h.label}
          </th>
        ))}
      </tr>
      {twoHead ? (
        <tr>
          {model.valueHeads.map((h, i) => (
            <th
              key={i}
              scope="col"
              className={cn(
                "whitespace-nowrap px-3 py-1 text-right text-xs font-medium text-muted-foreground",
                h.total && "border-l",
              )}
            >
              {h.label}
            </th>
          ))}
        </tr>
      ) : null}
    </thead>
  );
  const rowHead = (r: PivotBodyRow, bg: string) => (
    <th
      scope="row"
      className={cn(
        stickLeft,
        screen && (r.kind === "total" ? TOTAL_LINE : SIDE_LINE),
        bg,
        "min-w-[8rem] max-w-[18rem] px-3 py-1.5 text-left font-normal [overflow-wrap:anywhere]",
        r.depth === 1 && "pl-7",
        r.kind !== "leaf" && "font-semibold",
      )}
    >
      {r.label}
    </th>
  );
  return (
    <table
      className={cn("w-max min-w-full border-collapse", screen ? "text-sm" : "text-xs")}
      data-testid="widget-pivot"
    >
      {head}
      <tbody>
        {rows.map((r, i) => {
          const bg = r.kind === "group" ? "bg-muted" : "bg-card";
          return (
            <tr
              key={i}
              data-kind={r.kind}
              className={cn(
                "border-b last:border-b-0",
                r.kind === "group" && "bg-muted font-semibold",
              )}
            >
              {rowHead(r, bg)}
              <PivotCells row={r} model={model} format={format} />
            </tr>
          );
        })}
      </tbody>
      {model.total ? (
        <tfoot className={cn(screen && `sticky bottom-0 z-10 ${FOOT_LINE}`, "bg-card")}>
          <tr data-kind="total" className={cn("font-semibold", !screen && "border-t-2")}>
            {rowHead(model.total, "bg-card")}
            <PivotCells row={model.total} model={model} format={format} />
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

export function PivotView({
  data,
  format,
  label,
}: {
  data: PivotData;
  format: NumberFormat;
  label: string;
}) {
  const model = pivotTable(data);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cincin fokus di pembungkus (di atas kepala yang menempel), pola tabel widget. */}
      <div className="relative flex min-h-0 flex-1 flex-col after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-sm after:ring-inset has-[[data-scroll]:focus-visible]:after:ring-2 has-[[data-scroll]:focus-visible]:after:ring-ring">
        <div
          data-scroll=""
          className="relative min-h-0 flex-1 overflow-auto focus-visible:outline-none"
          role="region"
          aria-label={label}
          // Wilayah gulir harus bisa difokus agar bisa digulir dengan keyboard (WCAG 2.1.1).
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
        >
          <PivotTableMarkup model={model} format={format} variant="screen" />
          {model.rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Tidak ada data untuk ditampilkan.
            </p>
          ) : null}
        </div>
      </div>
      {model.note ? (
        <p className="border-t px-3 py-1 text-xs text-muted-foreground" data-testid="pivot-note">
          {model.note}
        </p>
      ) : null}
    </div>
  );
}
