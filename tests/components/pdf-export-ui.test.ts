import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appliedFiltersOf,
  publishAppliedFilters,
  resetAppliedFilters,
  withdrawAppliedFilters,
} from "@/components/dashboards/filters/applied-store";
import type { FilterState } from "@/components/dashboards/filters/filter-model";
import {
  dashboardExportTarget,
  EXPORT_IDLE,
  exportAnnouncement,
  exportError,
  exportReducer,
  type ExportEvent,
  type ExportJob,
} from "@/components/widgets/export-model";
import { ExportStatus } from "@/components/widgets/export-status";
import {
  dispatchExport,
  exportJobOf,
  exportKey,
  resetExportStore,
} from "@/components/widgets/export-store";
import { ExportUserProvider } from "@/components/widgets/export-user";
import { useExportJob } from "@/components/widgets/use-export-job";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const { DashboardPdfExport, DashboardPdfWatch, pdfExportBody } =
  await import("@/components/dashboards/dashboard-pdf-export");

/*
 * T-018 D9/D10: tombol "Ekspor PDF" di kepala halaman. Status filter yang diterapkan diterbitkan kanvas
 * per dashboard; body PDF; mesin status ekspor T-017 dengan sasaran dashboard (terpisah dari ekspor
 * widget, tetap per user); teks per keadaan termasuk kode galat yang TERLIHAT (AC3).
 */
const D = "cmv4kljx40009oczvdmpurrs1";
const TARGET = dashboardExportTarget(D);
const FILTERS: FilterState = {
  filters: [{ column: "Cabang", op: "in", values: ["Jakarta"] }],
};
const run = (events: ExportEvent[], from: ExportJob = EXPORT_IDLE) =>
  events.reduce(exportReducer, from);
const pdfRunning = run([
  { type: "start", format: "pdf" },
  { type: "created", id: "p1" },
]);
const status = (job: ExportJob, showCode = true) =>
  renderToStaticMarkup(
    createElement(ExportStatus, {
      job,
      pollError: false,
      onRetryPoll: () => {},
      onAgain: () => {},
      showCode,
    }),
  );

describe("store filter yang diterapkan (D9)", () => {
  beforeEach(resetAppliedFilters);

  it("terbit → terbaca per dashboard; dashboard lain kosong", () => {
    publishAppliedFilters(D, FILTERS);
    expect(appliedFiltersOf(D)).toBe(FILTERS);
    expect(appliedFiltersOf("lain")).toBeNull();
  });

  it("tarik hanya bila entri masih milik pemanggil (provider baru sudah terbit lebih dulu)", () => {
    const old: FilterState = { filters: [] };
    publishAppliedFilters(D, old);
    publishAppliedFilters(D, FILTERS); // kanvas mode baru terpasang
    withdrawAppliedFilters(D, old); // kanvas lama dilepas sesudahnya
    expect(appliedFiltersOf(D)).toBe(FILTERS);
    withdrawAppliedFilters(D, FILTERS);
    expect(appliedFiltersOf(D)).toBeNull();
  });
});

describe("pdfExportBody", () => {
  it("status yang diterapkan didahulukan dari ?f= (juga yang terlalu panjang untuk URL)", () => {
    const url = JSON.stringify({ filters: [{ column: "Kota", op: "in", values: ["Bogor"] }] });
    expect(pdfExportBody(D, FILTERS, url)).toEqual({
      dashboardId: D,
      format: "pdf",
      f: JSON.stringify(FILTERS),
    });
  });

  it("kanvas belum menerbitkan → ?f=; tanpa filter → tanpa f (skema ketat server)", () => {
    const url = JSON.stringify(FILTERS);
    expect(pdfExportBody(D, null, url)).toEqual({ dashboardId: D, format: "pdf", f: url });
    expect(pdfExportBody(D, null, null)).toEqual({ dashboardId: D, format: "pdf" });
    expect(pdfExportBody(D, { filters: [] }, url)).toEqual({ dashboardId: D, format: "pdf" });
    expect(pdfExportBody(D, null, "{rusak")).toEqual({ dashboardId: D, format: "pdf" });
  });
});

