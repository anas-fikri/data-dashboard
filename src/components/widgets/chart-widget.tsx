"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import {
  dateLabelForms,
  formatCell,
  formatLabelNumber,
  formatMeasure,
} from "@/features/widgets/format";
import type { ChartSpec, ChartType } from "@/features/widgets/spec";
import { CROSS_HINT_ID } from "@/components/dashboards/filters/cross-hint";
import type { WidgetFilters } from "@/components/dashboards/filters/filter-context";
import { filterKey } from "@/components/dashboards/filters/filter-model";
import { crossFilterFor } from "@/components/dashboards/filters/filter-text";
import { cn } from "@/lib/utils";
import { OTHERS_LABEL, periodFill } from "./chart-option";
import {
  NARROW,
  RANK_WORD,
  chartFit,
  printLegend,
  emptyBucketValue,
  legendOrder,
  lineOrder,
  middleTruncate,
  percentShares,
  pieRest,
  rankedItems,
  rankedLabels,
  valueCut,
  zeroWhenBlank,
} from "./chart-series";
import { chartEmpty } from "./body-state";
import { Both, ChartTable, canvasMeasure } from "./chart-table";
import { ChartView } from "./chart-view";
import { useBoxSize } from "./use-box-size";
import { useScrollFocus } from "./use-scroll-focus";
import type { WidgetData } from "./widget-query";

/*
 * Widget grafik (T-011): grafik + keterangan "Menampilkan N dari M" yang menyesuaikan tinggi kartu
 * (lengkap, ringkas satu baris, atau hanya untuk pembaca layar — grafik tidak pernah lebih pendek dari
 * batas minimumnya), tabel data biasa saat tombol "data" di kepala kartu aktif (nilai persis tanpa
 * hover — review H9), legenda HTML untuk pai (nama + persen berjumlah 100 %, terbesar dulu), daftar
 * peringkat sebagai ganti grafik di kartu < 140 px atau yang terlalu pendek untuk donat ("+N kategori
 * lain" bila baris terpotong — "Lainnya" hanya irisan pai; garis bertanggal terbaru dulu, "+N
 * sebelumnya"; label diukur dan hanya dipendekkan bila memang tidak muat — tanggal memakai bentuk
 * pendek yang tetap membedakan periode, dipotong di tengah hanya bila tidak ada yang muat). Pai dengan
 * nilai negatif tidak digambar (persen menyesatkan) — diberi penjelasan, dan tabel datanya memuat
 * "Lainnya" bertanda. Tanpa total keseluruhan (query total gagal) dan baris sebanyak batas N: pai
 * memberi tahu persennya hanya dari yang tampil, batang/garis menyebut "N terbesar", daftar peringkat
 * "mungkin ada kategori lain" (bukan seolah lengkap). Durasi j:mm:dd.
 * Cetak PDF (T-018): `print` = label nilai di grafik dan nilai di legenda pai (nilai jadi teks PDF);
 * `onSettled` = isi kartu siap — dari grafik yang selesai digambar, atau langsung bila isinya bukan
 * grafik (kosong, pai negatif, daftar peringkat).
 */
const SWATCH = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6"];
/**
 * Bentuk swatch legenda per warna (T-032): irisan tetap terbedakan tanpa warna (forced-colors, buta
 * warna). Di forced-colors warnanya dipertahankan (forced-color-adjust) agar tetap cocok dengan grafik.
 */
const SHAPE = [
  // Kotak bersudut tajam: rounded-sm (4 px pada 10 px) terbaca lingkaran (review desain T-032).
  "rounded-none",
  "rounded-full",
  "[clip-path:polygon(50%_0,100%_100%,0_100%)]",
  "[clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]",
  "[clip-path:polygon(50%_0,100%_38%,82%_100%,18%_100%,0_38%)]",
];
/** "Lainnya": garis pendek. */
const OTHERS_SHAPE = "h-1 rounded-full";
const CHAR_PX = 6.6;
/** Daftar peringkat (teks 12 px) tanpa canvas (SSR, uji): ±7 px per karakter. */
const RANK_CHAR_PX = 7;
/** Wilayah gulir yang bisa difokus: garis fokus di dalam kotak (tidak terpotong tepi kartu). */
const SCROLL_REGION = "overflow-y-auto focus-visible:-outline-offset-2";

/**
 * iso: nilai tanggal/cap waktu mentah (bentuk pendek di daftar peringkat); index: baris sumber
 * (kategori nyata, bisa jadi filter silang — "Lainnya" tidak).
 */
