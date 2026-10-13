"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { useRef } from "react";
import { formatCell, formatLabelNumber, formatMeasure } from "@/features/widgets/format";
import type { ChartSpec, ChartType } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import { OTHERS_LABEL, barsThatFit } from "./chart-option";
import {
  emptyBucketValue,
  legendOrder,
  lineOrder,
  middleTruncate,
  percentShares,
  pieRest,
  rankedItems,
} from "./chart-series";
import { ChartTable } from "./chart-table";
import { ChartView } from "./chart-view";
import { useBoxSize } from "./use-box-size";
import type { WidgetData } from "./widget-query";

/*
 * Widget grafik (T-011): grafik + keterangan "Menampilkan N dari M" setiap kali kategori dipotong (dua
 * baris maks.; pembaca layar selalu mendapatnya), tabel data biasa saat tombol "data" di kepala kartu
 * aktif (nilai persis tanpa hover — review H9), legenda HTML untuk pai (nama + persen berjumlah 100 %,
 * terbesar dulu), daftar peringkat sebagai ganti grafik di kartu < 140 px ("+N lainnya" bila baris
 * terpotong). Pai dengan nilai negatif tidak digambar (persen menyesatkan) — diberi penjelasan, dan
 * tabel datanya memuat "Lainnya" bertanda. Durasi tampil j:mm:dd.
 */
const NARROW = 140;
const SWATCH = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6"];
const CHAR_PX = 6.6;
/** Wilayah gulir yang bisa difokus: garis fokus di dalam kotak (tidak terpotong tepi kartu). */
const SCROLL_REGION = "overflow-y-auto focus-visible:-outline-offset-2";