describe("kunci store: PDF dashboard terpisah dari ekspor widget, tetap per user", () => {
  beforeEach(resetExportStore);

  it("PDF dan ekspor widget di dashboard yang sama tidak saling menimpa", () => {
    const pdf = exportKey("u1", TARGET);
    const widget = exportKey("u1", "w1");
    expect(pdf).toBe(`u1:dashboard:${D}`);
    dispatchExport(pdf, { type: "start", format: "pdf" });
    expect(exportJobOf(pdf)).toMatchObject({ phase: "starting", format: "pdf" });
    expect(exportJobOf(widget)).toBe(EXPORT_IDLE);
    dispatchExport(widget, { type: "start", format: "csv" });
    expect(exportJobOf(pdf)).toMatchObject({ format: "pdf" });
  });

  it("PDF user A tidak terlihat oleh user B", () => {
    dispatchExport(exportKey("user-a", TARGET), { type: "start", format: "pdf" });
    expect(exportJobOf(exportKey("user-b", TARGET))).toBe(EXPORT_IDLE);
  });
});

describe("pemetaan keadaan PDF", () => {
  it("berjalan: 'Menyiapkan PDF…' di wilayah status", () => {
    const out = status(pdfRunning);
    expect(out).toContain('role="status"');
    expect(out).toContain("Menyiapkan PDF…");
    expect(out).toContain("Panel boleh ditutup");
  });

  it("selesai: tanpa jumlah baris, hanya batas berlaku + 'Unduh lagi'", () => {
    const done = exportReducer(pdfRunning, {
      type: "status",
      id: "p1",
      view: { state: "done", rows: 6, expiresAt: "2026-10-16T08:00:00.000Z" },
    });
    const out = status(done);
    expect(out).toContain("Siap diunduh");
    expect(out).toContain("berlaku sampai 15.00 WIB");
    expect(out).not.toContain("baris");
    expect(out).toContain("Unduh lagi");
  });

  it("AC3: renderer mati saat buat (503) → RENDERER_UNAVAILABLE terlihat sebagai teks + data-code", () => {
    const failed = run([
      { type: "start", format: "pdf" },
      { type: "rejected", status: 503, code: "RENDERER_UNAVAILABLE" },
    ]);
    expect(failed).toMatchObject({ phase: "error", error: { code: "RENDERER_UNAVAILABLE" } });
    const out = status(failed);
    expect(out).toContain('data-code="RENDERER_UNAVAILABLE"');
    expect(out).toContain('role="alert"');
    expect(out).toContain("Layanan pembuat PDF sedang tidak tersedia");
    expect(out).toMatch(/data-testid="export-error-code">Kode: (<!-- -->)?RENDERER_UNAVAILABLE</);
  });

  it("renderer mati setelah masuk antrean (status failed dari worker) → kode yang sama", () => {
    const failed = exportReducer(pdfRunning, {
      type: "status",
      id: "p1",
      view: { state: "failed", code: "RENDERER_UNAVAILABLE" },
    });
    expect(status(failed)).toMatch(/Kode: (<!-- -->)?RENDERER_UNAVAILABLE/);
  });

  it("setiap kode galat tampil sebagai teks; ekspor widget tetap tanpa baris kode", () => {
    for (const code of ["EXPORT_BUSY", "RATE_LIMITED", "EXPORT_TIMEOUT", "OFFLINE"]) {
      const job = run([
        { type: "start", format: "pdf" },
        { type: "rejected", status: code === "OFFLINE" ? 0 : 429, code },
      ]);
      expect(status(job)).toMatch(new RegExp(`Kode: (<!-- -->)?${code}`));
    }
    const widget = run([
      { type: "start", format: "csv" },
      { type: "rejected", status: 429, code: "RATE_LIMITED" },
    ]);
    expect(status(widget, false)).not.toContain("Kode:");
  });

  it("teks PDF: dashboard (bukan widget) dicabut, batas ukuran tanpa saran baris; pesan server didahulukan", () => {
    expect(exportError("NOT_FOUND", undefined, "pdf").message).toContain("Dashboard ini");
    expect(exportError("NOT_FOUND").message).toContain("Widget ini");
    const big = exportError("EXPORT_TOO_LARGE", undefined, "pdf");
    expect(big.message).toContain("PDF melebihi batas ukuran");
    expect(big.hint).toBeUndefined();
    expect(exportError("RENDERER_UNAVAILABLE", "Renderer penuh.", "pdf").message).toBe(
      "Renderer penuh.",
    );
  });

  it("pengumuman panel tertutup", () => {
    expect(exportAnnouncement(pdfRunning, "")).toBe("Menyiapkan PDF…");
    const failed = run([
      { type: "start", format: "pdf" },
      { type: "rejected", status: 503, code: "RENDERER_UNAVAILABLE" },
    ]);
    expect(exportAnnouncement(failed, "")).toBe("Ekspor PDF gagal. Buka Ekspor PDF untuk detail.");
  });
});

