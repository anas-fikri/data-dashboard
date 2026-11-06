import { describe, expect, it } from "vitest";
import { chartOption, type ChartInput, type ChartTheme } from "@/components/widgets/chart-option";
import { statusPalette } from "@/features/widgets/status-color";

const theme: ChartTheme = {
  colors: ["c1", "c2", "c3", "c4", "c5", "c6"],
  text: "#000",
  muted: "#555",
  border: "#ddd",
  card: "#fff",
  font: "sans-serif",
};
type Opt = {
  series: { data: unknown[] }[];
  tooltip: { formatter: (p: unknown) => string };
};
const bar = (extra: Partial<ChartInput>) =>
  chartOption(
    {
      type: "bar",
      labels: ["Bandung", "Jakarta", "Surabaya"],
      values: [100, 50, 0],
      measureLabel: "Klaim",
      dimensionLabel: "Cabang",
      format: { style: "auto", decimals: 0 },
      reducedMotion: true,
      ...extra,
    },
    theme,
    { width: 600, height: 300 },
  ) as unknown as Opt;

describe("grafik batang: warna status (v1.7.0)", () => {
  it("klaim (makin tinggi makin buruk): batang tertinggi merah, terendah hijau", () => {
    const pal = statusPalette(undefined, false);
    const o = bar({ status: { tone: "down" } });
    const colors = o.series[0]!.data.map(
      (d) => (d as { itemStyle: { color: string } }).itemStyle.color,
    );
    expect(colors).toEqual([pal.bad.mark, pal.mid.mark, pal.good.mark]);
    expect(o.tooltip.formatter([{ name: "Bandung", value: 100, dataIndex: 0 }])).toContain(
      "Status: Perlu perhatian",
    );
  });

  it("tanpa penilaian warna: data batang tetap angka biasa (warna seri)", () => {
    expect(bar({}).series[0]!.data).toEqual([100, 50, 0]);
  });

  it("garis tidak diwarnai status", () => {
    const o = bar({ type: "line", status: { tone: "up" } });
    expect(o.series[0]!.data.every((d) => typeof d === "number")).toBe(true);
  });
});
