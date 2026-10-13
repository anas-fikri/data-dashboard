"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { useRef } from "react";
import { formatCell, formatLabelNumber, formatMeasure } from "@/features/widgets/format";
import type { ChartSpec, ChartType } from "@/features/widgets/spec";
import { cn } from "@/lib/utils";
import { OTHERS_LABEL, periodFill } from "./chart-option";
import {
  NARROW,
  chartFit,
  emptyBucketValue,
  legendOrder,
  lineOrder,
  middleTruncate,
  percentShares,
  pieRest,
  rankedItems,
  valueCut,
  zeroWhenBlank,
} from "./chart-series";
import { ChartTable } from "./chart-table";
import { ChartView } from "./chart-view";
import { useBoxSize } from "./use-box-size";
import type { WidgetData } from "./widget-query";

/*
 * Widget grafik (T-011): grafik + keterangan "Menampilkan N dari M" yang menyesuaikan tinggi kartu
 * (lengkap, ringkas satu baris, atau hanya untuk pembaca layar — grafik tidak pernah lebih pendek dari
 * batas minimumnya), tabel data biasa saat tombol "data" di kepala kartu aktif (nilai persis tanpa
 * hover — review H9), legenda HTML untuk pai (nama + persen berjumlah 100 %, terbesar dulu), daftar
 * peringkat sebagai ganti grafik di kartu < 140 px atau yang terlalu pendek untuk donat ("+N kategori
 * lain" bila baris terpotong — "Lainnya" hanya irisan pai; garis bertanggal terbaru dulu, "+N
 * sebelumnya"). Pai dengan nilai negatif tidak digambar (persen menyesatkan) — diberi penjelasan, dan
 * tabel datanya memuat "Lainnya" bertanda. Tanpa total keseluruhan (query total gagal) dan baris
 * sebanyak batas N: pai memberi tahu persennya hanya dari yang tampil, batang/garis menyebut "N
 * terbesar" (bukan seolah lengkap). Durasi j:mm:dd.
 */
