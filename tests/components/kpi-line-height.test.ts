import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KpiView } from "@/components/widgets/kpi-view";

/*
 * T-w764: angka KPI harus bertinggi baris leading-tight (1,25) — rumus kpiHeightPx bergantung padanya.
 * Dulu tailwind-merge (cn) membuang `leading-tight` karena kelas ukuran huruf text-* sesudahnya, jadi
 * tinggi baris jatuh ke 1,5 warisan body dan angka di halaman cetak terpotong 1 px di bawah.
 */
const html = (value: number) =>
  renderToStaticMarkup(
    createElement(KpiView, {
      data: { columns: [{ label: "Total Omzet", type: "decimal" }], rows: [[value]] },
      format: { style: "rupiah", decimals: 0 },
      title: "Omzet",
      agg: "sum",
      fixedHeight: true,
    }),
  );

describe("T-w764: tinggi baris angka KPI", () => {
  it("kpi-value memakai leading-tight dan kelas ukuran huruf sekaligus", () => {
    const cls = /<p class="([^"]*)"[^>]*data-testid="kpi-value"/.exec(html(1_234_567_890))?.[1];
    expect(cls).toBeTruthy();
    const list = cls!.split(" ");
    expect(list).toContain("leading-tight");
    expect(list.some((c) => c.startsWith("text-["))).toBe(true);
  });
});
