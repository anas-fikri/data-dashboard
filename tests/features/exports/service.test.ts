import { describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@/features/audit/service";
import { RULES } from "@/features/auth/rate-limit";
import {
  BUSY_MESSAGE,
  createExport,
  downloadExport,
  EXPIRED_MESSAGE,
  EXPORT_STATUS,
  exportStatus,
  IN_FLIGHT_STALE_MS,
  statusView,
  type ExportDeps,
  type ExportRepo,
  type ExportRow,
  type NewExport,
} from "@/features/exports/service";
import { COLUMN_UNAVAILABLE_VIEWER } from "@/features/query/service";
import type { DashboardAccessRole } from "@/features/sharing/access";
import type { PresignGetOptions } from "@/lib/storage/exports";
import { DASH, EDITOR, OWNER, ROLES, STRANGER, VIEWER, WID, fakeQueryRepo } from "./fixtures";

/*
 * T-017 layanan ekspor (tanpa DB/Redis/storage): matriks peran saat buat, batas berjalan per user, rate
 * limit, D6 400, status pemilik saja, unduh 404/410/302 + argumen presign + AuditLog (AC6).
 */

const NOW = new Date("2026-10-15T08:00:00.000Z");
const EXPORT_ID = "cmv4kljx40009oczvdmpuexp0";
const OTHER_ID = "cmv4kljx40009oczvdmpuexp1";
const KEY = `exports/${OWNER}/${EXPORT_ID}.xlsx`;

function makeDeps(over: { rows?: ExportRow[]; roles?: Record<string, DashboardAccessRole> } = {}) {
  const rows: ExportRow[] = over.rows ?? [];
  const created: (NewExport & { id: string; status: ExportRow["status"]; since: Date })[] = [];
  const audits: AuditEntry[] = [];
  const roles = over.roles ?? ROLES;
  let n = 0;
  const repo = {
    createIfRoom: vi.fn(async (input: NewExport, max: number, since: Date) => {
      const running = created.filter(
        (c) => c.userId === input.userId && (c.status === "QUEUED" || c.status === "RUNNING"),
      );
      if (running.length >= max) return null;
      const id = `cmv4kljx40009oczvdmpunew${n++}`;
      created.push({ ...input, id, status: "QUEUED", since });
      return { id };
    }),
    findOwned: vi.fn(
      async (userId: string, id: string) =>
        rows.find((r) => r.id === id && r.userId === userId) ?? null,
    ),
    fail: vi.fn(async () => {}),
    widgetTitle: vi.fn(async () => "Penjualan: Q1/2026"),
    dashboardRole: vi.fn(async (userId: string, dashboardId: string) =>
      dashboardId === DASH ? (roles[userId] ?? null) : null,
    ),
    audit: vi.fn(async (e: AuditEntry) => {
      audits.push(e);
    }),
  } satisfies ExportRepo;
  const enqueue = vi.fn(async () => {});
  const rateLimit = vi.fn(async () => ({ allowed: true, remaining: 29, retryAfterSec: 600 }));
  const downloadRateLimit = vi.fn(async (_userId: string) => ({
    allowed: true,
    remaining: 59,
    retryAfterSec: 600,
  }));
  const presign = vi.fn(
    async (key: string, _o: PresignGetOptions) =>
      `http://localhost:9100/bucket/${key}?X-Amz-Expires=300`,
  );
  const deps: ExportDeps = {
    repo,
    query: { repo: fakeQueryRepo() },
    enqueue,
    rateLimit,
    downloadRateLimit,
    presign,
    now: () => NOW,
  };
  return { deps, repo, enqueue, rateLimit, downloadRateLimit, presign, created, audits };
}

const done = (over: Partial<ExportRow> = {}): ExportRow => ({
  id: EXPORT_ID,
  userId: OWNER,
  dashboardId: DASH,
  widgetId: WID("table"),
  format: "XLSX",
  status: "DONE",
  errorCode: null,
  errorMessage: null,
  key: KEY,
  fileName: "Penjualan Q1 2026-20261015-1500.xlsx",
  rows: 12,
  finishedAt: new Date(NOW.getTime() - 10 * 60 * 1000),
  expiresAt: new Date(NOW.getTime() + 50 * 60 * 1000),
  deletedAt: null,
  ...over,
});

describe("createExport", () => {
  it("pemilik, editor, viewer dashboard → antre (jobId = Export.id); orang lain → 404 tanpa baris", async () => {
    for (const user of [OWNER, EDITOR, VIEWER]) {
      const t = makeDeps();
      const r = await createExport(user, { widgetId: WID("table"), format: "csv" }, t.deps);
      expect(r).toEqual({ ok: true, exportId: t.created[0]!.id });
      expect(t.enqueue).toHaveBeenCalledWith(t.created[0]!.id);
      expect(t.created[0]).toMatchObject({
        userId: user,
        dashboardId: DASH,
        widgetId: WID("table"),
        format: "CSV",
        params: { requestedAt: NOW.toISOString() },
        fileName: "Penjualan Q1 2026-20261015-1500.csv",
      });
    }
    const t = makeDeps();
    expect(
      await createExport(STRANGER, { widgetId: WID("table"), format: "xlsx" }, t.deps),
    ).toEqual({ ok: false, code: "NOT_FOUND", message: "Widget tidak ditemukan." });
    expect(t.created).toEqual([]);
    expect(t.enqueue).not.toHaveBeenCalled();
  });

  it("filter + urutan disimpan di params (dibaca ulang worker)", async () => {
    const t = makeDeps();
    const dashboardFilters = [{ column: "Cabang", op: "in" as const, values: ["Cabang 1", null] }];
    await createExport(
      VIEWER,
      {
        widgetId: WID("table"),
        format: "xlsx",
        dashboardFilters,
        sort: { column: 2, dir: "desc" },
      },
      t.deps,
    );
    expect(t.created[0]!.params).toEqual({
      dashboardFilters,
      sort: { column: 2, dir: "desc" },
      requestedAt: NOW.toISOString(),
    });
  });

  it("body strict: field lain/format lain → INVALID 400; spec dari klien tidak diterima", async () => {
    const t = makeDeps();
    for (const body of [
      { widgetId: WID("table"), format: "pdf" },
      { widgetId: WID("table"), format: "csv", spec: { sheetId: "x" } },
      { widgetId: "../etc", format: "csv" },
      { widgetId: WID("table"), format: "csv", sort: { column: 0, dir: "asc" } },
    ]) {
      const r = await createExport(OWNER, body, t.deps);
      expect(r).toMatchObject({ ok: false, code: "INVALID" });
    }
    expect(EXPORT_STATUS.INVALID).toBe(400);
    expect(t.created).toEqual([]);
  });

  it("D6: filter kolom yang tidak diizinkan → INVALID (400) sebelum baris dibuat", async () => {
    const t = makeDeps();
    const r = await createExport(
      VIEWER,
      {
        widgetId: WID("table"),
        format: "csv",
        dashboardFilters: [{ column: "Omzet", op: "range", gte: 1 }],
      },
      t.deps,
    );
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect((r as { message: string }).message).toMatch(/Filter tidak diizinkan/);
    expect(t.created).toEqual([]);
  });

  it("pra-resolusi per peran: viewer pesan umum COLUMN_UNAVAILABLE (409), pemilik detail", async () => {
    const t = makeDeps();
    expect(await createExport(VIEWER, { widgetId: WID("hidden"), format: "csv" }, t.deps)).toEqual({
      ok: false,
      code: "COLUMN_UNAVAILABLE",
      message: COLUMN_UNAVAILABLE_VIEWER,
    });
    const owner = await createExport(OWNER, { widgetId: WID("hidden"), format: "csv" }, t.deps);
    expect(owner).toMatchObject({ code: "COLUMN_UNAVAILABLE" });
    expect((owner as { message: string }).message).toContain('"Rahasia"');
    expect(EXPORT_STATUS.COLUMN_UNAVAILABLE).toBe(409);
    expect(t.created).toEqual([]);
  });

  it("batas berjalan: ekspor ke-3 saat 2 masih berjalan → EXPORT_BUSY 429; jendela basi 2 jam", async () => {
    const t = makeDeps();
    const body = { widgetId: WID("kpi"), format: "csv" };
    expect(await createExport(OWNER, body, t.deps)).toMatchObject({ ok: true });
    expect(await createExport(OWNER, body, t.deps)).toMatchObject({ ok: true });
    expect(await createExport(OWNER, body, t.deps)).toEqual({
      ok: false,
      code: "EXPORT_BUSY",
      message: BUSY_MESSAGE,
    });
    expect(BUSY_MESSAGE).toBe("Masih ada 2 ekspor yang berjalan. Tunggu salah satu selesai.");
    expect(EXPORT_STATUS.EXPORT_BUSY).toBe(429);
    expect(t.repo.createIfRoom.mock.calls[0]![1]).toBe(2);
    expect(t.repo.createIfRoom.mock.calls[0]![2]).toEqual(
      new Date(NOW.getTime() - IN_FLIGHT_STALE_MS),
    );
    // User lain tidak terpengaruh.
    expect(await createExport(VIEWER, body, t.deps)).toMatchObject({ ok: true });
    // Satu selesai → boleh lagi.
    t.created[0]!.status = "DONE";
    expect(await createExport(OWNER, body, t.deps)).toMatchObject({ ok: true });
  });

  it("rate limit habis → RATE_LIMITED 429 + Retry-After, tanpa membaca widget", async () => {
    const t = makeDeps();
    t.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 120 });
    expect(await createExport(OWNER, { widgetId: WID("kpi"), format: "csv" }, t.deps)).toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "Terlalu banyak permintaan ekspor. Coba lagi dalam 120 detik.",
      retryAfterSec: 120,
    });
    expect(t.created).toEqual([]);
  });

  it("enqueue gagal → baris digagalkan (tidak menahan batas berjalan) dan galat dilempar (503)", async () => {
    const t = makeDeps();
    t.enqueue.mockRejectedValueOnce(new Error("redis mati"));
    await expect(
      createExport(OWNER, { widgetId: WID("kpi"), format: "csv" }, t.deps),
    ).rejects.toThrow("redis mati");
    expect(t.repo.fail).toHaveBeenCalledWith(t.created[0]!.id, "UNAVAILABLE", expect.any(String));
  });
});

