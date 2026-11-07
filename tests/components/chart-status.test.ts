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
});

const colorOf = (d: unknown) => (d as { itemStyle?: { color?: string } }).itemStyle?.color;

describe("garis + pai: warna status (v1.9.0)", () => {
  it("garis: titik berwarna status, semua titik tampil, tooltip menyebut status", () => {
    const pal = statusPalette({ template: "bold" }, false);
    const o = bar({ type: "line", status: { tone: "up", colors: { template: "bold" } } });
    expect(o.series[0]!.data.map(colorOf)).toEqual([pal.good.mark, pal.mid.mark, pal.bad.mark]);
    const line = o.series[0] as unknown as { showSymbol: boolean; symbol: string };
    expect(line.showSymbol).toBe(true);
    expect(line.symbol).toBe("circle");
    expect(o.tooltip.formatter([{ name: "Jakarta", value: 50, dataIndex: 1 }])).toContain(
      "Status: Sedang",
    );
  });

  it("garis tanpa penilaian: data tetap angka biasa", () => {
    expect(bar({ type: "line" }).series[0]!.data).toEqual([100, 50, 0]);
  });

  it("pai: irisan berwarna status; Lainnya tetap warna netral", () => {
    const pal = statusPalette(undefined, false);
    const o = bar({ type: "pie", status: { tone: "down" }, others: 10 });
    const data = o.series[0]!.data;
    expect(data.slice(0, 3).map(colorOf)).toEqual([pal.bad.mark, pal.mid.mark, pal.good.mark]);
    expect(colorOf(data[3])).toBe("c6");
    expect(o.tooltip.formatter({ name: "Bandung", value: 100, dataIndex: 0 } as unknown)).toContain(
      "Status: Perlu perhatian",
    );
  });
});

type Series = {
  type: string;
  name?: string;
  data: unknown[];
  itemStyle?: { borderRadius?: number[] };
};
type Full = { series: Series[]; xAxis: { type: string }; yAxis: { type: string } };
const full = (extra: Partial<ChartInput>) => bar(extra) as unknown as Full;

describe("arah batang + garis tren (v1.10.0)", () => {
  it("batang tegak: kategori di sumbu x, sudut atas membulat; bawaan tetap mendatar", () => {
    const v = full({ vertical: true });
    expect(v.xAxis.type).toBe("category");
    expect(v.yAxis.type).toBe("value");
    expect(v.series[0]!.itemStyle?.borderRadius).toEqual([4, 4, 0, 0]);
    expect(full({}).xAxis.type).toBe("value");
  });

  it("tren lurus di batang tegak: seri putus-putus kedua dengan nilai regresi", () => {
    const o = full({ vertical: true, values: [10, 20, 30], trend: { kind: "linear" } });
    const t = o.series[1]!;
    expect(t.name).toBe("Tren");
    expect(t.data).toEqual([10, 20, 30]);
  });

  it("tren memakai waktu (ms) bila semua titik bertanggal", () => {
    const o = full({
      vertical: true,
      values: [10, 20, 40],
      trend: { kind: "linear", xs: [0, 1, 3] },
    });
    const d = o.series[1]!.data as number[];
    // Titik terakhir jauh (x = 3): tren tetap garis lurus terhadap waktu, bukan urutan.
    expect(d[2]! - d[1]!).toBeCloseTo(2 * (d[1]! - d[0]!), 6);
  });

  it("baris tanpa tanggal di batang tegak tidak ikut tren (sama dengan legenda)", () => {
    const ms = [0, 1, 2].map((m) => Date.UTC(2026, m, 1));
    const o = full({
      vertical: true,
      values: [10, 20, 30, 1000],
      trend: { kind: "linear", xs: [...ms, null], grain: "month" },
    });
    const d = o.series[1]!.data as (number | null)[];
    expect(d[3]).toBeNull();
    expect(d[2]! - d[1]!).toBeCloseTo(10, 6);
  });

  it("batang mendatar mengabaikan tren", () => {
    expect(full({ trend: { kind: "linear" } }).series).toHaveLength(1);
  });
});
