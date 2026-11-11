import type { MetricsSummary } from "./view";

/*
 * Tampilan angka monitor sumber daya (v1.18) — murni, dipakai kartu sidebar dan halaman admin. Ambang
 * "tinggi" sengaja sederhana dan sama untuk semua user; warna selalu disertai teks (bukan warna saja).
 */
export const LIMITS = { cpu: 0.85, mem: 0.9, disk: 0.85, iowait: 0.25 } as const;

export type Level = "ok" | "warn" | "down" | "unknown";

export const pct = (v: number | null | undefined): string =>
  typeof v === "number" ? `${Math.round(v * 100)}%` : "–";

/** Laju byte/detik: satuan biner, koma desimal Indonesia (mis. "1,2 MB/dtk"). */
export function rate(bps: number | null | undefined): string {
  if (typeof bps !== "number") return "–";
  const units = ["B", "KB", "MB", "GB"];
  let v = Math.max(0, bps);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const text = i > 0 && v < 10 ? v.toFixed(1).replace(".", ",") : String(Math.round(v));
  return `${text.replace(/,0$/, "")} ${units[i]}/dtk`;
}

/** Ukuran byte (GB untuk RAM/disk). */
export function size(bytes: number | null | undefined): string {
  if (typeof bytes !== "number") return "–";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1)
    return `${gb
      .toFixed(gb < 10 ? 1 : 0)
      .replace(".", ",")
      .replace(/,0$/, "")} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export const isHigh = (kind: "cpu" | "mem" | "disk", v: number | null | undefined) =>
  typeof v === "number" && v >= LIMITS[kind];

export interface Status {
  level: Level;
  /** Kalimat pendek untuk kartu (dan pembaca layar). */
  text: string;
}

/** Jendela rata-rata ambang CPU/iowait: lonjakan sesaat (mis. ingest) tidak membuat status berkedip. */
export const SUSTAIN_MS = 5 * 60_000;

/** Rata-rata 5 menit terakhir (deret + titik terakhir); tanpa deret → nilai terakhir. */
export function sustained(
  s: Pick<MetricsSummary, "latest" | "series">,
  key: "cpu" | "iowait",
): number | null {
  const p = s.latest;
  if (!p) return null;
  const xs = [...s.series.filter((x) => x.t >= p.t - SUSTAIN_MS && x.t < p.t), p]
    .map((x) => x[key])
    .filter((v): v is number => typeof v === "number");
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/**
 * Satu status gabungan: pemroses mati (dibaca terpisah dari exporter, tetap tampil walau data host hilang) →
 * data host tidak ada → beban tinggi (CPU/iowait rata-rata 5 menit, RAM/disk sesaat) → normal.
 */
export function statusOf(
  s: Pick<MetricsSummary, "available" | "latest" | "series" | "queue">,
): Status {
  if (s.queue?.workerDown) return { level: "down", text: "Pemroses unggahan tidak aktif" };
  if (!s.available || !s.latest) return { level: "unknown", text: "Data server tidak tersedia" };
  const p = s.latest;
  const io = sustained(s, "iowait");
  const high = [
    isHigh("cpu", sustained(s, "cpu")) && "CPU",
    isHigh("mem", p.mem) && "RAM",
    isHigh("disk", p.disk) && "disk",
    io !== null && io >= LIMITS.iowait && "menunggu disk",
  ].filter((x): x is string => !!x);
  if (high.length) return { level: "warn", text: `Beban tinggi: ${high.join(", ")}` };
  return { level: "ok", text: "Normal" };
}

/** Waktu WIB "14.05" (tanpa Intl zona: konsisten server/klien). */
export function clock(t: number): string {
  const d = new Date(t + 7 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}.${pad(d.getUTCMinutes())}`;
}

/** Rata-rata dan puncak deret (null diabaikan); kosong → null. */
export function stats(values: readonly (number | null)[]): { avg: number; peak: number } | null {
  const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!xs.length) return null;
  return { avg: xs.reduce((a, b) => a + b, 0) / xs.length, peak: Math.max(...xs) };
}

/** Inti CPU terpakai (cgroup): "0,35 inti". */
export const cores = (v: number | null | undefined): string =>
  typeof v === "number" ? `${v.toFixed(2).replace(".", ",")} inti` : "–";

/** Durasi singkat: "0 dtk", "45 dtk", "2 mnt 10 dtk", "1 jam 5 mnt". */
export function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} dtk`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} mnt ${s % 60} dtk` : `${m} mnt`;
  return m % 60 ? `${Math.floor(m / 60)} jam ${m % 60} mnt` : `${Math.floor(m / 60)} jam`;
}

/** Job berjalan per akun dalam kata: "1 unggahan, 2 ekspor"; tidak ada → "–". */
export function jobsText(j: { upload: number; recast: number; export: number }): string {
  const parts = [
    j.upload && `${j.upload} unggahan`,
    j.recast && `${j.recast} olah ulang`,
    j.export && `${j.export} ekspor`,
  ].filter((x): x is string => !!x);
  return parts.length ? parts.join(", ") : "–";
}