describe("exportStatus", () => {
  it("pemilik saja; bukan pemilik/ID asing → 404", async () => {
    const t = makeDeps({ rows: [done()] });
    expect(await exportStatus(OWNER, EXPORT_ID, t.deps)).toEqual({
      ok: true,
      state: "done",
      rows: 12,
      expiresAt: new Date(NOW.getTime() + 50 * 60 * 1000).toISOString(),
      fileName: "Penjualan Q1 2026-20261015-1500.xlsx",
    });
    for (const [user, id] of [
      [VIEWER, EXPORT_ID],
      [OWNER, OTHER_ID],
      [OWNER, "bukan-id"],
    ] as const) {
      expect(await exportStatus(user, id, t.deps)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    }
  });

  it("review CL-3: akses dashboard dicabut (atau dashboard terhapus) → 404, bukan 'selesai'", async () => {
    const revoked = makeDeps({ rows: [done()], roles: {} });
    expect(await exportStatus(OWNER, EXPORT_ID, revoked.deps)).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    const gone = makeDeps({ rows: [done({ dashboardId: null })] });
    expect(await exportStatus(OWNER, EXPORT_ID, gone.deps)).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("statusView: queued/running/failed/expired", () => {
    const base = done();
    expect(statusView({ ...base, status: "QUEUED" }, NOW)).toEqual({
      state: "queued",
      fileName: base.fileName,
    });
    expect(statusView({ ...base, status: "RUNNING" }, NOW).state).toBe("running");
    expect(
      statusView(
        { ...base, status: "FAILED", errorCode: "EXPORT_TOO_LARGE", errorMessage: "Hasil …" },
        NOW,
      ),
    ).toEqual({ state: "failed", code: "EXPORT_TOO_LARGE", message: "Hasil …" });
    expect(statusView({ ...base, expiresAt: NOW }, NOW)).toEqual({
      state: "expired",
      code: "EXPORT_EXPIRED",
      message: EXPIRED_MESSAGE,
    });
    expect(statusView({ ...base, deletedAt: NOW }, NOW).state).toBe("expired");
  });
});

describe("downloadExport (AC6)", () => {
  it("user B meminta ekspor milik A → 404 tanpa presign/audit", async () => {
    const t = makeDeps({ rows: [done()] });
    expect(await downloadExport(EDITOR, EXPORT_ID, "10.0.0.2", t.deps)).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(EXPORT_STATUS.NOT_FOUND).toBe(404);
    expect(t.presign).not.toHaveBeenCalled();
    expect(t.audits).toEqual([]);
  });

  it("pemilik → presigned ≤ 5 menit dengan attachment + tipe, dan AuditLog dashboard.widget.export", async () => {
    const t = makeDeps({ rows: [done()] });
    const r = await downloadExport(OWNER, EXPORT_ID, "10.0.0.1", t.deps);
    expect(r).toEqual({ ok: true, url: expect.stringContaining(KEY) });
    expect(t.presign).toHaveBeenCalledWith(KEY, {
      expiresIn: 300,
      contentDisposition:
        "attachment; filename=\"Penjualan Q1 2026-20261015-1500.xlsx\"; filename*=UTF-8''Penjualan%20Q1%202026-20261015-1500.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(t.audits).toEqual([
      {
        actorId: OWNER,
        action: "dashboard.widget.export",
        targetType: "dashboard",
        targetId: DASH,
        meta: {
          widgetId: WID("table"),
          exportId: EXPORT_ID,
          format: "xlsx",
          rows: 12,
          role: "OWNER",
        },
        ip: "10.0.0.1",
      },
    ]);
  });

  it("presign dipotong sisa umur ekspor (< 5 menit tersisa)", async () => {
    const t = makeDeps({ rows: [done({ expiresAt: new Date(NOW.getTime() + 90_500) })] });
    await downloadExport(OWNER, EXPORT_ID, "local", t.deps);
    expect(t.presign.mock.calls[0]![1]).toMatchObject({ expiresIn: 90 });
  });

  it("pemilik + kedaluwarsa (61 menit) atau objek terhapus → 410 EXPORT_EXPIRED", async () => {
    for (const row of [
      done({ expiresAt: new Date(NOW.getTime() - 60_000) }),
      done({ deletedAt: NOW }),
      done({ expiresAt: new Date(NOW.getTime() + 400) }),
    ]) {
      const t = makeDeps({ rows: [row] });
      expect(await downloadExport(OWNER, EXPORT_ID, "local", t.deps)).toEqual({
        ok: false,
        code: "EXPORT_EXPIRED",
        message: EXPIRED_MESSAGE,
      });
      expect(t.presign).not.toHaveBeenCalled();
      expect(t.audits).toEqual([]);
    }
    expect(EXPORT_STATUS.EXPORT_EXPIRED).toBe(410);
  });

  it("pemilik yang aksesnya ke dashboard dicabut / dashboard dihapus → 404", async () => {
    const revoked = makeDeps({ rows: [done({ userId: VIEWER })], roles: {} });
    expect(await downloadExport(VIEWER, EXPORT_ID, "local", revoked.deps)).toMatchObject({
      code: "NOT_FOUND",
    });
    const gone = makeDeps({ rows: [done({ dashboardId: null })] });
    expect(await downloadExport(OWNER, EXPORT_ID, "local", gone.deps)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(revoked.presign).not.toHaveBeenCalled();
    expect(gone.presign).not.toHaveBeenCalled();
  });

  it("belum selesai → 409 NOT_READY; gagal → 404", async () => {
    const running = makeDeps({ rows: [done({ status: "RUNNING", key: null })] });
    expect(await downloadExport(OWNER, EXPORT_ID, "local", running.deps)).toMatchObject({
      code: "NOT_READY",
    });
    const failed = makeDeps({ rows: [done({ status: "FAILED", key: null })] });
    expect(await downloadExport(OWNER, EXPORT_ID, "local", failed.deps)).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("AuditLog gagal → galat dilempar, tidak ada tautan", async () => {
    const t = makeDeps({ rows: [done()] });
    t.repo.audit.mockRejectedValueOnce(new Error("db putus"));
    await expect(downloadExport(OWNER, EXPORT_ID, "local", t.deps)).rejects.toThrow("db putus");
  });

  it("SEC-2: rate limit unduh per user → 429 RATE_LIMITED + Retry-After, tanpa DB/presign/AuditLog", async () => {
    const t = makeDeps({ rows: [done()] });
    await downloadExport(OWNER, EXPORT_ID, "local", t.deps);
    expect(t.downloadRateLimit).toHaveBeenCalledWith(OWNER);
    expect(t.audits).toHaveLength(1);
    t.repo.findOwned.mockClear();
    t.presign.mockClear();
    t.downloadRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 95 });
    expect(await downloadExport(OWNER, EXPORT_ID, "local", t.deps)).toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "Terlalu banyak unduhan ekspor. Coba lagi dalam 95 detik.",
      retryAfterSec: 95,
    });
    expect(EXPORT_STATUS.RATE_LIMITED).toBe(429);
    expect(t.repo.findOwned).not.toHaveBeenCalled();
    expect(t.presign).not.toHaveBeenCalled();
    expect(t.audits).toHaveLength(1);
    // Rate limit tidak terjangkau (Redis mati) → galat (503 di route), bukan lolos tanpa batas.
    t.downloadRateLimit.mockRejectedValueOnce(new Error("redis mati"));
    await expect(downloadExport(OWNER, EXPORT_ID, "local", t.deps)).rejects.toThrow("redis mati");
    expect(t.audits).toHaveLength(1);
  });

  it("SEC-2: RULES.exportDownload = 60 unduhan per 10 menit per user (bucket sendiri)", () => {
    expect(RULES.exportDownload).toEqual({
      name: "export-download:user",
      limit: 60,
      windowSec: 600,
    });
    expect(RULES.exportDownload.name).not.toBe(RULES.export.name);
  });
});
