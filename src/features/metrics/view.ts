import type { HostPoint } from "@/lib/metrics/host";
import type { AccountActivity, MetricsView, QueueStatus, ServiceRow } from "@/lib/metrics/store";

/*
 * Bentuk respons monitor sumber daya (v1.18). Ringkasan untuk semua user login: hanya angka gabungan host —
 * tanpa titik mount, nama antarmuka, nama host, atau jumlah worker (hanya "pemroses aktif/tidak"). Admin:
 * detail disk, per layanan, 24 jam. Murni (diuji unit).
 */
export interface SummaryPoint {
  t: number;
  cpu: number | null;
  /** Dipakai ambang "menunggu disk" rata-rata 5 menit (format.sustained). */
  iowait: number | null;
  mem: number | null;
  disk: number | null;
  rx: number | null;
  tx: number | null;
}

export interface MetricsSummary {
  /** false = monitor belum dipasang (METRICS_NODE_URL kosong): kartu disembunyikan, polling berhenti. */
  enabled: boolean;
  available: boolean;
  latest: (SummaryPoint & { load1: number | null; cpus: number }) | null;
  series: SummaryPoint[];
  /** null = status antrean tidak diketahui. */
  queue: {
    waiting: number;
    active: number;
    workerDown: boolean;
    /** Proses latar per jenis (v1.21); tidak ada = sampel versi lama. */
    jobs?: QueueStatus["jobs"];
  } | null;
}

const point = (p: HostPoint): SummaryPoint => ({
  t: p.t,
  cpu: p.cpu,
  iowait: p.iowait,
  mem: p.mem,
  disk: p.disk,
  rx: p.rx,
  tx: p.tx,
});

const queueOf = (q: QueueStatus | null): MetricsSummary["queue"] =>
  q
    ? {
        waiting: q.waiting,
        active: q.active,
        workerDown: q.workers === 0,
        ...(q.jobs ? { jobs: q.jobs } : {}),
      }
    : null;

export function summaryOf(v: MetricsView, enabled: boolean): MetricsSummary {
  return {
    enabled,
    available: enabled && v.available,
    latest: v.latest ? { ...point(v.latest), load1: v.latest.load1, cpus: v.latest.cpus } : null,
    series: v.series.map(point),
    queue: queueOf(v.queue),
  };
}

/** Job worker berjalan per akun (T-qed9): unggah/ingest, olah ulang skema + pemetaan, ekspor + PDF. */
export interface AccountJobs {
  upload: number;
  recast: number;
  export: number;
}

export interface AccountRow {
  id: string;
  email: string;
  name: string | null;
  /** Query DuckDB yang sedang dieksekusi. */
  running: number;
  /** Detik eksekusi query ± 15 menit terakhir. */
  seconds: number;
  jobs: AccountJobs;
  /** Storage terpakai (hitungan kuota unggah); null = tidak dihitung. */
  storageBytes: number | null;
}

export interface AccountsView {
  rows: AccountRow[];
  quotaBytes: number;
}

const jobTotal = (j: AccountJobs) => j.upload + j.recast + j.export;

/** Akun aktif (query atau job), terberat dulu: detik query → query berjalan → job → email. */
export function rankAccounts(
  users: readonly { id: string; email: string; name: string | null }[],
  activity: ReadonlyMap<string, AccountActivity>,
  jobs: ReadonlyMap<string, AccountJobs>,
  limit: number,
): AccountRow[] {
  return users
    .map((u) => {
      const a = activity.get(u.id);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        running: a?.running ?? 0,
        seconds: a?.seconds ?? 0,
        jobs: jobs.get(u.id) ?? { upload: 0, recast: 0, export: 0 },
        storageBytes: null,
      };
    })
    .filter((r) => r.running > 0 || r.seconds > 0 || jobTotal(r.jobs) > 0)
    .sort(
      (a, b) =>
        b.seconds - a.seconds ||
        b.running - a.running ||
        jobTotal(b.jobs) - jobTotal(a.jobs) ||
        a.email.localeCompare(b.email),
    )
    .slice(0, limit);
}

export interface MetricsAdmin extends MetricsSummary {
  host: HostPoint | null;
  day: SummaryPoint[];
  services: ServiceRow[];
  workers: number | null;
  /** null = data per akun gagal dibaca (sisanya tetap tampil). */
  accounts: AccountsView | null;
}

export function adminOf(
  v: MetricsView & { day: HostPoint[]; services: ServiceRow[] },
  enabled: boolean,
  accounts: AccountsView | null = null,
): MetricsAdmin {
  return {
    ...summaryOf(v, enabled),
    host: v.latest,
    day: v.day.map(point),
    services: v.services,
    workers: v.queue?.workers ?? null,
    accounts,
  };
}
