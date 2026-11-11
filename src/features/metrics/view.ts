import type { HostPoint } from "@/lib/metrics/host";
import type { MetricsView, QueueStatus, ServiceRow } from "@/lib/metrics/store";

/*
 * Bentuk respons monitor sumber daya (v1.18). Ringkasan untuk semua user login: hanya angka gabungan host —
 * tanpa titik mount, nama antarmuka, nama host, atau jumlah worker (hanya "pemroses aktif/tidak"). Admin:
 * detail disk, per layanan, 24 jam. Murni (diuji unit).
 */
export interface SummaryPoint {
  t: number;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  rx: number | null;
  tx: number | null;
}

export interface MetricsSummary {
  /** false = monitor belum dipasang (METRICS_NODE_URL kosong): kartu disembunyikan, polling berhenti. */
  enabled: boolean;
  available: boolean;
  latest: (SummaryPoint & { iowait: number | null; load1: number | null; cpus: number }) | null;
  series: SummaryPoint[];
  /** null = status antrean tidak diketahui. */
  queue: { waiting: number; active: number; workerDown: boolean } | null;
}

const point = (p: HostPoint): SummaryPoint => ({
  t: p.t,
  cpu: p.cpu,
  mem: p.mem,
  disk: p.disk,
  rx: p.rx,
  tx: p.tx,
});

const queueOf = (q: QueueStatus | null): MetricsSummary["queue"] =>
  q ? { waiting: q.waiting, active: q.active, workerDown: q.workers === 0 } : null;

export function summaryOf(v: MetricsView, enabled: boolean): MetricsSummary {
  return {
    enabled,
    available: enabled && v.available,
    latest: v.latest
      ? { ...point(v.latest), iowait: v.latest.iowait, load1: v.latest.load1, cpus: v.latest.cpus }
      : null,
    series: v.series.map(point),
    queue: queueOf(v.queue),
  };
}

export interface MetricsAdmin extends MetricsSummary {
  host: HostPoint | null;
  day: SummaryPoint[];
  services: ServiceRow[];
  workers: number | null;
}

export function adminOf(
  v: MetricsView & { day: HostPoint[]; services: ServiceRow[] },
  enabled: boolean,
): MetricsAdmin {
  return {
    ...summaryOf(v, enabled),
    host: v.latest,
    day: v.day.map(point),
    services: v.services,
    workers: v.queue?.workers ?? null,
  };
}
