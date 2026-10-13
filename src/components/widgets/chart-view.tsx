"use client";

import { useEffect, useRef, useState } from "react";
import { formatMeasure } from "@/features/widgets/format";
import type { ChartSort } from "@/features/widgets/spec";
import {
  OTHERS_LABEL,
  chartOption,
  chartSummary,
  onTimeAxis,
  pickIndex,
  type ChartInput,
  type ChartTheme,
} from "./chart-option";
import { useBoxSize } from "./use-box-size";

/*
 * Grafik ECharts (T-011): modul dimuat malas (hanya halaman yang punya grafik), renderer SVG (tajam,
 * teks tetap teks). Instans dibuat sekali lalu diperbarui di tempat — ganti tema/ukuran/data tidak
 * memutar ulang animasi masuk; opsi dibangun ulang dari ukuran kotak (label & sumbu menyesuaikan).
 * Warna dari token tema, dibaca ulang saat tema berganti. Tabel data tersembunyi untuk pembaca layar.
 * Klik (T-012, `onPick`): batang/garis — seluruh pita kategori di area plot (batang pendek tetap mudah
 * diklik), pai — irisannya; hasilnya indeks kategori sumber untuk filter silang. Jalan keyboard ada di
 * tabel data/daftar peringkat (tombol di kartu), bukan di grafik yang aria-hidden.
 */
type ECharts = typeof import("echarts/core");
type Instance = ReturnType<ECharts["init"]>;
type ZrEvent = { offsetX: number; offsetY: number };
let loader: Promise<ECharts> | null = null;
function loadECharts(): Promise<ECharts> {
  loader ??= Promise.all([
    import("echarts/core"),
    import("echarts/charts"),
    import("echarts/components"),
    import("echarts/renderers"),
  ]).then(([core, charts, components, renderers]) => {
    core.use([
      charts.BarChart,
      charts.LineChart,
      charts.PieChart,
      components.GridComponent,
      components.TooltipComponent,
      renderers.SVGRenderer,
    ]);
    return core;
  });
  return loader;
}

const css = (name: string) =>
  `hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/ /g, ", ")})`;
function readTheme(): ChartTheme {
  return {
    colors: [1, 2, 3, 4, 5, 6].map((n) => css(`--chart-${n}`)),
    text: css("--foreground"),
    muted: css("--muted-foreground"),
    border: css("--border"),
    card: css("--card"),
    font: getComputedStyle(document.body).fontFamily,
  };
}

/** Versi tema: naik setiap kelas <html> berubah (terang/gelap). */
function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => setV((n) => n + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return v;
}

export function ChartView(
  props: Omit<ChartInput, "reducedMotion"> & {
    categories?: number;
    /** Batang yang muat di tinggi kartu; tabel data (pembaca layar) tetap memuat semua baris. */
    limit?: number;
    /**
     * Tanpa total keseluruhan dan mungkin terpotong: ringkasan pai menyebut persen hanya dari yang
     * tampil; batang/garis menyebut "N terbesar/terkecil/pertama/terakhir" menurut `sort`.
     */
    partial?: boolean;
    sort?: ChartSort;
    /** Klik kategori → indeks label sumbernya (filter silang). Tanpa ini grafik tidak bisa diklik. */
    onPick?: (index: number) => void;
  },
) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<Instance | null>(null);
  /** Opsi sudah dipasang (sebelum itu instans belum punya grid — klik/gerak diabaikan). */
  const drawn = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const size = useBoxSize(box);
  const themeVersion = useThemeVersion();
  const { categories, limit, partial, sort, onPick, ...input } = props;
  const shown =
    limit && limit < input.labels.length
      ? { ...input, labels: input.labels.slice(0, limit), values: input.values.slice(0, limit) }
      : input;
  const inputKey = JSON.stringify(shown);
  // Data yang digambar + callback terbaru untuk handler klik yang dipasang sekali saat instans dibuat
  // (indeks irisan "Lainnya" = jumlah label yang digambar, bukan jumlah semua label).
  const latest = useRef({ input: shown, onPick });
  useEffect(() => {
    latest.current = { input: shown, onPick };
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let disposed = false;
    loadECharts().then(
      (echarts) => {
        if (disposed) return;
        const c: Instance = echarts.init(el, null, { renderer: "svg" });
        chart.current = c;
        const pick = (at: { index: number } | { ms: number }) => {
          const { input: i, onPick: cb } = latest.current;
          const k = cb ? pickIndex(i, at) : null;
          if (k !== null) cb?.(k);
        };
        // Pai: irisan yang diklik.
        c.on("click", (p) => {
          const index = (p as { dataIndex?: unknown }).dataIndex;
          if (latest.current.input.type === "pie" && typeof index === "number") pick({ index });
        });
        // Batang/garis: pita kategori (atau waktu terdekat) di bawah penunjuk, di dalam area plot.
        const zr = c.getZr();
        const at = (e: ZrEvent) => {
          const { input: i, onPick: cb } = latest.current;
          if (
            !cb ||
            !drawn.current ||
            i.type === "pie" ||
            !c.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])
          ) {
            return null;
          }
          const xy = c.convertFromPixel({ seriesIndex: 0 }, [e.offsetX, e.offsetY]);
          if (!Array.isArray(xy)) return null;
          if (i.type === "bar") return { index: Math.round(xy[1]!) };
          return onTimeAxis(i) ? { ms: xy[0]! } : { index: Math.round(xy[0]!) };
        };
        zr.on("click", (e) => {
          const hit = at(e);
          if (hit) pick(hit);
        });
        zr.on("mousemove", (e) => {
          const hit = at(e);
          const { input: i } = latest.current;
          if (hit) zr.setCursorStyle(pickIndex(i, hit) !== null ? "pointer" : "default");
        });
        setReady(true);
      },
      () => {
        if (!disposed) setFailed(true);
      },
    );
    return () => {
      disposed = true;
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!ready || !c || !size || size.width < 1 || size.height < 1) return;
    c.resize();
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const parsed = JSON.parse(inputKey) as Omit<ChartInput, "reducedMotion">;
    c.setOption(chartOption({ ...parsed, reducedMotion }, readTheme(), size), true);
    drawn.current = true;
  }, [ready, inputKey, themeVersion, size]);

  if (failed) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Grafik tidak bisa dimuat. Muat ulang halaman untuk mencoba lagi.
      </p>
    );
  }
  return (
    <div className="relative min-h-0 flex-1">
      {/* Grafik untuk mata; ringkasan + tabel data untuk pembaca layar. */}
      <div ref={box} className="absolute inset-0" aria-hidden />
      <table className="sr-only" data-testid="chart-data">
        <caption>{chartSummary(input, categories, partial, sort)}</caption>
        <thead>
          <tr>
            <th scope="col">{input.dimensionLabel}</th>
            <th scope="col">{input.measureLabel}</th>
          </tr>
        </thead>
        <tbody>
          {input.labels.map((label, i) => (
            <tr key={i}>
              <th scope="row">{label}</th>
              <td data-value={input.values[i] ?? ""}>
                {formatMeasure(input.values[i] ?? null, input.valueType, input.format)}
              </td>
            </tr>
          ))}
          {input.others ? (
            <tr>
              <th scope="row">{OTHERS_LABEL}</th>
              <td data-value={input.others}>
                {formatMeasure(input.others, input.valueType, input.format)}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
