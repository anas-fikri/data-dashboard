"use client";

import { formatMeasure, type ValueType } from "@/features/widgets/format";
import type { NumberFormat } from "@/features/widgets/spec";
import { middleTruncate, tableLayout } from "./chart-series";

/*
 * Nilai grafik sebagai tabel (tombol "data" di kepala kartu; cara tanpa hover membaca nilai persis —
 * review H9). Label baris dipendekkan di tengah (unit "…Unit 01"/"…Unit 02" tetap beda), nilai lengkap,
 * atau ringkas di kartu sempit; teks lengkap selalu di title dan untuk pembaca layar. Cincin fokus
 * digambar di pembungkus (di atas header lengket), sama dengan tabel widget.
 */
export function ChartTable({
  rows,
  dimensionLabel,
  measureLabel,
  valueType,
  format,
  label,
  width,
}: {
  rows: { label: string; value: number | null }[];
  dimensionLabel: string;
  measureLabel: string;
  valueType?: ValueType;
  format: NumberFormat;
  /** Nama wilayah gulir ("Data <judul>"). */
  label: string;
  width: number | null;
}) {
  const full = rows.map((r) => formatMeasure(r.value, valueType, format));
  const short = rows.map((r) => formatMeasure(r.value, valueType, format, true));
  const layout = tableLayout(width, full, short);
  const shown = layout.compact ? short : full;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-sm after:ring-inset has-[[data-scroll]:focus-visible]:after:ring-2 has-[[data-scroll]:focus-visible]:after:ring-ring">
      <div
        data-scroll=""
        className="relative min-h-0 flex-1 overflow-auto focus-visible:outline-none"
        role="region"
        aria-label={label}
        // Wilayah gulir harus bisa difokus agar bisa digulir dengan keyboard (WCAG 2.1.1).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        data-testid="chart-table"
      >
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col
              className={layout.valuePx === null ? "w-[45%]" : undefined}
              style={layout.valuePx === null ? undefined : { width: layout.valuePx }}
            />
          </colgroup>
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-left">
              <th scope="col" className="truncate px-3 py-1.5 font-medium" title={dimensionLabel}>
                {dimensionLabel}
              </th>
              <th
                scope="col"
                className="truncate px-3 py-1.5 text-right font-medium"
                title={measureLabel}
              >
                {measureLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const name = middleTruncate(r.label, layout.labelChars);
              return (
                <tr key={i} className="border-b last:border-b-0">
                  <th
                    scope="row"
                    className="truncate px-3 py-1.5 text-left font-normal"
                    title={r.label}
                  >
                    <Both visible={name} full={r.label} />
                  </th>
                  <td
                    className="truncate px-3 py-1.5 text-right tabular-nums"
                    title={full[i]}
                    data-value={r.value ?? ""}
                  >
                    <Both visible={shown[i]!} full={full[i]!} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Teks yang dipendekkan untuk mata, teks lengkap untuk pembaca layar. */
function Both({ visible, full }: { visible: string; full: string }) {
  if (visible === full) return full;
  return (
    <>
      <span aria-hidden>{visible}</span>
      <span className="sr-only">{full}</span>
    </>
  );
}
