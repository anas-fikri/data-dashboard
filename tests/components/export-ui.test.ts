import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DashFilter } from "@/components/dashboards/filters/filter-model";
import { widgetRequest } from "@/components/widgets/body-state";
import { ExportMenu } from "@/components/widgets/export-menu";
import {
  doneDetail,
  EXPIRY_MARGIN_MS,
  EXPORT_IDLE,
  exportAnnouncement,
  exportBody,
  exportBusy,
  exportDownloadUrl,
  exportError,
  exportReducer,
  exportStatusUrl,
  expiryDelay,
  rejectCode,
  TOO_LARGE_HINT,
  type ExportEvent,
  type ExportJob,
} from "@/components/widgets/export-model";
import { ExportStatus } from "@/components/widgets/export-status";

/*
 * T-017 E16: tombol ekspor di kepala kartu. Body ekspor = body query widget (filter + urutan tabel),
 * mesin status satu ekspor per kartu, teks galat per kode, dan markup status (test id stabil).
 */
const FILTERS: DashFilter[] = [
  { column: "Cabang", op: "in", values: ["Jakarta", "Bandung"] },
  { column: "Tanggal", op: "preset", preset: "this_month" },
];
const run = (events: ExportEvent[], from: ExportJob = EXPORT_IDLE) =>
  events.reduce(exportReducer, from);
const running = run([
  { type: "start", format: "xlsx" },
  { type: "created", id: "exp1" },
]);

describe("exportBody = body query widget", () => {
  it("tabel: filter dan urutan sama persis, tanpa halaman", () => {
    const sort = { column: 3, dir: "desc" } as const;
    const query = widgetRequest("w1", "table", 7, sort, FILTERS);
    expect(query).toEqual({ widgetId: "w1", page: 7, sort, dashboardFilters: FILTERS });
    const body = exportBody(query, "csv");
    expect(body).toEqual({ widgetId: "w1", format: "csv", sort, dashboardFilters: FILTERS });
    expect(body.dashboardFilters).toBe(query.dashboardFilters);
    expect(body).not.toHaveProperty("page");
  });

  it("tabel tanpa urutan/filter: hanya widgetId + format (skema ketat server)", () => {
    const query = widgetRequest("w1", "table", 0, null, []);
    expect(query).toEqual({ widgetId: "w1", page: 0 });
    expect(Object.keys(exportBody(query, "xlsx")).sort()).toEqual(["format", "widgetId"]);
  });

  it("grafik/KPI: urutan tabel tidak ikut walau ada, filter ikut", () => {
    for (const type of ["bar", "line", "pie", "kpi"]) {
      const query = widgetRequest("w2", type, 3, { column: 1, dir: "asc" }, FILTERS);
      expect(query).toEqual({ widgetId: "w2", dashboardFilters: FILTERS });
      expect(exportBody(query, "xlsx")).toEqual({
        widgetId: "w2",
        format: "xlsx",
        dashboardFilters: FILTERS,
      });
    }
  });
});