type Row = { label: string; value: number | null; others?: boolean };

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
  // Kotak luar (grafik + keterangan) menentukan ada-tidaknya keterangan — bukan kotak grafik yang
  // mengecil karena keterangan itu (tidak berkedip muncul-hilang).
  const outer = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const room = useBoxSize(outer);
  const [dim, measure] = data.columns;
  const dimType = dim?.type ?? "text";
  const valueType = measure?.type;
  const name = title || measure?.label || "grafik";

  // Garis: urut waktu/label naik di layar (urutan nilai: urutan server), apa pun urutan pengambilan.
  const source = type === "line" ? lineOrder(data.rows, dimType, spec.sort) : data.rows;
  const labels = source.map((r) =>
    typeof r[0] === "number"
      ? formatLabelNumber(r[0])
      : formatCell(r[0], dimType, { style: "auto", decimals: 0 }, spec.dimension.timeGrain),
  );
  const values = source.map((r) => (typeof r[1] === "number" ? r[1] : null));
  const categories = data.categories ?? labels.length;
  const rest = type === "pie" ? pieRest(values, data.grandTotal, categories > labels.length) : 0;
  const negative = type === "pie" && (values.some((v) => v !== null && v < 0) || rest < 0);
  const others = Math.max(0, rest);
  const fit = type === "bar" && size ? barsThatFit(size.height) : labels.length;
  const visible = Math.min(fit, labels.length);
  const narrow = !!size && size.width < NARROW;
  // "Lainnya" bertanda: sisa negatif tetap terlihat di tabel yang ditunjuk peringatan pai.
  const rows: Row[] = [
    ...labels.map((label, i) => ({ label, value: values[i] ?? null })),
    ...(rest !== 0 ? [{ label: OTHERS_LABEL, value: rest, others: true }] : []),
  ];
  const shares = percentShares(rows.map((r) => Math.max(0, r.value ?? 0)));
  // Pai: legenda/peringkat terbesar dulu — irisan terbesar (sering "Lainnya") terlihat lebih dulu.
  const order = type === "pie" ? legendOrder(rows.map((r) => r.value)) : rows.map((_, i) => i);
  const noun = type === "line" ? "titik" : "kategori";
  const shownCount = type === "bar" ? visible : labels.length;
  const cutShown = categories > shownCount;
  const note = cutShown
    ? `Menampilkan ${shownCount} dari ${categories.toLocaleString("id-ID")} ${noun}${others ? " · sisanya di Lainnya" : ""}`
    : `${categories.toLocaleString("id-ID")} ${noun}`;
  const chars = size ? Math.max(6, Math.floor((size.width - 72) / CHAR_PX)) : 24;

  let body: React.ReactNode;
  if (data.rows.length === 0) {
    body = (
      <p className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
        Tidak ada data untuk ditampilkan.
      </p>
    );
  } else if (showData) {
    body = (
      <ChartTable
        rows={rows}
        dimensionLabel={dim!.label}
        measureLabel={measure!.label}
        valueType={valueType}
        format={spec.format}
        label={`Data ${name}`}
        width={size?.width ?? null}
      />
    );
  } else if (negative) {
    body = (
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-2 p-3 text-center",
          SCROLL_REGION,
        )}
        role="region"
        aria-label={`Keterangan ${name}`}
        // Pesan bisa lebih tinggi dari kartu pendek: wilayah gulir harus bisa difokus (WCAG 2.1.1).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        data-testid="pie-negative"
      >
        <IconAlertTriangle
          size={20}
          stroke={1.5}
          aria-hidden
          className="shrink-0 text-warning @max-[10rem]:hidden"
        />
        <p className="text-sm break-words hyphens-auto">
          Grafik pai tidak bisa menampilkan nilai negatif. Pakai grafik batang, atau lihat nilainya
          lewat tombol tabel di kepala kartu.
        </p>
      </div>
    );
  } else if (narrow) {
    const fitRows = Math.max(1, Math.floor((size?.height ?? 160) / 34));
    const ranked = rankedItems(
      order.map((i) => rows[i]!),
      fitRows,
      categories,
    );
    body = (
      <ol
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-2 py-1 text-xs"
        data-testid="chart-ranked"
      >
        {ranked.items.map((r, i) => (
          <li key={i} className="flex min-w-0 flex-col">
            <span className="whitespace-nowrap text-muted-foreground" title={r.label}>
              {middleTruncate(r.label, chars + 8)}
            </span>
            <span className="font-medium tabular-nums">
              {formatMeasure(r.value, valueType, spec.format, true)}
            </span>
          </li>
        ))}
        {ranked.more > 0 ? (
          <li
            className="flex min-w-0 flex-col text-muted-foreground"
            data-testid="chart-ranked-more"
          >
            <span className="whitespace-nowrap">
              +{ranked.more.toLocaleString("id-ID")} lainnya
            </span>
            {/* Nilai gabungan hanya untuk pai (bagian dari keseluruhan) dan bila diketahui. */}
            {type === "pie" && ranked.moreValue !== null ? (
              <span className="tabular-nums">
                {formatMeasure(ranked.moreValue, valueType, spec.format, true)}
              </span>
            ) : null}
          </li>
        ) : null}
      </ol>
    );
  } else {
    const chart = (
      <ChartView
        type={type}
        labels={labels}
        values={values}
        others={others || undefined}
        textLabels={dimType === "text"}
        time={
          type === "line" && (dimType === "date" || dimType === "timestamp")
            ? {
                iso: source.map((r) => (r[0] === null ? null : String(r[0]))),
                grain: spec.dimension.timeGrain,
                empty: emptyBucketValue(spec.measure.agg, spec.sort, categories > labels.length),
              }
            : undefined
        }
        valueType={valueType}
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
          <div
            className={cn(
              "max-h-[45%] shrink-0 px-3 pb-1 text-xs @md:max-h-none @md:w-[45%] @md:self-center",
              SCROLL_REGION,
            )}
            role="region"
            aria-label={`Legenda ${name}`}
            // Legenda bisa lebih panjang dari kartu pendek: wilayah gulir harus bisa difokus.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
          >
            <ul data-testid="pie-legend">
              {order.map((i) => {
                const r = rows[i]!;
                return (
                  <li key={i} className="flex min-h-5 min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2.5 shrink-0 rounded-sm forced-colors:border forced-colors:border-[CanvasText]",
                        r.others ? SWATCH[5] : SWATCH[i % 5],
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
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {shares[i]}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        chart
      );
  }

  // Kategori terpotong selalu diberi tahu (cukup satu baris); jumlah kategori biasa hanya bila lega.
  const showNote =
    data.rows.length > 0 &&
    !showData &&
    !narrow &&
    !negative &&
    !!room &&
    room.height >= (cutShown ? 72 : 220);

  return (
    <div ref={outer} className="flex min-h-0 flex-1 flex-col">
      <div ref={box} className="relative flex min-h-0 flex-1 flex-col">
        {body}
      </div>
      {showNote ? (
        <p
          className="line-clamp-2 shrink-0 px-3 pb-1 text-xs text-muted-foreground"
          title={note}
          data-testid="chart-note"
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
