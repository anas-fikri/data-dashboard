import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WHATS_NEW } from "@/features/whats-new/entries";

/* "Yang baru" (v1.10.0): entri teratas tidak boleh tertinggal dari versi aplikasi (lupa menulis). */
const minor = (v: string) => v.split(".").slice(0, 2).map(Number) as [number, number];

describe("Yang baru", () => {
  it("entri teratas ≥ versi minor package.json; urut terbaru dulu; tiap entri berisi", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    const [pm, pn] = minor(pkg.version);
    const [em, en] = minor(WHATS_NEW[0]!.version);
    expect(em > pm || (em === pm && en >= pn)).toBe(true);
    for (let k = 1; k < WHATS_NEW.length; k++) {
      const [a, b] = minor(WHATS_NEW[k - 1]!.version);
      const [c, d] = minor(WHATS_NEW[k]!.version);
      expect(a > c || (a === c && b > d)).toBe(true);
      expect(WHATS_NEW[k]!.items.length).toBeGreaterThan(0);
    }
  });
});
