"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { useState } from "react";
import { LEVEL_ICON, LEVEL_TEXT } from "@/components/metrics/server-card";
import { Sparkline } from "@/components/metrics/sparkline";
import {
  clock,
  cores,
  isHigh,
  pct,
  rate,
  size,
  stats,
  statusOf,
  sustained,
} from "@/features/metrics/format";
import type { MetricsAdmin, SummaryPoint } from "@/features/metrics/view";
import { usePolling } from "@/lib/hooks/use-polling";
import { cn } from "@/lib/utils";

/*
 * Admin › Sumber daya (v1.18, ADR-0010): grafik 1 jam (10 dtk) / 24 jam (1 menit) untuk CPU, RAM, disk, dan
 * jaringan host; rincian disk per mount, beban (load) per inti, swap; pemakaian container app/worker dari
 * cgroup masing-masing; status antrean ingest. Polling 10 dtk (berhenti saat tab tersembunyi). Grafik hiasan
 * (aria-hidden) — angka sekarang/rata-rata/puncak selalu tertulis.
 */
type Response = MetricsAdmin & { ok: boolean };
type Range = "hour" | "day";

function Chart({
  title,
  testId,
  points,
  pick,
  format,
  kind,
  now,
  high: highProp,
}: {
  title: string;
  testId: string;
  points: SummaryPoint[];
  pick: (p: SummaryPoint) => number | null;
  format: (v: number | null | undefined) => string;
  kind?: "cpu" | "mem" | "disk";
  now: number | null | undefined;
  /** Ambang dari luar (CPU: rata-rata 5 menit, sama dengan status); bawaan = nilai sekarang. */
  high?: boolean;
}) {
  const values = points.map(pick);
  const s = stats(values);
  const high = highProp ?? (kind ? isHigh(kind, now) : false);
  const max = kind ? 1 : Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <figure className="flex flex-col gap-2 rounded-lg border bg-card p-4" data-testid={testId}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">{title}</span>
        <span
          className={cn("flex items-center gap-1.5 text-lg tabular-nums", high && "font-semibold")}
        >
          {high && <IconAlertTriangle size={18} aria-hidden className="text-warning" />}
          {format(now)}
          {high && <span className="text-sm font-medium"> (tinggi)</span>}
        </span>
      </figcaption>
      {/* Garis putus-putus atas/bawah = batas skala (100 % atau puncak laju, dan 0). */}
      <div className="border-y border-dashed border-border py-px">
        <Sparkline
          height={64}
          max={max}
          series={[{ values, className: high ? "text-warning" : "text-chart-1" }]}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums" aria-hidden>
        <span>{points[0] ? clock(points[0].t) : ""}</span>
        <span>{points.length ? clock(points[points.length - 1]!.t) : ""}</span>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {s ? `Rata-rata ${format(s.avg)} · puncak ${format(s.peak)}` : "Belum ada riwayat"}
      </p>
    </figure>
  );
}

