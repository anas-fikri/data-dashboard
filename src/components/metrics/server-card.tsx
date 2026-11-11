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
import { clock, isHigh, pct, rate, statusOf, type Level } from "@/features/metrics/format";
import type { MetricsSummary } from "@/features/metrics/view";
import { usePolling } from "@/lib/hooks/use-polling";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

/*
 * Kartu "Server" di sidebar (v1.18, ADR-0010) untuk semua user login: CPU, RAM, disk, jaringan, dan status
 * pemroses unggahan, polling 10 dtk (berhenti saat tab tersembunyi — usePolling). Monitor belum dipasang →
 * kartu tidak tampil dan polling berhenti. Sidebar diciutkan → satu ikon status (tombol melebarkan sidebar).
 * Warna selalu disertai teks; status gabungan diumumkan pembaca layar hanya saat berubah (role=status).
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

function queueText(q: MetricsSummary["queue"]): string {
  if (!q) return "Pemroses: status tidak diketahui";
  const parts = [q.workerDown ? "Pemroses: tidak aktif" : "Pemroses: aktif"];
  if (q.active) parts.push(`${q.active.toLocaleString("id-ID")} diproses`);
  if (q.waiting) parts.push(`${q.waiting.toLocaleString("id-ID")} menunggu`);
  if (!q.active && !q.waiting) parts.push("antrean kosong");
  return parts.join(" · ");
}

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
  const status = error
    ? { level: "unknown" as const, text: "Data server gagal dimuat" }
    : statusOf(data);
  const StatusIcon = LEVEL_ICON[status.level];

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onExpand}
        title={`Server: ${status.text}`}
        aria-label={`Server: ${status.text}. Lebarkan sidebar untuk detail`}
        data-testid="server-card-collapsed"
        data-level={status.level}
        className="flex size-10 items-center justify-center rounded-md hover:bg-sidebar-accent"
      >
        <StatusIcon size={20} stroke={1.75} aria-hidden className={LEVEL_TEXT[status.level]} />
      </button>
    );
  }

  const p = error ? null : data.latest;
  const series = error ? [] : data.series;
  const rxMax = Math.max(1, ...series.flatMap((s) => [s.rx ?? 0, s.tx ?? 0]));
  const row = (label: string, kind: "cpu" | "mem", v: number | null | undefined) => {
    const high = isHigh(kind, v);
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
      aria-labelledby="server-card-title"
      data-testid="server-card"
      data-level={status.level}
      className="rounded-md border bg-background/50 p-2.5 text-xs text-sidebar-foreground"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="server-card-title" className="text-xs font-semibold">
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
      <p role="status" className="mt-1 flex items-center gap-1.5" data-testid="server-status">
        <StatusIcon
          size={14}
          stroke={2}
          aria-hidden
          className={cn("shrink-0", LEVEL_TEXT[status.level])}
        />
        <span className="truncate">{status.text}</span>
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
