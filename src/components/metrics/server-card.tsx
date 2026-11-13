"use client";

import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconCircleCheck,
  IconCloudOff,
  type Icon,
} from "@tabler/icons-react";
import Link from "next/link";
import { useId } from "react";
import {
  clock,
  isHigh,
  pct,
  rate,
  statusOf,
  sustained,
  type Level,
} from "@/features/metrics/format";
import type { MetricsSummary } from "@/features/metrics/view";
import { usePolling } from "@/lib/hooks/use-polling";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

/*
 * Kartu "Server" di sidebar (v1.18, ADR-0010) untuk semua user login: CPU, RAM, disk, jaringan, dan status
 * pemroses unggahan, polling 10 dtk (berhenti saat tab tersembunyi — usePolling). Monitor belum dipasang →
 * kartu tidak tampil dan polling berhenti. Sidebar diciutkan → satu ikon status (tombol melebarkan sidebar).
 * Warna selalu disertai teks; status gabungan diumumkan pembaca layar hanya saat berubah (aria-live polite).
 */
export const LEVEL_ICON: Record<Level, Icon> = {
  ok: IconCircleCheck,
  warn: IconAlertTriangle,
  down: IconAlertOctagon,
  unknown: IconCloudOff,
};
export const LEVEL_TEXT: Record<Level, string> = {
  ok: "text-success",
  warn: "text-warning",
  down: "text-destructive",
  unknown: "text-muted-foreground",
};

type Response = MetricsSummary & { ok: boolean };

export function ServerCard({
  className,
  ...props
}: {
  /** Kelas pembungkus — pembungkus hanya dirender bila kartu tampil (tanpa celah kosong). */
  className?: string;
  collapsed?: boolean;
  isAdmin: boolean;
  onExpand?: () => void;
}) {
  const { data, error } = usePolling<Response>({
    url: "/api/metrics",
    intervalMs: 10_000,
    initial: null,
    done: (d) => !d.enabled,
    immediate: true,
  });
  if (!data?.enabled) return null;
  return (
    <div className={className}>
      <ServerCardView {...props} data={data} error={error} />
    </div>
  );
}

const JOB_LABEL = { upload: "unggahan", schema: "koreksi skema", export: "ekspor/PDF" } as const;
const n = (x: number) => x.toLocaleString("id-ID");

/**
 * Baris pemroses: status + semua proses latar per jenis (v1.21), mis. "Pemroses: aktif · 1 unggahan diproses,
 * 2 ekspor/PDF menunggu". Sampel lama tanpa rincian jenis → hitungan unggahan saja.
 */
export function queueText(q: MetricsSummary["queue"]): string {
  if (!q) return "Pemroses: status tidak diketahui";
  const head = q.workerDown ? "Pemroses: tidak aktif" : "Pemroses: aktif";
  const jobs = q.jobs ?? { upload: { active: q.active, waiting: q.waiting } };
  const parts: string[] = [];
  for (const kind of ["upload", "schema", "export"] as const) {
    const j = jobs[kind];
    if (!j) continue;
    if (j.active) parts.push(`${n(j.active)} ${JOB_LABEL[kind]} diproses`);
    if (j.waiting) parts.push(`${n(j.waiting)} ${JOB_LABEL[kind]} menunggu`);
  }
  return `${head} · ${parts.length ? parts.join(", ") : "tidak ada proses berjalan"}`;
}

/** Jumlah proses latar yang sedang berjalan (semua jenis). */
const runningOf = (q: MetricsSummary["queue"]) =>
  q
    ? Object.values(q.jobs ?? { upload: { active: q.active, waiting: 0 } }).reduce(
        (a, j) => a + (j?.active ?? 0),
        0,
      )
    : 0;