export function ResourcesPanel() {
  const [range, setRange] = useState<Range>("hour");
  const { data, error } = usePolling<Response>({
    url: "/api/metrics/admin",
    intervalMs: 10_000,
    initial: null,
    done: (d) => !d.enabled,
    immediate: true,
  });

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {error ? "Data server gagal dimuat. Mencoba lagi…" : "Memuat data server…"}
      </p>
    );
  }
  if (!data.enabled) {
    return (
      <div className="rounded-lg border bg-card p-5 text-sm" data-testid="resources-off">
        <p className="font-medium">Monitor sumber daya belum dipasang di server ini.</p>
        <p className="mt-1 text-muted-foreground">
          Pasang container node-exporter dan metrics-relay lalu isi METRICS_NODE_URL (runbook deploy
          §29). Setelah itu kartu &quot;Server&quot; muncul di sidebar semua pengguna.
        </p>
      </div>
    );
  }

  const status = error
    ? { level: "unknown" as const, text: "Data server gagal dimuat" }
    : statusOf(data);
  const StatusIcon = LEVEL_ICON[status.level];
  const h = data.host;
  const points = range === "hour" ? data.series : data.day;
  const perCore = h?.load1 != null && h.cpus ? h.load1 / h.cpus : null;
  const workerRows = data.services.map((s, i, all) => {
    const same = all.filter((x) => x.service === s.service);
    const n = same.indexOf(s) + 1;
    return {
      ...s,
      label: same.length > 1 ? `${s.service} #${n}` : s.service,
      key: `${s.service}-${i}`,
    };
  });

  return (
    <div className="flex flex-col gap-6" data-testid="resources-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Hanya status di live region: jam berubah tiap menit dan tidak perlu diumumkan. */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p role="status" className="flex items-center gap-2" data-testid="resources-status">
            <StatusIcon size={18} stroke={1.75} aria-hidden className={LEVEL_TEXT[status.level]} />
            <span className="font-medium">{status.text}</span>
          </p>
          {h && (
            <span className="text-muted-foreground" data-testid="resources-time">
              · data {clock(h.t)} <abbr title="Waktu Indonesia Barat">WIB</abbr>
            </span>
          )}
        </div>
        <div
          role="group"
          aria-label="Rentang grafik"
          className="inline-flex rounded-md border p-0.5"
        >
          {(
            [
              ["hour", "1 jam"],
              ["day", "24 jam"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
              data-testid={`range-${value}`}
              className={cn(
                "min-h-9 rounded-sm px-3 text-sm",
                range === value
                  ? "bg-accent font-semibold"
                  : "text-muted-foreground hover:bg-accent/60",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Chart
          title="CPU"
          testId="chart-cpu"
          points={points}
          pick={(p) => p.cpu}
          format={pct}
          kind="cpu"
          now={data.latest?.cpu}
          high={!error && isHigh("cpu", sustained(data, "cpu"))}
        />
        <Chart
          title="RAM"
          testId="chart-mem"
          points={points}
          pick={(p) => p.mem}
          format={pct}
          kind="mem"
          now={data.latest?.mem}
        />
        <Chart
          title="Disk (terpenuh)"
          testId="chart-disk"
          points={points}
          pick={(p) => p.disk}
          format={pct}
          kind="disk"
          now={data.latest?.disk}
        />
        <Chart
          title="Jaringan masuk"
          testId="chart-rx"
          points={points}
          pick={(p) => p.rx}
          format={rate}
          now={data.latest?.rx}
        />
      </div>

      <section aria-labelledby="res-host" className="flex flex-col gap-3">
        <h2 id="res-host" className="text-base font-semibold">
          Host
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Beban (load 1 menit)</dt>
            <dd className="tabular-nums" data-testid="res-load">
              {h?.load1 != null
                ? `${h.load1.toFixed(2).replace(".", ",")} untuk ${h.cpus} inti${perCore != null ? ` (${perCore.toFixed(1).replace(".", ",")} per inti)` : ""}`
                : "–"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">CPU menunggu disk (iowait)</dt>
            <dd className="tabular-nums">{pct(h?.iowait)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">RAM terpakai</dt>
            <dd className="tabular-nums">
              {size(h?.memUsed)} dari {size(h?.memTotal)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Swap terpakai</dt>
            <dd className="tabular-nums">
              {h?.swapTotal ? `${size(h.swapUsed)} dari ${size(h.swapTotal)}` : "Tidak ada swap"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Disk sibuk (perangkat tersibuk)</dt>
            <dd className="tabular-nums">{pct(h?.diskBusy)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Jaringan keluar</dt>
            <dd className="tabular-nums">{rate(h?.tx)}</dd>
          </div>
        </dl>
        {h && h.disks.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm" data-testid="res-disks">
              <caption className="sr-only">Pemakaian disk per titik mount</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Mount
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Terpakai
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Ukuran
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Persen
                  </th>
                </tr>
              </thead>
              <tbody>
                {h.disks.map((d) => {
                  const r = d.size > 0 ? d.used / d.size : null;
                  const high = isHigh("disk", r);
                  return (
                    <tr key={d.mount} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{d.mount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{size(d.used)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{size(d.size)}</td>
                      <td
                        className={cn("px-3 py-2 text-right tabular-nums", high && "font-semibold")}
                      >
                        {high && (
                          <IconAlertTriangle
                            size={14}
                            aria-hidden
                            className="mr-1 inline align-[-2px] text-warning"
                          />
                        )}
                        {pct(r)}
                        {high && <span className="font-medium"> (tinggi)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="res-services" className="flex flex-col gap-3">
        <h2 id="res-services" className="text-base font-semibold">
          Layanan dashboard
        </h2>
        <p className="text-sm text-muted-foreground" data-testid="res-queue">
          Pemroses unggahan (worker) aktif: {data.workers ?? "tidak diketahui"}
          {data.queue
            ? ` · ${data.queue.active.toLocaleString("id-ID")} diproses · ${data.queue.waiting.toLocaleString("id-ID")} menunggu`
            : ""}
        </p>
        {workerRows.length ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm" data-testid="res-services-table">
              <caption className="sr-only">Pemakaian CPU dan RAM per container dashboard</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Layanan
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    CPU
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    RAM
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Batas RAM
                  </th>
                </tr>
              </thead>
              <tbody>
                {workerRows.map((s) => (
                  <tr key={s.key} className="border-t">
                    <td className="px-3 py-2">{s.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cores(s.cpu)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{size(s.mem)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.memMax ? `${size(s.memMax)} (${pct(s.mem / s.memMax)})` : "Tanpa batas"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Belum ada laporan dari container app/worker.
          </p>
        )}
      </section>
    </div>
  );
}
