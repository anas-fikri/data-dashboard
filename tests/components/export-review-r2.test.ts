import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardTitle, EXPORT_HIDE, NARROW_VIEW } from "@/components/dashboards/widget-card-head";
import { EXPORT_IDLE, exportReducer, type ExportJob } from "@/components/widgets/export-model";
import { AGAIN_ATTR, ExportStatus } from "@/components/widgets/export-status";
import {
  claimDownload,
  dispatchExport,
  exportJobOf,
  exportKey,
  resetExportStore,
  subscribeExport,
} from "@/components/widgets/export-store";
import { ExportUserProvider } from "@/components/widgets/export-user";
import { pollStopped, useExportJob } from "@/components/widgets/use-export-job";

/*
 * Review T-017 putaran 2 (UI): R2-CL-1 store ekspor per user (keluar → masuk sebagai user lain di tab
 * yang sama tidak mewarisi ekspor), R2-CL-2 polling 404 = akses dicabut (refresh + NOT_FOUND tanpa
 * "Ekspor lagi"), R2-D-2 judul grafik dua baris di seluruh rentang tempat tombol data + ekspor tampil.
 * R2-D-1 (gulir fokus saat Tab berputar di menu) diverifikasi di browser: perilaku DOM, bukan markup.
 */
const A = exportKey("user-a", "w1");
const B = exportKey("user-b", "w1");
const doneView = { state: "done", rows: 3, expiresAt: "2026-10-16T10:00:00.000Z" } as const;

