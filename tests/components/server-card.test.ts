import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ServerCardView } from "@/components/metrics/server-card";
import { linePath } from "@/components/metrics/sparkline";
import { pct, rate, size, stats, statusOf, sustained } from "@/features/metrics/format";
import { adminOf, summaryOf, type MetricsSummary } from "@/features/metrics/view";
import { hostPoint, readHost, type HostPoint } from "@/lib/metrics/host";

/*
 * v1.18 monitor sumber daya: format angka, status gabungan (prioritas data hilang → pemroses mati → beban
 * tinggi), bentuk respons ringkasan (tanpa mount/antarmuka/jumlah worker), garis mini (null memutus garis),
 * dan kartu sidebar (teks menyertai warna, ikon saat diciutkan).
 */
const A = readFileSync("tests/fixtures/node-exporter/ne1.prom", "utf8");
const B = readFileSync("tests/fixtures/node-exporter/ne2.prom", "utf8");
const MOUNTS = ["/", "/var/lib/docker", "/data"];
// Angka dasar tetap (fixture diambil dari sandbox yang disknya hampir penuh).
const host: HostPoint = {
  ...hostPoint(readHost(A, 0, MOUNTS), readHost(B, 10_000, MOUNTS)),
  cpu: 0.2,
  iowait: 0.01,
  mem: 0.5,
  disk: 0.4,
};

const view = (over: Partial<HostPoint> = {}, workers: number | null = 1) => ({
  available: true,
  latest: { ...host, ...over },
  series: [host, { ...host, ...over }],
  queue: { t: 10_000, waiting: 2, active: 1, workers },
});

describe("format", () => {
  it("persen, laju, ukuran; nilai tidak diketahui → tanda pisah", () => {
    expect([pct(0.234), pct(null), pct(1)]).toEqual(["23%", "–", "100%"]);
    expect([rate(512), rate(1536), rate(5 * 1024 ** 2), rate(null)]).toEqual([
      "512 B/dtk",
      "1,5 KB/dtk",
      "5 MB/dtk",
      "–",
    ]);
    expect([
      size(16 * 1024 ** 3),
      size(1.5 * 1024 ** 3),
      size(300 * 1024 ** 2),
      size(3 * 1024 ** 3),
    ]).toEqual(["16 GB", "1,5 GB", "300 MB", "3 GB"]);
    expect(stats([0.2, null, 0.6])).toEqual({ avg: 0.4, peak: 0.6 });
    expect(stats([null])).toBeNull();
  });

  it("status: data hilang → pemroses mati → beban tinggi → normal", () => {
    const s = summaryOf(view(), true);
    expect(statusOf(s)).toEqual({ level: "ok", text: "Normal" });
    expect(statusOf(summaryOf(view({ cpu: 0.9, disk: 0.95 }), true)).text).toBe(
      "Beban tinggi: CPU, disk",
    );
    expect(statusOf(summaryOf(view({ iowait: 0.4 }), true)).level).toBe("warn");
    expect(statusOf(summaryOf(view({ cpu: 0.99 }, 0), true))).toEqual({
      level: "down",
      text: "Pemroses unggahan tidak aktif",
    });
    expect(statusOf({ ...s, available: false }).level).toBe("unknown");
    // Pemroses mati tetap terlihat walau data host hilang (exporter/relay bermasalah).
    expect(statusOf({ ...summaryOf(view({}, 0), true), available: false })).toEqual({
      level: "down",
      text: "Pemroses unggahan tidak aktif · data server tidak tersedia",
    });
    // Monitor dimatikan → tidak pernah "tersedia" walau Redis masih menyimpan titik lama.
    expect(summaryOf(view(), false).available).toBe(false);
  });
});