const SWATCH = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6"];
const CHAR_PX = 6.6;
const STACK_CHAR_PX = 7.5;
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
  // Semua keputusan tata letak dari kotak luar (grafik + keterangan) — bukan kotak grafik yang
  // mengecil karena keterangan itu (tidak berkedip muncul-hilang).
  const outer = useRef<HTMLDivElement>(null);
  const room = useBoxSize(outer);
  const [dim, measure] = data.columns;
  const dimType = dim?.type ?? "text";
  const valueType = measure?.type;
  const name = title || measure?.label || "grafik";
  const temporal = dimType === "date" || dimType === "timestamp";

  // Garis: urut waktu/label naik di layar (urutan nilai: urutan server), apa pun urutan pengambilan.
  const source = type === "line" ? lineOrder(data.rows, dimType, spec.sort) : data.rows;
  const labels = source.map((r) =>
    typeof r[0] === "number"
      ? formatLabelNumber(r[0])
      : formatCell(r[0], dimType, { style: "auto", decimals: 0 }, spec.dimension.timeGrain),
  );
  // Total/jumlah: kategori yang semua nilainya kosong = 0 (SUMIF Excel, sama dengan KPI).
  const blankZero = zeroWhenBlank(spec.measure.agg);
  const values = source.map((r) => (typeof r[1] === "number" ? r[1] : blankZero ? 0 : null));
  const categories = data.categories ?? labels.length;
  // Tanpa total (query total gagal) dan baris sebanyak batas N: kategori lain mungkin ada. Pai: persen
  // hanya dari yang tampil; batang/garis: "N terbesar" (bukan "N kategori"); garis N titik menurut
  // nilai: periode di luar N bukan 0 (celah "di luar N terbesar", bukan nol karangan).
  const partial = data.categories === undefined && data.rows.length >= spec.topN;
  const knownCut = categories > labels.length;
  const cut = knownCut || partial;
  const rest = type === "pie" ? pieRest(values, data.grandTotal, cut) : 0;
  const negative = type === "pie" && (values.some((v) => v !== null && v < 0) || rest < 0);
  const others = Math.max(0, rest);
  // "Lainnya" bertanda: sisa negatif tetap terlihat di tabel yang ditunjuk peringatan pai.
  const rows: Row[] = [
    ...labels.map((label, i) => ({ label, value: values[i] ?? null })),
    ...(rest !== 0 ? [{ label: OTHERS_LABEL, value: rest, others: true }] : []),
  ];
  const shares = percentShares(rows.map((r) => Math.max(0, r.value ?? 0)));
  // Pai: legenda/peringkat terbesar dulu — irisan terbesar (sering "Lainnya") terlihat lebih dulu.
  const order = type === "pie" ? legendOrder(rows.map((r) => r.value)) : rows.map((_, i) => i);
  const time =
    type === "line" && temporal
      ? {
          iso: source.map((r) => (r[0] === null ? null : String(r[0]))),
          grain: spec.dimension.timeGrain,
          empty: emptyBucketValue(spec.measure.agg, spec.sort, cut),
          dimType,
          cut: valueCut(spec.sort, cut),
        }
      : undefined;
  const fit = room
    ? chartFit({
        type,
        room,
        rows: labels.length,
        categories,
        legendRows: rows.length,
        others: others > 0,
        partial,
        sort: spec.sort,
        fill: periodFill({ type, values, time }),
      })
    : null;
  const visible = fit?.visible ?? labels.length;
  const width = room?.width ?? null;
  const chars = width ? Math.max(6, Math.floor((width - 72) / CHAR_PX)) : 24;

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
        width={width}
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
  } else if (fit?.ranked && room) {
    // Kartu sempit: label di atas nilai. Kartu pendek tetapi cukup lebar: satu baris per kategori.
    const inline = room.width >= NARROW;
    // Garis bertanggal: terbaru dulu — yang tidak muat adalah periode lama ("+N sebelumnya").
    const newestFirst = type === "line" && temporal;
    const list = (newestFirst ? [...order].reverse() : order).map((i) => rows[i]!);
    const fitRows = Math.max(1, Math.floor((room.height - 4) / (inline ? 20 : 36)));
    const ranked = rankedItems(list, fitRows, categories);
    // Yang tidak muat hanya periode lama — kecuali server memotong N terlama/menurut nilai.
    const olderOnly = newestFirst && (!knownCut || spec.sort === "label_desc");
    const text = (v: number | null) => formatMeasure(v, valueType, spec.format, true);
    const valueChars = ranked.items.reduce((m, r) => Math.max(m, text(r.value).length), 0);
    // Bertumpuk: label selebar isi daftar (px-2), 7,5 px per karakter (tanggal/angka, "M", "…").
    const labelChars = inline
      ? Math.max(6, Math.floor((room.width - 24 - valueChars * 7) / CHAR_PX))
      : Math.max(6, Math.floor((room.width - 16) / STACK_CHAR_PX));
    // "+N kategori lain" (bukan "lainnya" — itu irisan pai); kartu yang terlalu sempit: "+N lagi".
    const more = ranked.more.toLocaleString("id-ID");
    const moreFull = `+${more} ${olderOnly ? "sebelumnya" : type === "line" ? "titik lain" : "kategori lain"}`;
    const moreText =
      inline || moreFull.length * CHAR_PX <= room.width - 16 ? moreFull : `+${more} lagi`;
    body = (
      <ol
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-2 py-1 text-xs"
        data-testid="chart-ranked"
      >
        {ranked.items.map((r, i) => (
          <li key={i} className={cn("flex min-w-0", inline ? "items-baseline gap-2" : "flex-col")}>
            <span
              className={cn("truncate text-muted-foreground", inline && "min-w-0 flex-1")}
              title={r.label}
            >
              {middleTruncate(r.label, labelChars)}
            </span>
            <span className="shrink-0 font-medium tabular-nums">{text(r.value)}</span>
          </li>
        ))}
        {ranked.more > 0 ? (
          <li
            className={cn(
              "flex min-w-0 text-muted-foreground",
              inline ? "items-baseline gap-2" : "flex-col",
            )}
            data-testid="chart-ranked-more"
          >
            <span className={cn("truncate", inline && "min-w-0 flex-1")} title={moreFull}>
              {moreText}
            </span>
            {/* Nilai gabungan hanya untuk pai (bagian dari keseluruhan) dan bila diketahui. */}
            {type === "pie" && ranked.moreValue !== null ? (
              <span className="shrink-0 tabular-nums">{text(ranked.moreValue)}</span>
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
        time={time}
        valueType={valueType}
        measureLabel={measure!.label}
        dimensionLabel={dim!.label}
        format={spec.format}
        categories={categories}
        limit={visible}
        partial={partial}
        sort={spec.sort}
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
                        width && width >= 448 ? Math.floor((width * 0.45 - 56) / CHAR_PX) : chars,
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

  // Keterangan yang muat (lengkap/ringkas); teks lengkap tetap di title dan untuk pembaca layar.
  const note =
    fit && fit.note !== "none" && !fit.ranked && data.rows.length > 0 && !showData && !negative
      ? fit
      : null;

  return (
    <div ref={outer} className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">{body}</div>
      {note ? (
        // Jarak bawah di pembungkus: kotak yang dipotong line-clamp tidak memperlihatkan sisa baris.
        <div className="shrink-0 px-3 pb-1">
          <p
            className={cn(
              "text-xs text-muted-foreground",
              note.note === "full" ? "line-clamp-2" : "line-clamp-1",
            )}
            title={note.full}
            data-testid="chart-note"
          >
            {note.shown === note.full ? (
              note.full
            ) : (
              <>
                <span aria-hidden>{note.shown}</span>
                <span className="sr-only">{note.full}</span>
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
