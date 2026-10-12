"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { useRef } from "react";
import {
  formatCell,
  formatCompact,
  formatLabelNumber,
  formatNumber,
} from "@/features/widgets/format";
import type { ChartSpec, ChartType } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import { OTHERS_LABEL, barsThatFit, middleTruncate, percentShares } from "./chart-option";
import { ChartView } from "./chart-view";
import { useBoxSize } from "./use-box-size";
import type { WidgetData } from "./widget-query";

/*
 * Widget grafik (T-011): grafik + keterangan "Menampilkan N dari M" bila kategori dipotong (bila ada
 * ruang; pembaca layar selalu mendapatnya), tabel data biasa saat tombol "data" di kepala kartu aktif
 * (nilai persis tanpa hover — review H9), legenda HTML untuk pai (nama + persen berjumlah 100 %), daftar
 * peringkat sebagai ganti grafik di kartu < 140 px. Pai dengan nilai negatif tidak digambar (persen
 * menyesatkan) — diberi penjelasan.
 */
const NARROW = 140;
const SWATCH = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6"];
const CHAR_PX = 6.6;

export function ChartWidget({
  type,
  data,
  spec,
  showData,
  title,
}: {
  type: ChartType;
  data: WidgetData;
  spec: ChartSpec;
  /** Tampilkan nilai sebagai tabel (tombol di kepala kartu). */
  showData: boolean;
  title: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const [dim, measure] = data.columns;

  if (data.rows.length === 0) {
    return (
      <p className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
        Tidak ada data untuk ditampilkan.
      </p>
    );
  }
  const temporal = dim!.type === "date" || dim!.type === "timestamp";
  // Garis: selalu urut waktu/kategori naik di layar, apa pun urutan pengambilan N titiknya.
  const source =
    type === "line"
      ? [...data.rows].sort((a, b) =>
          a[0] === null ? 1 : b[0] === null ? -1 : String(a[0]) < String(b[0]) ? -1 : 1,
        )
      : data.rows;
  const labels = source.map((r) =>
    typeof r[0] === "number"
      ? formatLabelNumber(r[0])
      : formatCell(r[0], dim!.type, { style: "auto", decimals: 0 }, spec.dimension.timeGrain),
  );
  const values = source.map((r) => (typeof r[1] === "number" ? r[1] : null));
  const categories = data.categories ?? labels.length;
  const shownSum = values.reduce<number>((s, v) => s + (v ?? 0), 0);
  const rest =
    type === "pie" && categories > labels.length && typeof data.grandTotal === "number"
      ? data.grandTotal - shownSum
      : 0;
  const negative = type === "pie" && (values.some((v) => v !== null && v < 0) || rest < -1e-9);
  const others = Math.max(0, rest);
  const fit = type === "bar" && size ? barsThatFit(size.height) : labels.length;
  const visible = Math.min(fit, labels.length);
  const narrow = !!size && size.width < NARROW;
  const rows = [
    ...labels.map((label, i) => ({ label, value: values[i] ?? null })),
    ...(others ? [{ label: OTHERS_LABEL, value: others }] : []),
  ];
  const shares = percentShares(rows.map((r) => Math.max(0, r.value ?? 0)));
  const value = (v: number | null) => (v === null ? "(kosong)" : formatNumber(v, spec.format));
  const noun = type === "line" ? "titik" : "kategori";
  const shownCount = type === "bar" ? visible : labels.length;
  const note =
    categories > shownCount
      ? `Menampilkan ${shownCount} dari ${categories.toLocaleString("id-ID")} ${noun}${others ? " · sisanya di Lainnya" : ""}`
      : `${categories.toLocaleString("id-ID")} ${noun}`;
  const chars = size ? Math.max(6, Math.floor((size.width - 72) / CHAR_PX)) : 24;

  let body: React.ReactNode;
  if (showData) {
    body = (
      <div
        className="relative min-h-0 flex-1 overflow-auto"
        role="region"
        aria-label={`Data ${title || measure!.label}`}
        // Wilayah gulir harus bisa difokus agar bisa digulir dengan keyboard (WCAG 2.1.1).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        data-testid="chart-table"
      >
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-[45%]" />
          </colgroup>
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-left">
              <th scope="col" className="truncate px-3 py-1.5 font-medium" title={dim!.label}>
                {dim!.label}
              </th>
              <th
                scope="col"
                className="truncate px-3 py-1.5 text-right font-medium"
                title={measure!.label}
              >
                {measure!.label}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-b-0">
                <th
                  scope="row"
                  className="truncate px-3 py-1.5 text-left font-normal"
                  title={r.label}
                >
                  {r.label}
                </th>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                  {value(r.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (negative) {
    body = (
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-2 overflow-y-auto p-3 text-center"
        data-testid="pie-negative"
      >
        <IconAlertTriangle
          size={20}
          stroke={1.5}
          aria-hidden
          className="shrink-0 text-warning @max-[10rem]:hidden"
        />
        <p className="text-sm">
          Grafik pai tidak bisa menampilkan nilai negatif. Pakai grafik batang, atau lihat nilainya
          lewat tombol tabel di kepala kartu.
        </p>
      </div>
    );
  } else if (narrow) {
    const items = rows.slice(0, Math.max(1, Math.floor((size?.height ?? 160) / 34)));
    body = (
      <ol
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-2 py-1 text-xs"
        data-testid="chart-ranked"
      >
        {items.map((r, i) => (
          <li key={i} className="flex min-w-0 flex-col">
            <span className="whitespace-nowrap text-muted-foreground" title={r.label}>
              {middleTruncate(r.label, chars + 8)}
            </span>
            <span className="font-medium tabular-nums">
              {r.value === null ? "(kosong)" : formatCompact(r.value, spec.format)}
            </span>
          </li>
        ))}
      </ol>
    );
  } else {
    const chart = (
      <ChartView
        type={type}
        labels={labels}
        values={values}
        others={others || undefined}
        textLabels={dim!.type === "text"}
        time={
          type === "line" && temporal
            ? {
                iso: source.map((r) => (r[0] === null ? null : String(r[0]))),
                grain: spec.dimension.timeGrain,
              }
            : undefined
        }
        measureLabel={measure!.label}
        dimensionLabel={dim!.label}
        format={spec.format}
        categories={categories}
        limit={visible}
      />
    );
    body =
      type === "pie" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 @md:flex-row">
          {chart}
          <ul
            className="max-h-[45%] shrink-0 overflow-y-auto px-3 pb-1 text-xs @md:max-h-none @md:w-[45%] @md:self-center"
            data-testid="pie-legend"
          >
            {rows.map((r, i) => (
              <li key={i} className="flex min-h-5 min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 shrink-0 rounded-sm forced-colors:border forced-colors:border-[CanvasText]",
                    r.label === OTHERS_LABEL ? SWATCH[5] : SWATCH[i % 5],
                  )}
                />
                <span className="min-w-0 flex-1 whitespace-nowrap" title={r.label}>
                  {middleTruncate(
                    r.label,
                    size && size.width >= 448
                      ? Math.floor((size.width * 0.45 - 56) / CHAR_PX)
                      : chars,
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{shares[i]}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        chart
      );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={box} className="relative flex min-h-0 flex-1 flex-col">
        {body}
      </div>
      {!showData && !narrow && size && size.height >= 200 ? (
        <p
          className="shrink-0 truncate px-3 pb-1 text-xs text-muted-foreground"
          title={note}
          data-testid="chart-note"
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