describe("exportReducer", () => {
  it("alur lengkap: mulai → dibuat → antre/diproses → selesai → kedaluwarsa", () => {
    const starting = run([{ type: "start", format: "csv" }]);
    expect(starting).toEqual({ phase: "starting", format: "csv" });
    expect(exportBusy(starting)).toBe(true);
    const r = exportReducer(starting, { type: "created", id: "e1" });
    expect(r).toEqual({ phase: "running", format: "csv", id: "e1" });
    // Status antara tidak mengubah objek (identitas sama: tidak ada render/pengumuman baru).
    expect(exportReducer(r, { type: "status", id: "e1", view: { state: "queued" } })).toBe(r);
    expect(exportReducer(r, { type: "status", id: "e1", view: { state: "running" } })).toBe(r);
    const expiresAt = "2026-10-15T09:00:00.000Z";
    const done = exportReducer(r, {
      type: "status",
      id: "e1",
      view: { state: "done", rows: 1234, expiresAt, fileName: "x.csv" },
    });
    expect(done).toEqual({ phase: "done", format: "csv", id: "e1", rows: 1234, expiresAt });
    expect(exportBusy(done)).toBe(false);
    const expired = exportReducer(done, { type: "expired", id: "e1" });
    expect(expired).toMatchObject({
      phase: "error",
      format: "csv",
      error: { code: "EXPORT_EXPIRED", message: "Tautan unduhan sudah kedaluwarsa.", again: true },
    });
    // Ekspor lagi dari galat: format sama, mulai baru.
    expect(exportReducer(expired, { type: "start", format: "csv" })).toEqual({
      phase: "starting",
      format: "csv",
    });
  });

  it("satu ekspor per kartu: mulai saat berjalan diabaikan", () => {
    const s = run([{ type: "start", format: "csv" }]);
    expect(exportReducer(s, { type: "start", format: "xlsx" })).toBe(s);
    expect(exportReducer(running, { type: "start", format: "csv" })).toBe(running);
  });

  it("peristiwa milik ekspor lain atau di luar urutan diabaikan", () => {
    expect(exportReducer(EXPORT_IDLE, { type: "created", id: "x" })).toBe(EXPORT_IDLE);
    expect(exportReducer(running, { type: "created", id: "x" })).toBe(running);
    expect(exportReducer(running, { type: "rejected", status: 500 })).toBe(running);
    const other = { type: "status", id: "old", view: { state: "done" } } as const;
    expect(exportReducer(running, other)).toBe(running);
    expect(exportReducer(running, { type: "stopped", id: "old", status: 404 })).toBe(running);
    expect(exportReducer(running, { type: "expired", id: "exp1" })).toBe(running);
  });

  it("gagal dari worker: kode + pesan server (berbentuk peran); tanpa kode → EXPORT_FAILED", () => {
    const msg =
      "Hasil 1.250.000 baris melebihi batas 1.000.000 baris. Persempit filter lalu ekspor lagi.";
    const big = exportReducer(running, {
      type: "status",
      id: "exp1",
      view: { state: "failed", code: "EXPORT_TOO_LARGE", message: msg },
    });
    expect(big).toEqual({
      phase: "error",
      format: "xlsx",
      error: { code: "EXPORT_TOO_LARGE", message: msg, hint: TOO_LARGE_HINT, again: false },
    });
    const plain = exportReducer(running, { type: "status", id: "exp1", view: { state: "failed" } });
    expect(plain).toMatchObject({ error: { code: "EXPORT_FAILED", again: false } });
    expect(plain.phase === "error" && plain.error.message).toBe(
      "Ekspor gagal dibuat. Coba lagi beberapa saat lagi.",
    );
    // Status tak dikenal: polling sudah berhenti → galat, bukan menunggu selamanya.
    const odd = { state: "weird" } as unknown as { state: "failed" };
    expect(exportReducer(running, { type: "status", id: "exp1", view: odd }).phase).toBe("error");
    const exp = exportReducer(running, { type: "status", id: "exp1", view: { state: "expired" } });
    expect(exp).toMatchObject({ error: { code: "EXPORT_EXPIRED", again: true } });
  });

  it("POST ditolak: jaringan, sesi, akses, sibuk, rate limit", () => {
    const starting = run([{ type: "start", format: "csv" }]);
    const reject = (status: number, code?: string, message?: string) => {
      const s = exportReducer(starting, { type: "rejected", status, code, message });
      return s.phase === "error" ? s.error : null;
    };
    expect(reject(0)).toMatchObject({
      code: "OFFLINE",
      message: "Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.",
    });
    expect(reject(401, "UNAUTHORIZED", "x")?.message).toBe(
      "Sesi Anda berakhir. Muat ulang halaman lalu masuk lagi.",
    );
    expect(reject(404, "NOT_FOUND", "Tidak ditemukan.")?.message).toBe(
      "Widget ini tidak ditemukan atau akses Anda sudah dicabut. Muat ulang halaman.",
    );
    const busy = "Masih ada 2 ekspor yang berjalan. Tunggu salah satu selesai.";
    expect(reject(429, "EXPORT_BUSY", busy)).toEqual({
      code: "EXPORT_BUSY",
      message: busy,
      again: false,
    });
    expect(
      reject(429, "RATE_LIMITED", "Terlalu banyak permintaan. Coba lagi dalam 4 menit."),
    ).toEqual({
      code: "RATE_LIMITED",
      message: "Terlalu banyak permintaan. Coba lagi dalam 4 menit.",
      again: false,
    });
    expect(reject(429)?.code).toBe("RATE_LIMITED");
    expect(
      reject(409, "COLUMN_UNAVAILABLE", "Kolom yang dipakai widget ini tidak tersedia."),
    ).toEqual({
      code: "COLUMN_UNAVAILABLE",
      message: "Kolom yang dipakai widget ini tidak tersedia.",
      again: false,
    });
    expect(reject(503)).toMatchObject({
      code: "UNAVAILABLE",
      message: "Ekspor belum bisa dibuat. Coba lagi beberapa saat lagi.",
    });
  });

  it("polling berhenti: 401 sesi, 410 kedaluwarsa, 404/403 ekspor hilang (Ekspor lagi)", () => {
    const stop = (status: number) =>
      exportReducer(running, { type: "stopped", id: "exp1", status });
    expect(stop(401)).toMatchObject({ error: { code: "SESSION", again: false } });
    expect(stop(410)).toMatchObject({ error: { code: "EXPORT_EXPIRED", again: true } });
    expect(stop(404)).toMatchObject({
      error: { code: "EXPORT_GONE", message: "Ekspor ini tidak ditemukan lagi.", again: true },
    });
    expect(stop(403)).toMatchObject({ error: { code: "EXPORT_GONE" } });
  });
});