describe("tombol kepala halaman", () => {
  beforeEach(resetExportStore);
  // Provider dipanggil sebagai fungsi di dalam pembungkus (pola export-review-r2 / sharing-review-r3).
  const page = (userId: string, children: ReactNode) =>
    renderToStaticMarkup(createElement(() => ExportUserProvider({ userId, children })));
  const button = () => page("u1", createElement(DashboardPdfExport, { dashboardId: D }));

  it("diam: 'Ekspor PDF' dengan ikon PDF, panel tertutup, tanpa pengumuman", () => {
    const out = button();
    expect(out).toContain('data-testid="dashboard-pdf-export"');
    expect(out).toContain("Ekspor PDF");
    expect(out).toContain("tabler-icon-file-type-pdf");
    expect(out).toContain('aria-haspopup="dialog"');
    expect(out).not.toContain("animate-spin");
  });

  it("HTML server selalu diam (snapshot server store): ekspor di tab ini tidak ikut hidrasi", () => {
    // Ikon berputar / titik galat / pengumuman saat panel tertutup dibaca dari store di klien
    // (useSyncExternalStore); teksnya diuji di "pemetaan keadaan PDF" dan dicek di browser.
    const key = exportKey("u1", TARGET);
    dispatchExport(key, { type: "start", format: "pdf" });
    dispatchExport(key, { type: "rejected", status: 503, code: "RENDERER_UNAVAILABLE" });
    const out = button();
    expect(out).not.toContain("animate-spin");
    expect(out).not.toContain("Ekspor PDF gagal");
  });
});

describe("pemantau tanpa tombol (mode edit, review R1-CL-1)", () => {
  beforeEach(resetExportStore);
  const watch = (userId = "u1") =>
    renderToStaticMarkup(
      createElement(() =>
        ExportUserProvider({
          userId,
          children: createElement(DashboardPdfWatch, { dashboardId: D }),
        }),
      ),
    );

  it("tanpa tombol/kontrol: hanya wilayah status tersembunyi, diam saat dipasang", () => {
    // Keadaan saat dipasang (mis. PDF yang sedang dibuat) sudah diumumkan di mode lihat.
    const key = exportKey("u1", TARGET);
    dispatchExport(key, { type: "start", format: "pdf" });
    dispatchExport(key, { type: "created", id: "p1" });
    const out = watch();
    expect(out).toBe(
      '<span role="status" class="sr-only" data-testid="dashboard-pdf-watch"></span>',
    );
    expect(out).not.toContain("<button");
  });
});

describe("useExportJob dengan sasaran dashboard", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    resetExportStore();
    refresh.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  function hook(onAccessLost?: () => void) {
    let api: ReturnType<typeof useExportJob> | null = null;
    function Probe() {
      api = useExportJob(TARGET, onAccessLost);
      return null;
    }
    renderToStaticMarkup(
      createElement(() => ExportUserProvider({ userId: "u1", children: createElement(Probe) })),
    );
    return api!;
  }

  it("POST body PDF; ekspor tercatat di kunci dashboard", async () => {
    fetchMock.mockResolvedValue({ status: 202, json: async () => ({ ok: true, exportId: "p9" }) });
    await hook().start(pdfExportBody(D, FILTERS, null));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/exports");
    expect(JSON.parse(init.body as string)).toEqual({
      dashboardId: D,
      format: "pdf",
      f: JSON.stringify(FILTERS),
    });
    expect(exportJobOf(exportKey("u1", TARGET))).toMatchObject({
      phase: "running",
      format: "pdf",
      id: "p9",
    });
  });

  it("503 RENDERER_UNAVAILABLE langsung jadi galat (tanpa polling)", async () => {
    fetchMock.mockResolvedValue({
      status: 503,
      json: async () => ({ ok: false, code: "RENDERER_UNAVAILABLE", message: "" }),
    });
    await hook().start({ dashboardId: D, format: "pdf" });
    expect(exportJobOf(exportKey("u1", TARGET))).toMatchObject({
      phase: "error",
      format: "pdf",
      error: { code: "RENDERER_UNAVAILABLE" },
    });
  });

  it("404 saat buat (akses dicabut) → onAccessLost halaman (di luar kanvas)", async () => {
    fetchMock.mockResolvedValue({
      status: 404,
      json: async () => ({ ok: false, code: "NOT_FOUND", message: "x" }),
    });
    const lost = vi.fn();
    await hook(lost).start({ dashboardId: D, format: "pdf" });
    expect(lost).toHaveBeenCalledTimes(1);
    expect(exportJobOf(exportKey("u1", TARGET))).toMatchObject({
      error: { code: "NOT_FOUND", message: expect.stringContaining("Dashboard ini") },
    });
  });
});
