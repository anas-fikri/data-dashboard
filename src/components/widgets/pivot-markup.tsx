"use client";

import { CROSS_HINT_ID } from "@/components/dashboards/filters/cross-hint";
import { formatCell } from "@/features/widgets/format";
import { valueFormat } from "@/features/widgets/show-as";
import type { PivotBodyRow, PivotPick, PivotTableModel } from "@/features/widgets/pivot-table";
import type { NumberFormat } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";

/*
 * Tabel pivot (T-tcjp), seperti PivotTable Excel: kolom baris (kiri) dan kepala kolom menempel saat
 * digulir, baris Total menempel di bawah; kelompok/subtotal berlatar abu dan tebal, kolom/baris Total
 * tebal dengan garis pemisah. Angka rata kanan tabular; sel tanpa data "–" (dibacakan "tidak ada data").
 * `variant="print"`: tanpa gulir/menempel, untuk PDF (baris dibatasi pemanggil).
 * Layar (T-f4a7): sel pojok bisa berisi menu saring field (`corner`), dan label baris/kolom menjadi
 * tombol filter silang bila `picker` mengizinkannya (pola tombol kategori tabel data grafik).
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

/** Label yang bisa menyaring widget lain: aksi + status tekan; null = label biasa. */
export type PivotPicker = (pick: PivotPick) => { pressed: boolean; onPick: () => void } | null;

function PickLabel({
  text,
  pick,
  picker,
}: {
  text: string;
  pick?: PivotPick;
  picker?: PivotPicker;
}) {
  const p = pick && picker?.(pick);
  if (!p) return text;
  return (
    <button
      type="button"
      aria-pressed={p.pressed}
      aria-describedby={CROSS_HINT_ID}
      data-testid="crossfilter-item"
      data-field={pick.field}
      onClick={p.onPick}
      className={cn(
        "cursor-pointer rounded-sm text-left underline-offset-4 hover:underline [overflow-wrap:anywhere]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        // Ditekan: tebal + latar; mode warna paksa: garis Highlight (latar hilang).
        "aria-pressed:bg-primary/10 aria-pressed:font-semibold forced-colors:aria-pressed:outline forced-colors:aria-pressed:outline-[Highlight]",
      )}
    >
      {text}
    </button>
  );
}

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
          formatCell(v, head.type, valueFormat(head.showAs, head.format ?? format))
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
  corner,
  picker,
}: {
  model: PivotTableModel;
  format: NumberFormat;
  /** Baris yang dicetak (PDF memotong yang tidak muat); bawaan semua. */
  rows?: PivotBodyRow[];
  variant: "screen" | "print";
  /** Isi sel pojok (menu saring field); bawaan judul kolom baris. */
  corner?: React.ReactNode;
  picker?: PivotPicker;
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
          // Berisi menu saring: nama kepala kolom tetap "Cabang › Layanan", bukan nama tombolnya.
          aria-label={corner !== undefined ? model.rowHeader : undefined}
          className={cn(
            stickLeft,
            screen && `z-20 ${CORNER_LINE}`,
            "bg-card px-3 py-1.5 text-left align-bottom font-medium",
            corner !== undefined && "px-2 py-1",
          )}
        >
          {corner ?? model.rowHeader}
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
            <PickLabel text={h.label} pick={h.pick} picker={picker} />
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
      <PickLabel text={r.label} pick={r.pick} picker={picker} />
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
