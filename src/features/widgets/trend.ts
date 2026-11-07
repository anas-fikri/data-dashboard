/*
 * Garis tren grafik (v1.10.0): seperti Trendline di Excel — garis lurus (regresi linear kuadrat terkecil)
 * atau rata-rata bergerak 3/7 periode — di atas Garis atau Batang tegak berdimensi tanggal/periode.
 * Titik kosong (periode tanpa data) dilewati. Satu sumber untuk layar, PDF, dan teks legenda. Murni.
 */
export const TRENDS = ["linear", "ma3", "ma7"] as const;
export type Trend = (typeof TRENDS)[number];

export const TREND_LABEL: Record<Trend, string> = {
  linear: "Garis tren (lurus)",
  ma3: "Rata-rata 3 periode",
  ma7: "Rata-rata 7 periode",
};

const DAY_MS = 86_400_000;
const NOUN: Record<string, string> = {
  day: "hari",
  week: "minggu",
  month: "bulan",
  quarter: "kuartal",
  year: "tahun",
  point: "titik",
};
const MONTHS: Record<string, number> = { month: 1, quarter: 3, year: 12 };

/**
 * Posisi x tren dari waktu (ms UTC) dalam satuan periode: bulan/kuartal/tahun dihitung per bulan
 * kalender (Feb tidak "lebih pendek"), minggu/hari per hari — sehingga kemiringan = perubahan per periode.
 */
export function trendX(ms: number, grain: string | undefined): number {
  const months = grain ? MONTHS[grain] : undefined;
  if (months) {
    const d = new Date(ms);
    return (d.getUTCFullYear() * 12 + d.getUTCMonth()) / months;
  }
  return ms / (grain === "week" ? 7 * DAY_MS : DAY_MS);
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Regresi linear y = a + b·x atas titik berisi; null bila < 2 titik atau x sama semua. */
export function linearFit(
  xs: readonly (number | null)[],
  ys: readonly (number | null)[],
): { slope: number; intercept: number } | null {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let k = 0; k < ys.length; k++) {
    const y = ys[k];
    const x = xs[k];
    if (!num(y) || !num(x)) continue;
    n++;
    sx += x;
    sy += y;
  }
  if (n < 2) return null;
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (let k = 0; k < ys.length; k++) {
    const y = ys[k];
    const x = xs[k];
    if (!num(y) || !num(x)) continue;
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/**
 * Rata-rata bergerak k periode (seperti Excel): titik ke-t = rata-rata titik berisi di [t−k+1, t];
 * kosong untuk k−1 titik pertama dan bila kurang dari separuh jendela berisi.
 */
export function movingAverage(ys: readonly (number | null)[], k: number): (number | null)[] {
  return ys.map((_, t) => {
    if (t < k - 1) return null;
    let sum = 0;
    let n = 0;
    for (let j = t - k + 1; j <= t; j++) {
      const y = ys[j];
      if (num(y)) {
        sum += y;
        n++;
      }
    }
    return n >= Math.ceil(k / 2) ? sum / n : null;
  });
}

/** Nilai garis tren di setiap titik (sejajar `ys`); x = waktu (ms) atau urutan titik. */
export function trendValues(
  kind: Trend,
  xs: readonly (number | null)[],
  ys: readonly (number | null)[],
): (number | null)[] {
  if (kind === "ma3") return movingAverage(ys, 3);
  if (kind === "ma7") return movingAverage(ys, 7);
  const fit = linearFit(xs, ys);
  return fit
    ? xs.map((x) => (x === null ? null : fit.intercept + fit.slope * x))
    : ys.map(() => null);
}

/**
 * Titik tren dari waktu per titik (ms UTC; null = tanpa tanggal, mis. "(kosong)" → tidak ikut tren) dan
 * nilainya: x dalam satuan periode (trendX). Satu jalur untuk garis putus-putus dan kalimat legenda.
 */
export function trendPoints(
  ms: readonly (number | null)[],
  ys: readonly (number | null)[],
  grain: string | undefined,
): { xs: (number | null)[]; ys: (number | null)[] } {
  const xs = ms.map((m) => (m === null ? null : trendX(m, grain)));
  return { xs, ys: ys.map((y, k) => (xs[k] === null ? null : (y ?? null))) };
}

/**
 * Kalimat legenda: "Tren: naik 1.234 per bulan" (garis lurus; kemiringan sudah per satuan `unit`:
 * day/week/month/quarter/year/point) atau nama rata-rata bergerak. `fmt` memformat angka seperti grafik.
 */
export function trendText(
  kind: Trend,
  fit: { slope: number } | null,
  unit: string | undefined,
  fmt: (v: number) => string,
): string {
  if (kind !== "linear") return `${TREND_LABEL[kind]} (garis putus-putus)`;
  if (!fit) return "Tren: data belum cukup (minimal 2 titik)";
  if (Math.abs(fit.slope) < 1e-9) return "Tren: datar";
  const noun = NOUN[unit ?? "day"] ?? "hari";
  return `Tren: ${fit.slope > 0 ? "naik" : "turun"} ${fmt(Math.abs(fit.slope))} per ${noun} (garis putus-putus)`;
}