describe("R2-CL-1: store ekspor per user", () => {
  beforeEach(resetExportStore);

  it("ekspor user A tidak terlihat oleh user B pada widget yang sama", () => {
    dispatchExport(A, { type: "start", format: "csv" });
    dispatchExport(A, { type: "created", id: "e1" });
    dispatchExport(A, { type: "status", id: "e1", view: doneView });
    expect(exportJobOf(A)).toMatchObject({ phase: "done", id: "e1", rows: 3 });
    expect(exportJobOf(B)).toBe(EXPORT_IDLE);
    // B tidak bisa mengklaim unduhan A; A tetap sekali.
    expect(claimDownload(B, "e1")).toBe(false);
    expect(claimDownload(A, "e1")).toBe(true);
  });

  it("galat dan ekspor berjalan A juga tidak bocor; pelanggan hanya diberi tahu untuk kuncinya", () => {
    const nA = vi.fn();
    const nB = vi.fn();
    subscribeExport(A, nA);
    subscribeExport(B, nB);
    dispatchExport(A, { type: "start", format: "xlsx" });
    dispatchExport(A, { type: "rejected", status: 503 });
    expect(exportJobOf(A)).toMatchObject({ phase: "error" });
    expect(exportJobOf(B)).toBe(EXPORT_IDLE);
    expect(nA).toHaveBeenCalledTimes(2);
    expect(nB).not.toHaveBeenCalled();
  });

  it("kunci = user + widget (widget lain milik user yang sama tetap terpisah)", () => {
    expect(exportKey("u1", "w1")).toBe("u1:w1");
    expect(exportKey("u1", "w2")).not.toBe(exportKey("u1", "w1"));
    expect(exportKey("u2", "w1")).not.toBe(exportKey("u1", "w1"));
  });

  describe("hook membaca id user dari props server (ExportUserProvider)", () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
      fetchMock.mockResolvedValue({
        status: 202,
        json: async () => ({ ok: true, exportId: "e7" }),
      });
      vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    // Hook dijalankan lewat render server; start() lalu dipanggil di luar render.
    function hookFor(userId: string) {
      let api: ReturnType<typeof useExportJob> | null = null;
      function Probe() {
        api = useExportJob("w1");
        return null;
      }
      // Dipanggil sebagai fungsi di dalam pembungkus (pola tes sharing-review-r3).
      function Page() {
        return ExportUserProvider({ userId, children: createElement(Probe) });
      }
      renderToStaticMarkup(createElement(Page));
      return api!;
    }

    it("ekspor yang dimulai user A tersimpan di kunci A, bukan di kunci B", async () => {
      await hookFor("user-a").start({ widgetId: "w1", format: "csv" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(exportJobOf(A)).toMatchObject({ phase: "running", id: "e7", format: "csv" });
      expect(exportJobOf(B)).toBe(EXPORT_IDLE);
      // User B (tab yang sama, sesudah keluar/masuk) bisa memulai ekspornya sendiri.
      await hookFor("user-b").start({ widgetId: "w1", format: "xlsx" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(exportJobOf(B)).toMatchObject({ phase: "running", format: "xlsx" });
    });
  });
});

describe("R2-CL-2: polling 404 = akses dicabut di tengah ekspor", () => {
  beforeEach(resetExportStore);
  const running = (key: string) => {
    dispatchExport(key, { type: "start", format: "csv" });
    dispatchExport(key, { type: "created", id: "e1" });
  };

  it("404 → refresh akses bersama dipanggil dengan id widget + NOT_FOUND tanpa 'Ekspor lagi'", () => {
    running(A);
    const lost = vi.fn(() => true);
    pollStopped(A, { target: "w1", id: "e1" }, 404, lost);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(lost).toHaveBeenCalledWith("w1");
    expect(exportJobOf(A)).toMatchObject({
      phase: "error",
      format: "csv",
      error: {
        code: "NOT_FOUND",
        message: "Widget ini tidak ditemukan atau akses Anda sudah dicabut. Muat ulang halaman.",
        again: false,
      },
    });
  });

  it("401/403/410 tidak memicu refresh akses; kodenya tetap", () => {
    const cases: [number, string, boolean][] = [
      [401, "SESSION", false],
      [403, "EXPORT_GONE", true],
      [410, "EXPORT_EXPIRED", true],
    ];
    for (const [status, code, again] of cases) {
      resetExportStore();
      running(A);
      const lost = vi.fn(() => true);
      pollStopped(A, { target: "w1", id: "e1" }, status, lost);
      expect(lost).not.toHaveBeenCalled();
      expect(exportJobOf(A)).toMatchObject({ phase: "error", error: { code, again } });
    }
  });

  it("di luar kanvas (tanpa penjaga akses) tetap NOT_FOUND; id ekspor lain diabaikan", () => {
    running(A);
    pollStopped(A, { target: "w1", id: "lain" }, 404, null);
    expect(exportJobOf(A)).toMatchObject({ phase: "running", id: "e1" });
    pollStopped(A, { target: "w1", id: "e1" }, 404, null);
    expect(exportJobOf(A)).toMatchObject({ phase: "error", error: { code: "NOT_FOUND" } });
  });

  it("markup: NOT_FOUND dari polling tidak menawarkan 'Ekspor lagi' (403 masih)", () => {
    const stopped = (status: number): ExportJob =>
      [
        { type: "start", format: "csv" } as const,
        { type: "created", id: "e1" } as const,
        { type: "stopped", id: "e1", status } as const,
      ].reduce(exportReducer, EXPORT_IDLE);
    const html = (job: ExportJob) =>
      renderToStaticMarkup(
        createElement(ExportStatus, {
          job,
          pollError: false,
          onRetryPoll: () => {},
          onAgain: () => {},
        }),
      );
    expect(html(stopped(404))).toContain("akses Anda sudah dicabut");
    expect(html(stopped(404))).not.toContain(AGAIN_ATTR);
    expect(html(stopped(403))).toContain(AGAIN_ATTR);
  });
});

describe("R2-D-2: judul kartu grafik dua baris selama tombol data + ekspor tampil", () => {
  const title = (chart: boolean, editing = false) =>
    renderToStaticMarkup(
      createElement(CardTitle, { title: "Omzet per cabang", placeholder: false, editing, chart }),
    );
  // @max-[x] = lebar container < x; 1rem = 16 px.
  const rem = (cls: string, coarse: boolean) => {
    const m = coarse
      ? cls.match(/@max-\[([\d.]+)rem\]:any-pointer-coarse:/)
      : cls.match(/@max-\[([\d.]+)rem\]:(?!any-pointer)/);
    return Number(m![1]) * 16;
  };

  it("grafik memakai aturan dua baris grafik; KPI/tabel tetap < 9rem; mode edit tanpa keduanya", () => {
    const chartHtml = title(true);
    for (const cls of NARROW_VIEW.title.chart) expect(chartHtml).toContain(cls);
    expect(chartHtml).not.toContain("@max-[9rem]:line-clamp-2");
    const plainHtml = title(false);
    for (const cls of NARROW_VIEW.title.plain) expect(plainHtml).toContain(cls);
    expect(plainHtml).not.toContain("@max-[9.5rem]");
    expect(title(true, true)).not.toContain("line-clamp-2");
    expect(chartHtml).toContain('title="Omzet per cabang"');
  });

  it("rentang dua baris grafik mencakup seluruh rentang ekspor grafik sampai judul sebaris ≥ 4rem", () => {
    const twoLine = NARROW_VIEW.title.chart.join(" ");
    const mouse = { twoLine: rem(twoLine, false), export: rem(EXPORT_HIDE.view.chart, false) };
    const touch = { twoLine: rem(twoLine, true), export: rem(EXPORT_HIDE.view.chart, true) };
    expect(mouse).toEqual({ twoLine: 152, export: 144 });
    expect(touch).toEqual({ twoLine: 176, export: 164 });
    // Di batas atas, judul sebaris = 16 padding + 2 × (gap 4 + tombol) lebih sedikit = 64 px.
    expect(mouse.twoLine - 16 - 2 * (4 + 32)).toBe(64);
    expect(touch.twoLine - 16 - 2 * (4 + 44)).toBe(64);
    // Padding kepala dirapatkan di rentang yang sama.
    expect(NARROW_VIEW.head.chart).toBe("@max-[9.5rem]:px-1 @max-[11rem]:any-pointer-coarse:px-1");
  });

  it("kartu bawaan terukur (review R2) jatuh di rentang dua baris dengan tombol ekspor tampil", () => {
    // Lebar container kartu grafik w=4, bilah samping terbuka: 768/777 mouse; 820/834/844 sentuh.
    const twoLine = NARROW_VIEW.title.chart.join(" ");
    const band = (w: number, coarse: boolean) =>
      w >= rem(EXPORT_HIDE.view.chart, coarse) && w < rem(twoLine, coarse);
    for (const w of [147, 150]) expect(band(w, false)).toBe(true);
    for (const w of [164, 165, 169, 173]) expect(band(w, true)).toBe(true);
  });
});
