import { describe, expect, it } from "vitest";
import { kpiCompareView } from "@/components/widgets/kpi-compare";
import type { KpiCompareData } from "@/features/query/spec";

/*
 * T-43hv: baris pembanding KPI — persen + label periode, tanpa data → tanpa persen, pembanding 0 → selisih
 * angka, warna mengikuti arah penilaian (naik baik / turun baik), tanpa penilaian → netral.
 */
/** Intl memakai spasi tak putus (NBSP); dibandingkan sebagai spasi biasa. */
const sp = (s: string | null) => s?.replace(/\u00a0/g, " ") ?? null;
const AUTO = { style: "auto", decimals: 0 } as const;
const RP = { style: "rupiah", decimals: 0 } as const;
const cmp = (over: Partial<KpiCompareData> = {}): KpiCompareData => ({
  period: "2026-11-01",
  previousPeriod: "2026-10-01",
  previous: 1000,
  previousRows: 5,
  grain: "month",
  against: "previous",
  ...over,
});

describe("kpiCompareView (T-43hv)", () => {
  it("naik 12,5 % vs Okt 2026; label + nilai pembanding ringkas; kalimat lengkap", () => {
    const v = kpiCompareView(1125, cmp(), "decimal", AUTO, "up");
    expect(v).toMatchObject({ direction: "up", status: "good" });
    expect(sp(v.change)).toMatch(/^\+12,5\s?%$/);
    expect(sp(v.text)).toBe("vs Okt 2026 (1 rb)");
    expect(v.full).toMatch(/^Naik 12,5\s?% dibanding Okt 2026 \(1\.000\)$/);
  });

  it("turun: warna mengikuti arah — naik baik → buruk, turun baik → baik; tanpa penilaian netral", () => {
    expect(kpiCompareView(800, cmp(), "decimal", AUTO, "up")).toMatchObject({
      direction: "down",
      status: "bad",
    });
    expect(kpiCompareView(800, cmp(), "decimal", AUTO, "down").status).toBe("good");
    expect(kpiCompareView(1200, cmp(), "decimal", AUTO, "down").status).toBe("bad");
    const n = kpiCompareView(800, cmp(), "decimal", AUTO, undefined);
    expect(n.status).toBeNull();
    expect(n.change).toMatch(/^−20\s?%$/);
  });

  it("sama → datar tanpa warna", () => {
    const v = kpiCompareView(1000, cmp(), "decimal", AUTO, "up");
    expect(v).toMatchObject({ direction: "flat", status: null });
    expect(v.full).toBe("Sama dengan Okt 2026 (1.000)");
  });

  it("tahun lalu tanpa data → 'Tidak ada data Nov 2025' tanpa persen (COUNT 0 juga)", () => {
    const v = kpiCompareView(
      7,
      cmp({ previousPeriod: "2025-11-01", previous: 0, previousRows: 0, against: "year" }),
      "count",
      AUTO,
      "up",
    );
    expect(v).toMatchObject({ change: null, direction: null, text: "Tidak ada data Nov 2025" });
  });

  it("pembanding 0 → selisih angka, bukan persen tak hingga", () => {
    const v = kpiCompareView(2_500_000, cmp({ previous: 0 }), "decimal", RP, "up");
    expect(sp(v.change)).toBe("+Rp 2,5 jt");
    expect(v.change).not.toContain("%");
  });

  it("data tanpa tanggal → keterangan netral; label per periode (kuartal, minggu)", () => {
    expect(
      kpiCompareView(null, cmp({ period: null, previousPeriod: null }), "decimal", AUTO, "up"),
    ).toMatchObject({ text: "Tidak ada data bertanggal", change: null });
    expect(
      sp(
        kpiCompareView(
          5,
          cmp({ grain: "quarter", previousPeriod: "2026-07-01" }),
          "decimal",
          AUTO,
          "up",
        ).text,
      ),
    ).toBe("vs K3 2026 (1 rb)");
    expect(
      sp(
        kpiCompareView(
          5,
          cmp({ grain: "week", previousPeriod: "2026-10-26" }),
          "decimal",
          AUTO,
          "up",
        ).text,
      ),
    ).toBe("vs Mg 26 Okt 2026 (1 rb)");
  });
});