describe("exportError / rejectCode", () => {
  it("pesan server didahulukan kecuali kode yang langkahnya milik klien", () => {
    expect(exportError("EXPORT_EXPIRED", "Tautan unduhan sudah kedaluwarsa. Ekspor lagi.")).toEqual(
      { code: "EXPORT_EXPIRED", message: "Tautan unduhan sudah kedaluwarsa.", again: true },
    );
    expect(exportError("EXPORT_TOO_LARGE").message).toBe(
      "Hasil melebihi batas 1.000.000 baris. Persempit filter lalu ekspor lagi.",
    );
    expect(exportError("EXPORT_TOO_LARGE", "  ").hint).toBe(TOO_LARGE_HINT);
    expect(exportError("EXPORT_TIMEOUT").message).toMatch(/batas waktu 10 menit/);
    expect(exportError("NOT_ALLOWED", "Filter tidak diizinkan.").message).toBe(
      "Filter tidak diizinkan.",
    );
    expect(exportError("SOMETHING").message).toBe(
      "Ekspor belum bisa dibuat. Coba lagi beberapa saat lagi.",
    );
  });

  it("status HTTP → kode", () => {
    expect(rejectCode(0)).toBe("OFFLINE");
    expect(rejectCode(401, "X")).toBe("SESSION");
    expect(rejectCode(404, "X")).toBe("NOT_FOUND");
    expect(rejectCode(429)).toBe("RATE_LIMITED");
    expect(rejectCode(400, "INVALID")).toBe("INVALID");
    expect(rejectCode(500)).toBe("UNAVAILABLE");
  });
});

describe("kedaluwarsa dan teks status", () => {
  it("expiryDelay: margin, tidak negatif, tanpa tanggal terbaca = null", () => {
    const now = Date.parse("2026-10-15T08:00:00Z");
    expect(expiryDelay("2026-10-15T09:00:00Z", now)).toBe(3_600_000 - EXPIRY_MARGIN_MS);
    expect(expiryDelay("2026-10-15T07:00:00Z", now)).toBe(0);
    expect(expiryDelay(null, now)).toBeNull();
    expect(expiryDelay("bukan tanggal", now)).toBeNull();
  });

  it("doneDetail: jumlah baris id-ID + jam WIB", () => {
    expect(doneDetail(1234, "2026-10-15T08:42:00Z")).toBe("1.234 baris · berlaku sampai 15.42 WIB");
    expect(doneDetail(null, "2026-10-15T08:42:00Z")).toBe("berlaku sampai 15.42 WIB");
    expect(doneDetail(0, null)).toBe("0 baris");
  });

  it("pengumuman saat menu tertutup", () => {
    expect(exportAnnouncement(EXPORT_IDLE, "Penjualan")).toBe("");
    expect(exportAnnouncement(running, "Penjualan")).toBe("Menyiapkan ekspor Penjualan…");
    const failed = exportReducer(running, { type: "stopped", id: "exp1", status: 404 });
    expect(exportAnnouncement(failed, "Penjualan")).toBe(
      "Ekspor Penjualan gagal. Buka menu ekspor untuk detail.",
    );
  });

  it("URL status/unduh memakai id ter-encode", () => {
    expect(exportStatusUrl("ab/c")).toBe("/api/exports/ab%2Fc");
    expect(exportDownloadUrl("abc")).toBe("/api/exports/abc/download");
  });
});

describe("markup", () => {
  const status = (job: ExportJob, pollError = false) =>
    renderToStaticMarkup(
      createElement(ExportStatus, { job, pollError, onRetryPoll: () => {}, onAgain: () => {} }),
    );

  it("wilayah status selalu ada; kosong saat diam", () => {
    const html = status(EXPORT_IDLE);
    expect(html).toBe('<div role="status" data-testid="export-status" class="text-sm"></div>');
  });

  it("berjalan / polling gagal / selesai / galat", () => {
    expect(status(running)).toContain("Menyiapkan ekspor…");
    expect(status(running, true)).toContain("Coba sekarang");
    const done = run([{ type: "status", id: "exp1", view: { state: "done", rows: 5 } }], running);
    const html = status(done);
    expect(html).toContain("Siap diunduh");
    // `download`: tanpa navigasi (galat 404/410 tidak membuka halaman JSON, beforeunload editor diam).
    expect(html).toMatch(
      /<a href="\/api\/exports\/exp1\/download" download="" data-testid="export-download"/,
    );
    expect(html).toContain("Unduh lagi");
    const expired = exportReducer(done, { type: "stopped", id: "x", status: 410 });
    expect(expired).toBe(done); // id lain diabaikan
    const err = status(run([{ type: "status", id: "exp1", view: { state: "expired" } }], running));
    expect(err).toContain('data-testid="export-error" data-code="EXPORT_EXPIRED"');
    expect(err).toContain('role="alert"');
    expect(err).toContain("Ekspor lagi");
    const big = status(
      run(
        [{ type: "status", id: "exp1", view: { state: "failed", code: "EXPORT_TOO_LARGE" } }],
        running,
      ),
    );
    expect(big).toContain(TOO_LARGE_HINT);
    expect(big).not.toContain("Ekspor lagi");
  });

  it("tombol pemicu: nama aksesibel, test id, ukuran dari kartu", () => {
    const html = renderToStaticMarkup(
      createElement(ExportMenu, {
        title: "Penjualan",
        table: true,
        request: { current: null },
        className: "size-(--control-h-lg)",
      }),
    );
    expect(html).toContain('aria-label="Ekspor Penjualan"');
    expect(html).toContain('data-testid="widget-export"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("size-(--control-h-lg)");
  });
});