type Row = {
  label: string;
  value: number | null;
  others?: boolean;
  iso?: string | null;
  index?: number;
};
/** Tombol kategori yang ditekan (filter silang dari grafik ini): garis + latar, bukan warna saja. */
const PRESSED =
  "aria-pressed:bg-primary/10 aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-primary forced-colors:aria-pressed:outline forced-colors:aria-pressed:outline-[Highlight]";

export function ChartWidget({
  type,
  data,
  spec,
  showData,
  title,
  cross,
  print = false,
  onSettled,
}: {
  type: ChartType;
  data: WidgetData;
  spec: ChartSpec;
  /** Tampilkan nilai sebagai tabel (tombol di kepala kartu). */
  showData: boolean;
  title: string;
  /**
   * Filter dashboard widget ini (T-012): sorotan + klik kategori → filter silang. Petunjuknya satu
   * untuk seluruh dashboard (cross-hint.tsx); tombol kategori menunjuk ke sana (aria-describedby).
   */
  cross?: WidgetFilters;
  /** Halaman render PDF: nilai sebagai teks, tanpa animasi. */
  print?: boolean;
  /** Isi siap (grafik tergambar/gagal, atau isi bukan grafik). */
  onSettled?: () => void;
}) {
  // Semua keputusan tata letak dari kotak luar (grafik + keterangan) — bukan kotak grafik yang
  // mengecil karena keterangan itu (tidak berkedip muncul-hilang).
  const outer = useRef<HTMLDivElement>(null);
  const [legendEl, legendTab] = useScrollFocus<HTMLDivElement>();
  const [noticeEl, noticeTab] = useScrollFocus<HTMLDivElement>();
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
  // Filter silang (T-012): nilai MENTAH kategori (bukan label); tanggal berperiode → rentang periode.
  const filterAt = (k: number) =>
    dim ? crossFilterFor(dim.label, dimType, spec.dimension.timeGrain, source[k]?.[0]) : null;
  const canPick = !!cross?.pick && spec.crossFilter !== false && !!dim && cross.canPick(dim.label);
  const pickAt = canPick
    ? (k: number) => {
        const f = filterAt(k);
        if (f) cross!.pick!(f);
      }
    : undefined;
  const selectedKey = cross?.selected ? filterKey(cross.selected) : null;
  const selected = selectedKey
    ? source.findIndex((_, k) => {
        const f = filterAt(k);
        return !!f && filterKey(f) === selectedKey;
      })
    : -1;
  const rawText = (k: number) => {
    const v = source[k]?.[0];
    return v === null || v === undefined ? "" : String(v);
  };
  const rows: Row[] = [
    ...labels.map((label, i) => ({
      label,
      value: values[i] ?? null,
      iso: temporal && source[i]![0] !== null ? String(source[i]![0]) : null,
      index: i,
    })),
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
  // Pai cetak: legenda utuh (nama + nilai + persen) menentukan apakah donat masih muat. Lebar teks dari
  // canvas; angka tabular (tnum) tidak dikenal canvas → semua angka diukur sebagai "0" (+1 px bulat).
  const printMeasure = print && type === "pie" && room ? canvasMeasure(12) : undefined;
  const legend =
    print && type === "pie" && room
      ? printLegend(
          room.width,
          order.map((k) => ({
            label: rows[k]!.label,
            tail: `${formatMeasure(rows[k]!.value, valueType, spec.format)} ${shares[k]}%`,
          })),
          printMeasure
            ? (t) => (printMeasure(t.replace(/\d/g, "0"), false) ?? [...t].length * 7) + 1
            : undefined,
        )
      : null;
  const fit = room
    ? chartFit({
        type,
        room,
        rows: labels.length,
        categories,
        legendRows: rows.length,
        printLegendPx: legend?.px,
        print: !!print,
        others: others > 0,
        partial,
        sort: spec.sort,
        fill: periodFill({ type, values, time }),
      })
    : null;
  const visible = fit?.visible ?? labels.length;
  const width = room?.width ?? null;
  const chars = width ? Math.max(6, Math.floor((width - 72) / CHAR_PX)) : 24;
  // Isi bukan grafik ECharts (tidak ada gambar yang ditunggu): langsung siap untuk halaman render.
  const drawsChart = !chartEmpty(data) && !showData && !negative && !(fit?.ranked && room);
  useEffect(() => {
    if (!drawsChart) onSettled?.();
  }, [drawsChart, onSettled]);

  let body: React.ReactNode;
  if (chartEmpty(data)) {
    body = (
      <p className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
        Tidak ada data untuk ditampilkan.
      </p>
    );
  } else if (showData) {
    body = (
      <ChartTable
        rows={rows.map((r) =>
          pickAt && r.index !== undefined
            ? {
                ...r,
                pick: () => pickAt(r.index!),
                pressed: r.index === selected,
                raw: rawText(r.index),
              }
            : r,
        )}
        dimensionLabel={dim!.label}
        measureLabel={measure!.label}
        valueType={valueType}
        format={spec.format}
        describedBy={pickAt ? CROSS_HINT_ID : undefined}
        label={`Data ${name}`}
        width={width}
        height={room?.height ?? null}
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
        // Pesan bisa lebih tinggi dari kartu pendek: wilayah gulir bisa difokus bila meluap (WCAG 2.1.1).
        ref={noticeEl}
        tabIndex={print ? undefined : noticeTab}
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
    // Garis bertanggal: terbaru dulu — yang tidak muat adalah periode lama ("+N sebelumnya").
    const newestFirst = type === "line" && temporal;
    const list = (newestFirst ? [...order].reverse() : order).map((i) => rows[i]!);
    // Tanpa total keseluruhan (query total gagal) dan baris sebanyak batas N: daftar tidak boleh tampak
    // lengkap — satu baris dicadangkan untuk "mungkin ada kategori lain" (sama dengan keterangan grafik).
    const unsure = partial && !list.some((r) => r.others);
    // Yang tidak muat hanya periode lama — kecuali server memotong N terlama/menurut nilai.
    const olderOnly = newestFirst && (!knownCut || spec.sort === "label_desc") && !unsure;
    const text = (v: number | null) => formatMeasure(v, valueType, spec.format, true);
    // Lebar terukur (canvas, teks 12 px). Halaman memakai angka tabular (tnum) yang tidak dikenal
    // canvas: label dan nilai diukur dengan semua angka = "0" (selebar angka tabular) — nilai yang hanya
    // beda angka memberi ruang label yang sama, baris satu daftar dipendekkan dengan cara yang sama.
    // Label +1 px pembulatan; nilai (font-medium) +1 px per titik/koma (kerning angka tabular).
    const measure = canvasMeasure(12);
    const px = (t: string, value = false) => {
      const w = measure?.(t.replace(/\d/g, "0"), value);
      if (typeof w !== "number") return [...t].length * RANK_CHAR_PX;
      return value ? w + (t.match(/[.,]/g)?.length ?? 0) : w + 1;
    };
    const listPx = room.width - 16; // px-2
    // Bentuk pendek ditentukan dari semua baris yang dimuat, bukan hanya yang tampil: tahun/tanggal
    // dibuang hanya bila memang sama untuk seluruh deret.
    const iso = (r: Row) => (r.others ? null : (r.iso ?? null));
    // Kartu cukup lebar: satu baris per kategori (label di samping nilai) — kecuali label tanggal tidak
    // muat utuh/terpotong seragam di sampingnya; daftar lalu bertumpuk (label selebar kartu) daripada
    // angka terpotong. Kartu sempit: selalu bertumpuk.
    // Tinggi baris + gap-1: sebaris 20 px; bertumpuk 36 px, 52 px bila nilainya lebih lebar dari daftar
    // (terbungkus 2 baris; +0,5 px: ukuran +1 px per titik/koma sedikit melebihi DOM).
    const rowPx = (r: Row, inline: boolean) =>
      inline ? 20 : px(text(r.value), true) > listPx + 0.5 ? 52 : 36;
    const lay = (inline: boolean) => {
      // Kapasitas dari tinggi nyata baris dari atas; bila perlu baris '+N' (sama dengan rankedItems),
      // sisakan 20 px untuknya.
      const total = categories + (unsure ? 1 : 0);
      let used = 4;
      let k = 0;
      while (k < list.length && used + rowPx(list[k]!, inline) <= room.height) {
        used += rowPx(list[k++]!, inline);
      }
      const real = list.filter((r) => !r.others).length;
      const needsMore = k < list.length || (!list.some((r) => r.others) && total > real);
      // Bila satu baris pun tidak muat bersama '+N' (nilai raksasa terbungkus di kartu pendek), hanya
      // baris '+N' yang tampil — nilainya tetap di title/sr.
      if (needsMore) while (k > 0 && used + 20 > room.height) used -= rowPx(list[--k]!, inline);
      const ranked = rankedItems(list, needsMore ? k + 1 : k, total, needsMore);
      const items = ranked.items;
      const beside = (v: string | null) => (inline && v !== null ? px(v, true) + 8 : 0); // gap-2
      const forms = temporal
        ? dateLabelForms(
            items.map(iso),
            spec.dimension.timeGrain,
            dimType === "timestamp" && !spec.dimension.timeGrain,
            rows.map(iso),
          ).map((f) => f.map((t, k) => t ?? items[k]!.label))
        : [items.map((r) => r.label)];
      const rooms = items.map((r) => listPx - beside(text(r.value)));
      const shown = rankedLabels(forms, rooms, (t) => px(t), temporal, inline);
      return shown && { inline, ranked, items, shown };
    };
    const laid = (room.width >= NARROW && lay(true)) || lay(false)!;
    const { inline, ranked, items, shown: shownLabels } = laid;
    const hidden = ranked.more - (unsure ? 1 : 0);
    // "+N kategori lain" (bukan "lainnya" — itu irisan pai); yang tidak muat: "+N lagi".
    const more = hidden.toLocaleString("id-ID");
    const tail = olderOnly ? "sebelumnya" : type === "line" ? "titik lain" : "kategori lain";
    const moreForms = !unsure
      ? [`+${more} ${tail}`, `+${more} lagi`]
      : hidden > 0
        ? [`+${more} ${tail} atau lebih`, `+${more} atau lebih`]
        : [`Mungkin ada ${tail}`, "+? lagi"];
    const noun = type === "line" ? "titik" : "kategori";
    const moreFull = unsure
      ? `${moreForms[0]} — ${labels.length.toLocaleString("id-ID")} ${noun} ${RANK_WORD[spec.sort]} dimuat, jumlah keseluruhan tidak tersedia`
      : moreForms[0]!;
    // Nilai gabungan hanya untuk pai (bagian dari keseluruhan) dan bila diketahui.
    const moreValue = type === "pie" && ranked.moreValue !== null ? text(ranked.moreValue) : null;
    // Baris '+N' satu baris (label di samping nilai) bila muat — juga di daftar bertumpuk, agar baris
    // terakhir tidak keluar dari kartu pendek (kapasitas daftar bertumpuk dihitung per baris data).
    // Nilai '+N' tampil bobot 400 (bukan font-medium): diukur sama, +1 px per titik/koma.
    const moreBeside =
      moreValue !== null ? px(moreValue) - 1 + (moreValue.match(/[.,]/g)?.length ?? 0) + 8 : 0; // gap-2
    const moreInline = inline || moreForms.some((t) => px(t) <= listPx - moreBeside);
    const moreRoom = listPx - (moreInline ? moreBeside : 0);
    const moreText = moreForms.find((t) => px(t) <= moreRoom) ?? moreForms.at(-1)!;
    // Tidak muat sebaris dan tidak ada tempat di bawah label (baris data 36 px + nilai 32 px): nilai
    // '+N' hanya di title/sr — baris terakhir tidak boleh terpotong tepi kartu.
    // Nilai lebih lebar dari daftar akan terbungkus 2 baris → juga hanya di title/sr.
    const usedRows = items.reduce((sum, r) => sum + rowPx(r, inline), 0);
    const moreFits = 4 + usedRows + 32 <= room.height && moreBeside - 8 <= listPx;
    const moreShown = moreInline || moreFits ? moreValue : null;
    const moreTitle =
      moreValue !== null && moreShown === null ? `${moreFull} · ${moreValue}` : moreFull;
    body = (
      <ol
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-2 py-1 text-xs"
        data-testid="chart-ranked"
      >
        {items.map((r, i) => {
          const layout = cn("flex min-w-0", inline ? "items-baseline gap-2" : "flex-col");
          const content = (
            <>
              <span
                className={cn("truncate text-muted-foreground", inline && "min-w-0 flex-1")}
                title={r.label}
              >
                <Both visible={shownLabels[i]!} full={r.label} />
              </span>
              <span className="shrink-0 font-medium tabular-nums">{text(r.value)}</span>
            </>
          );
          const k = r.others ? undefined : r.index;
          return (
            <li key={i} className={pickAt && k !== undefined ? "flex min-w-0" : layout}>
              {pickAt && k !== undefined ? (
                // Kategori sebagai tombol tekan: filter silang dengan keyboard (grafik aria-hidden).
                <button
                  type="button"
                  aria-pressed={k === selected}
                  aria-describedby={CROSS_HINT_ID}
                  data-testid="crossfilter-item"
                  data-value={rawText(k)}
                  onClick={() => pickAt(k)}
                  className={cn(
                    layout,
                    // Latar disorot/ditekan: label (muted) ikut gelap agar kontras tetap ≥ 4,5:1. Latar
                    // melebar ke padding daftar (-mx-1 px-1): teks tetap di tempat yang diukur.
                    "-mx-1 flex-1 cursor-pointer rounded-sm px-1 text-left hover:bg-accent hover:*:text-foreground aria-pressed:*:text-foreground focus-visible:-outline-offset-2",
                    PRESSED,
                  )}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
        {ranked.more > 0 ? (
          <li
            className={cn(
              "flex min-w-0 text-muted-foreground",
              moreInline ? "items-baseline gap-2" : "flex-col",
            )}
            data-testid="chart-ranked-more"
          >
            <span className={cn("truncate", moreInline && "min-w-0 flex-1")} title={moreTitle}>
              <Both visible={moreText} full={moreTitle} />
            </span>
            {moreShown !== null ? <span className="shrink-0 tabular-nums">{moreShown}</span> : null}
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
        selected={selected >= 0 ? selected : undefined}
        onPick={pickAt}
        print={print || undefined}
        onSettled={onSettled}
      />
    );
    body =
      type === "pie" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 @md:flex-row">
          {chart}
          <div
            className={cn(
              // Samping donat (≥ 28rem): dibatasi tinggi kartu → digulir, bukan terpotong (T-032).
              "shrink-0 px-3 pb-1 text-xs @md:max-h-full @md:w-[45%] @md:self-center",
              // Cetak: legenda = satu-satunya teks irisan di kertas (tanpa gulir) → boleh setinggi kartu
              // kecuali 4,5rem untuk donat (grafik setinggi 0 tidak pernah memberi sinyal siap).
              print ? "max-h-[calc(100%-4.5rem)]" : "max-h-[45%]",
              SCROLL_REGION,
            )}
            role="region"
            aria-label={`Legenda ${name}`}
            // Legenda bisa lebih panjang dari kartu pendek: bisa difokus (panah menggulir) hanya bila
            // meluap — legenda yang muat bukan tab stop (T-032).
            ref={legendEl}
            tabIndex={print ? undefined : legendTab}
            data-testid="pie-legend-region"
          >
            <ul data-testid="pie-legend">
              {order.map((i) => {
                const r = rows[i]!;
                return (
                  <li
                    key={i}
                    className={cn(
                      "flex min-h-5 min-w-0 items-center",
                      print ? "flex-wrap gap-x-1.5" : "gap-1.5",
                    )}
                  >
                    <span
                      aria-hidden
                      data-testid="pie-swatch"
                      className={cn(
                        "w-2.5 shrink-0 forced-color-adjust-none",
                        r.others
                          ? [SWATCH[5], OTHERS_SHAPE]
                          : ["h-2.5", SWATCH[i % 5], SHAPE[i % 5]],
                      )}
                    />
                    {/* Cetak: nama lengkap membungkus di samping nilainya (kertas tanpa tooltip; dua
                      irisan berawalan sama tetap terbedakan — review R1-DS-3); nama terlalu sempit di
                      samping nilai: sebaris penuh, nilai di bawahnya (R3-DS-2, printLegend). Layar:
                      satu baris. */}
                    {print ? (
                      <span
                        className={cn(
                          "min-w-0 flex-1 [overflow-wrap:anywhere]",
                          legend?.stack && "basis-[calc(100%-1rem)]",
                        )}
                      >
                        {r.label}
                      </span>
                    ) : (
                      <span className="min-w-0 flex-1 whitespace-nowrap" title={r.label}>
                        {middleTruncate(
                          r.label,
                          width && width >= 448 ? Math.floor((width * 0.45 - 56) / CHAR_PX) : chars,
                        )}
                      </span>
                    )}
                    {/* Cetak: nilai irisan sebagai teks (layar: di tabel data/tooltip). */}
                    {print ? (
                      <span
                        className={cn("shrink-0 tabular-nums", legend?.stack && "ml-4")}
                        data-testid="pie-legend-value"
                      >
                        {formatMeasure(r.value, valueType, spec.format)}
                      </span>
                    ) : null}
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
  const drawn = fit && !fit.ranked && !chartEmpty(data) && !showData && !negative ? fit : null;
  const note = drawn && drawn.note !== "none" ? drawn : null;
  // Keterangan tidak muat (kartu pendek): lencana "N dari M" di celah kiri bawah grafik — tidak memeras
  // judul di kepala kartu (review desain T-032). Pembaca layar: ringkasan grafik.
  const badge = !print && drawn?.badge ? drawn.badge : "";

  return (
    <div ref={outer} className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
        {body}
        {badge ? (
          <span
            className="pointer-events-none absolute bottom-0.5 left-2 rounded-sm bg-card/90 px-1 text-[0.6875rem] leading-4 tabular-nums text-foreground"
            aria-hidden
            data-testid="chart-badge"
          >
            {badge}
          </span>
        ) : null}
      </div>
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
