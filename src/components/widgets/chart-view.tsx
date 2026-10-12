"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/features/widgets/format";
import { chartOption, chartSummary, type ChartInput, type ChartTheme } from "./chart-option";

/*
 * Grafik ECharts (T-011): modul dimuat malas (hanya halaman yang punya grafik), renderer SVG (tajam,
 * teks tetap teks), ukuran mengikuti kartu (ResizeObserver), warna dari token tema dan dibaca ulang saat
 * tema berganti. Tabel data tersembunyi untuk pembaca layar memuat nilai yang sama dengan grafik.
 */
type ECharts = typeof import("echarts/core");
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

export function ChartView(props: Omit<ChartInput, "reducedMotion">) {
  const box = useRef<HTMLDivElement>(null);
  const themeVersion = useThemeVersion();
  const [failed, setFailed] = useState(false);
  const input = JSON.stringify(props);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let disposed = false;
    let chart: {
      setOption(o: unknown, notMerge: boolean): void;
      resize(): void;
      dispose(): void;
    } | null = null;
    let ro: ResizeObserver | null = null;
    loadECharts().then(
      (echarts) => {
        if (disposed) return;
        chart = echarts.init(el, null, { renderer: "svg" });
        const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const parsed = JSON.parse(input) as Omit<ChartInput, "reducedMotion">;
        chart.setOption(chartOption({ ...parsed, reducedMotion }, readTheme()), true);
        ro = new ResizeObserver(() => chart?.resize());
        ro.observe(el);
      },
      () => {
        if (!disposed) setFailed(true);
      },
    );
    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.dispose();
    };
  }, [input, themeVersion]);

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
        <caption>{chartSummary(props)}</caption>
        <thead>
          <tr>
            <th scope="col">{props.dimensionLabel}</th>
            <th scope="col">{props.measureLabel}</th>
          </tr>
        </thead>
        <tbody>
          {props.labels.map((label, i) => (
            <tr key={i}>
              <th scope="row">{label}</th>
              <td data-value={props.values[i] ?? ""}>
                {props.values[i] === null
                  ? "(kosong)"
                  : formatNumber(props.values[i]!, props.format)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
