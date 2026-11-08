import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTES } from "@/features/widgets/tone";

/*
 * Tema grafik (v1.10.0/v1.11.0): setiap tema punya blok terang + gelap di globals.css, keenam warna seri
 * ≥ 3:1 terhadap kartu (WCAG 1.4.11): terang #FFFFFF, gelap hsl(240 6% 10%) ≈ #18181B.
 */
const css = readFileSync("src/app/globals.css", "utf8");
const hslToRgb = (h: number, s: number, l: number) => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
};
const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
function block(selector: string): number[][] {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(at, css.indexOf("}", at));
  return [1, 2, 3, 4, 5, 6].map((n) => {
    const m = new RegExp(`--chart-${n}: (\\d+) (\\d+)% (\\d+)%;`).exec(body);
    expect(m, `${selector} --chart-${n}`).toBeTruthy();
    return hslToRgb(Number(m![1]), Number(m![2]), Number(m![3]));
  });
}

describe("tema grafik: kontras terang + gelap", () => {
  for (const p of PALETTES.filter((x) => x !== "default")) {
    it(p, () => {
      for (const c of block(`[data-palette="${p}"]`)) {
        expect(ratio(c, [1, 1, 1])).toBeGreaterThanOrEqual(3);
      }
      for (const c of block(`.dark [data-palette="${p}"]`)) {
        expect(ratio(c, hslToRgb(240, 6, 10))).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
