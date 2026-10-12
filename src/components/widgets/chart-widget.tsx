"use client";

import { IconChartBar, IconTable } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCell, formatCompact, formatNumber } from "@/features/widgets/format";
import type { ChartSpec, ChartType } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import { OTHERS_LABEL, PIE_LABEL_MIN_WIDTH, barsThatFit, middleTruncate } from "./chart-option";
import { ChartView } from "./chart-view";
import { useBoxSize } from "./use-box-size";
import type { WidgetData } from "./widget-query";

/*
 * Widget grafik (T-011): grafik + keterangan "N teratas dari M" bila kategori dipotong, tombol "Lihat
 * data" yang menampilkan nilai persisnya sebagai tabel biasa (bisa dibaca/di-tab tanpa hover dan
 * disalin seperti di Excel — review desain T-011 H9), legenda HTML untuk pai di kartu kecil, dan daftar
 * peringkat sebagai ganti grafik di kartu yang terlalu sempit (H3).
 */
const NARROW = 140;
const SWATCH = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6"];

export function ChartWidget({
  type,
  data,
  spec,
}: {
  type: ChartType;
  data: WidgetData;
  spec: ChartSpec;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const [showData, setShowData] = useState(false);
  const [dim, measure] = data.columns;

  if (data.rows.length === 0) {
    return (
      <p className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
        Tidak ada data untuk ditampilkan.
      </p>
    );
  }
  // Format Rp/persen milik nilai ukuran, bukan label kategori.
  const labelFormat = { style: "auto", decimals: 0 } as const;
  const labels = data.rows.map((r) =>
    formatCell(r[0], dim!.type, labelFormat, spec.dimension.timeGrain),
  );
  const values = data.rows.map((r) => (typeof r[1] === "number" ? r[1] : null));
  const categories = data.categories ?? labels.length;
  const shownSum = values.reduce<number>((s, v) => s + (v ?? 0), 0);
  // "Lainnya" hanya untuk pai (ukuran yang bisa dijumlahkan): total seluruh kategori − yang tampil.
  const others =
    type === "pie" && categories > labels.length && typeof data.grandTotal === "number"
      ? Math.max(0, data.grandTotal - shownSum)
      : 0;
  const fit = type === "bar" && size ? barsThatFit(size.height) : labels.length;
  const visible = Math.min(fit, labels.length);
  const truncated = categories > visible;
  const narrow = !!size && size.width < NARROW;
  const pieLegend = type === "pie" && !!size && !narrow && size.width < PIE_LABEL_MIN_WIDTH;
  const total = shownSum + others;
  const rows = [
    ...labels.map((label, i) => ({ label, value: values[i] ?? null })),
    ...(others ? [{ label: OTHERS_LABEL, value: others }] : []),
  ];
  const value = (v: number | null) => (v === null ? "(kosong)" : formatNumber(v, spec.format));
  const noun = type === "line" ? "titik" : "kategori";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={box} className="relative flex min-h-0 flex-1 flex-col">
        {showData ? (
          <div
            className="relative min-h-0 flex-1 overflow-auto"
            role="region"
            aria-label={`Data ${measure!.label} per ${dim!.label}`}
            // Wilayah gulir harus bisa difokus agar bisa digulir dengan keyboard (WCAG 2.1.1).
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            data-testid="chart-table"
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left">
                  <th scope="col" className="px-3 py-1.5 font-medium">
                    {dim!.label}
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    {measure!.label}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <th
                      scope="row"
                      className="max-w-[16rem] truncate px-3 py-1.5 text-left font-normal"
                      title={r.label}
                    >
                      {r.label}
                    </th>
                    <td className="px-3 py-1.5 text-right tabular-nums">{value(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : narrow ? (
          <ol
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-2 py-1 text-xs"
            data-testid="chart-ranked"
          >
            {rows.slice(0, 5).map((r, i) => (
              <li key={i} className="flex min-w-0 flex-col">
                <span className="truncate text-muted-foreground" title={r.label}>
                  {r.label}
                </span>
                <span className="font-medium tabular-nums">
                  {r.value === null ? "(kosong)" : formatCompact(r.value, spec.format)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <ChartView
            type={type}
            labels={labels}
            values={values}
            others={others || undefined}
            measureLabel={measure!.label}
            dimensionLabel={dim!.label}
            format={spec.format}
            categories={categories}
            limit={visible}
          />
        )}
      </div>

      {pieLegend && !showData ? (
        <ul className="grid shrink-0 grid-cols-1 gap-x-3 gap-y-0.5 px-3 pb-1 text-xs @xs:grid-cols-2">
          {rows.map((r, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "size-2.5 shrink-0 rounded-sm",
                  r.label === OTHERS_LABEL ? SWATCH[5] : SWATCH[i % 5],
                )}
              />
              <span className="min-w-0 truncate" title={r.label}>
                {middleTruncate(r.label, 22)}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {total
                  ? formatNumber((r.value ?? 0) / total, { style: "percent", decimals: 0 })
                  : "–"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex shrink-0 items-center gap-2 border-t px-2 py-0.5">
        <p
          className="min-w-0 flex-1 truncate text-xs text-muted-foreground @max-[10rem]:sr-only"
          data-testid="chart-note"
        >
          {truncated
            ? `Menampilkan ${visible} dari ${categories.toLocaleString("id-ID")} ${noun}${others ? " · sisanya di Lainnya" : ""}`
            : `${categories.toLocaleString("id-ID")} ${noun}`}
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-(--control-h-lg) shrink-0 px-2 text-xs md:h-7"
          aria-pressed={showData}
          leadingIcon={showData ? <IconChartBar aria-hidden /> : <IconTable aria-hidden />}
          onClick={() => setShowData((s) => !s)}
        >
          {showData ? "Lihat grafik" : "Lihat data"}
        </Button>
      </div>
    </div>
  );
}
