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

/** Satu status gabungan: data tidak ada → pemroses mati → beban tinggi → normal. */
export function statusOf(s: Pick<MetricsSummary, "available" | "latest" | "queue">): Status {
  if (!s.available || !s.latest) return { level: "unknown", text: "Data server tidak tersedia" };
  if (s.queue?.workerDown) return { level: "down", text: "Pemroses unggahan tidak aktif" };
  const p = s.latest;
  const high = [
    isHigh("cpu", p.cpu) && "CPU",
    isHigh("mem", p.mem) && "RAM",
    isHigh("disk", p.disk) && "disk",
    typeof p.iowait === "number" && p.iowait >= LIMITS.iowait && "menunggu disk",
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