describe("ambang CPU rata-rata 5 menit", () => {
  const at = (t: number, cpu: number) => ({ ...host, t, cpu });
  it("lonjakan sesaat tidak memicu Beban tinggi; beban bertahan memicu; titik > 5 menit diabaikan", () => {
    const base = 10_000_000;
    const spike = summaryOf(
      {
        available: true,
        latest: at(base, 0.95),
        series: [at(base - 60_000, 0.3), at(base - 30_000, 0.3), at(base, 0.95)],
        queue: null,
      },
      true,
    );
    expect(sustained(spike, "cpu")).toBeCloseTo((0.3 + 0.3 + 0.95) / 3, 9);
    expect(statusOf(spike).level).toBe("ok");
    const busy = summaryOf(
      {
        available: true,
        latest: at(base, 0.9),
        series: [at(base - 6 * 60_000, 0.1), at(base - 120_000, 0.88), at(base, 0.9)],
        queue: null,
      },
      true,
    );
    expect(sustained(busy, "cpu")).toBeCloseTo(0.89, 9);
    expect(statusOf(busy).text).toBe("Beban tinggi: CPU");
  });
});

describe("bentuk respons", () => {
  it("ringkasan semua user: tanpa mount, nama antarmuka, atau jumlah worker", () => {
    const s = summaryOf(view({}, 3), true);
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/mount|disks|eth0|"workers"|hostname/);
    expect(s.queue).toEqual({ waiting: 2, active: 1, workerDown: false });
    expect(Object.keys(s.series[0]!).sort()).toEqual([
      "cpu",
      "disk",
      "iowait",
      "mem",
      "rx",
      "t",
      "tx",
    ]);
    // Jumlah worker tidak diketahui (null) ≠ mati.
    expect(summaryOf(view({}, null), true).queue!.workerDown).toBe(false);
  });

  it("admin: + host (disk per mount), 24 jam, layanan, jumlah worker", () => {
    const a = adminOf({ ...view({}, 2), day: [host], services: [] }, true);
    expect(a.workers).toBe(2);
    expect(a.host!.disks.map((d) => d.mount)).toEqual(["/"]);
    expect(a.day).toHaveLength(1);
  });
});

describe("linePath", () => {
  it("null memutus garis; nilai dibatasi 0..max; deret kosong → path kosong", () => {
    expect(linePath([0, 0.5, null, 1], 1, 10)).toBe("M0.00 10.00L33.33 5.00M100.00 0.00");
    expect(linePath([2], 1, 10)).toBe("M50.00 0.00");
    expect(linePath([], 1, 10)).toBe("");
    expect(linePath([1], 0, 10)).toBe("");
  });
});

describe("ServerCardView", () => {
  const render = (data: MetricsSummary, opts: { collapsed?: boolean; error?: boolean } = {}) =>
    renderToStaticMarkup(
      createElement(ServerCardView, {
        data,
        error: opts.error ?? false,
        collapsed: opts.collapsed,
        isAdmin: false,
      }),
    );

  it("angka + status + antrean; nilai tinggi ditandai teks, bukan warna saja; tanpa tautan admin", () => {
    const html = render(summaryOf(view({ cpu: 0.9 }), true));
    expect(html).toContain("Beban tinggi: CPU");
    expect(html).toContain('90%<span class="sr-only"> (tinggi)</span>');
    expect(html).toContain("Pemroses: aktif · 1 unggahan diproses, 2 unggahan menunggu");
    expect(html).not.toContain("/admin/sumber-daya");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).not.toContain('role="status"'); // tidak bersaing dengan status milik halaman
  });

  it("diciutkan → satu tombol ikon berlabel status; galat → tidak tersedia", () => {
    const html = render(summaryOf(view({}, 0), true), { collapsed: true });
    expect(html).toContain(
      'aria-label="Server: Pemroses unggahan tidak aktif, CPU 20%, RAM 50%, 1 proses berjalan. Lebarkan sidebar untuk detail"',
    );
    expect(html).not.toContain("<dl");
    const err = render(summaryOf(view(), true), { error: true });
    expect(err).toContain("Data server gagal dimuat");
    expect(err).toContain("Pemroses: status tidak diketahui");
  });
});