export function ServerCardView({
  data,
  error,
  collapsed = false,
  isAdmin,
  onExpand,
}: {
  data: MetricsSummary;
  error: boolean;
  collapsed?: boolean;
  isAdmin: boolean;
  onExpand?: () => void;
}) {
  // Dua salinan kartu (sidebar + drawer ponsel) → id judul unik.
  const titleId = useId();
  const status = error
    ? { level: "unknown" as const, text: "Data server gagal dimuat" }
    : statusOf(data);
  const StatusIcon = LEVEL_ICON[status.level];

  if (collapsed) {
    // Sidebar diciutkan (v1.21): ikon status + CPU/RAM + jumlah proses berjalan tetap terlihat sekilas.
    const latest = error ? null : data.latest;
    const running = error ? 0 : runningOf(data.queue);
    const summary = [
      latest ? `CPU ${pct(latest.cpu)}` : null,
      latest ? `RAM ${pct(latest.mem)}` : null,
      running ? `${n(running)} proses berjalan` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <button
        type="button"
        onClick={onExpand}
        title={`Server: ${status.text}${summary ? ` — ${summary}` : ""}`}
        aria-label={`Server: ${status.text}${summary ? `, ${summary}` : ""}. Lebarkan sidebar untuk detail`}
        data-testid="server-card-collapsed"
        data-level={status.level}
        className="flex w-10 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] leading-3 tabular-nums text-sidebar-foreground hover:bg-sidebar-accent"
      >
        <StatusIcon size={20} stroke={1.75} aria-hidden className={LEVEL_TEXT[status.level]} />
        {latest ? (
          <>
            <span aria-hidden data-testid="server-collapsed-cpu">
              {pct(latest.cpu)}
            </span>
            <span aria-hidden className="text-muted-foreground">
              {pct(latest.mem)}
            </span>
          </>
        ) : null}
        {running ? (
          <span
            aria-hidden
            className="rounded-sm bg-sidebar-accent px-1 font-medium"
            data-testid="server-collapsed-jobs"
          >
            {n(running)}▸
          </span>
        ) : null}
      </button>
    );
  }

  const p = error ? null : data.latest;
  const series = error ? [] : data.series;
  const rxMax = Math.max(1, ...series.flatMap((s) => [s.rx ?? 0, s.tx ?? 0]));
  // CPU: ambang dari rata-rata 5 menit (sama dengan status), angka tetap nilai terakhir.
  const cpuHigh = !error && isHigh("cpu", sustained(data, "cpu"));
  const row = (label: string, kind: "cpu" | "mem", v: number | null | undefined) => {
    const high = kind === "cpu" ? cpuHigh : isHigh(kind, v);
    return (
      <>
        <dt>{label}</dt>
        <dd
          className={cn("text-right tabular-nums", high && "font-semibold")}
          data-testid={`server-${kind}`}
          data-high={high || undefined}
        >
          {pct(v)}
          {high && <span className="sr-only"> (tinggi)</span>}
        </dd>
        <dd aria-hidden>
          <Sparkline
            series={[
              {
                values: series.map((s) => s[kind]),
                className: high ? "text-warning" : "text-chart-1",
              },
            ]}
          />
        </dd>
      </>
    );
  };
  const diskHigh = isHigh("disk", p?.disk);

  return (
    <section
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="server-card"
      data-level={status.level}
      className="rounded-md border bg-background/50 p-2.5 text-xs text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={titleId} className="text-xs font-semibold">
          Server
          {p && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              {clock(p.t)} <abbr title="Waktu Indonesia Barat">WIB</abbr>
            </span>
          )}
        </h2>
        {isAdmin && (
          <Link
            href="/admin/sumber-daya"
            className="rounded-sm text-xs font-medium text-sidebar-primary underline-offset-2 hover:underline"
            data-testid="server-card-detail"
          >
            Detail<span className="sr-only"> pemakaian server</span>
          </Link>
        )}
      </div>
      {/* aria-live (bukan role=status): diumumkan saat berubah seperti status, tanpa menambah wilayah "status"
          global di setiap halaman yang bersaing dengan status milik halaman itu sendiri. */}
      <p
        aria-live="polite"
        aria-atomic="true"
        className="mt-1 flex items-start gap-1.5"
        data-testid="server-status"
      >
        <StatusIcon
          size={14}
          stroke={2}
          aria-hidden
          className={cn("mt-px shrink-0", LEVEL_TEXT[status.level])}
        />
        {/* Dua baris paling banyak: status gabungan (mis. pemroses mati + data tidak tersedia) tetap terbaca. */}
        <span className="line-clamp-2" title={status.text}>
          {status.text}
        </span>
      </p>
      {p && (
        <dl className="mt-2 grid grid-cols-[auto_2.75rem_1fr] items-center gap-x-2 gap-y-1">
          {row("CPU", "cpu", p.cpu)}
          {row("RAM", "mem", p.mem)}
          <dt>Disk</dt>
          <dd
            className={cn("text-right tabular-nums", diskHigh && "font-semibold")}
            data-testid="server-disk"
            data-high={diskHigh || undefined}
          >
            {pct(p.disk)}
            {diskHigh && <span className="sr-only"> (tinggi)</span>}
          </dd>
          <dd aria-hidden>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", diskHigh ? "bg-warning" : "bg-chart-1")}
                style={{ width: `${Math.round((p.disk ?? 0) * 100)}%` }}
              />
            </div>
          </dd>
          <dt>Jaringan</dt>
          <dd
            className="col-span-2 flex flex-wrap items-center gap-x-2 tabular-nums"
            data-testid="server-net"
          >
            <span className="flex items-center gap-0.5 whitespace-nowrap">
              <IconArrowDown size={12} aria-hidden className="text-chart-1" />
              <span className="sr-only">masuk </span>
              {rate(p.rx)}
            </span>
            <span className="flex items-center gap-0.5 whitespace-nowrap">
              <IconArrowUp size={12} aria-hidden className="text-chart-2" />
              <span className="sr-only">keluar </span>
              {rate(p.tx)}
            </span>
          </dd>
          <dd className="col-span-3" aria-hidden>
            <Sparkline
              max={rxMax}
              series={[
                { values: series.map((s) => s.rx), className: "text-chart-1" },
                { values: series.map((s) => s.tx), className: "text-chart-2" },
              ]}
            />
          </dd>
        </dl>
      )}
      <p
        className={cn(
          "mt-2 border-t pt-1.5 text-muted-foreground",
          data.queue?.workerDown && "font-medium text-destructive",
        )}
        data-testid="server-queue"
      >
        {queueText(error ? null : data.queue)}
      </p>
    </section>
  );
}
