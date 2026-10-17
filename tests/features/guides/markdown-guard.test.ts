import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * Review T-fesf: pertahanan berlapis saat render — bila pemeriksaan per baris (guideBodyProblem)
 * terkecoh, tabel > 8 kolom tetap tidak ditambal ke lebar penuh di toHast, melainkan diganti teks.
 * guideBodyProblem dipalsukan lolos agar jalur render ini yang diuji.
 */
vi.mock("@/features/guides/validation", async (orig) => ({
  ...(await orig<typeof import("@/features/guides/validation")>()),
  guideBodyProblem: () => null,
}));

const { GuideMarkdown } = await import("@/features/guides/markdown");
const row = (n: number, cell: string) => `|${Array(n).fill(cell).join("|")}|`;
const html = (md: string) =>
  renderToStaticMarkup(createElement(GuideMarkdown, { markdown: md, origins: [] }));

describe("remarkTable — batas kolom saat render (T-fesf)", () => {
  it("2.500 kolom × 1.990 baris (≈ 5 juta sel bila ditambal) → teks pengganti, cepat", () => {
    const bomb = `${row(2500, "h")}\n${row(2500, "-")}\n${"a\n".repeat(1990)}`;
    const t0 = performance.now();
    const out = html(bomb);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(out).toContain("Tabel terlalu lebar untuk ditampilkan (maks. 8 kolom).");
    expect(out).not.toContain("<table");
  });

  it("di dalam kutipan/daftar juga dicegat; tabel ≤ 8 kolom tetap dirender", () => {
    const wide = `${row(9, "a")}\n${row(9, "-")}\n${row(9, "1")}`;
    const out = html(`> ${wide.split("\n").join("\n> ")}\n\n${row(8, "b")}\n${row(8, "-")}`);
    expect(out).toContain("Tabel terlalu lebar untuk ditampilkan");
    expect(out.match(/<table/g)).toHaveLength(1);
  });
});
