import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXPORT_HIDE, HeadExport } from "@/components/dashboards/widget-card-head";
import { chartOf } from "@/components/dashboards/widget-card-model";
import {
  EXPIRY_MARGIN_MS,
  EXPORT_IDLE,
  exportReducer,
  recheckOutcome,
  type ExportEvent,
  type ExportJob,
} from "@/components/widgets/export-model";
import { ExportStatus, NEWS_ATTR } from "@/components/widgets/export-status";
import {
  claimDownload,
  dispatchExport,
  exportJobOf,
  resetExportStore,
  subscribeExport,
} from "@/components/widgets/export-store";

/*
 * Review T-017 putaran 1 (UI): CL-1 ekspor bertahan saat kartu dipasang ulang (store per widget,
 * unduhan otomatis sekali per ekspor), CL-3 "Unduh lagi" membaca status dulu, R1-D-1/CL-4 batas
 * tombol ekspor per isi kepala kartu, R1-D-2 penanda isi baru untuk gulir menu.
 */
const created = (id: string, format: "csv" | "xlsx" = "csv"): ExportEvent[] => [
  { type: "start", format },
  { type: "created", id },
];
const doneEvent = (id: string): ExportEvent => ({
  type: "status",
  id,
  view: { state: "done", rows: 3, expiresAt: "2026-10-16T10:00:00.000Z" },
});
const feed = (widgetId: string, events: ExportEvent[]) =>
  events.forEach((e) => dispatchExport(widgetId, e));

