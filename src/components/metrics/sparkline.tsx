import { cn } from "@/lib/utils";

/*
 * Grafik garis mini SVG (v1.18) untuk monitor sumber daya: tanpa pustaka grafik (sidebar dimuat di semua
 * halaman). Nilai null memutus garis (data tidak diketahui ≠ 0). Hiasan saja (aria-hidden): angkanya selalu
 * tertulis di sebelahnya.
 */
export const VIEW_W = 100;

/** Path SVG "M x y L x y …" per segmen tanpa null; y terbalik (0 di bawah). */
export function linePath(values: readonly (number | null)[], max: number, h: number): string {
  const n = values.length;
  if (n === 0 || !(max > 0)) return "";
  const step = n > 1 ? VIEW_W / (n - 1) : 0;
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = n > 1 ? i * step : VIEW_W / 2;
    const y = h - Math.min(1, Math.max(0, v / max)) * h;
    d += `${pen ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    pen = true;
  });
  return d;
}

export interface SparkSeries {
  values: readonly (number | null)[];
  /** Kelas warna (currentColor), mis. "text-chart-1". */
  className?: string;
}

export function Sparkline({
  series,
  max = 1,
  height = 16,
  className,
}: {
  series: SparkSeries[];
  /** Batas atas sumbu; persen = 1, laju = nilai tertinggi deret. */
  max?: number;
  height?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
      className={cn("block w-full overflow-visible", className)}
      style={{ height }}
    >
      {series.map((s, i) => (
        <path
          key={i}
          d={linePath(s.values, max, height)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className={s.className}
        />
      ))}
    </svg>
  );
}