describe("export-store (CL-1)", () => {
  beforeEach(resetExportStore);

  it("kosong = idle; snapshot stabil sampai ada perubahan", () => {
    expect(exportJobOf("w1")).toBe(EXPORT_IDLE);
    feed("w1", created("e1"));
    const a = exportJobOf("w1");
    expect(a).toMatchObject({ phase: "running", id: "e1" });
    expect(exportJobOf("w1")).toBe(a);
  });

  it("kartu dipasang ulang: membaca ekspor berjalan yang sama (polling dilanjutkan)", () => {
    feed("w1", created("e1"));
    // Kartu lama dilepas (tidak ada pelanggan), kartu baru membaca store.
    expect(exportJobOf("w1")).toMatchObject({ phase: "running", id: "e1", format: "csv" });
  });

  it("jawaban POST yang tiba setelah kartu dilepas tetap mendarat di store", () => {
    dispatchExport("w1", { type: "start", format: "xlsx" });
    const off = subscribeExport("w1", () => {});
    off(); // kartu dilepas saat POST berjalan
    dispatchExport("w1", { type: "created", id: "e9" });
    expect(exportJobOf("w1")).toMatchObject({ phase: "running", id: "e9", format: "xlsx" });
  });

  it("unduhan otomatis sekali per ekspor, lintas pemasangan ulang", () => {
    feed("w1", created("e1"));
    expect(claimDownload("w1", "e1")).toBe(false); // belum selesai
    dispatchExport("w1", doneEvent("e1"));
    expect(claimDownload("w1", "e1")).toBe(true); // pemasangan yang membaca "done"
    expect(claimDownload("w1", "e1")).toBe(false); // pemasangan berikutnya / onDone kedua
    expect(exportJobOf("w1")).toMatchObject({ phase: "done", id: "e1" });
  });

  it("selesai saat kartu dilepas: pemasangan berikutnya mengunduh tepat sekali", () => {
    feed("w1", created("e1"));
    // Kartu dilepas; polling kartu baru membaca "done".
    dispatchExport("w1", doneEvent("e1"));
    const claims = [
      claimDownload("w1", "e1"),
      claimDownload("w1", "e1"),
      claimDownload("w1", "e1"),
    ];
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("ekspor baru di widget yang sama punya klaim sendiri; id lama tidak bisa diklaim", () => {
    feed("w1", [...created("e1"), doneEvent("e1")]);
    expect(claimDownload("w1", "e1")).toBe(true);
    feed("w1", [...created("e2", "xlsx"), doneEvent("e2")]);
    expect(claimDownload("w1", "e1")).toBe(false);
    expect(claimDownload("w1", "e2")).toBe(true);
    expect(claimDownload("w1", "e2")).toBe(false);
  });

  it("widget saling terpisah", () => {
    feed("w1", created("e1"));
    expect(exportJobOf("w2")).toBe(EXPORT_IDLE);
    feed("w2", [...created("e2"), doneEvent("e2")]);
    expect(claimDownload("w1", "e2")).toBe(false);
    expect(claimDownload("w2", "e2")).toBe(true);
  });

  it("pelanggan diberi tahu hanya saat status berubah, dan hanya untuk widgetnya", () => {
    const n1 = vi.fn();
    const n2 = vi.fn();
    const off1 = subscribeExport("w1", n1);
    subscribeExport("w2", n2);
    feed("w1", created("e1"));
    expect(n1).toHaveBeenCalledTimes(2);
    dispatchExport("w1", { type: "start", format: "xlsx" }); // diabaikan reducer (sedang berjalan)
    dispatchExport("w1", { type: "status", id: "lain", view: { state: "done" } });
    expect(n1).toHaveBeenCalledTimes(2);
    expect(n2).not.toHaveBeenCalled();
    off1();
    dispatchExport("w1", doneEvent("e1"));
    expect(n1).toHaveBeenCalledTimes(2);
  });
});

describe("recheckOutcome — 'Unduh lagi' (CL-3)", () => {
  const now = Date.parse("2026-10-16T09:00:00.000Z");
  const at = (ms: number) => new Date(now + ms).toISOString();

  it("selesai dan belum kedaluwarsa → unduh", () => {
    const view = { state: "done", expiresAt: at(10 * 60_000) } as const;
    expect(recheckOutcome(200, view, now)).toEqual({ kind: "download" });
    expect(recheckOutcome(200, { state: "done" }, now)).toEqual({ kind: "download" });
  });

  it("selesai tetapi lewat expiresAt (margin klien) → kedaluwarsa + Ekspor lagi", () => {
    const view = { state: "done", expiresAt: at(EXPIRY_MARGIN_MS) } as const;
    expect(recheckOutcome(200, view, now)).toEqual({
      kind: "error",
      code: "EXPORT_EXPIRED",
      accessLost: false,
    });
  });

  it("kedaluwarsa / 410 → EXPORT_EXPIRED", () => {
    const expired = { kind: "error", code: "EXPORT_EXPIRED", accessLost: false };
    expect(recheckOutcome(200, { state: "expired", code: "EXPORT_EXPIRED" }, now)).toEqual(expired);
    expect(recheckOutcome(410, null, now)).toEqual(expired);
  });

  it("gagal → kode + pesan server; tanpa kode → EXPORT_FAILED", () => {
    const view = { state: "failed", code: "EXPORT_TIMEOUT", message: "Lewat 10 menit." } as const;
    expect(recheckOutcome(200, view, now)).toEqual({
      kind: "error",
      code: "EXPORT_TIMEOUT",
      message: "Lewat 10 menit.",
      accessLost: false,
    });
    expect(recheckOutcome(200, { state: "failed" }, now)).toMatchObject({ code: "EXPORT_FAILED" });
  });

  it("404 → akses dicabut: NOT_FOUND + halaman diambil ulang (seperti membuat ekspor)", () => {
    expect(recheckOutcome(404, null, now)).toEqual({
      kind: "error",
      code: "NOT_FOUND",
      accessLost: true,
    });
  });

  it("401 sesi; 403 ekspor hilang", () => {
    expect(recheckOutcome(401, null, now)).toMatchObject({ code: "SESSION", accessLost: false });
    expect(recheckOutcome(403, null, now)).toMatchObject({ code: "EXPORT_GONE" });
  });

  it("jaringan / 5xx / 429 / JSON rusak → coba lagi, tautan tetap", () => {
    for (const status of [0, 500, 503, 429]) {
      expect(recheckOutcome(status, null, now)).toEqual({ kind: "retry" });
    }
    expect(recheckOutcome(200, null, now)).toEqual({ kind: "retry" });
  });

  it("reducer: recheck memindahkan 'selesai' ke galat; id lain / fase lain diabaikan", () => {
    const run = (events: ExportEvent[], from: ExportJob = EXPORT_IDLE) =>
      events.reduce(exportReducer, from);
    const done = run([...created("e1", "xlsx"), doneEvent("e1")]);
    const lost = exportReducer(done, { type: "recheck", id: "e1", code: "EXPORT_EXPIRED" });
    expect(lost).toMatchObject({ phase: "error", format: "xlsx", error: { again: true } });
    expect(exportReducer(done, { type: "recheck", id: "x", code: "NOT_FOUND" })).toBe(done);
    const running = run(created("e1"));
    expect(exportReducer(running, { type: "recheck", id: "e1", code: "NOT_FOUND" })).toBe(running);
    const gone = exportReducer(done, { type: "recheck", id: "e1", code: "NOT_FOUND" });
    expect(gone).toMatchObject({ phase: "error", error: { code: "NOT_FOUND", again: false } });
  });
});

describe("markup 'Unduh lagi' dan penanda gulir (CL-3, R1-D-2)", () => {
  const done = [...created("e1"), doneEvent("e1")].reduce(exportReducer, EXPORT_IDLE);
  const status = (again?: "idle" | "checking" | "failed") =>
    renderToStaticMarkup(
      createElement(ExportStatus, {
        job: done,
        pollError: false,
        onRetryPoll: () => {},
        onAgain: () => {},
        again,
      }),
    );

  it("tombol (bukan tautan unduh): klik membaca status dulu", () => {
    const html = status();
    expect(html).toMatch(/<button[^>]*data-testid="export-download"/);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain('aria-busy="true"');
    expect(html).toContain("Unduh lagi");
    expect(html).toContain(NEWS_ATTR);
  });

  it("membaca status: tetap fokusabel, aria-busy + aria-disabled (tanpa disabled)", () => {
    const html = status("checking");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/<button[^>]*data-testid="export-download"[^>]* disabled=""/);
  });

  it("status tidak terbaca: catatan role=alert, tombol tetap", () => {
    const html = status("failed");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Tautan belum bisa diperiksa");
    expect(html).toContain('data-testid="export-download"');
  });
});

describe("batas tombol ekspor per isi kepala kartu (R1-D-1, CL-4)", () => {
  const head = (type: "kpi" | "table" | "bar" | "line" | "pie", editing: boolean) =>
    renderToStaticMarkup(
      createElement(HeadExport, {
        widgetId: "w1",
        type,
        title: "Jumlah transaksi",
        editing,
        request: { current: null },
      }),
    );

  it("KPI/tabel (tanpa tombol data): lihat 7,25rem / 8rem sentuh; edit 11,75rem / 14,5rem", () => {
    for (const type of ["kpi", "table"] as const) {
      expect(chartOf(type)).toBeNull();
      expect(head(type, false)).toContain(EXPORT_HIDE.view.plain);
      expect(head(type, true)).toContain(EXPORT_HIDE.edit.plain);
    }
    expect(EXPORT_HIDE.view.plain).toBe(
      "@max-[7.25rem]:hidden @max-[8rem]:any-pointer-coarse:hidden",
    );
    expect(EXPORT_HIDE.edit.plain).toBe(
      "@max-[11.75rem]:hidden @max-[14.5rem]:any-pointer-coarse:hidden",
    );
  });

  it("grafik (+ tombol data): lihat 9rem / 10,25rem sentuh; edit tetap 14rem / 17,5rem", () => {
    for (const type of ["bar", "line", "pie"] as const) {
      expect(chartOf(type)).toBe(type);
      expect(head(type, false)).toContain(EXPORT_HIDE.view.chart);
      expect(head(type, true)).toContain(EXPORT_HIDE.edit.chart);
    }
  });

  it("kartu bawaan w=4 (bilah samping terbuka) tetap bertombol ekspor", () => {
    // Lebar container terukur (review R1): 768 mouse 147 px; tablet tegak sentuh 820 → 164–165 px,
    // 834 → 169 px; ponsel mendatar 844×390 → 172–173 px. 1rem = 16 px; @max-[x] = lebar < x.
    const px = (cls: string, pointer: "mouse" | "touch") => {
      const m = cls.match(/@max-\[([\d.]+)rem\]:hidden @max-\[([\d.]+)rem\]/)!;
      return Number(pointer === "mouse" ? m[1] : m[2]) * 16;
    };
    const visible = (cls: string, pointer: "mouse" | "touch", width: number) =>
      width >= px(cls, pointer);
    for (const cls of [EXPORT_HIDE.view.plain, EXPORT_HIDE.view.chart]) {
      expect(visible(cls, "mouse", 147)).toBe(true);
      expect(visible(cls, "touch", 164)).toBe(true);
      expect(visible(cls, "touch", 169)).toBe(true);
      expect(visible(cls, "touch", 172)).toBe(true);
    }
    // KPI/tabel di 768 sentuh (147 px) juga; judul tetap ≥ 4rem: 147 − 16 − 4 − 44 = 83 px.
    expect(visible(EXPORT_HIDE.view.plain, "touch", 147)).toBe(true);
    // Judul KPI/tabel tepat di batas ≥ 64 px: 16 padding + 4 gap + tombol.
    expect(px(EXPORT_HIDE.view.plain, "mouse") - 16 - 4 - 32).toBe(64);
    expect(px(EXPORT_HIDE.view.plain, "touch") - 16 - 4 - 44).toBe(64);
  });
});
